import { Router } from 'express';
import { z } from 'zod';
import { ContentController } from '../controllers/content.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '../types/enums';
import { validateParams, validateQuery } from '../middlewares/validate.middleware';
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
});

// Protected Routes (All require login)
router.use(authMiddleware);

// Volunteer/Child operations
// GET /api/videos - List public videos
router.get('/', validateQuery(listVideosQuerySchema), ContentController.listVideos);

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
	requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]),
	validateParams(idParamSchema),
	ContentController.auditVideo
);

export default router;
