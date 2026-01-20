import { Router } from 'express';
import { z } from 'zod';
import { PlatformController } from '../controllers/platform.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { Permission } from '../types/permissions';
import { validateBody, validateParams } from '../middlewares/validate.middleware';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';
import { AuditAction } from '../types/enums';

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

const listAuditLogsQuerySchema = z.object({
  collegeId: z.coerce.number().int().positive().optional().describe('平台管理员可按学院筛选；学院管理员会被强制为自身学院'),
  action: z.nativeEnum(AuditAction).optional(),
  operatorId: z.coerce.number().int().positive().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const dashboardQuerySchema = z.object({
  collegeId: z.coerce.number().int().positive().optional().describe('平台管理员可按学院查看；学院管理员会被强制为自身学院'),
});

const listCollegeAdminsQuerySchema = z.object({
  collegeId: z.coerce.number().int().positive().optional(),
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

registerPath({
  method: 'get',
  path: '/api/platform/college-admins',
  summary: '学院管理员账号列表（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { query: listCollegeAdminsQuerySchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'delete',
  path: '/api/platform/college-admins/{id}',
  summary: '删除学院管理员账号（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/platform/audit-logs',
  summary: '审计日志查询（管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { query: listAuditLogsQuerySchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/platform/dashboard',
  summary: '数据概览 Dashboard（管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { query: dashboardQuerySchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
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

router.get(
  '/college-admins',
  requirePermissions([Permission.USER_COLLEGE_ADMIN_MANAGE]),
  PlatformController.listCollegeAdmins
);

router.delete(
  '/college-admins/:id',
  requirePermissions([Permission.USER_COLLEGE_ADMIN_MANAGE]),
  validateParams(idParamSchema),
  PlatformController.deleteCollegeAdmin
);

router.get(
  '/audit-logs',
  requirePermissions([Permission.AUDIT_VIEW]),
  PlatformController.listAuditLogs
);

router.get(
  '/dashboard',
  requirePermissions([Permission.DASHBOARD_VIEW]),
  PlatformController.getDashboard
);

export default router;
