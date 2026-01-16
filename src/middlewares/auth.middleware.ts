import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/token';
import redisClient from '../config/redis';
// import { UserRole } from '@prisma/client';
import { UserRole } from '../types/enums';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 1. Check Redis Blacklist (Logout)
    // Fail-open if Redis is unavailable.
    if (redisClient.status === 'ready') {
      try {
        const isBlacklisted = await redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
          return res.status(401).json({ code: 401, message: 'Unauthorized: Token revoked' });
        }
      } catch (redisError) {
        console.warn('Redis blacklist check failed (fail-open):', redisError);
      }
    }

    // 2. Verify Token
    const payload = verifyToken(token);
    req.user = payload;

    next();
  } catch (error) {
    return res.status(401).json({ code: 401, message: 'Unauthorized: Invalid token' });
  }
};

export const requireRole = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};
