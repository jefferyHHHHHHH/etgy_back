import { Router } from 'express';
import { z } from 'zod';
import { OssController } from '../controllers/oss.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';

const router = Router();

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

router.use(authMiddleware);
router.post('/upload-url', validateBody(createUploadUrlBodySchema), OssController.createUploadUrl);

export default router;
