import type { Request, Response, NextFunction } from 'express';
import { Permission, hasPermissions } from '../types/permissions';

export const requirePermissions = (permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    const ok = hasPermissions(req.user.role, permissions);
    if (!ok) {
      return res.status(403).json({ code: 403, message: 'Forbidden: missing permissions' });
    }

    return next();
  };
};

export const requireAnyPermissions = (permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ code: 401, message: 'Unauthorized' });
    }

    const ok = permissions.some((p) => hasPermissions(req.user!.role, [p]));
    if (!ok) {
      return res.status(403).json({ code: 403, message: 'Forbidden: missing permissions' });
    }

    return next();
  };
};
