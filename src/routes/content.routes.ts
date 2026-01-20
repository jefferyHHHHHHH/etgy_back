import { Router } from 'express';
import { z } from 'zod';
import { ContentController } from '../controllers/content.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '../types/enums';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import { VideoStatus } from '../types/enums';
import { apiResponse, BaseResponseSchema, ErrorResponseSchema, registerPath } from '../docs/openapi';
import { LiveMessageSchema, VideoCommentSchema, VideoSchema, VideoWatchLogSchema } from '../docs/schemas';
import { requireAnyPermissions, requirePermissions } from '../middlewares/permission.middleware';
import { Permission } from '../types/permissions';

const router = Router();

const idParamSchema = z.object({
	id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const createVideoBodySchema = z.object({
	title: z.string().min(1),
	url: z.string().min(1),
	intro: z.string().optional(),
	coverUrl: z.string().optional(),
	duration: z.coerce.number().int().positive().optional(),
	gradeRange: z.string().optional(),
	subjectTag: z.string().optional(),
});

const updateVideoBodySchema = z.object({
	title: z.string().min(1).optional(),
	url: z.string().min(1).optional(),
	intro: z.string().optional(),
	coverUrl: z.string().optional(),
	duration: z.coerce.number().int().positive().optional(),
	gradeRange: z.string().optional(),
	subjectTag: z.string().optional(),
});

const listVideosQuerySchema = z.object({
	status: z.nativeEnum(VideoStatus).optional(),
	collegeId: z.coerce.number().int().positive().optional(),
	uploaderId: z.coerce.number().int().positive().optional(),
	search: z.string().optional(),
	grade: z.string().optional(),
	subject: z.string().optional(),
	sort: z.enum(['latest', 'hot']).default('latest'),
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const auditBodySchema = z.object({
	pass: z.coerce.boolean(),
	reason: z.string().optional(),
});

const auditBatchBodySchema = z.object({
	ids: z.array(z.coerce.number().int().positive()).min(1),
	pass: z.coerce.boolean(),
	reason: z.string().optional(),
});

const offlineBodySchema = z.object({
	reason: z.string().optional(),
});

const commentCreateBodySchema = z.object({
	content: z.string().min(1).max(2000),
});

const listCommentsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const auditCommentBodySchema = z.object({
	pass: z.coerce.boolean(),
	reason: z.string().optional(),
});

const commentIdParamSchema = z.object({
	commentId: z.string().regex(/^\d+$/, 'commentId must be a positive integer'),
});

const watchBodySchema = z.object({
	lastPositionSec: z.coerce.number().int().min(0).default(0),
	watchedSeconds: z.coerce.number().int().min(0).default(0).describe('本次增量观看秒数（delta）'),
	completed: z.coerce.boolean().optional(),
});

const listWatchLogsQuerySchema = z.object({
	videoId: z.coerce.number().int().positive().optional(),
	completed: z.coerce.boolean().optional(),
	page: z.coerce.number().int().min(1).default(1),
	pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// OpenAPI registration (single source of truth = Zod schemas)
registerPath({
	method: 'get',
	path: '/api/videos',
	summary: '获取视频列表（公开）',
	tags: ['Videos'],
	description: '游客/儿童仅可获取已发布(PUBLISHED)内容；search 或请求非 PUBLISHED 时需登录。',
	request: {
		query: listVideosQuerySchema,
	},
	responses: {
		200: {
			description: 'Success',
			content: {
				'application/json': {
					schema: apiResponse(z.array(VideoSchema)),
				},
			},
		},
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/videos/{id}',
	summary: '获取视频详情（公开）',
	tags: ['Videos'],
	request: { params: idParamSchema },
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(VideoSchema) } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/videos/{id}/media-urls',
	summary: '获取视频/封面临时访问 URL（私有桶预签名）',
	tags: ['Videos'],
	description: '返回视频与封面图的 presigned GET URL。游客仅能获取已发布(PUBLISHED)视频。',
	request: { params: idParamSchema },
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos',
	summary: '创建视频草稿（志愿者）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: {
		body: {
			description: 'Create video draft',
			content: { 'application/json': { schema: createVideoBodySchema } },
		},
	},
	responses: {
		201: { description: 'Created', content: { 'application/json': { schema: apiResponse(VideoSchema) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'patch',
	path: '/api/videos/{id}',
	summary: '编辑视频（志愿者：草稿/驳回）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: {
		params: idParamSchema,
		body: { content: { 'application/json': { schema: updateVideoBodySchema } } },
	},
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(VideoSchema) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'delete',
	path: '/api/videos/{id}',
	summary: '删除视频（志愿者：草稿/驳回）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: { params: idParamSchema },
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/{id}/like',
	summary: '点赞/取消点赞（登录用户）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: { params: idParamSchema },
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/{id}/favorite',
	summary: '收藏/取消收藏（登录用户）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: { params: idParamSchema },
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/videos/{id}/comments',
	summary: '获取视频评论列表（公开：仅已通过）',
	tags: ['Videos'],
	request: { params: idParamSchema, query: listCommentsQuerySchema },
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.array(VideoCommentSchema)) } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/{id}/comments',
	summary: '发表评论（儿童/登录用户，默认待审核）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: {
		params: idParamSchema,
		body: { content: { 'application/json': { schema: commentCreateBodySchema } } },
	},
	responses: {
		201: { description: 'Created', content: { 'application/json': { schema: apiResponse(VideoCommentSchema) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/comments/{commentId}/audit',
	summary: '审核评论（管理员）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: {
		params: commentIdParamSchema,
		body: { content: { 'application/json': { schema: auditCommentBodySchema } } },
	},
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(VideoCommentSchema) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/{id}/watch',
	summary: '上报学习/播放记录（登录用户）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: {
		params: idParamSchema,
		body: { content: { 'application/json': { schema: watchBodySchema } } },
	},
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(VideoWatchLogSchema) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		404: { description: 'Not Found', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/videos/watch-logs',
	summary: '获取我的学习/播放记录（登录用户）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: { query: listWatchLogsQuerySchema },
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/videos/mine/dashboard',
	summary: '志愿者视频数据面板（我的）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/{id}/submit',
	summary: '提交视频审核（志愿者）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: { params: idParamSchema },
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: BaseResponseSchema } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/{id}/audit',
	summary: '审核视频（学院管理员）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: {
		params: idParamSchema,
		body: { content: { 'application/json': { schema: auditBodySchema } } },
	},
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(VideoSchema) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'get',
	path: '/api/videos/admin',
	summary: '管理端视频列表（学院/平台管理员）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	description: '管理端使用：默认返回待审核(REVIEW)视频，可按 status/collegeId/uploaderId/search 等筛选。平台管理员可跨学院查看；学院管理员仅能查看本学院。',
	request: { query: listVideosQuerySchema },
	responses: {
		200: { description: 'Success', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/audit/batch',
	summary: '批量审核视频（学院管理员）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: { body: { content: { 'application/json': { schema: auditBatchBodySchema } } } },
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(z.any()) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/{id}/publish',
	summary: '发布视频（志愿者）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: { params: idParamSchema },
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(VideoSchema) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/videos/{id}/offline',
	summary: '下架视频（志愿者/管理员）',
	tags: ['Videos'],
	security: [{ bearerAuth: [] }],
	request: {
		params: idParamSchema,
		body: { content: { 'application/json': { schema: offlineBodySchema } } },
	},
	responses: {
		200: { description: 'OK', content: { 'application/json': { schema: apiResponse(VideoSchema) } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

// Public listing (Published videos)
// - Anyone (including guests) can browse published videos
// - Searching requires login
// - Requesting non-PUBLISHED status requires login
router.get(
	'/',
	validateQuery(listVideosQuerySchema),
	(req, res, next) => {
		const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
		const status = req.query.status as VideoStatus | undefined;
		const needsAuth = (search.length > 0) || (status && status !== VideoStatus.PUBLISHED);
		if (needsAuth) return authMiddleware(req, res, next);
		return next();
	},
	ContentController.listVideos
);

// Public video detail
// - Guests can only view published videos
// - Non-published access requires login and is scope-checked in service
router.get(
	'/:id',
	validateParams(idParamSchema),
	(req, res, next) => {
		// If user provides token, allow richer access rules downstream
		const authHeader = req.headers.authorization;
		const hasBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
		if (hasBearer) return authMiddleware(req, res, next);
		return next();
	},
	ContentController.getVideo
);

// Public comments list (optional auth)
router.get(
	'/:id/comments',
	validateParams(idParamSchema),
	validateQuery(listCommentsQuerySchema),
	(req, res, next) => {
		const authHeader = req.headers.authorization;
		const hasBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
		if (hasBearer) return authMiddleware(req, res, next);
		return next();
	},
	ContentController.listVideoComments
);

// Public media urls (optional auth)
router.get(
	'/:id/media-urls',
	validateParams(idParamSchema),
	(req, res, next) => {
		const authHeader = req.headers.authorization;
		const hasBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
		if (hasBearer) return authMiddleware(req, res, next);
		return next();
	},
	ContentController.getVideoMediaUrls
);

// Protected Routes (All other video operations require login)
router.use(authMiddleware);

// Watch logs
router.get('/watch-logs', validateQuery(listWatchLogsQuerySchema), ContentController.listMyWatchLogs);

// Volunteer dashboard (must be before '/:id' mutations if any future pattern overlaps)
router.get('/mine/dashboard', requireRole([UserRole.VOLUNTEER]), ContentController.getMyVideoDashboard);

// Admin management routes
router.get(
	'/admin',
	requireRole([UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN]),
	// Platform admins can list to compare colleges / manage offlining; college admins list for reviews
	requireAnyPermissions([Permission.VIDEO_REVIEW, Permission.VIDEO_OFFLINE]),
	validateQuery(listVideosQuerySchema),
	ContentController.listVideosAdmin
);

router.post(
	'/audit/batch',
	requireRole([UserRole.COLLEGE_ADMIN]),
	requirePermissions([Permission.VIDEO_REVIEW]),
	validateBody(auditBatchBodySchema),
	ContentController.auditVideosBatch
);

// Volunteer operations
// POST /api/videos - Upload
router.post('/', requireRole([UserRole.VOLUNTEER]), validateBody(createVideoBodySchema), ContentController.createVideo);

// Edit / delete video (only draft/rejected)
router.patch(
	'/:id',
	requireRole([UserRole.VOLUNTEER]),
	requirePermissions([Permission.VIDEO_EDIT]),
	validateParams(idParamSchema),
	validateBody(updateVideoBodySchema),
	ContentController.updateVideo
);
router.delete(
	'/:id',
	requireRole([UserRole.VOLUNTEER]),
	requirePermissions([Permission.VIDEO_DELETE]),
	validateParams(idParamSchema),
	ContentController.deleteVideo
);

// POST /api/videos/:id/submit - Submit for review
router.post(
	'/:id/submit',
	requireRole([UserRole.VOLUNTEER]),
	validateParams(idParamSchema),
	ContentController.submitReview
);

// Admin operations
// POST /api/videos/:id/audit
router.post(
	'/:id/audit',
	requireRole([UserRole.COLLEGE_ADMIN]),
	requirePermissions([Permission.VIDEO_REVIEW]),
	validateParams(idParamSchema),
	validateBody(auditBodySchema),
	ContentController.auditVideo
);

// Volunteer operations
// POST /api/videos/:id/publish - Publish an approved video
router.post(
	'/:id/publish',
	requireRole([UserRole.VOLUNTEER]),
	validateParams(idParamSchema),
	ContentController.publishVideo
);

// Interactions
router.post('/:id/like', validateParams(idParamSchema), ContentController.toggleLike);
router.post('/:id/favorite', validateParams(idParamSchema), ContentController.toggleFavorite);
router.post(
	'/:id/comments',
	validateParams(idParamSchema),
	validateBody(commentCreateBodySchema),
	ContentController.createVideoComment
);
router.post(
	'/comments/:commentId/audit',
	requireRole([UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.COMMENT_REVIEW]),
	validateParams(commentIdParamSchema),
	validateBody(auditCommentBodySchema),
	ContentController.auditVideoComment
);

// Study/watch record
router.post('/:id/watch', validateParams(idParamSchema), validateBody(watchBodySchema), ContentController.reportWatchLog);

// Offline operations (volunteer self-offline OR admin force offline)
// POST /api/videos/:id/offline
router.post(
	'/:id/offline',
	requireRole([UserRole.VOLUNTEER, UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN]),
	requirePermissions([Permission.VIDEO_OFFLINE]),
	validateParams(idParamSchema),
	validateBody(offlineBodySchema),
	ContentController.offlineVideo
);

export default router;
