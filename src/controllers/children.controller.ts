import type { Request, Response } from 'express';
import { UserService } from '../services/user.service';
import { HttpError } from '../utils/httpError';

export class ChildrenController {
  /**
   * GET /api/children/:id/password
   * Platform admin reveals child's current password.
   */
  static async getChildPassword(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = await UserService.getChildPassword(Number(id));
      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Bad Request' });
    }
  }

  /**
   * POST /api/children/:id/password
   * Body: { newPassword: string }
   */
  static async setChildPassword(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body as { newPassword: string };
      const data = await UserService.setChildPassword(Number(id), newPassword);
      return res.json({ code: 200, message: 'Password updated', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error?.message || 'Bad Request' });
    }
  }
}
