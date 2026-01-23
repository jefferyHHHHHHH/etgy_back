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

  // Reverse proxy
  // When running behind Nginx/Ingress/Cloud LB, enable this so req.ip uses X-Forwarded-For.
  TRUST_PROXY: z.coerce.boolean().optional(),

  // API rate limit
  // Applied to /api/* as a coarse safeguard.
  // Note: In production behind proxies, enable TRUST_PROXY to avoid all clients sharing one IP.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),

  // Agora RTC (optional; required only when using Agora token endpoints)
  AGORA_APP_ID: z.string().optional(),
  AGORA_APP_CERTIFICATE: z.string().optional(),
  AGORA_RTC_TOKEN_EXPIRE_SECONDS: z.coerce.number().int().positive().default(3600),

  // WeChat Mini Program (optional; required only when using WeChat mini program login/bind endpoints)
  WECHAT_MP_APP_ID: z.string().optional(),
  WECHAT_MP_APP_SECRET: z.string().optional(),
  WECHAT_MP_BIND_TOKEN_EXPIRE_SECONDS: z.coerce.number().int().positive().default(600),

  // iFlytek Spark (讯飞星火) (optional)
  // HTTP OpenAPI: Authorization: Bearer <SPARK_HTTP_API_PASSWORD>
  SPARK_HTTP_ENDPOINT: z.string().url().optional().default('https://spark-api-open.xf-yun.com/v2/chat/completions'),
  SPARK_HTTP_API_PASSWORD: z.string().optional(),
  // Spark X1.5 is exposed via Ultra model in HTTP OpenAPI (official docs: 4.0Ultra)
  SPARK_HTTP_MODEL: z.string().optional().default('4.0Ultra'),

  // WebSocket (signed URL auth)
  SPARK_WS_URL: z.string().url().optional().default('wss://spark-api.xf-yun.com/v1/x1'),
  SPARK_WS_APP_ID: z.string().optional(),
  SPARK_WS_API_KEY: z.string().optional(),
  SPARK_WS_API_SECRET: z.string().optional(),

  // AI tutor (child coaching)
  AI_TUTOR_ENABLED: z.coerce.boolean().default(true),
  AI_TUTOR_DAILY_LIMIT: z.coerce.number().int().min(1).default(5),
  AI_TUTOR_MAX_INPUT_LENGTH: z.coerce.number().int().min(20).max(2000).default(200),
  AI_TUTOR_CONTEXT_MESSAGES: z.coerce.number().int().min(0).max(50).default(8),
});

export const env = envSchema.parse(process.env);
