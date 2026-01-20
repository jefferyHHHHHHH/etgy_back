import type { Request, Response } from 'express';
import { PlatformService } from '../services/platform.service';
import { HttpError } from '../utils/httpError';
import { UserStatus } from '../types/enums';

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

  static async listCollegeAdmins(req: Request, res: Response) {
    try {
      const collegeId = req.query.collegeId ? Number(req.query.collegeId) : undefined;
      const list = await PlatformService.listCollegeAdminAccounts(collegeId);
      return res.json({ code: 200, message: 'Success', data: list });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }

  static async deleteCollegeAdmin(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const deleted = await PlatformService.deleteCollegeAdminAccount(id, req.user!.userId);
      return res.json({ code: 200, message: 'Deleted', data: deleted });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Delete college admin failed' });
    }
  }

  static async updateCollegeAdmin(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const updated = await PlatformService.updateCollegeAdminAccount(id, req.body);
      return res.json({ code: 200, message: 'Updated', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Update college admin failed' });
    }
  }

  static async updateCollegeAdminStatus(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const { status } = req.body as { status: UserStatus };
      const updated = await PlatformService.updateCollegeAdminStatus(id, req.user!.userId, status);
      return res.json({ code: 200, message: 'Updated', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Update college admin status failed' });
    }
  }

  static async listAuditLogs(req: Request, res: Response) {
    try {
      const user = req.user!;
      const data = await PlatformService.listAuditLogs(user.userId, user.role, {
        collegeId: req.query.collegeId ? Number(req.query.collegeId) : undefined,
        action: req.query.action as any,
        operatorId: req.query.operatorId ? Number(req.query.operatorId) : undefined,
        targetType: req.query.targetType as any,
        targetId: req.query.targetId as any,
        startTime: req.query.startTime ? String(req.query.startTime) : undefined,
        endTime: req.query.endTime ? String(req.query.endTime) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
      });
      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }

  static async getDashboard(req: Request, res: Response) {
    try {
      const user = req.user!;
      const collegeId = req.query.collegeId ? Number(req.query.collegeId) : undefined;
      const data = await PlatformService.getDashboardStats(user.userId, user.role, collegeId);
      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }
}
