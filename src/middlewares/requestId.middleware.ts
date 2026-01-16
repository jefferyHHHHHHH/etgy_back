import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header('x-request-id');
  const requestId = (incoming && incoming.trim()) || randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  next();
};
