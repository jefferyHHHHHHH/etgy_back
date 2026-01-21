import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
// import { UserRole } from '@prisma/client';
import { UserRole } from '../types/enums';
import redisClient from '../config/redis';
import { getTokenTtlSeconds } from '../utils/token';
import { HttpError } from '../utils/httpError';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { username, password, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ code: 400, message: 'Missing username or password' });
      }

      const result = await AuthService.login(username, password, role as UserRole | undefined);
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
      const { username, password, role } = req.body;
      // In real scenario, would handle profile creation here too

      if (!username || !password || !role) {
        return res.status(400).json({ code: 400, message: 'Missing username, password, or role' });
      }
      
      const user = await AuthService.register(username, password, role as UserRole);
      res.json({
        code: 201,
        message: 'Register success',
        data: user,
      });
    } catch (error: any) {
      res.status(400).json({ code: 400, message: error.message || 'Register failed' });
    }
  }

  static async logout(req: Request, res: Response) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(400).json({ code: 400, message: 'Missing Bearer token' });
    }

    const token = authHeader.split(' ')[1];
    const ttl = getTokenTtlSeconds(token);

    try {
      if (ttl > 0 && redisClient.status === 'ready') {
        await redisClient.set(`blacklist:${token}`, '1', 'EX', ttl);
      }
      return res.json({ code: 200, message: 'Logout success' });
    } catch (error) {
      // Fail-open: client can discard token even if we cannot blacklist.
      return res.json({ code: 200, message: 'Logout success (blacklist unavailable)' });
    }
  }

  static async wechatMiniProgramLogin(req: Request, res: Response) {
    try {
      const { code } = req.body ?? {};
      const data = await AuthService.wechatMiniProgramLogin(String(code ?? ''));
      return res.json({
        code: 200,
        message: 'OK',
        data,
      });
    } catch (error: any) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      return res.status(statusCode).json({ code: statusCode, message: error.message || 'WeChat login failed' });
    }
  }

  static async wechatMiniProgramBind(req: Request, res: Response) {
    try {
      const { bindToken, username, password } = req.body ?? {};
      const result = await AuthService.wechatMiniProgramBind({
        bindToken: String(bindToken ?? ''),
        username: String(username ?? ''),
        password: String(password ?? ''),
      });
      return res.json({
        code: 200,
        message: 'OK',
        data: result,
      });
    } catch (error: any) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      return res.status(statusCode).json({ code: statusCode, message: error.message || 'WeChat bind failed' });
    }
  }
}
