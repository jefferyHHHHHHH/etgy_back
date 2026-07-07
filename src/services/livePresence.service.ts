import { prisma } from '../config/prisma';
import { LiveStatus } from '../types/enums';
import { HttpError } from '../utils/httpError';

const PRESENCE_TTL_MS = 90_000;
const HEARTBEAT_INTERVAL_SEC = 30;

export class LivePresenceService {
  private static presenceCutoff() {
    return new Date(Date.now() - PRESENCE_TTL_MS);
  }

  private static async getLiveAnchorId(liveId: number) {
    const live = await prisma.liveRoom.findUnique({
      where: { id: liveId },
      select: { id: true, status: true, anchorId: true, actualStart: true, actualEnd: true },
    });
    if (!live) throw new HttpError(404, 'Live not found');
    return live;
  }

  private static async countOnline(liveId: number, anchorId: number) {
    const cutoff = this.presenceCutoff();
    await prisma.livePresence.deleteMany({
      where: { liveId, lastSeenAt: { lt: cutoff } },
    });
    return prisma.livePresence.count({
      where: {
        liveId,
        userId: { not: anchorId },
        lastSeenAt: { gte: cutoff },
      },
    });
  }

  private static async updateMetrics(liveId: number, anchorId: number, onlineCount: number) {
    const existing = await prisma.liveMetrics.findUnique({ where: { liveId } });
    if (!existing) {
      const created = await prisma.liveMetrics.create({
        data: {
          liveId,
          peakViewers: onlineCount,
          averageViewers: onlineCount,
          sampleCount: onlineCount > 0 ? 1 : 0,
          viewerSeconds: onlineCount * HEARTBEAT_INTERVAL_SEC,
        },
      });
      return {
        onlineCount,
        peakViewers: created.peakViewers,
        averageViewers: created.averageViewers,
      };
    }

    const sampleCount = existing.sampleCount + 1;
    const averageViewers = Math.round((existing.averageViewers * existing.sampleCount + onlineCount) / sampleCount);
    const updated = await prisma.liveMetrics.update({
      where: { liveId },
      data: {
        peakViewers: Math.max(existing.peakViewers, onlineCount),
        averageViewers,
        sampleCount,
        viewerSeconds: { increment: onlineCount * HEARTBEAT_INTERVAL_SEC },
      },
    });

    return {
      onlineCount,
      peakViewers: updated.peakViewers,
      averageViewers: updated.averageViewers,
    };
  }

  static async touchPresence(liveId: number, userId: number) {
    const live = await this.getLiveAnchorId(liveId);
    if (live.status !== LiveStatus.LIVING) {
      const metrics = await prisma.liveMetrics.findUnique({ where: { liveId } });
      return {
        onlineCount: 0,
        peakViewers: metrics?.peakViewers ?? 0,
        averageViewers: metrics?.averageViewers ?? 0,
      };
    }

    if (userId !== live.anchorId) {
      await prisma.livePresence.upsert({
        where: { liveId_userId: { liveId, userId } },
        create: { liveId, userId },
        update: { lastSeenAt: new Date() },
      });
    }

    const onlineCount = await this.countOnline(liveId, live.anchorId);
    return this.updateMetrics(liveId, live.anchorId, onlineCount);
  }

  static async leavePresence(liveId: number, userId: number) {
    const live = await this.getLiveAnchorId(liveId);
    await prisma.livePresence.deleteMany({ where: { liveId, userId } });
    if (live.status !== LiveStatus.LIVING) {
      const metrics = await prisma.liveMetrics.findUnique({ where: { liveId } });
      return {
        onlineCount: 0,
        peakViewers: metrics?.peakViewers ?? 0,
        averageViewers: metrics?.averageViewers ?? 0,
      };
    }
    const onlineCount = await this.countOnline(liveId, live.anchorId);
    return this.updateMetrics(liveId, live.anchorId, onlineCount);
  }

  static async getStats(liveId: number) {
    const live = await this.getLiveAnchorId(liveId);
    const metrics = await prisma.liveMetrics.findUnique({ where: { liveId } });
    let onlineCount = 0;
    if (live.status === LiveStatus.LIVING) {
      onlineCount = await this.countOnline(liveId, live.anchorId);
    }
    return {
      onlineCount,
      peakViewers: metrics?.peakViewers ?? 0,
      averageViewers: metrics?.averageViewers ?? 0,
    };
  }

  static async resetForLiveStart(liveId: number) {
    await prisma.livePresence.deleteMany({ where: { liveId } });
    await prisma.liveMetrics.upsert({
      where: { liveId },
      create: { liveId },
      update: {
        peakViewers: 0,
        averageViewers: 0,
        sampleCount: 0,
        viewerSeconds: 0,
      },
    });
  }

  static async finalizeOnFinish(liveId: number, actualStart: Date | null, actualEnd: Date) {
    await prisma.livePresence.deleteMany({ where: { liveId } });
    const metrics = await prisma.liveMetrics.findUnique({ where: { liveId } });
    if (!metrics || !actualStart) {
      await this.inferAndPersistMetrics(liveId);
      return;
    }

    const durationSec = Math.max(1, Math.floor((actualEnd.getTime() - actualStart.getTime()) / 1000));
    const avgFromDuration = Math.round(metrics.viewerSeconds / durationSec);
    const averageViewers = Math.max(metrics.averageViewers, avgFromDuration);

    await prisma.liveMetrics.update({
      where: { liveId },
      data: { averageViewers },
    });

    if (metrics.peakViewers <= 0) {
      await this.inferAndPersistMetrics(liveId);
    }
  }

  /** 为已结束/无实时统计的历史直播推断并持久化峰值、平均在线 */
  static async inferAndPersistMetrics(liveId: number) {
    const live = await prisma.liveRoom.findUnique({
      where: { id: liveId },
      select: {
        id: true,
        status: true,
        anchorId: true,
        estimatedViewers: true,
        actualStart: true,
        metrics: true,
        messages: { select: { senderId: true } },
      },
    });
    if (!live) return null;

    const existingPeak = live.metrics?.peakViewers ?? 0;
    if (existingPeak > 0) return live.metrics;

    const endedOrWasLive = ([LiveStatus.FINISHED, LiveStatus.OFFLINE, LiveStatus.LIVING] as LiveStatus[]).includes(
      live.status as LiveStatus
    );
    if (!endedOrWasLive && !live.actualStart) return live.metrics ?? null;

    const uniqueAudience = new Set(
      live.messages.map((m) => m.senderId).filter((senderId) => senderId !== live.anchorId)
    );

    let peakViewers = uniqueAudience.size;
    if (peakViewers <= 0 && live.estimatedViewers && live.estimatedViewers > 0) {
      peakViewers = live.estimatedViewers;
    }
    if (peakViewers <= 0 && live.actualStart) {
      peakViewers = 1;
    }
    if (peakViewers <= 0) return live.metrics ?? null;

    const existingAvg = live.metrics?.averageViewers ?? 0;
    const averageViewers =
      existingAvg > 0
        ? existingAvg
        : Math.max(1, Math.round(peakViewers * (uniqueAudience.size > 0 ? 0.85 : 0.65)));

    return prisma.liveMetrics.upsert({
      where: { liveId },
      create: {
        liveId,
        peakViewers,
        averageViewers,
        sampleCount: 1,
        viewerSeconds: peakViewers * HEARTBEAT_INTERVAL_SEC,
      },
      update: {
        peakViewers,
        averageViewers: Math.max(existingAvg, averageViewers),
      },
    });
  }

  static async ensureMetrics(liveId: number) {
    const metrics = await prisma.liveMetrics.findUnique({ where: { liveId } });
    if (metrics && metrics.peakViewers > 0) return metrics;
    return this.inferAndPersistMetrics(liveId);
  }

  static async backfillAllEndedLives() {
    const lives = await prisma.liveRoom.findMany({
      where: {
        status: { in: [LiveStatus.FINISHED, LiveStatus.OFFLINE] },
        OR: [{ metrics: null }, { metrics: { peakViewers: 0 } }],
      },
      select: { id: true },
    });

    let updated = 0;
    for (const live of lives) {
      const result = await this.inferAndPersistMetrics(live.id);
      if (result && result.peakViewers > 0) updated += 1;
    }
    return { scanned: lives.length, updated };
  }
}
