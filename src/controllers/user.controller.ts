import { Request, Response } from 'express';
import { UserService } from '../services/user.service';
// import { UserRole, VolunteerStatus } from '@prisma/client';
import { UserRole, UserStatus, VolunteerStatus } from '../types/enums';
import { HttpError } from '../utils/httpError';
import { parseChildrenExcel } from '../utils/childrenExcel';
import * as XLSX from 'xlsx';

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

  static async createChildrenBatchExcel(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ code: 400, message: 'file is required (multipart field name: file)' });
      }

      const parsed = parseChildrenExcel(file.buffer);
      const created = await UserService.createChildrenBatch(parsed.valid.map((v) => v.item));

      const results = [
        ...parsed.invalid.map((r) => ({ rowNumber: r.rowNumber, ok: false as const, username: r.username, message: r.message })),
        ...created.results.map((r, idx) => ({ rowNumber: parsed.valid[idx]!.rowNumber, ...r })),
      ].sort((a, b) => a.rowNumber - b.rowNumber);

      const success = created.success;
      const total = parsed.totalRows;
      const failed = total - success;

      return res.status(201).json({
        code: 201,
        message: 'Batch complete',
        data: {
          total,
          success,
          failed,
          results,
        },
      });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Bad Request' });
    }
  }

  static async downloadChildrenBatchExcelTemplate(req: Request, res: Response) {
    try {
      // Sheet1: template header only (avoid users accidentally importing sample rows)
      const templateRows = [['用户名', '密码', '姓名', '性别', '学校', '年级']];
      const wsTemplate = XLSX.utils.aoa_to_sheet(templateRows);
      (wsTemplate as any)['!cols'] = [
        { wch: 18 },
        { wch: 16 },
        { wch: 14 },
        { wch: 10 },
        { wch: 24 },
        { wch: 10 },
      ];

      // Sheet2: explanation + example table (Chinese)
      const exampleRows = [
        ['填写说明（请不要修改“导入模板”工作表的表头）'],
        ['1）必填列：用户名、密码、姓名、学校、年级。性别可填：男 / 女 / 未知（不填默认未知）'],
        ['2）密码长度至少 6 位；同一个用户名不能重复'],
        ['3）本文件包含示例行：请复制粘贴到“导入模板”后再上传'],
        [],
        ['示例表格（仅示例，不会被导入）'],
        ['用户名', '密码', '姓名', '性别', '学校', '年级'],
        ['child_001', 'Passw0rd!', '张三', '未知', '示例小学', '3'],
        ['child_002', 'Passw0rd!', '李四', '男', '示例小学', '4'],
      ];
      const wsExample = XLSX.utils.aoa_to_sheet(exampleRows);
      (wsExample as any)['!cols'] = [
        { wch: 30 },
        { wch: 16 },
        { wch: 14 },
        { wch: 10 },
        { wch: 24 },
        { wch: 10 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsTemplate, '导入模板');
      XLSX.utils.book_append_sheet(wb, wsExample, '示例与说明');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="children-import-template.xlsx"'
      );
      return res.status(200).send(buf);
    } catch (error: any) {
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
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
