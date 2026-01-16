import app from './app';
import dotenv from 'dotenv';
import { prisma } from './config/prisma';
import redisClient from './config/redis';

dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    console.log('⏳ Starting server...');
    
    // 1. Test Database Connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // 2. Test Redis Connection
    if (redisClient.status === 'ready' || redisClient.status === 'connecting') {
      console.log('✅ Redis connected successfully');
    } else {
      await redisClient.connect(); // Explicit connect if lazy
      console.log('✅ Redis connected successfully');
    }

    // 3. Start Express Server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

    // Graceful Shutdown
    const shutdown = async () => {
      console.log('🛑 Shutting down server...');
      server.close(() => {
        console.log('   Http server closed');
      });
      await prisma.$disconnect();
      console.log('   Prisma disconnected');
      await redisClient.quit();
      console.log('   Redis disconnected');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('❌ Server failed to start:', error);
    process.exit(1);
  }
};

startServer();
