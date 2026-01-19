import { Request, Response } from 'express';
import { ContentService } from '../services/content.service';
import { UserService } from '../services/user.service';
import { VideoStatus, UserRole } from '../types/enums';
import { HttpError } from '../utils/httpError';

export class ContentController {
  
  static async createVideo(req: Request, res: Response) {
    try {
      const user = req.user!;
      // Fetch profile to get collegeId
      const profile = await UserService.getUserProfile(user.userId);
      const collegeId = profile?.volunteerProfile?.collegeId; // Assuming volunteer

      const video = await ContentService.createVideo(user.userId, collegeId, req.body);
      res.json({ code: 201, message: 'Video created', data: video });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async listVideos(req: Request, res: Response) {
    try {
        const user = req.user;
	  const { status, collegeId, uploaderId, search, grade, subject, sort, page, pageSize } = req.query;

        // Load viewer scope only when logged in
        let viewerCollegeId: number | undefined;
        if (user) {
          const profile = await UserService.getUserProfile(user.userId);
          viewerCollegeId = profile?.adminProfile?.collegeId ?? profile?.volunteerProfile?.collegeId ?? undefined;
        }
      
	  const result = await ContentService.listVideos({
        status: status as VideoStatus,
        collegeId: collegeId ? Number(collegeId) : undefined,
        uploaderId: uploaderId ? Number(uploaderId) : undefined,
        search: search as string,
		  grade: grade as string | undefined,
		  subject: subject as string | undefined,
		  sort: (sort as 'latest' | 'hot') ?? 'latest',
		  page: page ? Number(page) : undefined,
		  pageSize: pageSize ? Number(pageSize) : undefined,
          viewerRole: user?.role as UserRole | undefined,
          viewerUserId: user?.userId,
          viewerCollegeId,
      });

	  res.setHeader('X-Total-Count', String(result.total));
	  res.setHeader('X-Page', String(result.page));
	  res.setHeader('X-Page-Size', String(result.pageSize));
	  res.json({ code: 200, message: 'Success', data: result.items });
    } catch (error: any) {
        if (error instanceof HttpError) {
          return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
        }
        res.status(500).json({ code: 500, message: error.message });
    }
  }

  /**
   * GET /api/videos/admin
   * Management list for admins (college/platform).
   * Returns pagination meta in response body (friendlier for admin UIs).
   */
  static async listVideosAdmin(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { status, collegeId, uploaderId, search, grade, subject, sort, page, pageSize } = req.query;

      // Load viewer scope
      const profile = await UserService.getUserProfile(user.userId);
      const viewerCollegeId = profile?.adminProfile?.collegeId ?? profile?.volunteerProfile?.collegeId ?? undefined;

      // Admin default: pending review
      const effectiveStatus = (status as VideoStatus | undefined) ?? VideoStatus.REVIEW;

      const result = await ContentService.listVideos({
        status: effectiveStatus,
        collegeId: collegeId ? Number(collegeId) : undefined,
        uploaderId: uploaderId ? Number(uploaderId) : undefined,
        search: search as string,
        grade: grade as string | undefined,
        subject: subject as string | undefined,
        sort: (sort as 'latest' | 'hot') ?? 'latest',
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        viewerRole: user.role as UserRole,
        viewerUserId: user.userId,
        viewerCollegeId,
      });

      return res.json({
        code: 200,
        message: 'Success',
        data: result,
      });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error.message });
    }
  }

  /**
   * POST /api/videos/audit/batch
   * Batch audit videos (college admin only).
   */
  static async auditVideosBatch(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { ids, pass, reason } = req.body;

      const profile = await UserService.getUserProfile(user.userId);
      const adminCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const result = await ContentService.auditVideosBatch({
        adminUserId: user.userId,
        adminRole: user.role as UserRole,
        adminCollegeId,
        ids,
        pass: Boolean(pass),
        reason,
      });

      return res.json({ code: 200, message: 'Batch audit complete', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async submitReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user!;
      await ContentService.submitReview(Number(id), user.userId);
      res.json({ code: 200, message: 'Submitted for review' });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async auditVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { pass, reason } = req.body;
      const user = req.user!;

      const profile = await UserService.getUserProfile(user.userId);
      const adminCollegeId = profile?.adminProfile?.collegeId ?? undefined;
      
      const result = await ContentService.auditVideo(
        user.userId,
        user.role as UserRole,
        adminCollegeId,
        Number(id),
        Boolean(pass),
        reason
      );
      res.json({ code: 200, message: 'Audit complete', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  /**
   * GET /api/videos/:id
   * - Guest: only PUBLISHED
   * - Logged in: role-scoped access to non-published
   */
  static async getVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user;

      let viewerCollegeId: number | undefined;
      if (user) {
        const profile = await UserService.getUserProfile(user.userId);
        viewerCollegeId = profile?.adminProfile?.collegeId ?? profile?.volunteerProfile?.collegeId ?? undefined;
      }

      const video = await ContentService.getVideoById({
        videoId: Number(id),
        viewerRole: user?.role as UserRole | undefined,
        viewerUserId: user?.userId,
        viewerCollegeId,
      });

      res.json({ code: 200, message: 'Success', data: video });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async publishVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user!;
      const result = await ContentService.publishVideo(user.userId, Number(id));
      res.json({ code: 200, message: 'Published', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async offlineVideo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const user = req.user!;

      const profile = await UserService.getUserProfile(user.userId);
      const operatorCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const result = await ContentService.offlineVideo({
        operatorUserId: user.userId,
        operatorRole: user.role as UserRole,
        operatorCollegeId,
        videoId: Number(id),
        reason,
      });

      res.json({ code: 200, message: 'Offlined', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      res.status(400).json({ code: 400, message: error.message });
    }
  }
}
