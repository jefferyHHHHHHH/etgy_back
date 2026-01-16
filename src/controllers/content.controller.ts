import { Request, Response } from 'express';
import { ContentService } from '../services/content.service';
import { UserService } from '../services/user.service';
import { VideoStatus } from '../types/enums';

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
      const { status, collegeId, uploaderId, search } = req.query;
      
      const list = await ContentService.listVideos({
        status: status as VideoStatus,
        collegeId: collegeId ? Number(collegeId) : undefined,
        uploaderId: uploaderId ? Number(uploaderId) : undefined,
        search: search as string
      });
      res.json({ code: 200, message: 'Success', data: list });
    } catch (error: any) {
      res.status(500).json({ code: 500, message: error.message });
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
      
      const result = await ContentService.auditVideo(user.userId, Number(id), pass, reason);
      res.json({ code: 200, message: 'Audit complete', data: result });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }
}
