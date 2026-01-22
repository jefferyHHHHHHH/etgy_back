import { Router } from 'express';
import { z } from 'zod';
import { AiController } from '../controllers/ai.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import { apiResponse, registerPath } from '../docs/openapi';
import { requirePermissions } from '../middlewares/permission.middleware';
import { Permission } from '../types/permissions';
import { UserRole } from '../types/enums';

const router = Router();

const tutorChatBodySchema = z.object({
  mode: z.enum(['study', 'emotion']).default('study'),
  message: z.string().min(1).max(200),
  conversationId: z.coerce.number().int().positive().optional(),
});

const tutorChatResultSchema = z.object({
  conversationId: z.number().int().positive(),
  risk: z
    .object({
      triggered: z.boolean(),
      riskType: z.string().optional(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
      alertId: z.number().int().positive().optional(),
    })
    .passthrough(),
  answer: z.string(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const tutorConversationItemSchema = z.object({
  id: z.number().int().positive(),
  mode: z.enum(['STUDY', 'EMOTION']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastMessage: z
    .object({
      role: z.enum(['SYSTEM', 'USER', 'ASSISTANT']),
      content: z.string(),
    })
    .nullable(),
});

const listTutorConversationsResultSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  items: z.array(tutorConversationItemSchema),
});

const tutorMessageSchema = z.object({
  id: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  role: z.enum(['SYSTEM', 'USER', 'ASSISTANT']),
  content: z.string(),
  createdAt: z.string().datetime(),
});

const tutorConversationDetailSchema = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  mode: z.enum(['STUDY', 'EMOTION']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messages: z.array(tutorMessageSchema),
});

const listRiskAlertsQuerySchema = z.object({
  status: z.enum(['OPEN', 'HANDLED']).optional(),
  collegeId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const riskAlertItemSchema = z.object({
  id: z.number().int().positive(),
  conversationId: z.number().int().positive(),
  userId: z.number().int().positive(),
  collegeId: z.number().int().positive().nullable().optional(),
  mode: z.enum(['STUDY', 'EMOTION']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  riskType: z.string(),
  inputText: z.string(),
  matchedKeywords: z.string().nullable().optional(),
  status: z.enum(['OPEN', 'HANDLED']),
  handledAt: z.string().datetime().nullable().optional(),
  handledBy: z.number().int().positive().nullable().optional(),
  handleNote: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  user: z
    .object({
      id: z.number().int().positive(),
      username: z.string(),
      role: z.nativeEnum(UserRole),
      childProfile: z
        .object({
          realName: z.string(),
          school: z.string(),
          grade: z.string(),
          gender: z.any().optional(),
          collegeId: z.number().int().positive().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
  college: z
    .object({
      id: z.number().int().positive(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  handledByUser: z
    .object({
      id: z.number().int().positive(),
      username: z.string(),
      role: z.nativeEnum(UserRole),
    })
    .nullable()
    .optional(),
});

const listRiskAlertsResultSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  items: z.array(riskAlertItemSchema),
});

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const handleRiskAlertBodySchema = z.object({
  note: z.string().max(2000).optional(),
});

// OpenAPI registrations
registerPath({
  method: 'post',
  path: '/api/ai/tutor/chat',
  summary: '儿童 AI 辅导对话',
  tags: ['AI'],
  request: {
    body: {
      content: {
        'application/json': {
          schema: tutorChatBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: apiResponse(tutorChatResultSchema),
        },
      },
    },
  },
});

registerPath({
  method: 'get',
  path: '/api/ai/tutor/conversations',
  summary: '获取 AI 辅导会话列表（儿童）',
  tags: ['AI'],
  request: {
    query: paginationQuerySchema,
  },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: apiResponse(listTutorConversationsResultSchema),
        },
      },
    },
  },
});

registerPath({
  method: 'get',
  path: '/api/ai/tutor/conversations/{id}',
  summary: '获取 AI 辅导会话详情（儿童）',
  tags: ['AI'],
  request: {
    params: idParamSchema,
  },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: apiResponse(tutorConversationDetailSchema),
        },
      },
    },
  },
});

registerPath({
  method: 'get',
  path: '/api/ai/risk-alerts',
  summary: 'AI 风险告警列表（学院/平台）',
  tags: ['AI'],
  request: {
    query: listRiskAlertsQuerySchema,
  },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: apiResponse(listRiskAlertsResultSchema),
        },
      },
    },
  },
});

registerPath({
  method: 'patch',
  path: '/api/ai/risk-alerts/{id}/handle',
  summary: '处理 AI 风险告警',
  tags: ['AI'],
  request: {
    params: idParamSchema,
    body: {
      content: {
        'application/json': {
          schema: handleRiskAlertBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'OK',
      content: {
        'application/json': {
          schema: apiResponse(riskAlertItemSchema),
        },
      },
    },
  },
});

// Routes
router.post(
  '/tutor/chat',
  authMiddleware,
  requireRole([UserRole.CHILD]),
  validateBody(tutorChatBodySchema),
  AiController.chatTutor
);

router.get(
  '/tutor/conversations',
  authMiddleware,
  requireRole([UserRole.CHILD]),
  validateQuery(paginationQuerySchema),
  AiController.listTutorConversations
);

router.get(
  '/tutor/conversations/:id',
  authMiddleware,
  requireRole([UserRole.CHILD]),
  validateParams(idParamSchema),
  AiController.getTutorConversation
);

router.get(
  '/risk-alerts',
  authMiddleware,
  requireRole([UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN]),
  requirePermissions([Permission.AI_RISK_VIEW]),
  validateQuery(listRiskAlertsQuerySchema),
  AiController.listRiskAlerts
);

router.patch(
  '/risk-alerts/:id/handle',
  authMiddleware,
  requireRole([UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN]),
  requirePermissions([Permission.AI_RISK_HANDLE]),
  validateParams(idParamSchema),
  validateBody(handleRiskAlertBodySchema),
  AiController.handleRiskAlert
);

export default router;
