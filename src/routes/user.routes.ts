import { Router } from 'express';
import { z } from 'zod';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { UserRole } from '../types/enums';
import { validateParams, validateQuery } from '../middlewares/validate.middleware';
import { VolunteerStatus } from '../types/enums';

const router = Router();

const idParamSchema = z.object({
	id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const listVolunteersQuerySchema = z.object({
	collegeId: z.coerce.number().int().positive().optional(),
	status: z.nativeEnum(VolunteerStatus).optional(),
});

// Public Routes (None for now)

// Protected Routes
router.use(authMiddleware);

router.get('/me', UserController.getMe);

// Admin Routes
router.post('/children', requireRole([UserRole.PLATFORM_ADMIN, UserRole.COLLEGE_ADMIN]), UserController.createChild);

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
	UserController.updateVolunteerStatus
);

export default router;
