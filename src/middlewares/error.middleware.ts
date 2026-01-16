import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { HttpError } from '../utils/httpError';
import { logger } from '../config/logger';

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    code: 404,
    message: 'Not Found',
    data: {
      path: req.originalUrl,
      method: req.method,
      requestId: req.requestId,
    },
  });
};

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  // Prisma errors → map to user-friendly messages
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // e.g. P2002 unique constraint
    if (err.code === 'P2002') {
      return res.status(409).json({
        code: 409,
        message: 'Conflict: duplicate value',
        data: { requestId: req.requestId },
      });
    }

    return res.status(400).json({
      code: 400,
      message: 'Database error',
      data: { requestId: req.requestId, prismaCode: err.code },
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      code: err.statusCode,
      message: err.message,
      data: { requestId: req.requestId, errorCode: err.code ?? null },
    });
  }

  const message = err instanceof Error ? err.message : 'Internal Server Error';
  logger.error({ err, requestId: req.requestId }, 'Unhandled error');

  return res.status(500).json({
    code: 500,
    message,
    data: { requestId: req.requestId },
  });
};
