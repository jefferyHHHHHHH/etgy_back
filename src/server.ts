import app from './app';
import { prisma } from './config/prisma';
import redisClient from './config/redis';
import { env } from './config/env';
import { logger } from './config/logger';

const PORT = env.PORT;

const startServer = async () => {
  try {
    logger.info('Starting server...');
    
    // 1. Test Database Connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // 2. Test Redis Connection
    try {
      if (redisClient.status === 'ready' || redisClient.status === 'connecting') {
        logger.info('Redis connected successfully');
      } else {
        await redisClient.connect(); // Explicit connect if lazy
        logger.info('Redis connected successfully');
      }
    } catch (redisError) {
      // Fail-open: Redis is used for performance / token blacklist, but should not block local dev.
      logger.warn({ err: redisError }, 'Redis unavailable, continuing without Redis');
    }

    // 3. Start Express Server
    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server running');
    });

    // Graceful Shutdown
    const shutdown = async () => {
      logger.info('Shutting down server...');
      server.close(() => {
        logger.info('Http server closed');
      });
      await prisma.$disconnect();
      logger.info('Prisma disconnected');

      try {
        if (redisClient.status === 'ready' || redisClient.status === 'connecting') {
          await redisClient.quit();
          logger.info('Redis disconnected');
        }
      } catch (redisError) {
        logger.warn({ err: redisError }, 'Redis disconnect failed');
      }
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error({ err: error }, 'Server failed to start');
    process.exit(1);
  }
};

startServer();
