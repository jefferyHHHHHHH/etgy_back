import { Router } from 'express';
import { z } from 'zod';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '../types/enums';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import { Gender, VolunteerStatus } from '../types/enums';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';

const router = Router();

const idParamSchema = z.object({
	id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const listVolunteersQuerySchema = z.object({
	collegeId: z.coerce.number().int().positive().optional(),
	status: z.nativeEnum(VolunteerStatus).optional(),
});

const createChildBodySchema = z.object({
	username: z.string().min(1),
	realName: z.string().min(1),
	school: z.string().min(1),
	grade: z.string().min(1),
	gender: z.nativeEnum(Gender),
});

const updateVolunteerStatusBodySchema = z.object({
	status: z.nativeEnum(VolunteerStatus),
});

// OpenAPI registration
registerPath({
	method: 'get',
	path: '/api/users/me',
	summary: '获取我的用户信息',
	security: [{ bearerAuth: [] }],
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/users/children',
	summary: '创建儿童账号（管理员）',
	security: [{ bearerAuth: [] }],
	request: { body: { content: { 'application/json': { schema: createChildBodySchema } } } },
	responses: {
		201: { description: 'Created', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/users/volunteers',
	summary: '获取志愿者列表（管理员）',
	security: [{ bearerAuth: [] }],
	request: { query: listVolunteersQuerySchema },
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'patch',
	path: '/api/users/volunteers/{id}/status',
	summary: '更新志愿者状态（管理员）',
	security: [{ bearerAuth: [] }],
	request: {
		params: idParamSchema,
		body: { content: { 'application/json': { schema: updateVolunteerStatusBodySchema } } },
	},
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

// Public Routes (None for now)

// Protected Routes
router.use(authMiddleware);

router.get('/me', UserController.getMe);

// Admin Routes
router.post(
	'/children',
	requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]),
	validateBody(createChildBodySchema),
	UserController.createChild
);

router.get(
	'/volunteers',
	requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]),
	validateQuery(listVolunteersQuerySchema),
	UserController.listVolunteers
);

router.patch(
	'/volunteers/:id/status',
	requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]),
	validateParams(idParamSchema),
	validateBody(updateVolunteerStatusBodySchema),
	UserController.updateVolunteerStatus
);

export default router;
