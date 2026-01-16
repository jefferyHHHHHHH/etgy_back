"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.authMiddleware = void 0;
const token_1 = require("../utils/token");
const redis_1 = __importDefault(require("../config/redis"));
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ code: 401, message: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split(' ')[1];
    try {
        // 1. Check Redis Blacklist (Logout)
        // If Redis is down, we might fail-open or fail-closed. 
        // Here we fail-open (allow) if Redis error, but log it. 
        // Ideally use a circuit breaker.
        if (redis_1.default.status === 'ready') {
            const isBlacklisted = await redis_1.default.get(`blacklist:${token}`);
            if (isBlacklisted) {
                return res.status(401).json({ code: 401, message: 'Unauthorized: Token revoked' });
            }
        }
        // 2. Verify Token
        const payload = (0, token_1.verifyToken)(token);
        req.user = payload;
        next();
    }
    catch (error) {
        return res.status(401).json({ code: 401, message: 'Unauthorized: Invalid token' });
    }
};
exports.authMiddleware = authMiddleware;
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ code: 403, message: 'Forbidden: Insufficient permissions' });
        }
        next();
    };
};
exports.requireRole = requireRole;
