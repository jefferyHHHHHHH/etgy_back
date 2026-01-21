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

  // ---------------------------------------------------------------------------
  // Content Moderation
  // ---------------------------------------------------------------------------

  static async getContentPolicy(req: Request, res: Response) {
    try {
      const data = await PlatformService.getContentPolicy();
      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }

  static async updateContentPolicy(req: Request, res: Response) {
    try {
      const data = await PlatformService.updateContentPolicy(req.body);
      return res.json({ code: 200, message: 'Updated', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Update content policy failed' });
    }
  }

  static async listSensitiveWords(req: Request, res: Response) {
    try {
      const data = await PlatformService.listSensitiveWords({
        q: req.query.q ? String(req.query.q) : undefined,
        isActive: typeof req.query.isActive === 'undefined' ? undefined : String(req.query.isActive) === 'true',
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

  static async createSensitiveWord(req: Request, res: Response) {
    try {
      const created = await PlatformService.createSensitiveWord(req.body);
      return res.status(201).json({ code: 201, message: 'Created', data: created });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Create sensitive word failed' });
    }
  }

  static async batchCreateSensitiveWords(req: Request, res: Response) {
    try {
      const result = await PlatformService.batchCreateSensitiveWords(req.body);
      return res.status(201).json({ code: 201, message: 'Created', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Batch create sensitive words failed' });
    }
  }

  static async updateSensitiveWord(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const updated = await PlatformService.updateSensitiveWord(id, req.body);
      return res.json({ code: 200, message: 'Updated', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Update sensitive word failed' });
    }
  }

  static async deleteSensitiveWord(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      const data = await PlatformService.deleteSensitiveWord(id);
      return res.json({ code: 200, message: 'Deleted', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Delete sensitive word failed' });
    }
  }

  static async exportSensitiveWords(req: Request, res: Response) {
    try {
      const format = (req.query.format ? String(req.query.format) : 'txt') as 'txt' | 'csv';
      const isActive = typeof req.query.isActive === 'undefined' ? undefined : String(req.query.isActive) === 'true';
      const result = await PlatformService.exportSensitiveWords({ format, isActive });

      res.setHeader('content-type', result.contentType);
      res.setHeader('content-disposition', `attachment; filename=${result.filename}`);
      return res.status(200).send(result.content);
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Export sensitive words failed' });
    }
  }

  static async importSensitiveWords(req: Request, res: Response) {
    try {
      const format = (req.query.format ? String(req.query.format) : 'txt') as 'txt' | 'csv';
      const overwrite = req.query.overwrite ? String(req.query.overwrite) === 'true' : false;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) throw new HttpError(400, 'file is required');

      const text = Buffer.from(file.buffer).toString('utf8');
      const result = await PlatformService.importSensitiveWords({ format, overwrite, text });
      return res.status(201).json({ code: 201, message: 'Created', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Import sensitive words failed' });
    }
  }
}
