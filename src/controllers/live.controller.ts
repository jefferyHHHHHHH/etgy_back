import { Request, Response } from 'express';
import { LiveService } from '../services/live.service';
import { UserService } from '../services/user.service';
import { HttpError } from '../utils/httpError';
import { UserRole } from '../types/enums';

export class LiveController {
  static async listPublic(req: Request, res: Response) {
    try {
      const { tab, collegeId, search, page, pageSize } = req.query;
      const result = await LiveService.listPublicLives({
        tab: tab as any,
        collegeId: collegeId ? Number(collegeId) : undefined,
        search: search as string | undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      });
      return res.json({ code: 200, message: 'Success', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error.message });
    }
  }

  static async getLive(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user;

      let viewerCollegeId: number | undefined;
      if (user) {
        const profile = await UserService.getUserProfile(user.userId);
        viewerCollegeId = profile?.adminProfile?.collegeId ?? profile?.volunteerProfile?.collegeId ?? undefined;
      }

      const live = await LiveService.getLiveById({
        liveId: Number(id),
        viewerRole: user?.role as UserRole | undefined,
        viewerUserId: user?.userId,
        viewerCollegeId,
      });

      return res.json({ code: 200, message: 'Success', data: live });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async listMine(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { status, page, pageSize } = req.query;
      const result = await LiveService.listMyLives({
        anchorUserId: user.userId,
        status: status as any,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      });
      return res.json({ code: 200, message: 'Success', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async listAdmin(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { status, collegeId, anchorId, search, page, pageSize } = req.query;

      const profile = await UserService.getUserProfile(user.userId);
      const viewerCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const result = await LiveService.listLivesAdmin({
        viewerRole: user.role as UserRole,
        viewerCollegeId,
        status: status as any,
        collegeId: collegeId ? Number(collegeId) : undefined,
        anchorId: anchorId ? Number(anchorId) : undefined,
        search: search as string | undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      });

      return res.json({ code: 200, message: 'Success', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

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

  static async publishLive(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const updated = await LiveService.publishLive(user.userId, Number(id));
      return res.json({ code: 200, message: 'Published', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async offlineLive(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { reason } = req.body;

      const profile = await UserService.getUserProfile(user.userId);
      const operatorCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const updated = await LiveService.offlineLive({
        operatorUserId: user.userId,
        operatorRole: user.role as UserRole,
        operatorCollegeId,
        liveId: Number(id),
        reason,
      });
      return res.json({ code: 200, message: 'Offlined', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async startLive(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const updated = await LiveService.startLive(user.userId, Number(id));
      return res.json({ code: 200, message: 'Live started', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async finishLive(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const updated = await LiveService.finishLive(user.userId, Number(id));
      return res.json({ code: 200, message: 'Live finished', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async getStreamInfo(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;

      let viewerCollegeId: number | undefined;
      const profile = await UserService.getUserProfile(user.userId);
      viewerCollegeId = profile?.adminProfile?.collegeId ?? profile?.volunteerProfile?.collegeId ?? undefined;

      const data = await LiveService.getStreamInfo({
        liveId: Number(id),
        viewerRole: user.role as UserRole,
        viewerUserId: user.userId,
        viewerCollegeId,
      });

      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }
}
