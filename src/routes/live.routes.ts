import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { validateBody, validateParams } from '../middlewares/validate.middleware';
import { LiveController } from '../controllers/live.controller';
import { UserRole } from '../types/enums';

const router = Router();

const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a positive integer'),
});

const createLiveBodySchema = z.object({
  title: z.string().min(1),
  intro: z.string().optional(),
  planStartTime: z.string().min(1),
  planEndTime: z.string().min(1),
});

const auditBodySchema = z.object({
  pass: z.coerce.boolean(),
  reason: z.string().optional(),
});

router.use(authMiddleware);

// Volunteer
router.post('/', requireRole([UserRole.VOLUNTEER]), validateBody(createLiveBodySchema), LiveController.createLive);
router.post('/:id/submit', requireRole([UserRole.VOLUNTEER]), validateParams(idParamSchema), LiveController.submitReview);

// College admin (platform admin does NOT audit by PRD)
router.post('/:id/audit', requireRole([UserRole.COLLEGE_ADMIN]), validateParams(idParamSchema), validateBody(auditBodySchema), LiveController.auditLive);

export default router;
