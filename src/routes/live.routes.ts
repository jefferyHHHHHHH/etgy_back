import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams } from '../middlewares/validate.middleware';
import { LiveController } from '../controllers/live.controller';
import { UserRole } from '../types/enums';
import { apiResponse, BaseResponseSchema, ErrorResponseSchema, registerPath } from '../docs/openapi';
import { LiveRoomSchema } from '../docs/schemas';

const router = Router();

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
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

// OpenAPI registration
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

router.use(authMiddleware);

// Volunteer
router.post('/', requireRole([UserRole.VOLUNTEER]), validateBody(createLiveBodySchema), LiveController.createLive);
router.post('/:id/submit', requireRole([UserRole.VOLUNTEER]), validateParams(idParamSchema), LiveController.submitReview);

// College admin (platform admin does NOT audit by PRD)
router.post('/:id/audit', requireRole([UserRole.COLLEGE_ADMIN]), validateParams(idParamSchema), validateBody(auditBodySchema), LiveController.auditLive);

export default router;
