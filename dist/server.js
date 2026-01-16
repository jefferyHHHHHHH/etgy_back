"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const dotenv_1 = __importDefault(require("dotenv"));
const prisma_1 = require("./config/prisma");
const redis_1 = __importDefault(require("./config/redis"));
dotenv_1.default.config();
const PORT = process.env.PORT || 3000;
const startServer = async () => {
    try {
        console.log('⏳ Starting server...');
        // 1. Test Database Connection
        await prisma_1.prisma.$connect();
        console.log('✅ Database connected successfully');
        // 2. Test Redis Connection
        if (redis_1.default.status === 'ready' || redis_1.default.status === 'connecting') {
            console.log('✅ Redis connected successfully');
        }
        else {
            await redis_1.default.connect(); // Explicit connect if lazy
            console.log('✅ Redis connected successfully');
        }
        // 3. Start Express Server
        const server = app_1.default.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
        // Graceful Shutdown
        const shutdown = async () => {
            console.log('🛑 Shutting down server...');
            server.close(() => {
                console.log('   Http server closed');
            });
            await prisma_1.prisma.$disconnect();
            console.log('   Prisma disconnected');
            await redis_1.default.quit();
            console.log('   Redis disconnected');
            process.exit(0);
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }
    catch (error) {
        console.error('❌ Server failed to start:', error);
        process.exit(1);
    }
};
startServer();
