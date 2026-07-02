/*
 * Inspect runtime data for stats Q&A — watch logs, durations, child completions.
 */
import { prisma } from '../src/config/prisma';
import { Prisma } from '@prisma/client';

async function main() {
  const watchTotal = await prisma.videoWatchLog.count();
  const watchCompleted = await prisma.videoWatchLog.count({ where: { completed: true } });

  const childCompletions = await prisma.$queryRaw<Array<{ cnt: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) AS cnt
      FROM VideoWatchLog w
      INNER JOIN ChildProfile cp ON cp.userId = w.userId
      WHERE w.completed = 1
    `
  );

  const sampleLogs = await prisma.$queryRaw<
    Array<{
      id: number;
      videoId: number;
      userId: number;
      childName: string | null;
      videoTitle: string;
      uploaderId: number;
      completed: number;
      watchedSeconds: number;
      lastPositionSec: number;
      updatedAt: Date;
    }>
  >(
    Prisma.sql`
      SELECT w.id, w.videoId, w.userId, cp.realName AS childName, v.title AS videoTitle,
             v.uploaderId, w.completed, w.watchedSeconds, w.lastPositionSec, w.updatedAt
      FROM VideoWatchLog w
      LEFT JOIN ChildProfile cp ON cp.userId = w.userId
      INNER JOIN Video v ON v.id = w.videoId
      ORDER BY w.updatedAt DESC
      LIMIT 10
    `
  );

  const videoDurationSample = await prisma.video.findMany({
    where: { status: { in: ['PUBLISHED', 'OFFLINE'] } },
    select: { id: true, title: true, duration: true, uploaderId: true, status: true },
    take: 5,
    orderBy: { id: 'desc' },
  });

  const liveDurationSample = await prisma.liveRoom.findMany({
    where: { status: 'FINISHED', actualStart: { not: null }, actualEnd: { not: null } },
    select: { id: true, title: true, actualStart: true, actualEnd: true, anchorId: true },
    take: 3,
    orderBy: { id: 'desc' },
  });

  console.log(JSON.stringify({
    watchLogs: { total: watchTotal, completed: watchCompleted, childCompleted: Number(childCompletions[0]?.cnt ?? 0) },
    sampleWatchLogs: sampleLogs.map((r) => ({
      ...r,
      completed: Boolean(r.completed),
      isChild: r.childName != null,
    })),
    videoDurationSample,
    liveDurationSample: liveDurationSample.map((l) => ({
      id: l.id,
      title: l.title,
      anchorId: l.anchorId,
      minutes: Math.round((l.actualEnd!.getTime() - l.actualStart!.getTime()) / 60000),
    })),
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
