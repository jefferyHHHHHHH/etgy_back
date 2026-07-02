import { Router } from 'express';
import { z } from 'zod';
import { StatsController } from '../controllers/stats.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { validateQuery } from '../middlewares/validate.middleware';
import { UserRole } from '../types/enums';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';

const router = Router();

const rankingMetricSchema = z.enum([
  'score',
  'teachingMinutes',
  'liveFinishedCount',
  'auditPassRate',
  'childCompletionCount',
]);

const rankingPeriodSchema = z.enum(['all', 'month', 'week']);

const volunteerRankingQuerySchema = z.object({
  scope: z.enum(['college', 'school', 'platform']).default('college'),
  collegeId: z.coerce.number().int().positive().optional(),
  school: z.string().optional(),
  metric: rankingMetricSchema.default('score'),
  period: rankingPeriodSchema.default('all'),
  periodKey: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const collegeRankingQuerySchema = z.object({
  metric: rankingMetricSchema.default('score'),
  period: rankingPeriodSchema.default('all'),
  periodKey: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const volunteerMeQuerySchema = z.object({
  period: rankingPeriodSchema.default('all'),
  periodKey: z.string().optional(),
});

const listSchoolsQuerySchema = z.object({
  collegeId: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
});

const volunteerRankingItemSchema = z.object({
  rank: z.number().int().positive(),
  volunteerUserId: z.number().int().positive(),
  realName: z.string(),
  studentId: z.string(),
  collegeId: z.number().int().positive(),
  collegeName: z.string(),
  teachingMinutes: z.number().int().nonnegative(),
  liveFinishedCount: z.number().int().nonnegative(),
  auditPassRate: z.number().nullable(),
  childCompletionCount: z.number().int().nonnegative(),
  score: z.number(),
});

const volunteerRankingResultSchema = z.object({
  scope: z.enum(['college', 'school', 'platform']),
  collegeId: z.number().int().positive().optional(),
  school: z.string().optional(),
  metric: rankingMetricSchema,
  period: rankingPeriodSchema,
  periodKey: z.string().optional(),
  total: z.number().int().nonnegative(),
  items: z.array(volunteerRankingItemSchema),
  myRank: z
    .object({
      rank: z.number().int().positive(),
      score: z.number(),
    })
    .optional(),
  cachedAt: z.string().optional(),
});

const collegeRankingItemSchema = z.object({
  rank: z.number().int().positive(),
  collegeId: z.number().int().positive(),
  collegeName: z.string(),
  volunteerActiveCount: z.number().int().nonnegative(),
  publishedVideoCount: z.number().int().nonnegative(),
  liveFinishedCount: z.number().int().nonnegative(),
  totalTeachingMinutes: z.number().int().nonnegative(),
  auditPassRate: z.number().nullable(),
  childCompletionCount: z.number().int().nonnegative(),
  score: z.number(),
});

registerPath({
  method: 'get',
  path: '/api/stats/volunteers/ranking',
  tags: ['Stats'],
  summary: '志愿者排行榜',
  security: [{ bearerAuth: [] }],
  request: { query: volunteerRankingQuerySchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: apiResponse(volunteerRankingResultSchema) } } },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/stats/colleges/ranking',
  tags: ['Stats'],
  summary: '学院排行榜（平台管理员）',
  security: [{ bearerAuth: [] }],
  request: { query: collegeRankingQuerySchema },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: apiResponse(
            z.object({
              metric: rankingMetricSchema,
              period: rankingPeriodSchema,
              periodKey: z.string().optional(),
              total: z.number().int().nonnegative(),
              items: z.array(collegeRankingItemSchema),
              cachedAt: z.string().optional(),
            })
          ),
        },
      },
    },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/stats/volunteers/me',
  tags: ['Stats'],
  summary: '志愿者个人统计',
  security: [{ bearerAuth: [] }],
  request: { query: volunteerMeQuerySchema },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: apiResponse(
            z.object({
              teachingMinutes: z.number().int().nonnegative(),
              liveFinishedCount: z.number().int().nonnegative(),
              auditPassRate: z.number().nullable(),
              childCompletionCount: z.number().int().nonnegative(),
              ranks: z.object({
                college: z
                  .object({
                    rank: z.number().int().positive(),
                    total: z.number().int().nonnegative(),
                  })
                  .nullable(),
              }),
            })
          ),
        },
      },
    },
    404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

registerPath({
  method: 'get',
  path: '/api/stats/schools',
  tags: ['Stats'],
  summary: '帮扶学校列表（学校榜下拉）',
  security: [{ bearerAuth: [] }],
  request: { query: listSchoolsQuerySchema },
  responses: {
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: apiResponse(
            z.array(
              z.object({
                school: z.string(),
                childCount: z.number().int().nonnegative(),
              })
            )
          ),
        },
      },
    },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});

router.get(
  '/volunteers/ranking',
  authMiddleware,
  requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN, UserRole.VOLUNTEER]),
  validateQuery(volunteerRankingQuerySchema),
  StatsController.volunteerRanking
);

router.get(
  '/colleges/ranking',
  authMiddleware,
  requireRole([UserRole.PLATFORM_ADMIN]),
  validateQuery(collegeRankingQuerySchema),
  StatsController.collegeRanking
);

router.get(
  '/volunteers/me',
  authMiddleware,
  requireRole([UserRole.VOLUNTEER]),
  validateQuery(volunteerMeQuerySchema),
  StatsController.volunteerMe
);

router.get(
  '/schools',
  authMiddleware,
  requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN, UserRole.VOLUNTEER]),
  validateQuery(listSchoolsQuerySchema),
  StatsController.listSchools
);

export default router;
