import { Router } from 'express';
import { ContentController } from '../controllers/content.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Protected Routes (All require login)
router.use(authMiddleware);

// Volunteer/Child operations
// GET /api/videos - List public videos
router.get('/', ContentController.listVideos);

// Volunteer operations
// POST /api/videos - Upload
router.post('/', requireRole([UserRole.VOLUNTEER]), ContentController.createVideo);

// POST /api/videos/:id/submit - Submit for review
router.post('/:id/submit', requireRole([UserRole.VOLUNTEER]), ContentController.submitReview);

// Admin operations
// POST /api/videos/:id/audit
router.post('/:id/audit', requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]), ContentController.auditVideo);

export default router;
