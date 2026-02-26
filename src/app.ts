import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import { loggerMiddleware } from './middlewares/logger.middleware';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { prisma } from './config/prisma';
import redisClient from './config/redis';
import { env } from './config/env';
import { registerModules } from './modules/registerModules';
import { registerSwagger } from './docs/swagger';

// Initialize Express App
const app = express();

// Global Middlewares
app.use(requestIdMiddleware);
app.use(loggerMiddleware);
const isProd = env.NODE_ENV === 'production';

// If deployed behind a reverse proxy (Nginx/Ingress/Cloud LB), enable trust proxy so
// req.ip uses X-Forwarded-For. Otherwise all clients may appear as the same IP and
// get rate-limited together.
const trustProxy = typeof env.TRUST_PROXY === 'boolean' ? env.TRUST_PROXY : isProd;
app.set('trust proxy', trustProxy ? 1 : false);

// In development, avoid 304 responses preserving previously cached security headers.
// This is especially important for Swagger UI when testing via http://<lan-ip>.
if (!isProd) {
  app.set('etag', false);
}

// Helmet defaults are great for HTTPS, but on plain HTTP origins they can:
// - trigger CSP `upgrade-insecure-requests` (breaking Swagger UI assets)
// - emit COOP / Origin-Agent-Cluster warnings in browsers
// We enable the full set only when the current request is HTTPS.
const helmetSecure = helmet();
const helmetInsecure = helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  hsts: false,
});

app.use((req: Request, res: Response, next: NextFunction) => {
  const forwardedProto = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto'].split(',')[0].trim()
    : undefined;
  const isHttps = req.secure || forwardedProto === 'https';
  return (isHttps ? helmetSecure : helmetInsecure)(req, res, next);
});
app.use(cors({
  origin: '*', // Configure properly in production
  credentials: true
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Basic API rate limit (adjust as needed)
app.use(
  '/api',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS ?? 60 * 1000,
    limit: env.RATE_LIMIT_MAX ?? (isProd ? 120 : 1000),
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Basic Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness check: dependencies (DB + Redis)
app.get('/ready', async (req: Request, res: Response) => {
  const checks: { db: boolean; redis: boolean } = { db: false, redis: false };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch {
    checks.db = false;
  }

  try {
    const pong = await redisClient.ping();
    checks.redis = pong === 'PONG';
  } catch {
    checks.redis = false;
  }

  const ready = checks.db && checks.redis;
  return res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

// API index (helps beginners avoid confusion with 404)
app.get('/api', (req: Request, res: Response) => {
  res.status(200).json({
    code: 200,
    message: 'API is running. Use POST for auth endpoints.',
    data: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        logout: 'POST /api/auth/logout',
      },
      health: 'GET /health',
    },
  });
});

// Routes
registerModules(app);

// Docs (Swagger UI + OpenAPI JSON)
registerSwagger(app);


// 404 + Error handler
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
