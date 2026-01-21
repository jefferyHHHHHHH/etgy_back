import { Router } from 'express';
import { z } from 'zod';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { UserRole, UserStatus } from '../types/enums';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import { Gender, VolunteerStatus } from '../types/enums';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';
import { requirePermissions } from '../middlewares/permission.middleware';
import { Permission } from '../types/permissions';
import multer from 'multer';

const router = Router();

const idParamSchema = z.object({
	id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const listVolunteersQuerySchema = z.object({
	collegeId: z.coerce.number().int().positive().optional(),
	status: z.nativeEnum(VolunteerStatus).optional(),
	userStatus: z.nativeEnum(UserStatus).optional(),
	search: z.string().optional(),
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createChildBodySchema = z.object({
	username: z.string().min(1),
	password: z.string().min(6),
	realName: z.string().min(1),
	school: z.string().min(1),
	grade: z.string().min(1),
	gender: z.nativeEnum(Gender),
});

const createChildrenBatchBodySchema = z.object({
	items: z.array(createChildBodySchema).min(1),
});

const createChildrenBatchExcelBodySchema = z.object({
	file: z.string().openapi({ type: 'string', format: 'binary', description: 'Excel 文件（.xlsx），字段名固定为 file' }),
});

const createChildrenBatchExcelResultSchema = z.object({
	total: z.number().int().nonnegative(),
	success: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative(),
	results: z.array(
		z.union([
			z.object({ rowNumber: z.number().int().positive(), ok: z.literal(true), username: z.string(), userId: z.number().int().positive() }),
			z.object({ rowNumber: z.number().int().positive(), ok: z.literal(false), username: z.string(), message: z.string() }),
		])
	),
});

const excelUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const listChildrenQuerySchema = z.object({
	search: z.string().optional().describe('按用户名/姓名模糊搜索'),
	school: z.string().optional(),
	grade: z.string().optional(),
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const updateUserStatusBodySchema = z.object({
	status: z.nativeEnum(UserStatus),
});

const suspendBodySchema = z.object({
	suspended: z.coerce.boolean(),
});

const createVolunteerAccountBodySchema = z.object({
	username: z.string().min(3),
	password: z.string().min(6),
	realName: z.string().min(1),
	studentId: z.string().min(1),
	collegeId: z.coerce.number().int().positive().optional().describe('仅平台管理员创建时需要传；学院管理员会被强制使用自身学院'),
	phone: z.string().optional(),
});

const changePasswordBodySchema = z.object({
	oldPassword: z.string().min(1),
	newPassword: z.string().min(6),
});

const updateVolunteerStatusBodySchema = z.object({
	status: z.nativeEnum(VolunteerStatus),
});

// OpenAPI registration
registerPath({
	method: 'get',
	path: '/api/users/me',
	summary: '获取我的用户信息',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/users/children',
	summary: '创建儿童账号（平台管理员建档）',
	tags: ['Users'],
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
	method: 'post',
	path: '/api/users/children/batch',
	summary: '批量创建儿童账号（平台管理员建档）',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { 'application/json': { schema: createChildrenBatchBodySchema } } } },
	responses: {
		201: { description: 'Created', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/users/children/batch-excel',
	summary: '批量导入儿童账号（Excel .xlsx）',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	request: {
		body: {
			content: {
				'multipart/form-data': {
					schema: createChildrenBatchExcelBodySchema,
				},
			},
		},
	},
	responses: {
		201: { description: 'Created', content: { 'application/json': { schema: apiResponse(createChildrenBatchExcelResultSchema) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/users/children/batch-excel/template',
	summary: '下载儿童批量导入 Excel 模板（.xlsx）',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	responses: {
		200: {
			description: 'Excel template',
			content: {
				'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
					schema: z.string().openapi({ type: 'string', format: 'binary' }),
				},
			},
		},
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/users/children',
	summary: '获取儿童账号列表（平台管理员）',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	request: { query: listChildrenQuerySchema },
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/users/children/{id}/reset-password',
	summary: '重置儿童账号密码（平台管理员）',
	tags: ['Users'],
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
	method: 'patch',
	path: '/api/users/children/{id}/status',
	summary: '更新儿童账号状态（平台管理员）',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	request: {
		params: idParamSchema,
		body: { content: { 'application/json': { schema: updateUserStatusBodySchema } } },
	},
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/users/volunteers/accounts',
	summary: '创建志愿者账号（学院管理员/平台管理员）',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { 'application/json': { schema: createVolunteerAccountBodySchema } } } },
	responses: {
		201: { description: 'Created', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'patch',
	path: '/api/users/me/password',
	summary: '修改我的密码',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { 'application/json': { schema: changePasswordBodySchema } } } },
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/users/volunteers',
	summary: '获取志愿者列表（管理员）',
	tags: ['Users'],
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
	path: '/api/users/volunteers/{id}/suspend',
	summary: '停用/启用志愿者账号（管理员）',
	tags: ['Users'],
	security: [{ bearerAuth: [] }],
	request: {
		params: idParamSchema,
		body: { content: { 'application/json': { schema: suspendBodySchema } } },
	},
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
	path: '/api/users/volunteers/{id}/status',
	summary: '更新志愿者状态（管理员）',
	tags: ['Users'],
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

router.patch('/me/password', validateBody(changePasswordBodySchema), UserController.changePassword);

// Admin Routes
router.post(
	'/children',
	requireRole([UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.USER_CHILD_CREATE]),
	validateBody(createChildBodySchema),
	UserController.createChild
);

router.post(
	'/children/batch',
	requireRole([UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.USER_CHILD_CREATE]),
	validateBody(createChildrenBatchBodySchema),
	UserController.createChildrenBatch
);

router.post(
	'/children/batch-excel',
	requireRole([UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.USER_CHILD_CREATE]),
	excelUpload.single('file'),
	UserController.createChildrenBatchExcel
);

router.get(
	'/children/batch-excel/template',
	requireRole([UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.USER_CHILD_CREATE]),
	UserController.downloadChildrenBatchExcelTemplate
);

router.get(
	'/children',
	requireRole([UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.USER_CHILD_VIEW]),
	validateQuery(listChildrenQuerySchema),
	UserController.listChildren
);

router.post(
	'/children/:id/reset-password',
	requireRole([UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.USER_CHILD_MANAGE]),
	validateParams(idParamSchema),
	UserController.resetChildPassword
);

router.patch(
	'/children/:id/status',
	requireRole([UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.USER_CHILD_MANAGE]),
	validateParams(idParamSchema),
	validateBody(updateUserStatusBodySchema),
	UserController.updateChildStatus
);

router.post(
	'/volunteers/accounts',
	requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]),
	requirePermissions([Permission.USER_VOLUNTEER_CREATE]),
	validateBody(createVolunteerAccountBodySchema),
	UserController.createVolunteerAccount
);

router.get(
	'/volunteers',
	requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]),
	requirePermissions([Permission.USER_VOLUNTEER_MANAGE]),
	validateQuery(listVolunteersQuerySchema),
	UserController.listVolunteers
);

router.patch(
	'/volunteers/:id/suspend',
	requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]),
	requirePermissions([Permission.USER_VOLUNTEER_MANAGE]),
	validateParams(idParamSchema),
	validateBody(suspendBodySchema),
	UserController.suspendVolunteer
);

router.patch(
	'/volunteers/:id/status',
	requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]),
	requirePermissions([Permission.USER_VOLUNTEER_MANAGE]),
	validateParams(idParamSchema),
	validateBody(updateVolunteerStatusBodySchema),
	UserController.updateVolunteerStatus
);

export default router;
