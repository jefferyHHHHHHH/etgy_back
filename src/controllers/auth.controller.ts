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
      const { username, password, role, deviceId, deviceInfo } = req.body;
      if (!username || !password) {
        return res.status(400).json({ code: 400, message: 'Missing username or password' });
      }

      const result = await AuthService.login(username, password, role as UserRole | undefined, {
        deviceId: deviceId ? String(deviceId) : undefined,
        deviceInfo: deviceInfo ?? undefined,
      });

      return res.json({
        code: 200,
        message: 'Login success',
        data: result,
      });
    } catch (error: any) {
	  // Important: do not mask unexpected server errors as 401.
	  if (!(error instanceof HttpError)) {
		  // eslint-disable-next-line no-console
		  console.error('Unhandled error during login', { requestId: (req as any).requestId, error });
		  return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
	  }

	  const statusCode = error.statusCode;
	  return res.status(statusCode).json({ code: statusCode, message: error.message || 'Login failed' });
    }
  }

  static async confirmDeviceBinding(req: Request, res: Response) {
    try {
      const { bindToken, deviceInfo } = req.body ?? {};
      const result = await AuthService.confirmDeviceBinding({
        bindToken: String(bindToken ?? ''),
        deviceInfo: deviceInfo ?? undefined,
      });
      return res.json({
        code: 200,
        message: 'OK',
        data: result,
      });
    } catch (error: any) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      return res.status(statusCode).json({ code: statusCode, message: error.message || 'Device bind failed' });
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
