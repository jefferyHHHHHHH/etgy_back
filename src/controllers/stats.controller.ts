import type { Request, Response } from 'express';
import { StatsService } from '../services/stats.service';
import { HttpError } from '../utils/httpError';
import { UserRole } from '../types/enums';
import type { RankingMetric, RankingPeriod, RankingScope } from '../types/stats.types';

export class StatsController {
  static async volunteerRanking(req: Request, res: Response) {
    try {
      const user = req.user!;
      const {
        scope: scopeRaw,
        collegeId: collegeIdRaw,
        school,
        metric: metricRaw,
        period: periodRaw,
        periodKey,
        page: pageRaw,
        pageSize: pageSizeRaw,
      } = req.query;

      const metric = (metricRaw as RankingMetric) || 'score';
      const period = (periodRaw as RankingPeriod) || 'all';
      const page = pageRaw ? Number(pageRaw) : 1;
      const pageSize = pageSizeRaw ? Number(pageSizeRaw) : 20;

      let scope = (scopeRaw as RankingScope) || 'college';
      let collegeId = collegeIdRaw ? Number(collegeIdRaw) : undefined;

      if (user.role === UserRole.PLATFORM_ADMIN) {
        if (scope === 'platform') {
          collegeId = undefined;
        }
      } else if (user.role === UserRole.COLLEGE_ADMIN) {
        collegeId = await StatsService.resolveViewerCollegeId(user.userId, user.role);
        if (!collegeId) {
          return res.status(400).json({ code: 400, message: 'College admin must belong to a college' });
        }
        if (scope === 'platform') {
          return res.status(403).json({ code: 403, message: 'Forbidden: college admin cannot view platform ranking' });
        }
      } else if (user.role === UserRole.VOLUNTEER) {
        collegeId = await StatsService.resolveViewerCollegeId(user.userId, user.role);
        if (!collegeId) {
          return res.status(400).json({ code: 400, message: 'Volunteer must belong to a college' });
        }
        scope = scope === 'school' ? 'school' : 'college';
      } else {
        return res.status(403).json({ code: 403, message: 'Forbidden' });
      }

      const data = await StatsService.getVolunteerRanking({
        scope,
        collegeId,
        school: school as string | undefined,
        metric,
        period,
        periodKey: periodKey as string | undefined,
        page,
        pageSize,
        viewerUserId: user.role === UserRole.VOLUNTEER ? user.userId : undefined,
      });

      res.setHeader('X-Total-Count', String(data.total));
      res.setHeader('X-Page', String(page));
      res.setHeader('X-Page-Size', String(pageSize));
      if (data.cachedAt) res.setHeader('X-Stats-Cache', 'HIT');
      else res.setHeader('X-Stats-Cache', 'MISS');

      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }

  static async collegeRanking(req: Request, res: Response) {
    try {
      const {
        metric: metricRaw,
        period: periodRaw,
        periodKey,
        page: pageRaw,
        pageSize: pageSizeRaw,
      } = req.query;

      const data = await StatsService.getCollegeRanking({
        metric: (metricRaw as RankingMetric) || 'score',
        period: (periodRaw as RankingPeriod) || 'all',
        periodKey: periodKey as string | undefined,
        page: pageRaw ? Number(pageRaw) : 1,
        pageSize: pageSizeRaw ? Number(pageSizeRaw) : 20,
      });

      res.setHeader('X-Total-Count', String(data.total));
      if (data.cachedAt) res.setHeader('X-Stats-Cache', 'HIT');
      else res.setHeader('X-Stats-Cache', 'MISS');

      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }

  static async volunteerMe(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { period: periodRaw, periodKey } = req.query;
      const data = await StatsService.getVolunteerMeStats(
        user.userId,
        (periodRaw as RankingPeriod) || 'all',
        periodKey as string | undefined
      );
      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }

  static async listSchools(req: Request, res: Response) {
    try {
      const user = req.user!;
      const { collegeId: collegeIdRaw, search } = req.query;

      let collegeId = collegeIdRaw ? Number(collegeIdRaw) : undefined;

      if (user.role === UserRole.PLATFORM_ADMIN) {
        if (!collegeId) {
          return res.status(400).json({ code: 400, message: 'collegeId is required for platform admin' });
        }
      } else {
        collegeId = await StatsService.resolveViewerCollegeId(user.userId, user.role);
        if (!collegeId) {
          return res.status(400).json({ code: 400, message: 'User must belong to a college' });
        }
      }

      const data = await StatsService.listSchools({
        collegeId,
        search: search as string | undefined,
      });
      return res.json({ code: 200, message: 'Success', data });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(500).json({ code: 500, message: error?.message || 'Internal Server Error' });
    }
  }
}
