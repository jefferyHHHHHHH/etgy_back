import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import { LiveController } from '../controllers/live.controller';
import { LiveMessageType, LiveStatus, UserRole } from '../types/enums';
import { apiResponse, BaseResponseSchema, ErrorResponseSchema, registerPath } from '../docs/openapi';
import { LiveMessageSchema, LiveRoomSchema } from '../docs/schemas';

const router = Router();

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const listPublicLivesQuerySchema = z.object({
  tab: z.enum(['upcoming', 'living', 'ended']).optional(),
  collegeId: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const listMineQuerySchema = z.object({
  status: z.nativeEnum(LiveStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const listAdminQuerySchema = z.object({
  status: z.nativeEnum(LiveStatus).optional().describe('默认 REVIEW'),
  collegeId: z.coerce.number().int().positive().optional(),
  anchorId: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const createLiveBodySchema = z.object({
  title: z.string().min(1),
  intro: z.string().optional(),
  planStartTime: z.string().min(1),
  planEndTime: z.string().min(1),
});

const auditBodySchema = z.object({
  pass: z.coerce.boolean(),
  reason: z.string().optional(),
});

const offlineBodySchema = z.object({
  reason: z.string().optional(),
});

const finishBodySchema = z.object({
  replayVideoId: z.coerce.number().int().positive().optional(),
});

const messageListQuerySchema = z.object({
  afterId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const messageSendBodySchema = z.object({
  type: z.nativeEnum(LiveMessageType).optional(),
  content: z.string().min(1).max(500),
});

// OpenAPI registration
registerPath({
  method: 'get',
  path: '/api/live',
  summary: '直播列表（公开）',
  tags: ['Live'],
  request: { query: listPublicLivesQuerySchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/live/{id}',
  summary: '直播详情（公开）',
  tags: ['Live'],
  request: { params: idParamSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(LiveRoomSchema) } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

// OpenAPI registration
registerPath({
  method: 'get',
  path: '/api/live/mine',
  summary: '我的直播列表（志愿者）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: { query: listMineQuerySchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/live/admin',
  summary: '管理端直播列表（学院/平台管理员）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: { query: listAdminQuerySchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/live',
  summary: '创建直播草稿（志愿者）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: createLiveBodySchema } },
    },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: apiResponse(LiveRoomSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/live/{id}/submit',
  summary: '提交直播审核（志愿者）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(LiveRoomSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/live/{id}/audit',
  summary: '审核直播（学院管理员）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: auditBodySchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(LiveRoomSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/live/{id}/publish',
  summary: '上架直播（志愿者）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(LiveRoomSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/live/{id}/offline',
  summary: '下架直播（志愿者/管理员）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: offlineBodySchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(LiveRoomSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/live/{id}/start',
  summary: '开始直播（志愿者）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(LiveRoomSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/live/{id}/finish',
  summary: '结束直播（志愿者）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: finishBodySchema } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(LiveRoomSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/live/{id}/messages',
  summary: '直播消息列表（登录用户）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema, query: messageListQuerySchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.array(LiveMessageSchema)) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'post',
  path: '/api/live/{id}/messages',
  summary: '发送直播消息（登录用户）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: messageSendBodySchema } } },
  },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: apiResponse(LiveMessageSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/live/{id}/stream',
  summary: '获取直播推/拉流信息（登录用户）',
  tags: ['Live'],
  security: [{ bearerAuth: [] }],
  request: { params: idParamSchema },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

// Public routes
router.get('/', validateQuery(listPublicLivesQuerySchema), LiveController.listPublic);

// 说明：Express v5 使用的新 path-to-regexp 版本不兼容 `:id(\\d+)` 这种写法。
// 为避免 `/mine`、`/admin` 被 `/:id` 吃掉，这里用“更具体的路由优先”顺序来解决。
router.get(
  '/mine',
  authMiddleware,
  requireRole([UserRole.VOLUNTEER]),
  validateQuery(listMineQuerySchema),
  LiveController.listMine
);
router.get(
  '/admin',
  authMiddleware,
  requireRole([UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN]),
  validateQuery(listAdminQuerySchema),
  LiveController.listAdmin
);

router.get(
	'/:id',
  validateParams(idParamSchema),
  (req, res, next) => {
    const authHeader = req.headers.authorization;
    const hasBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
    if (hasBearer) return authMiddleware(req, res, next);
    return next();
  },
  LiveController.getLive
);

// Protected routes
router.use(authMiddleware);

// Volunteer
router.post('/', requireRole([UserRole.VOLUNTEER]), validateBody(createLiveBodySchema), LiveController.createLive);
router.post('/:id/submit', requireRole([UserRole.VOLUNTEER]), validateParams(idParamSchema), LiveController.submitReview);
router.post('/:id/publish', requireRole([UserRole.VOLUNTEER]), validateParams(idParamSchema), LiveController.publishLive);
router.post('/:id/start', requireRole([UserRole.VOLUNTEER]), validateParams(idParamSchema), LiveController.startLive);
router.post(
  '/:id/finish',
  requireRole([UserRole.VOLUNTEER]),
  validateParams(idParamSchema),
  validateBody(finishBodySchema),
  LiveController.finishLive
);

// Live messages
router.get(
  '/:id/messages',
  validateParams(idParamSchema),
  validateQuery(messageListQuerySchema),
  LiveController.listMessages
);
router.post(
  '/:id/messages',
  validateParams(idParamSchema),
  validateBody(messageSendBodySchema),
  LiveController.sendMessage
);

// Offline (volunteer self offline OR admin force offline)
router.post(
  '/:id/offline',
  requireRole([UserRole.VOLUNTEER, UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN]),
  validateParams(idParamSchema),
  validateBody(offlineBodySchema),
  LiveController.offlineLive
);

// Stream info
router.get(
  '/:id/stream',
  validateParams(idParamSchema),
  LiveController.getStreamInfo
);

// College admin (platform admin does NOT audit by PRD)
router.post(
  '/:id/audit',
  requireRole([UserRole.COLLEGE_ADMIN]),
  validateParams(idParamSchema),
  validateBody(auditBodySchema),
  LiveController.auditLive
);

export default router;
