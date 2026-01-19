import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
// import { UserRole, VolunteerStatus } from '@prisma/client';
import { UserRole, VolunteerStatus } from '../types/enums';
import { HttpError } from '../utils/httpError';

export class UserController {
  
  /**
   * GET /api/users/me
   */
  static async getMe(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const user = await UserService.getUserProfile(userId);
      res.json({ code: 200, message: 'Success', data: user });
    } catch (error: any) {
      res.status(500).json({ code: 500, message: error.message });
    }
  }

  /**
   * POST /api/users/children (Platform Admin Only)
   */
  static async createChild(req: Request, res: Response) {
    try {
      const data = req.body;
      const child = await UserService.createChild(data);
      res.status(201).json({ code: 201, message: 'Child created', data: child });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async createChildrenBatch(req: Request, res: Response) {
    try {
      const { items } = req.body as { items: any[] };
      const result = await UserService.createChildrenBatch(items);
      return res.status(201).json({ code: 201, message: 'Batch complete', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async createVolunteerAccount(req: Request, res: Response) {
    try {
      const user = req.user!;
      let collegeId: number;

      if (user.role === UserRole.COLLEGE_ADMIN) {
        const profile = await UserService.getUserProfile(user.userId);
        const forcedCollegeId = profile?.adminProfile?.collegeId;
        if (!forcedCollegeId) {
          return res.status(400).json({ code: 400, message: 'Admin must belong to a college' });
        }
        collegeId = forcedCollegeId;
      } else if (user.role === UserRole.PLATFORM_ADMIN) {
        collegeId = Number(req.body.collegeId);
      } else {
        return res.status(403).json({ code: 403, message: 'Forbidden' });
      }

      const created = await UserService.createVolunteerAccount({
        username: req.body.username,
        password: req.body.password,
        realName: req.body.realName,
        studentId: req.body.studentId,
        collegeId,
        phone: req.body.phone,
      });

      return res.status(201).json({ code: 201, message: 'Volunteer created', data: created });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  static async changePassword(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { oldPassword, newPassword } = req.body;
      const result = await UserService.changePassword(userId, oldPassword, newPassword);
      return res.json({ code: 200, message: 'Password changed', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  /**
   * GET /api/users/volunteers
   */
  static async listVolunteers(req: Request, res: Response) {
    try {
      // If College Admin, force collegeId filter
      const user = req.user!;
      let collegeId: number | undefined;

      if (user.role === UserRole.COLLEGE_ADMIN) {
        const profile = await UserService.getUserProfile(user.userId);
        collegeId = profile?.adminProfile?.collegeId || undefined;
      }
      // If Platform Admin, optional query param
      else if (user.role === UserRole.PLATFORM_ADMIN) {
        collegeId = req.query.collegeId ? Number(req.query.collegeId) : undefined;
      } else {
        return res.status(403).json({ code: 403, message: 'Forbidden' });
      }

      const status = req.query.status as VolunteerStatus; // Cast to enum
      const list = await UserService.listVolunteers(collegeId, status);
      res.json({ code: 200, message: 'Success', data: list });
    } catch (error: any) {
      res.status(500).json({ code: 500, message: error.message });
    }
  }

  /**
   * PATCH /api/users/volunteers/:id/status
   */
  static async updateVolunteerStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const result = await UserService.updateVolunteerStatus(Number(id), status);
      res.json({ code: 200, message: 'Status updated', data: result });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message });
    }
  }
}
