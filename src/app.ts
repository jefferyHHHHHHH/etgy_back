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
import { registerModules } from './modules/registerModules';
import { registerSwagger } from './docs/swagger';

// Initialize Express App
const app = express();

// Global Middlewares
app.use(requestIdMiddleware);
app.use(loggerMiddleware);
app.use(helmet());
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
    windowMs: 60 * 1000,
    limit: 120,
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
