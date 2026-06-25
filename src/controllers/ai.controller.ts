import type { Request, Response } from 'express';
import { HttpError } from '../utils/httpError';
import { fail } from '../utils/response';
import { AiTutorService } from '../services/aiTutor.service';
import { UserService } from '../services/user.service';
import { UserRole } from '../types/enums';

export class AiController {
  static async chatTutor(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { mode, message, conversationId } = req.body ?? {};

      const data = await AiTutorService.chat({
        userId: user.userId,
        mode: mode === 'emotion' ? 'emotion' : 'study',
        message: String(message ?? ''),
        conversationId: conversationId ? Number(conversationId) : undefined,
        clientIp: req.ip,
      });

      return res.json({ code: 200, message: 'OK', data });
    } catch (error: any) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      return res.status(statusCode).json({ code: statusCode, message: error.message || 'AI tutor failed' });
    }
  }

  static async listTutorConversations(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { page, pageSize } = req.query as any;

      const data = await AiTutorService.listConversations({
        userId: user.userId,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });

      return res.json({ code: 200, message: 'OK', data });
    } catch (error: any) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      return res.status(statusCode).json({ code: statusCode, message: error.message || 'List conversations failed' });
    }
  }

  static async getTutorConversation(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params as any;

      const data = await AiTutorService.getConversation({
        userId: user.userId,
        conversationId: Number(id),
      });

      return res.json({ code: 200, message: 'OK', data });
    } catch (error: any) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      return res.status(statusCode).json({ code: statusCode, message: error.message || 'Get conversation failed' });
    }
  }

  static async listRiskAlerts(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { status, collegeId, page, pageSize } = req.query as any;

      const profile = await UserService.getUserProfile(user.userId);
      const viewerCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const data = await AiTutorService.listRiskAlerts({
        viewerUserId: user.userId,
        viewerRole: user.role as UserRole,
        viewerCollegeId,
        status: status === 'OPEN' || status === 'HANDLED' ? status : undefined,
        collegeId: collegeId ? Number(collegeId) : undefined,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });

      return res.json({ code: 200, message: 'OK', data });
    } catch (error: any) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      return res.status(statusCode).json({ code: statusCode, message: error.message || 'List risk alerts failed' });
    }
  }

  static async handleRiskAlert(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { id } = req.params as any;
      const { note } = req.body ?? {};

      const profile = await UserService.getUserProfile(user.userId);
      const viewerCollegeId = profile?.adminProfile?.collegeId ?? undefined;

      const data = await AiTutorService.handleRiskAlert({
        viewerUserId: user.userId,
        viewerRole: user.role as UserRole,
        viewerCollegeId,
        id: Number(id),
        note: note ? String(note) : undefined,
        clientIp: req.ip,
      });

      return res.json({ code: 200, message: 'OK', data });
    } catch (error: any) {
      const statusCode = error instanceof HttpError ? error.statusCode : 400;
      return res.status(statusCode).json({ code: statusCode, message: error.message || 'Handle risk alert failed' });
    }
  }

  /**
   * POST /api/ai/tutor/chat/stream
   * SSE 流式 AI 辅导对话
   */
  static async chatTutorStream(req: Request, res: Response) {
    try {
      await AiTutorService.chatStream({
        userId: req.user!.userId,
        mode: req.body.mode,
        message: req.body.message,
        conversationId: req.body.conversationId,
        clientIp: req.ip,
        res,
      });
      // ★ service 已经直接操作 res 完成 SSE，此处不调用 res.json()
    } catch (err: any) {
      // SSE header 未发送时 = Phase A 校验错误，返回 JSON
      if (!res.headersSent) {
        if (err instanceof HttpError) {
          return fail(res, err.message, err.statusCode);
        }
        return fail(res, 'Internal server error', 500);
      }
    }
  }
}
