import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '../types/enums';

const router = Router();

// Public Routes (None for now)

// Protected Routes
router.use(authMiddleware);

router.get('/me', UserController.getMe);

// Admin Routes
router.post('/children', requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]), UserController.createChild);

router.get('/volunteers', requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]), UserController.listVolunteers);
router.patch('/volunteers/:id/status', requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]), UserController.updateVolunteerStatus);

export default router;
