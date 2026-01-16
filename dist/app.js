"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const content_routes_1 = __importDefault(require("./routes/content.routes"));
const requestId_middleware_1 = require("./middlewares/requestId.middleware");
const logger_middleware_1 = require("./middlewares/logger.middleware");
const error_middleware_1 = require("./middlewares/error.middleware");
const prisma_1 = require("./config/prisma");
const redis_1 = __importDefault(require("./config/redis"));
// Initialize Express App
const app = (0, express_1.default)();
// Global Middlewares
app.use(requestId_middleware_1.requestIdMiddleware);
app.use(logger_middleware_1.loggerMiddleware);
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: '*', // Configure properly in production
    credentials: true
}));
app.use((0, compression_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cookie_parser_1.default)());
// Basic API rate limit (adjust as needed)
app.use('/api', (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
}));
// Basic Health Check Route
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Readiness check: dependencies (DB + Redis)
app.get('/ready', async (req, res) => {
    const checks = { db: false, redis: false };
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        checks.db = true;
    }
    catch {
        checks.db = false;
    }
    try {
        const pong = await redis_1.default.ping();
        checks.redis = pong === 'PONG';
    }
    catch {
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
app.get('/api', (req, res) => {
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
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
// Videos / Content
app.use('/api/videos', content_routes_1.default);
// 404 + Error handler
app.use(error_middleware_1.notFoundHandler);
app.use(error_middleware_1.errorHandler);
exports.default = app;
