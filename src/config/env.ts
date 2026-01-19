import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env once, early
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET should be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // OSS / S3 compatible (optional)
  // For Qiniu S3:
  // - OSS_BUCKET=etgy
  // - OSS_REGION=cn-south-1
  // - OSS_ENDPOINT=https://etgy.s3.cn-south-1.qiniucs.com (bucket endpoint) OR https://s3.cn-south-1.qiniucs.com
  OSS_ACCESS_KEY_ID: z.string().optional(),
  OSS_ACCESS_KEY_SECRET: z.string().optional(),
  OSS_BUCKET: z.string().optional(),
  OSS_REGION: z.string().optional(),
  OSS_ENDPOINT: z.string().optional(),
  OSS_PUBLIC_BASE_URL: z.string().optional(),
  OSS_PRESIGN_EXPIRES_SECONDS: z.coerce.number().int().positive().optional(),

  // Docs
  SWAGGER_ENABLED: z.coerce.boolean().default(true),
});

export const env = envSchema.parse(process.env);
