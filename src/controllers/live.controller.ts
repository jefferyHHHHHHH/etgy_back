import { Request, Response } from 'express';
import { LiveService } from '../services/live.service';
import { UserService } from '../services/user.service';
import { HttpError } from '../utils/httpError';
import { UserRole } from '../types/enums';

export class LiveController {
  static async createLive(req: Request, res: Response) {
    try {
      const user = req.user!;
      const profile = await UserService.getUserProfile(user.userId);
      const collegeId = profile?.volunteerProfile?.collegeId;

      const live = await LiveService.createLiveDraft(user.userId, collegeId, {
        title: req.body.title,
        intro: req.body.intro,
        planStartTime: new Date(req.body.planStartTime),
        planEndTime: new Date(req.body.planEndTime),
      });

      res.json({ code: 201, message: 'Live draft created', data: live });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async submitReview(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const updated = await LiveService.submitReview(Number(id), user.userId);
      res.json({ code: 200, message: 'Submitted for review', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async auditLive(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { pass, reason } = req.body;

      const profile = await UserService.getUserProfile(user.userId);
      const adminCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const result = await LiveService.auditLive({
        adminUserId: user.userId,
        adminRole: user.role as UserRole,
        adminCollegeId,
        liveId: Number(id),
        pass: Boolean(pass),
        reason,
      });

      res.json({ code: 200, message: 'Audit complete', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      res.status(400).json({ code: 400, message: error.message });
    }
  }
}
