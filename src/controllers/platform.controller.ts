import type { Request, Response } from 'express';
import { PlatformService } from '../services/platform.service';
import { HttpError } from '../utils/httpError';

export class PlatformController {
  static async listColleges(req: Request, res: Response) {
    try {
      const list = await PlatformService.listColleges();
      return res.json({ code: 200, message: 'Success', data: list });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }

  static async createCollege(req: Request, res: Response) {
    try {
      const created = await PlatformService.createCollege(req.body);
      return res.status(201).json({ code: 201, message: 'Created', data: created });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Create college failed' });
    }
  }

  static async updateCollege(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const updated = await PlatformService.updateCollege(id, req.body);
      return res.json({ code: 200, message: 'Updated', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Update college failed' });
    }
  }

  static async createCollegeAdmin(req: Request, res: Response) {
    try {
      const created = await PlatformService.createCollegeAdminAccount(req.body);
      return res.status(201).json({ code: 201, message: 'Created', data: created });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Create college admin failed' });
    }
  }
}
