"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const prisma_1 = require("./config/prisma");
const redis_1 = __importDefault(require("./config/redis"));
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const PORT = env_1.env.PORT;
const startServer = async () => {
    try {
        logger_1.logger.info('Starting server...');
        // 1. Test Database Connection
        await prisma_1.prisma.$connect();
        logger_1.logger.info('Database connected successfully');
        // 2. Test Redis Connection
        if (redis_1.default.status === 'ready' || redis_1.default.status === 'connecting') {
            logger_1.logger.info('Redis connected successfully');
        }
        else {
            await redis_1.default.connect(); // Explicit connect if lazy
            logger_1.logger.info('Redis connected successfully');
        }
        // 3. Start Express Server
        const server = app_1.default.listen(PORT, () => {
            logger_1.logger.info({ port: PORT }, 'Server running');
        });
        // Graceful Shutdown
        const shutdown = async () => {
            logger_1.logger.info('Shutting down server...');
            server.close(() => {
                logger_1.logger.info('Http server closed');
            });
            await prisma_1.prisma.$disconnect();
            logger_1.logger.info('Prisma disconnected');
            await redis_1.default.quit();
            logger_1.logger.info('Redis disconnected');
            process.exit(0);
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }
    catch (error) {
        logger_1.logger.error({ err: error }, 'Server failed to start');
        process.exit(1);
    }
};
startServer();
