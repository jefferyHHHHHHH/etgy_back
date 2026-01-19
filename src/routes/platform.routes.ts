import { Router } from 'express';
import { z } from 'zod';
import { PlatformController } from '../controllers/platform.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { Permission } from '../types/permissions';
import { validateBody, validateParams } from '../middlewares/validate.middleware';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';

const router = Router();

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const createCollegeBodySchema = z.object({
  name: z.string().min(1),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const updateCollegeBodySchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const createCollegeAdminBodySchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  realName: z.string().min(1),
  collegeId: z.coerce.number().int().positive(),
});

registerPath({
  method: 'get',
  path: '/api/platform/colleges',
  summary: '学院列表（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/platform/colleges',
  summary: '创建学院（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createCollegeBodySchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'patch',
  path: '/api/platform/colleges/{id}',
  summary: '更新学院（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateCollegeBodySchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/platform/college-admins',
  summary: '创建学院管理员账号（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createCollegeAdminBodySchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

router.use(authMiddleware);

router.get('/colleges', requirePermissions([Permission.COLLEGE_MANAGE]), PlatformController.listColleges);
router.post(
  '/colleges',
  requirePermissions([Permission.COLLEGE_MANAGE]),
  validateBody(createCollegeBodySchema),
  PlatformController.createCollege
);
router.patch(
  '/colleges/:id',
  requirePermissions([Permission.COLLEGE_MANAGE]),
  validateParams(idParamSchema),
  validateBody(updateCollegeBodySchema),
  PlatformController.updateCollege
);

router.post(
  '/college-admins',
  requirePermissions([Permission.USER_COLLEGE_ADMIN_CREATE]),
  validateBody(createCollegeAdminBodySchema),
  PlatformController.createCollegeAdmin
);

export default router;
