import { createHash } from 'crypto';
import redisClient from '../config/redis';
import { env } from '../config/env';
import type { RankingPeriod } from '../types/stats.types';

type CacheSetOptions = { ttlSeconds: number };

export class StatsCacheService {
  private static enabled(): boolean {
    return env.STATS_CACHE_ENABLED === true && redisClient.status === 'ready';
  }

  private static hashPart(s: string): string {
    return createHash('sha1').update(s).digest('hex').slice(0, 8);
  }

  static async getVersion(scope: string, id: string | number): Promise<number> {
    if (!this.enabled()) return 0;
    try {
      const v = await redisClient.get(`etgy:stats:ver:${scope}:${id}`);
      return v ? Number(v) : 0;
    } catch (err) {
      console.warn('[StatsCache] getVersion failed (fail-open):', err);
      return 0;
    }
  }

  static async bumpVersion(scope: string, id: string | number): Promise<void> {
    if (!this.enabled()) return;
    try {
      await redisClient.incr(`etgy:stats:ver:${scope}:${id}`);
      if (scope !== 'platform') {
        await redisClient.incr('etgy:stats:ver:platform:0');
      }
    } catch (err) {
      console.warn('[StatsCache] bumpVersion failed (fail-open):', err);
    }
  }

  static volunteerRankingKey(params: {
    scope: string;
    collegeId?: number;
    school?: string;
    metric: string;
    period: string;
    periodKey?: string;
    page: number;
    pageSize: number;
    version: number;
  }): string {
    const schoolPart = params.school ? this.hashPart(params.school) : '0';
    const collegePart = params.collegeId ?? 0;
    const periodKey = params.periodKey ?? 'all';
    return [
      'etgy:stats:vol',
      params.scope,
      collegePart,
      schoolPart,
      params.metric,
      params.period,
      periodKey,
      `v${params.version}`,
      `p${params.page}`,
      `s${params.pageSize}`,
    ].join(':');
  }

  static collegeRankingKey(params: {
    metric: string;
    period: string;
    periodKey?: string;
    page: number;
    pageSize: number;
    version: number;
  }): string {
    const periodKey = params.periodKey ?? 'all';
    return [
      'etgy:stats:college',
      params.metric,
      params.period,
      periodKey,
      `v${params.version}`,
      `p${params.page}`,
      `s${params.pageSize}`,
    ].join(':');
  }

  static volunteerMeKey(userId: number, period: RankingPeriod, periodKey?: string): string {
    return `etgy:stats:me:${userId}:${period}:${periodKey ?? 'all'}`;
  }

  static myRankKey(params: {
    userId: number;
    scope: string;
    collegeId?: number;
    school?: string;
    metric: string;
    period: string;
    periodKey?: string;
    version: number;
  }): string {
    const schoolPart = params.school ? this.hashPart(params.school) : '0';
    return [
      'etgy:stats:myrank',
      params.userId,
      params.scope,
      params.collegeId ?? 0,
      schoolPart,
      params.metric,
      params.period,
      params.periodKey ?? 'all',
      `v${params.version}`,
    ].join(':');
  }

  static schoolsKey(collegeId: number): string {
    return `etgy:stats:schools:${collegeId}`;
  }

  static async get<T>(key: string): Promise<T | null> {
    if (!this.enabled()) return null;
    try {
      const raw = await redisClient.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn('[StatsCache] get failed (fail-open):', key, err);
      return null;
    }
  }

  static async set<T>(key: string, value: T, opts: CacheSetOptions): Promise<void> {
    if (!this.enabled()) return;
    try {
      await redisClient.setex(key, opts.ttlSeconds, JSON.stringify(value));
    } catch (err) {
      console.warn('[StatsCache] set failed (fail-open):', key, err);
    }
  }

  static async invalidateOnVideoChange(collegeId: number, uploaderId: number): Promise<void> {
    await Promise.all([
      this.bumpVersion('college', collegeId),
      this.bumpVersion('volunteer', uploaderId),
      this.del(this.volunteerMeKey(uploaderId, 'all')),
      this.del(this.volunteerMeKey(uploaderId, 'month')),
      this.del(this.volunteerMeKey(uploaderId, 'week')),
    ]);
  }

  static async invalidateOnLiveChange(collegeId: number, anchorId: number): Promise<void> {
    await this.invalidateOnVideoChange(collegeId, anchorId);
  }

  static async invalidateOnCompletion(collegeId: number, uploaderId: number): Promise<void> {
    await this.invalidateOnVideoChange(collegeId, uploaderId);
  }

  private static async del(key: string): Promise<void> {
    if (!this.enabled()) return;
    try {
      await redisClient.del(key);
    } catch {
      // fail-open
    }
  }
}
