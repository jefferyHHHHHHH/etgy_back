import { Router } from 'express';
import { z } from 'zod';
import { PlatformController } from '../controllers/platform.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { Permission } from '../types/permissions';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';
import { AuditAction, ModerationAction, UserStatus } from '../types/enums';
import multer from 'multer';

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

const updateCollegeAdminBodySchema = z.object({
  realName: z.string().min(1).optional(),
  collegeId: z.coerce.number().int().positive().optional(),
});

const updateCollegeAdminStatusBodySchema = z.object({
  status: z.nativeEnum(UserStatus),
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

const contentPolicySchema = z.object({
  commentsEnabled: z.boolean(),
  liveChatEnabled: z.boolean(),
  moderationAction: z.nativeEnum(ModerationAction),
  updatedAt: z.string(),
});

const updateContentPolicyBodySchema = z
  .object({
    commentsEnabled: z.coerce.boolean().optional(),
    liveChatEnabled: z.coerce.boolean().optional(),
    moderationAction: z.nativeEnum(ModerationAction).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });

const listSensitiveWordsQuerySchema = z.object({
  q: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createSensitiveWordBodySchema = z.object({
  word: z.string().min(1).max(64),
  isActive: z.coerce.boolean().optional(),
});

const batchCreateSensitiveWordsBodySchema = z.object({
  words: z.array(z.string().min(1).max(64)).min(1),
  overwrite: z.coerce.boolean().optional(),
});

const updateSensitiveWordBodySchema = z.object({
  isActive: z.coerce.boolean(),
});

const exportSensitiveWordsQuerySchema = z.object({
  format: z.enum(['txt', 'csv']).optional().default('txt'),
  isActive: z.coerce.boolean().optional(),
});

const importSensitiveWordsQuerySchema = z.object({
  format: z.enum(['txt', 'csv']).optional().default('txt'),
  overwrite: z.coerce.boolean().optional().default(false),
});

const importSensitiveWordsMultipartBodySchema = z.object({
  file: z.string().openapi({ type: 'string', format: 'binary', description: 'TXT/CSV 文件，字段名必须为 file' }),
});

const textUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // 1MB
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
  method: 'get',
  path: '/api/platform/sensitive-words/export',
  summary: '导出敏感词（TXT/CSV）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { query: exportSensitiveWordsQuerySchema },
  responses: {
    200: { description: 'OK' },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/platform/sensitive-words/import',
  summary: '导入敏感词（TXT/CSV）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: {
    query: importSensitiveWordsQuerySchema,
    body: {
      content: {
        'multipart/form-data': {
          schema: importSensitiveWordsMultipartBodySchema,
        },
      },
    },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/platform/content-policy',
  summary: '获取内容合规策略（评论/弹幕开关 + 敏感词动作）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(contentPolicySchema) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'put',
  path: '/api/platform/content-policy',
  summary: '更新内容合规策略（评论/弹幕开关 + 敏感词动作）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: updateContentPolicyBodySchema } } } },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: apiResponse(contentPolicySchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/platform/sensitive-words',
  summary: '敏感词列表（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { query: listSensitiveWordsQuerySchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/platform/sensitive-words',
  summary: '新增敏感词（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createSensitiveWordBodySchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/platform/sensitive-words/batch',
  summary: '批量新增敏感词（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: batchCreateSensitiveWordsBodySchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'patch',
  path: '/api/platform/sensitive-words/{id}',
  summary: '启用/停用敏感词（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateSensitiveWordBodySchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'delete',
  path: '/api/platform/sensitive-words/{id}',
  summary: '删除敏感词（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: {
    200: { description: 'Deleted', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
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
  method: 'patch',
  path: '/api/platform/college-admins/{id}',
  summary: '编辑学院管理员账号（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateCollegeAdminBodySchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'patch',
  path: '/api/platform/college-admins/{id}/status',
  summary: '停用/启用学院管理员账号（平台管理员）',
  tags: ['Platform'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateCollegeAdminStatusBodySchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: apiResponse(z.any()) } } },
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

router.get(
  '/content-policy',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  PlatformController.getContentPolicy
);

router.put(
  '/content-policy',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  validateBody(updateContentPolicyBodySchema),
  PlatformController.updateContentPolicy
);

router.get(
  '/sensitive-words',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  PlatformController.listSensitiveWords
);

router.post(
  '/sensitive-words',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  validateBody(createSensitiveWordBodySchema),
  PlatformController.createSensitiveWord
);

router.post(
  '/sensitive-words/batch',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  validateBody(batchCreateSensitiveWordsBodySchema),
  PlatformController.batchCreateSensitiveWords
);

router.get(
  '/sensitive-words/export',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  validateQuery(exportSensitiveWordsQuerySchema),
  PlatformController.exportSensitiveWords
);

router.post(
  '/sensitive-words/import',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  validateQuery(importSensitiveWordsQuerySchema),
  textUpload.single('file'),
  PlatformController.importSensitiveWords
);

router.patch(
  '/sensitive-words/:id',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  validateParams(idParamSchema),
  validateBody(updateSensitiveWordBodySchema),
  PlatformController.updateSensitiveWord
);

router.delete(
  '/sensitive-words/:id',
  requirePermissions([Permission.CONTENT_POLICY_MANAGE]),
  validateParams(idParamSchema),
  PlatformController.deleteSensitiveWord
);

router.delete(
  '/college-admins/:id',
  requirePermissions([Permission.USER_COLLEGE_ADMIN_MANAGE]),
  validateParams(idParamSchema),
  PlatformController.deleteCollegeAdmin
);

router.patch(
  '/college-admins/:id',
  requirePermissions([Permission.USER_COLLEGE_ADMIN_MANAGE]),
  validateParams(idParamSchema),
  validateBody(updateCollegeAdminBodySchema),
  PlatformController.updateCollegeAdmin
);

router.patch(
  '/college-admins/:id/status',
  requirePermissions([Permission.USER_COLLEGE_ADMIN_MANAGE]),
  validateParams(idParamSchema),
  validateBody(updateCollegeAdminStatusBodySchema),
  PlatformController.updateCollegeAdminStatus
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
