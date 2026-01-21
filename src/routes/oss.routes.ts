import { Router } from 'express';
import { z } from 'zod';
import { OssController } from '../controllers/oss.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

const router = Router();

const tmpDir = path.join(process.cwd(), 'tmp', 'oss-uploads');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '');
      cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    },
  }),
  // Safety limit: adjust if you really want backend proxy for huge videos.
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB
});

const createUploadUrlBodySchema = z.object({
  // If key is provided, backend will use it as object key.
  // Otherwise, backend generates one from prefix/filename.
  key: z.string().min(1).optional(),
  prefix: z.string().min(1).optional().default('uploads'),
  filename: z.string().min(1).optional(),
  contentType: z.string().min(1).optional(),
  expiresInSeconds: z.coerce.number().int().positive().optional(),
});

registerPath({
  method: 'post',
  path: '/api/oss/upload-url',
  summary: '获取直传上传 URL（S3 预签名 PUT）',
  tags: ['OSS'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createUploadUrlBodySchema } } } },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

const uploadFileParamsSchema = z.object({
  folder: z.enum(['images', 'videos']),
});

const uploadFileMultipartBodySchema = z.object({
  file: z.string().openapi({ type: 'string', format: 'binary', description: '上传文件字段名必须为 file' }),
});

registerPath({
  method: 'post',
  path: '/api/oss/upload/{folder}',
  summary: '后端代传上传文件到 OSS（multipart）',
  tags: ['OSS'],
  security: [{ bearerAuth: [] }],
  request: {
    params: uploadFileParamsSchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: uploadFileMultipartBodySchema,
        },
      },
    },
  },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/oss/url',
  summary: '获取私有对象临时访问 URL（S3 预签名 GET）',
  tags: ['OSS'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      keyOrUrl: z.string().min(1).describe('对象 key（如 videos/2026/01/19/xxx.mp4）或完整 http(s) URL'),
      expiresInSeconds: z.coerce.number().int().positive().optional(),
    }),
  },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    500: { description: 'Server Error', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

router.use(authMiddleware);
router.post('/upload-url', validateBody(createUploadUrlBodySchema), OssController.createUploadUrl);

router.get('/url', validateQuery(z.object({
  keyOrUrl: z.string().min(1),
  expiresInSeconds: z.coerce.number().int().positive().optional(),
})), OssController.getUrl);

router.post('/upload/:folder', validateParams(uploadFileParamsSchema), upload.single('file'), OssController.uploadFile);

export default router;
