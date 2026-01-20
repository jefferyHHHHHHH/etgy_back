import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
// import { UserRole, VolunteerStatus } from '@prisma/client';
import { UserRole, UserStatus, VolunteerStatus } from '../types/enums';
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

  /**
   * GET /api/users/children (Platform Admin Only)
   */
  static async listChildren(req: Request, res: Response) {
    try {
      const data = await UserService.listChildren({
        search: req.query.search ? String(req.query.search) : undefined,
        school: req.query.school ? String(req.query.school) : undefined,
        grade: req.query.grade ? String(req.query.grade) : undefined,
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

  /**
   * POST /api/users/children/:id/reset-password (Platform Admin)
   */
  static async resetChildPassword(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await UserService.resetChildPassword(Number(id));
      return res.json({ code: 200, message: 'Password reset', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  /**
   * PATCH /api/users/children/:id/status (Platform Admin)
   */
  static async updateChildStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body as { status: UserStatus };
      const updated = await UserService.updateChildStatus(Number(id), status);
      return res.json({ code: 200, message: 'Updated', data: updated });
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
      const user = req.user!;
      if (user.role !== UserRole.COLLEGE_ADMIN && user.role !== UserRole.PLATFORM_ADMIN) {
        return res.status(403).json({ code: 403, message: 'Forbidden' });
      }

      const profile = await UserService.getUserProfile(user.userId);
      const operatorCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const result = await UserService.listVolunteersPaged({
        operatorRole: user.role as UserRole,
        operatorUserId: user.userId,
        operatorCollegeId,
        collegeId: req.query.collegeId ? Number(req.query.collegeId) : undefined,
        volunteerStatus: req.query.status as VolunteerStatus | undefined,
        userStatus: req.query.userStatus as UserStatus | undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20,
      });

      res.setHeader('X-Total-Count', String(result.total));
      res.setHeader('X-Page', String(result.page));
      res.setHeader('X-Page-Size', String(result.pageSize));
      return res.json({ code: 200, message: 'Success', data: result.items });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error.message });
    }
  }

  /**
   * PATCH /api/users/volunteers/:id/suspend
   */
  static async suspendVolunteer(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { suspended } = req.body as { suspended: boolean };

      const profile = await UserService.getUserProfile(user.userId);
      const operatorCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const updated = await UserService.setVolunteerSuspended({
        operatorRole: user.role as UserRole,
        operatorUserId: user.userId,
        operatorCollegeId,
        volunteerUserId: Number(id),
        suspended: Boolean(suspended),
      });

      return res.json({ code: 200, message: 'Updated', data: updated });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  /**
   * PATCH /api/users/volunteers/:id/status
   */
  static async updateVolunteerStatus(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { status } = req.body as { status: VolunteerStatus };

      const profile = await UserService.getUserProfile(user.userId);
      const operatorCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const result = await UserService.updateVolunteerStatus({
        operatorRole: user.role as UserRole,
        operatorUserId: user.userId,
        operatorCollegeId,
        volunteerUserId: Number(id),
        status,
      });

      return res.json({ code: 200, message: 'Status updated', data: result });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }
}
