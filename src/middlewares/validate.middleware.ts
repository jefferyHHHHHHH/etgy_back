import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodType } from 'zod';

const formatZodError = (error: ZodError) => {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
};

export const validateBody = <T>(schema: ZodType<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body) as any;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          code: 400,
          message: 'Invalid request body',
          data: { issues: formatZodError(err), requestId: req.requestId },
        });
      }
      return next(err);
    }
  };
};

export const validateQuery = <T>(schema: ZodType<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.query) as any;

      // Express v5 makes `req.query` a getter-only property. Direct assignment throws:
      // "Cannot set property query of #<IncomingMessage> which has only a getter".
      // Define an own property to shadow the getter, keeping existing controllers intact.
      Object.defineProperty(req, 'query', {
        value: parsed,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          code: 400,
          message: 'Invalid query params',
          data: { issues: formatZodError(err), requestId: req.requestId },
        });
      }
      return next(err);
    }
  };
};

export const validateParams = <T>(schema: ZodType<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          code: 400,
          message: 'Invalid route params',
          data: { issues: formatZodError(err), requestId: req.requestId },
        });
      }
      return next(err);
    }
  };
};
