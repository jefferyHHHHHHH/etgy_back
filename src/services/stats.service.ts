import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';
import { LiveStatus, UserRole, UserStatus, VideoStatus, VolunteerStatus } from '../types/enums';
import { StatsCacheService } from './statsCache.service';
import type {
  CollegeMetricRow,
  CollegeRankingResult,
  RankingMetric,
  RankingPeriod,
  RankingScope,
  SchoolOption,
  VolunteerMeStats,
  VolunteerMetricRow,
  VolunteerRankingResult,
} from '../types/stats.types';

type PeriodRange = { start: Date; end: Date } | null;

const TEACHING_VIDEO_STATUSES: VideoStatus[] = [VideoStatus.PUBLISHED, VideoStatus.OFFLINE];

export class StatsService {
  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  static async getVolunteerRanking(params: {
    scope: RankingScope;
    collegeId?: number;
    school?: string;
    metric: RankingMetric;
    period: RankingPeriod;
    periodKey?: string;
    page: number;
    pageSize: number;
    viewerUserId?: number;
  }): Promise<VolunteerRankingResult> {
    const { scope, collegeId, school, metric, period, periodKey, page, pageSize, viewerUserId } = params;

    if (scope === 'college' && !collegeId) {
      throw new HttpError(400, 'collegeId is required when scope=college');
    }
    if (scope === 'school' && (!collegeId || !school?.trim())) {
      throw new HttpError(400, 'collegeId and school are required when scope=school');
    }

    const verScope = scope === 'platform' ? 'platform' : 'college';
    const verId = scope === 'platform' ? 0 : (collegeId ?? 0);
    const version = await StatsCacheService.getVersion(verScope, verId);

    const cacheKey = StatsCacheService.volunteerRankingKey({
      scope,
      collegeId,
      school,
      metric,
      period,
      periodKey,
      page,
      pageSize,
      version,
    });

    const cached = await StatsCacheService.get<Omit<VolunteerRankingResult, 'myRank'>>(cacheKey);
    if (cached) {
      const result: VolunteerRankingResult = { ...cached };
      if (viewerUserId) {
        result.myRank = await this.getMyRank({ ...params, viewerUserId, version });
      }
      return { ...result, cachedAt: new Date().toISOString() };
    }

    const rows = await this.aggregateVolunteerMetrics({ scope, collegeId, school, period, periodKey });
    const sorted = this.sortVolunteersByMetric(rows, metric);
    const total = sorted.length;
    const offset = (page - 1) * pageSize;
    const items = sorted.slice(offset, offset + pageSize).map((r, i) => ({
      ...r,
      rank: offset + i + 1,
    }));

    const result: VolunteerRankingResult = {
      scope,
      collegeId,
      school,
      metric,
      period,
      periodKey,
      total,
      items,
    };

    await StatsCacheService.set(cacheKey, result, { ttlSeconds: env.STATS_CACHE_TTL_SECONDS });

    if (viewerUserId) {
      result.myRank = await this.getMyRank({ ...params, viewerUserId, version });
    }

    return result;
  }

  static async getCollegeRanking(params: {
    metric: RankingMetric;
    period: RankingPeriod;
    periodKey?: string;
    page: number;
    pageSize: number;
  }): Promise<CollegeRankingResult> {
    const { metric, period, periodKey, page, pageSize } = params;
    const version = await StatsCacheService.getVersion('platform', 0);

    const cacheKey = StatsCacheService.collegeRankingKey({ metric, period, periodKey, page, pageSize, version });
    const cached = await StatsCacheService.get<CollegeRankingResult>(cacheKey);
    if (cached) {
      return { ...cached, cachedAt: new Date().toISOString() };
    }

    const rows = await this.aggregateCollegeMetrics({ period, periodKey });
    const sorted = this.sortCollegesByMetric(rows, metric);
    const total = sorted.length;
    const offset = (page - 1) * pageSize;
    const items = sorted.slice(offset, offset + pageSize).map((r, i) => ({
      ...r,
      rank: offset + i + 1,
    }));

    const result: CollegeRankingResult = { metric, period, periodKey, total, items };
    await StatsCacheService.set(cacheKey, result, { ttlSeconds: env.STATS_CACHE_TTL_SECONDS });
    return result;
  }

  static async getVolunteerMeStats(userId: number, period: RankingPeriod = 'all', periodKey?: string): Promise<VolunteerMeStats> {
    const cacheKey = StatsCacheService.volunteerMeKey(userId, period, periodKey);
    const cached = await StatsCacheService.get<VolunteerMeStats>(cacheKey);
    if (cached) return cached;

    const profile = await prisma.volunteerProfile.findUnique({
      where: { userId },
      include: { college: { select: { id: true, name: true } } },
    });
    if (!profile) throw new HttpError(404, 'Volunteer profile not found');

    const metrics = await this.aggregateSingleVolunteer(userId, profile.collegeId, period, periodKey);
    const version = await StatsCacheService.getVersion('college', profile.collegeId);
    const myRank = await this.getMyRank({
      scope: 'college',
      collegeId: profile.collegeId,
      metric: 'score',
      period,
      periodKey,
      viewerUserId: userId,
      version,
      page: 1,
      pageSize: 20,
    });

    const total = await this.countActiveCollegeVolunteers(profile.collegeId);

    const result: VolunteerMeStats = {
      ...metrics,
      ranks: {
        college: myRank ? { rank: myRank.rank, total } : null,
      },
    };

    await StatsCacheService.set(cacheKey, result, { ttlSeconds: env.STATS_CACHE_TTL_ME_SECONDS });
    return result;
  }

  static async listSchools(params: { collegeId: number; search?: string }): Promise<SchoolOption[]> {
    const cacheKey = StatsCacheService.schoolsKey(params.collegeId);
    const cached = await StatsCacheService.get<SchoolOption[]>(cacheKey);
    if (cached) {
      return this.filterSchools(cached, params.search);
    }

    const rows = await prisma.childProfile.groupBy({
      by: ['school'],
      where: { collegeId: params.collegeId },
      _count: { _all: true },
      orderBy: { school: 'asc' },
    });

    const schools: SchoolOption[] = rows.map((r) => ({
      school: r.school,
      childCount: r._count._all,
    }));

    await StatsCacheService.set(cacheKey, schools, { ttlSeconds: env.STATS_CACHE_TTL_SCHOOLS_SECONDS });
    return this.filterSchools(schools, params.search);
  }

  // ---------------------------------------------------------------------------
  // Aggregation
  // ---------------------------------------------------------------------------

  private static async aggregateVolunteerMetrics(params: {
    scope: RankingScope;
    collegeId?: number;
    school?: string;
    period: RankingPeriod;
    periodKey?: string;
  }): Promise<VolunteerMetricRow[]> {
    const range = this.resolvePeriodRange(params.period, params.periodKey);

    const volunteerWhere: Prisma.VolunteerProfileWhereInput = {
      status: VolunteerStatus.IN_SCHOOL,
      user: { status: UserStatus.ACTIVE },
    };
    if (params.scope !== 'platform') {
      volunteerWhere.collegeId = params.collegeId;
    }

    const volunteers = await prisma.volunteerProfile.findMany({
      where: volunteerWhere,
      include: { college: { select: { id: true, name: true } } },
    });

    if (volunteers.length === 0) return [];

    const userIds = volunteers.map((v) => v.userId);
    const [videoMetrics, liveMetrics, auditMetrics, completionMap] = await Promise.all([
      this.fetchVideoMetricsByUploader(userIds, range),
      this.fetchLiveMetricsByAnchor(userIds, range),
      this.fetchAuditMetricsByVolunteer(userIds, range),
      this.fetchCompletionCounts(userIds, params.school, range),
    ]);

    const rows: VolunteerMetricRow[] = volunteers.map((vp) => {
      const video = videoMetrics.get(vp.userId) ?? { teachingMinutes: 0 };
      const live = liveMetrics.get(vp.userId) ?? { liveFinishedCount: 0, liveTeachingMinutes: 0 };
      const audit = auditMetrics.get(vp.userId) ?? { approved: 0, rejected: 0 };
      const childCompletionCount = completionMap.get(vp.userId) ?? 0;

      const reviewedTotal = audit.approved + audit.rejected;
      const auditPassRate = reviewedTotal === 0 ? null : audit.approved / reviewedTotal;
      const teachingMinutes = video.teachingMinutes + live.liveTeachingMinutes;

      return {
        volunteerUserId: vp.userId,
        realName: vp.realName,
        studentId: vp.studentId,
        collegeId: vp.collegeId,
        collegeName: vp.college.name,
        teachingMinutes,
        liveFinishedCount: live.liveFinishedCount,
        auditPassRate,
        childCompletionCount,
        score: 0,
      };
    });

    return this.applyVolunteerScores(rows);
  }

  private static async aggregateCollegeMetrics(params: {
    period: RankingPeriod;
    periodKey?: string;
  }): Promise<CollegeMetricRow[]> {
    const range = this.resolvePeriodRange(params.period, params.periodKey);

    const colleges = await prisma.college.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });

    if (colleges.length === 0) return [];

    const collegeIds = colleges.map((c) => c.id);

    const [volunteerCounts, videoCounts, liveCounts, teachingMinutes, auditByCollege, completionByCollege] =
      await Promise.all([
        this.countActiveVolunteersByCollege(collegeIds),
        this.countPublishedVideosByCollege(collegeIds, range),
        this.countFinishedLivesByCollege(collegeIds, range),
        this.sumTeachingMinutesByCollege(collegeIds, range),
        this.fetchAuditMetricsByCollege(collegeIds, range),
        this.fetchCompletionCountsByCollege(collegeIds, range),
      ]);

    const rows: CollegeMetricRow[] = colleges.map((college) => {
      const audit = auditByCollege.get(college.id) ?? { approved: 0, rejected: 0 };
      const reviewedTotal = audit.approved + audit.rejected;
      const auditPassRate = reviewedTotal === 0 ? null : audit.approved / reviewedTotal;

      return {
        collegeId: college.id,
        collegeName: college.name,
        volunteerActiveCount: volunteerCounts.get(college.id) ?? 0,
        publishedVideoCount: videoCounts.get(college.id) ?? 0,
        liveFinishedCount: liveCounts.get(college.id) ?? 0,
        totalTeachingMinutes: teachingMinutes.get(college.id) ?? 0,
        auditPassRate,
        childCompletionCount: completionByCollege.get(college.id) ?? 0,
        score: 0,
      };
    });

    return this.applyCollegeScores(rows);
  }

  private static async aggregateSingleVolunteer(
    userId: number,
    collegeId: number,
    period: RankingPeriod,
    periodKey?: string
  ) {
    const rows = await this.aggregateVolunteerMetrics({
      scope: 'college',
      collegeId,
      period,
      periodKey,
    });
    const row = rows.find((r) => r.volunteerUserId === userId);
    if (!row) {
      return {
        teachingMinutes: 0,
        liveFinishedCount: 0,
        auditPassRate: null as number | null,
        childCompletionCount: 0,
      };
    }
    return {
      teachingMinutes: row.teachingMinutes,
      liveFinishedCount: row.liveFinishedCount,
      auditPassRate: row.auditPassRate,
      childCompletionCount: row.childCompletionCount,
    };
  }

  // ---------------------------------------------------------------------------
  // DB helpers
  // ---------------------------------------------------------------------------

  private static async fetchVideoMetricsByUploader(userIds: number[], range: PeriodRange) {
    const map = new Map<number, { teachingMinutes: number }>();
    for (const id of userIds) map.set(id, { teachingMinutes: 0 });

    const videos = await prisma.video.findMany({
      where: {
        uploaderId: { in: userIds },
        status: { in: TEACHING_VIDEO_STATUSES },
        ...(range
          ? {
              OR: [
                { publishedAt: { gte: range.start, lt: range.end } },
                { publishedAt: null, updatedAt: { gte: range.start, lt: range.end } },
              ],
            }
          : {}),
      },
      select: { uploaderId: true, duration: true },
    });

    for (const v of videos) {
      const cur = map.get(v.uploaderId)!;
      cur.teachingMinutes += Math.round((v.duration ?? 0) / 60);
    }
    return map;
  }

  private static async fetchLiveMetricsByAnchor(userIds: number[], range: PeriodRange) {
    const map = new Map<number, { liveFinishedCount: number; liveTeachingMinutes: number }>();
    for (const id of userIds) map.set(id, { liveFinishedCount: 0, liveTeachingMinutes: 0 });

    const lives = await prisma.liveRoom.findMany({
      where: {
        anchorId: { in: userIds },
        status: LiveStatus.FINISHED,
        actualStart: { not: null },
        actualEnd: { not: null },
        ...(range ? { actualEnd: { gte: range.start, lt: range.end } } : {}),
      },
      select: { anchorId: true, actualStart: true, actualEnd: true },
    });

    for (const live of lives) {
      const cur = map.get(live.anchorId)!;
      cur.liveFinishedCount += 1;
      const start = live.actualStart!.getTime();
      const end = live.actualEnd!.getTime();
      cur.liveTeachingMinutes += Math.max(0, Math.round((end - start) / 60000));
    }
    return map;
  }

  private static async fetchAuditMetricsByVolunteer(userIds: number[], range: PeriodRange) {
    const map = new Map<number, { approved: number; rejected: number }>();
    for (const id of userIds) map.set(id, { approved: 0, rejected: 0 });

    const videos = await prisma.video.findMany({
      where: {
        uploaderId: { in: userIds },
        status: { in: [VideoStatus.APPROVED, VideoStatus.REJECTED, VideoStatus.PUBLISHED, VideoStatus.OFFLINE] },
        reviewedAt: { not: null },
        ...(range ? { reviewedAt: { gte: range.start, lt: range.end } } : {}),
      },
      select: { uploaderId: true, status: true },
    });

    for (const v of videos) {
      const cur = map.get(v.uploaderId)!;
      if (v.status === VideoStatus.REJECTED) {
        cur.rejected += 1;
      } else {
        cur.approved += 1;
      }
    }

    const lives = await prisma.liveRoom.findMany({
      where: {
        anchorId: { in: userIds },
        status: { in: [LiveStatus.PASSED, LiveStatus.REJECTED, LiveStatus.PUBLISHED, LiveStatus.LIVING, LiveStatus.FINISHED, LiveStatus.OFFLINE] },
        reviewedAt: { not: null },
        ...(range ? { reviewedAt: { gte: range.start, lt: range.end } } : {}),
      },
      select: { anchorId: true, status: true },
    });

    for (const live of lives) {
      const cur = map.get(live.anchorId)!;
      if (live.status === LiveStatus.REJECTED) {
        cur.rejected += 1;
      } else {
        cur.approved += 1;
      }
    }

    return map;
  }

  private static async fetchCompletionCounts(userIds: number[], school: string | undefined, range: PeriodRange) {
    const map = new Map<number, number>();
    for (const id of userIds) map.set(id, 0);

    if (userIds.length === 0) return map;

    const schoolFilter = school?.trim()
      ? Prisma.sql`AND cp.school = ${school.trim()}`
      : Prisma.empty;

    const rangeFilter = range
      ? Prisma.sql`AND w.updatedAt >= ${range.start} AND w.updatedAt < ${range.end}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<Array<{ uploaderId: number; cnt: bigint }>>(
      Prisma.sql`
        SELECT v.uploaderId AS uploaderId, COUNT(*) AS cnt
        FROM VideoWatchLog w
        INNER JOIN Video v ON v.id = w.videoId
        INNER JOIN User u ON u.id = w.userId
        INNER JOIN ChildProfile cp ON cp.userId = u.id
        WHERE w.completed = 1
          AND v.uploaderId IN (${Prisma.join(userIds)})
          ${schoolFilter}
          ${rangeFilter}
        GROUP BY v.uploaderId
      `
    );

    for (const row of rows) {
      map.set(Number(row.uploaderId), Number(row.cnt));
    }
    return map;
  }

  private static async countActiveVolunteersByCollege(collegeIds: number[]) {
    const map = new Map<number, number>();
    const rows = await prisma.volunteerProfile.groupBy({
      by: ['collegeId'],
      where: {
        collegeId: { in: collegeIds },
        status: VolunteerStatus.IN_SCHOOL,
        user: { status: UserStatus.ACTIVE },
      },
      _count: { _all: true },
    });
    for (const r of rows) map.set(r.collegeId, r._count._all);
    return map;
  }

  private static async countPublishedVideosByCollege(collegeIds: number[], range: PeriodRange) {
    const map = new Map<number, number>();
    const rows = await prisma.video.groupBy({
      by: ['collegeId'],
      where: {
        collegeId: { in: collegeIds },
        status: { in: TEACHING_VIDEO_STATUSES },
        ...(range
          ? {
              OR: [
                { publishedAt: { gte: range.start, lt: range.end } },
                { publishedAt: null, updatedAt: { gte: range.start, lt: range.end } },
              ],
            }
          : {}),
      },
      _count: { _all: true },
    });
    for (const r of rows) map.set(r.collegeId, r._count._all);
    return map;
  }

  private static async countFinishedLivesByCollege(collegeIds: number[], range: PeriodRange) {
    const map = new Map<number, number>();
    const rows = await prisma.liveRoom.groupBy({
      by: ['collegeId'],
      where: {
        collegeId: { in: collegeIds },
        status: LiveStatus.FINISHED,
        actualStart: { not: null },
        actualEnd: { not: null },
        ...(range ? { actualEnd: { gte: range.start, lt: range.end } } : {}),
      },
      _count: { _all: true },
    });
    for (const r of rows) map.set(r.collegeId, r._count._all);
    return map;
  }

  private static async sumTeachingMinutesByCollege(collegeIds: number[], range: PeriodRange) {
    const map = new Map<number, number>();
    for (const id of collegeIds) map.set(id, 0);

    const videos = await prisma.video.findMany({
      where: {
        collegeId: { in: collegeIds },
        status: { in: TEACHING_VIDEO_STATUSES },
        ...(range
          ? {
              OR: [
                { publishedAt: { gte: range.start, lt: range.end } },
                { publishedAt: null, updatedAt: { gte: range.start, lt: range.end } },
              ],
            }
          : {}),
      },
      select: { collegeId: true, duration: true },
    });

    for (const v of videos) {
      map.set(v.collegeId, (map.get(v.collegeId) ?? 0) + Math.round((v.duration ?? 0) / 60));
    }

    const lives = await prisma.liveRoom.findMany({
      where: {
        collegeId: { in: collegeIds },
        status: LiveStatus.FINISHED,
        actualStart: { not: null },
        actualEnd: { not: null },
        ...(range ? { actualEnd: { gte: range.start, lt: range.end } } : {}),
      },
      select: { collegeId: true, actualStart: true, actualEnd: true },
    });

    for (const live of lives) {
      const minutes = Math.max(0, Math.round((live.actualEnd!.getTime() - live.actualStart!.getTime()) / 60000));
      map.set(live.collegeId, (map.get(live.collegeId) ?? 0) + minutes);
    }

    return map;
  }

  private static async fetchAuditMetricsByCollege(collegeIds: number[], range: PeriodRange) {
    const map = new Map<number, { approved: number; rejected: number }>();
    for (const id of collegeIds) map.set(id, { approved: 0, rejected: 0 });

    const videos = await prisma.video.findMany({
      where: {
        collegeId: { in: collegeIds },
        reviewedAt: { not: null },
        status: { in: [VideoStatus.APPROVED, VideoStatus.REJECTED, VideoStatus.PUBLISHED, VideoStatus.OFFLINE] },
        ...(range ? { reviewedAt: { gte: range.start, lt: range.end } } : {}),
      },
      select: { collegeId: true, status: true },
    });

    for (const v of videos) {
      const cur = map.get(v.collegeId)!;
      if (v.status === VideoStatus.REJECTED) cur.rejected += 1;
      else cur.approved += 1;
    }

    const lives = await prisma.liveRoom.findMany({
      where: {
        collegeId: { in: collegeIds },
        reviewedAt: { not: null },
        status: { notIn: [LiveStatus.DRAFT, LiveStatus.REVIEW] },
        ...(range ? { reviewedAt: { gte: range.start, lt: range.end } } : {}),
      },
      select: { collegeId: true, status: true },
    });

    for (const live of lives) {
      const cur = map.get(live.collegeId)!;
      if (live.status === LiveStatus.REJECTED) cur.rejected += 1;
      else cur.approved += 1;
    }

    return map;
  }

  private static async fetchCompletionCountsByCollege(collegeIds: number[], range: PeriodRange) {
    const map = new Map<number, number>();
    for (const id of collegeIds) map.set(id, 0);
    if (collegeIds.length === 0) return map;

    const rangeFilter = range
      ? Prisma.sql`AND w.updatedAt >= ${range.start} AND w.updatedAt < ${range.end}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<Array<{ collegeId: number; cnt: bigint }>>(
      Prisma.sql`
        SELECT v.collegeId AS collegeId, COUNT(*) AS cnt
        FROM VideoWatchLog w
        INNER JOIN Video v ON v.id = w.videoId
        INNER JOIN User u ON u.id = w.userId
        INNER JOIN ChildProfile cp ON cp.userId = u.id
        WHERE w.completed = 1
          AND v.collegeId IN (${Prisma.join(collegeIds)})
          ${rangeFilter}
        GROUP BY v.collegeId
      `
    );

    for (const row of rows) {
      map.set(Number(row.collegeId), Number(row.cnt));
    }
    return map;
  }

  private static async countActiveCollegeVolunteers(collegeId: number) {
    return prisma.volunteerProfile.count({
      where: {
        collegeId,
        status: VolunteerStatus.IN_SCHOOL,
        user: { status: UserStatus.ACTIVE },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Ranking helpers
  // ---------------------------------------------------------------------------

  private static async getMyRank(params: {
    scope: RankingScope;
    collegeId?: number;
    school?: string;
    metric: RankingMetric;
    period: RankingPeriod;
    periodKey?: string;
    viewerUserId: number;
    version: number;
    page: number;
    pageSize: number;
  }): Promise<{ rank: number; score: number } | undefined> {
    const cacheKey = StatsCacheService.myRankKey({
      userId: params.viewerUserId,
      scope: params.scope,
      collegeId: params.collegeId,
      school: params.school,
      metric: params.metric,
      period: params.period,
      periodKey: params.periodKey,
      version: params.version,
    });

    const cached = await StatsCacheService.get<{ rank: number; score: number }>(cacheKey);
    if (cached) return cached;

    const rows = await this.aggregateVolunteerMetrics({
      scope: params.scope,
      collegeId: params.collegeId,
      school: params.school,
      period: params.period,
      periodKey: params.periodKey,
    });
    const sorted = this.sortVolunteersByMetric(rows, params.metric);
    const idx = sorted.findIndex((r) => r.volunteerUserId === params.viewerUserId);
    if (idx < 0) return undefined;

    const myRank = { rank: idx + 1, score: sorted[idx].score };
    await StatsCacheService.set(cacheKey, myRank, { ttlSeconds: env.STATS_CACHE_TTL_SECONDS });
    return myRank;
  }

  private static sortVolunteersByMetric(rows: VolunteerMetricRow[], metric: RankingMetric) {
    const sorted = [...rows];
    sorted.sort((a, b) => this.compareByMetric(a, b, metric));
    return sorted;
  }

  private static sortCollegesByMetric(rows: CollegeMetricRow[], metric: RankingMetric) {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (metric === 'score') return b.score - a.score;
      if (metric === 'teachingMinutes') return b.totalTeachingMinutes - a.totalTeachingMinutes;
      if (metric === 'liveFinishedCount') return b.liveFinishedCount - a.liveFinishedCount;
      if (metric === 'auditPassRate') return this.compareNullableRate(b.auditPassRate, a.auditPassRate);
      if (metric === 'childCompletionCount') return b.childCompletionCount - a.childCompletionCount;
      return b.score - a.score;
    });
    return sorted;
  }

  private static compareByMetric(a: VolunteerMetricRow, b: VolunteerMetricRow, metric: RankingMetric) {
    if (metric === 'score') return b.score - a.score;
    if (metric === 'teachingMinutes') return b.teachingMinutes - a.teachingMinutes;
    if (metric === 'liveFinishedCount') return b.liveFinishedCount - a.liveFinishedCount;
    if (metric === 'auditPassRate') return this.compareNullableRate(b.auditPassRate, a.auditPassRate);
    if (metric === 'childCompletionCount') return b.childCompletionCount - a.childCompletionCount;
    return b.score - a.score;
  }

  private static compareNullableRate(a: number | null, b: number | null) {
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a - b;
  }

  private static applyVolunteerScores(rows: VolunteerMetricRow[]): VolunteerMetricRow[] {
    if (rows.length === 0) return rows;

    const mins = rows.map((r) => r.teachingMinutes);
    const lives = rows.map((r) => r.liveFinishedCount);
    const completions = rows.map((r) => r.childCompletionCount);
    const rates = rows.map((r) => r.auditPassRate ?? 0);

    const normTeaching = this.normalize(mins);
    const normLive = this.normalize(lives);
    const normCompletion = this.normalize(completions);
    const normRate = this.normalize(rates);

    return rows.map((r, i) => ({
      ...r,
      score: Math.round(
        (0.35 * normTeaching[i] + 0.25 * normLive[i] + 0.2 * normRate[i] + 0.2 * normCompletion[i]) * 1000
      ) / 10,
    }));
  }

  private static applyCollegeScores(rows: CollegeMetricRow[]): CollegeMetricRow[] {
    if (rows.length === 0) return rows;

    const teaching = rows.map((r) => r.totalTeachingMinutes);
    const lives = rows.map((r) => r.liveFinishedCount);
    const completions = rows.map((r) => r.childCompletionCount);
    const rates = rows.map((r) => r.auditPassRate ?? 0);
    const volunteers = rows.map((r) => r.volunteerActiveCount);

    const normTeaching = this.normalize(teaching);
    const normLive = this.normalize(lives);
    const normCompletion = this.normalize(completions);
    const normRate = this.normalize(rates);
    const normVolunteers = this.normalize(volunteers);

    return rows.map((r, i) => ({
      ...r,
      score: Math.round(
        (0.25 * normTeaching[i] +
          0.2 * normLive[i] +
          0.2 * normCompletion[i] +
          0.2 * normRate[i] +
          0.15 * normVolunteers[i]) *
          1000
      ) / 10,
    }));
  }

  private static normalize(values: number[]): number[] {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return values.map(() => (max > 0 ? 1 : 0));
    return values.map((v) => (v - min) / (max - min));
  }

  private static resolvePeriodRange(period: RankingPeriod, periodKey?: string): PeriodRange {
    if (period === 'all') return null;

    const now = new Date();

    if (period === 'month') {
      const key =
        periodKey ??
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [year, month] = key.split('-').map(Number);
      if (!year || !month || month < 1 || month > 12) {
        throw new HttpError(400, 'Invalid periodKey for month, expected YYYY-MM');
      }
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      return { start, end };
    }

    if (period === 'week') {
      if (periodKey) {
        const start = new Date(periodKey);
        if (Number.isNaN(start.getTime())) {
          throw new HttpError(400, 'Invalid periodKey for week, expected YYYY-MM-DD');
        }
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return { start, end };
      }
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start, end };
    }

    return null;
  }

  private static filterSchools(schools: SchoolOption[], search?: string) {
    const q = search?.trim();
    if (!q) return schools;
    return schools.filter((s) => s.school.includes(q));
  }

  // ---------------------------------------------------------------------------
  // Access scope helpers (used by controller)
  // ---------------------------------------------------------------------------

  static async resolveViewerCollegeId(userId: number, role: UserRole): Promise<number | undefined> {
    if (role === UserRole.COLLEGE_ADMIN) {
      const profile = await prisma.adminProfile.findUnique({ where: { userId }, select: { collegeId: true } });
      return profile?.collegeId ?? undefined;
    }
    if (role === UserRole.VOLUNTEER) {
      const profile = await prisma.volunteerProfile.findUnique({ where: { userId }, select: { collegeId: true } });
      return profile?.collegeId ?? undefined;
    }
    return undefined;
  }
}
