import pinoHttp from 'pino-http';
import { logger } from '../config/logger';
import { randomUUID } from 'crypto';

export const loggerMiddleware = pinoHttp({
  logger,
  quietReqLogger: true,
  genReqId: (req, res) => {
    // We already set x-request-id in requestIdMiddleware; reuse it.
    const existing = (req as any).requestId as string | undefined;

    const fromHeader = req.headers['x-request-id'] as string | undefined;
    return existing || fromHeader || randomUUID();
  },
  customProps: (req) => ({
    requestId: (req as any).requestId,
    userId: (req as any).user?.userId,
  }),
});
