import { Router } from 'express';
import { z } from 'zod';
import { ContentController } from '../controllers/content.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '../types/enums';
import { validateBody, validateParams, validateQuery } from '../middlewares/validate.middleware';
import { VideoStatus } from '../types/enums';

const router = Router();

const idParamSchema = z.object({
	id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
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

const offlineBodySchema = z.object({
	reason: z.string().optional(),
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

// Protected Routes (All other video operations require login)
router.use(authMiddleware);

// Volunteer operations
// POST /api/videos - Upload
router.post('/', requireRole([UserRole.VOLUNTEER]), ContentController.createVideo);

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

// Offline operations (volunteer self-offline OR admin force offline)
// POST /api/videos/:id/offline
router.post(
	'/:id/offline',
	requireRole([UserRole.VOLUNTEER, UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN]),
	validateParams(idParamSchema),
	validateBody(offlineBodySchema),
	ContentController.offlineVideo
);

export default router;
