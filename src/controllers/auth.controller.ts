import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
// import { UserRole } from '@prisma/client';
import { UserRole } from '../types/enums';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { username, role } = req.body;
      if (!username || !role) {
        return res.status(400).json({ code: 400, message: 'Missing username or role' });
      }

      const result = await AuthService.login(username, role as UserRole);
      res.json({
        code: 200,
        message: 'Login success',
        data: result,
      });
    } catch (error: any) {
      res.status(401).json({ code: 401, message: error.message || 'Login failed' });
    }
  }

  static async register(req: Request, res: Response) {
    try {
      const { username, role } = req.body;
      // In real scenario, would handle profile creation here too
      
      const user = await AuthService.register(username, role as UserRole);
      res.json({
        code: 201,
        message: 'Register success',
        data: user,
      });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message || 'Register failed' });
    }
  }
}
