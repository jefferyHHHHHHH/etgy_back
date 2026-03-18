import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { Permission } from '../types/permissions';
import { UserRole } from '../types/enums';
import { validateBody, validateParams } from '../middlewares/validate.middleware';
import { ChildrenController } from '../controllers/children.controller';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';

const router = Router();

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const setPasswordBodySchema = z.object({
  newPassword: z.string().min(6),
});

// OpenAPI
registerPath({
  method: 'get',
  path: '/api/children/{id}/password',
  summary: '查看儿童账号密码（平台管理员）',
  tags: ['Children'],
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/children/{id}/password',
  summary: '修改儿童账号密码（平台管理员）',
  tags: ['Children'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: setPasswordBodySchema } } },
  },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

// Protected
router.use(authMiddleware);

router.get(
  '/:id/password',
  requireRole([UserRole.PLATFORM_ADMIN]),
  requirePermissions([Permission.USER_CHILD_VIEW]),
  validateParams(idParamSchema),
  ChildrenController.getChildPassword
);

router.post(
  '/:id/password',
  requireRole([UserRole.PLATFORM_ADMIN]),
  requirePermissions([Permission.USER_CHILD_MANAGE]),
  validateParams(idParamSchema),
  validateBody(setPasswordBodySchema),
  ChildrenController.setChildPassword
);

export default router;
