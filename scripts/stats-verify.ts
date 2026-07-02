/*
 * Stats correctness verification — compares StatsService output against
 * independent ground-truth DB queries.
 *
 * Usage: npm run verify:stats
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { StatsService } from '../src/services/stats.service';
import { LiveStatus, UserStatus, VideoStatus, VolunteerStatus } from '../src/types/enums';
import type { CollegeMetricRow, VolunteerMetricRow } from '../src/types/stats.types';
import * as fs from 'fs';
import * as path from 'path';

const LOG_PATH = path.join(__dirname, '..', 'debug-93a79b.log');
const DEBUG_ENDPOINT = 'http://127.0.0.1:7743/ingest/03a0fb0f-c655-4cc5-9a21-21a9c8f9997a';
const SESSION_ID = '93a79b';

const TEACHING_VIDEO_STATUSES = [VideoStatus.PUBLISHED, VideoStatus.OFFLINE];

type Mismatch = {
  hypothesisId: string;
  entity: string;
  field: string;
  expected: unknown;
  actual: unknown;
  detail?: string;
};

const mismatches: Mismatch[] = [];

function agentLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  const payload = {
    sessionId: SESSION_ID,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId: 'verify',
  };
  // #region agent log
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION_ID },
    body: JSON.stringify(payload),
  }).catch(() => {});
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(payload) + '\n');
  } catch {
    // ignore
  }
  // #endregion
}

function recordMismatch(hypothesisId: string, entity: string, field: string, expected: unknown, actual: unknown, detail?: string) {
  mismatches.push({ hypothesisId, entity, field, expected, actual, detail });
  agentLog(hypothesisId, 'stats-verify.ts', `MISMATCH: ${entity}.${field}`, { entity, field, expected, actual, detail });
}

function approxEq(a: number | null, b: number | null, eps = 0.0001): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) < eps;
}

// ---------------------------------------------------------------------------
// Ground truth: volunteer metrics (canonical business rules)
// ---------------------------------------------------------------------------

async function groundTruthVolunteerMetrics(): Promise<Map<number, VolunteerMetricRow>> {
  const volunteers = await prisma.volunteerProfile.findMany({
    where: { status: VolunteerStatus.IN_SCHOOL, user: { status: UserStatus.ACTIVE } },
    include: { college: { select: { id: true, name: true } } },
  });

  const map = new Map<number, VolunteerMetricRow>();

  for (const vp of volunteers) {
    const uid = vp.userId;

    const videos = await prisma.video.findMany({
      where: { uploaderId: uid, status: { in: TEACHING_VIDEO_STATUSES } },
      select: { duration: true },
    });
    const videoMinutes = videos.reduce((s, v) => s + Math.round((v.duration ?? 0) / 60), 0);

    const lives = await prisma.liveRoom.findMany({
      where: {
        anchorId: uid,
        status: LiveStatus.FINISHED,
        actualStart: { not: null },
        actualEnd: { not: null },
      },
      select: { actualStart: true, actualEnd: true },
    });
    const liveCount = lives.length;
    const liveMinutes = lives.reduce(
      (s, l) => s + Math.max(0, Math.round((l.actualEnd!.getTime() - l.actualStart!.getTime()) / 60000)),
      0
    );

    const auditVideos = await prisma.video.findMany({
      where: {
        uploaderId: uid,
        reviewedAt: { not: null },
        status: { in: [VideoStatus.APPROVED, VideoStatus.REJECTED, VideoStatus.PUBLISHED, VideoStatus.OFFLINE] },
      },
      select: { status: true },
    });
    const auditLives = await prisma.liveRoom.findMany({
      where: {
        anchorId: uid,
        reviewedAt: { not: null },
        status: {
          in: [LiveStatus.PASSED, LiveStatus.REJECTED, LiveStatus.PUBLISHED, LiveStatus.LIVING, LiveStatus.FINISHED, LiveStatus.OFFLINE],
        },
      },
      select: { status: true },
    });
    let approved = 0;
    let rejected = 0;
    for (const v of auditVideos) {
      if (v.status === VideoStatus.REJECTED) rejected++;
      else approved++;
    }
    for (const l of auditLives) {
      if (l.status === LiveStatus.REJECTED) rejected++;
      else approved++;
    }
    const reviewedTotal = approved + rejected;
    const auditPassRate = reviewedTotal === 0 ? null : approved / reviewedTotal;

    const completionRows = await prisma.$queryRaw<Array<{ cnt: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*) AS cnt
        FROM VideoWatchLog w
        INNER JOIN Video v ON v.id = w.videoId
        INNER JOIN User u ON u.id = w.userId
        INNER JOIN ChildProfile cp ON cp.userId = u.id
        WHERE w.completed = 1 AND v.uploaderId = ${uid}
      `
    );
    const childCompletionCount = Number(completionRows[0]?.cnt ?? 0);

    map.set(uid, {
      volunteerUserId: uid,
      realName: vp.realName,
      studentId: vp.studentId,
      collegeId: vp.collegeId,
      collegeName: vp.college.name,
      teachingMinutes: videoMinutes + liveMinutes,
      liveFinishedCount: liveCount,
      auditPassRate,
      childCompletionCount,
      score: 0,
    });
  }

  return map;
}

// ---------------------------------------------------------------------------
// Ground truth: college metrics (canonical — child-only completions)
// ---------------------------------------------------------------------------

async function groundTruthCollegeMetricsChildOnly(): Promise<Map<number, Omit<CollegeMetricRow, 'score'>>> {
  const colleges = await prisma.college.findMany({ where: { isActive: true } });
  const map = new Map<number, Omit<CollegeMetricRow, 'score'>>();

  for (const college of colleges) {
    const cid = college.id;

    const volunteerActiveCount = await prisma.volunteerProfile.count({
      where: { collegeId: cid, status: VolunteerStatus.IN_SCHOOL, user: { status: UserStatus.ACTIVE } },
    });

    const publishedVideoCount = await prisma.video.count({
      where: { collegeId: cid, status: { in: TEACHING_VIDEO_STATUSES } },
    });

    const liveFinishedCount = await prisma.liveRoom.count({
      where: { collegeId: cid, status: LiveStatus.FINISHED, actualStart: { not: null }, actualEnd: { not: null } },
    });

    const videos = await prisma.video.findMany({
      where: { collegeId: cid, status: { in: TEACHING_VIDEO_STATUSES } },
      select: { duration: true },
    });
    const lives = await prisma.liveRoom.findMany({
      where: {
        collegeId: cid,
        status: LiveStatus.FINISHED,
        actualStart: { not: null },
        actualEnd: { not: null },
      },
      select: { actualStart: true, actualEnd: true },
    });
    const totalTeachingMinutes =
      videos.reduce((s, v) => s + Math.round((v.duration ?? 0) / 60), 0) +
      lives.reduce((s, l) => s + Math.max(0, Math.round((l.actualEnd!.getTime() - l.actualStart!.getTime()) / 60000)), 0);

    const auditVideos = await prisma.video.findMany({
      where: {
        collegeId: cid,
        reviewedAt: { not: null },
        status: { in: [VideoStatus.APPROVED, VideoStatus.REJECTED, VideoStatus.PUBLISHED, VideoStatus.OFFLINE] },
      },
      select: { status: true },
    });
    const auditLives = await prisma.liveRoom.findMany({
      where: {
        collegeId: cid,
        reviewedAt: { not: null },
        status: { notIn: [LiveStatus.DRAFT, LiveStatus.REVIEW] },
      },
      select: { status: true },
    });
    let approved = 0;
    let rejected = 0;
    for (const v of auditVideos) {
      if (v.status === VideoStatus.REJECTED) rejected++;
      else approved++;
    }
    for (const l of auditLives) {
      if (l.status === LiveStatus.REJECTED) rejected++;
      else approved++;
    }
    const reviewedTotal = approved + rejected;
    const auditPassRate = reviewedTotal === 0 ? null : approved / reviewedTotal;

    const completionRows = await prisma.$queryRaw<Array<{ cnt: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*) AS cnt
        FROM VideoWatchLog w
        INNER JOIN Video v ON v.id = w.videoId
        INNER JOIN User u ON u.id = w.userId
        INNER JOIN ChildProfile cp ON cp.userId = u.id
        WHERE w.completed = 1 AND v.collegeId = ${cid}
      `
    );
    const childCompletionCount = Number(completionRows[0]?.cnt ?? 0);

    map.set(cid, {
      collegeId: cid,
      collegeName: college.name,
      volunteerActiveCount,
      publishedVideoCount,
      liveFinishedCount,
      totalTeachingMinutes,
      auditPassRate,
      childCompletionCount,
    });
  }

  return map;
}

// ---------------------------------------------------------------------------
// Cross-consistency checks
// ---------------------------------------------------------------------------

async function checkCollegeLiveFilterGap() {
  const livesWithoutTimes = await prisma.liveRoom.count({
    where: {
      status: LiveStatus.FINISHED,
      OR: [{ actualStart: null }, { actualEnd: null }],
    },
  });
  agentLog('H1', 'stats-verify.ts', 'FINISHED lives missing actualStart/actualEnd', { count: livesWithoutTimes });
  if (livesWithoutTimes > 0) {
    const collegeCount = await prisma.liveRoom.count({
      where: { status: LiveStatus.FINISHED },
    });
    const strictCount = await prisma.liveRoom.count({
      where: { status: LiveStatus.FINISHED, actualStart: { not: null }, actualEnd: { not: null } },
    });
    recordMismatch(
      'H1',
      'college:liveFinishedCount',
      'filterGap',
      strictCount,
      collegeCount,
      `${livesWithoutTimes} FINISHED live(s) lack actualStart/actualEnd; college counts ${collegeCount} but strict count is ${strictCount}`
    );
  }
}

async function checkCollegeCompletionNonChild() {
  const allCompletions = await prisma.videoWatchLog.count({ where: { completed: true } });
  const childCompletions = await prisma.$queryRaw<Array<{ cnt: bigint }>>(
    Prisma.sql`
      SELECT COUNT(*) AS cnt
      FROM VideoWatchLog w
      INNER JOIN User u ON u.id = w.userId
      INNER JOIN ChildProfile cp ON cp.userId = u.id
      WHERE w.completed = 1
    `
  );
  const childCnt = Number(childCompletions[0]?.cnt ?? 0);
  const nonChildCnt = allCompletions - childCnt;
  agentLog('H2', 'stats-verify.ts', 'completion child vs all', { allCompletions, childCnt, nonChildCnt });
  if (nonChildCnt > 0) {
    const serviceRows = await StatsService.getCollegeRanking({ metric: 'childCompletionCount', period: 'all', page: 1, pageSize: 1000 });
    const serviceTotal = serviceRows.items.reduce((s, r) => s + r.childCompletionCount, 0);
    recordMismatch(
      'H2',
      'college:childCompletionCount',
      'includesNonChild',
      childCnt,
      serviceTotal,
      `${nonChildCnt} non-child completion(s) exist; service college total=${serviceTotal}, child-only=${childCnt}`
    );
  }
}

async function main() {
  console.log('=== Stats Verification ===\n');

  // --- Volunteer: service vs ground truth ---
  const serviceVol = await StatsService.getVolunteerRanking({
    scope: 'platform',
    metric: 'score',
    period: 'all',
    page: 1,
    pageSize: 10000,
  });
  const truthVol = await groundTruthVolunteerMetrics();

  console.log(`Volunteers: service=${serviceVol.items.length}, groundTruth=${truthVol.size}`);

  for (const item of serviceVol.items) {
    const gt = truthVol.get(item.volunteerUserId);
    if (!gt) {
      recordMismatch('H0', `volunteer:${item.volunteerUserId}`, 'missing', 'exists', 'missing in ground truth');
      continue;
    }
    if (item.teachingMinutes !== gt.teachingMinutes) {
      recordMismatch('H4', `volunteer:${item.volunteerUserId}`, 'teachingMinutes', gt.teachingMinutes, item.teachingMinutes);
    }
    if (item.liveFinishedCount !== gt.liveFinishedCount) {
      recordMismatch('H1', `volunteer:${item.volunteerUserId}`, 'liveFinishedCount', gt.liveFinishedCount, item.liveFinishedCount);
    }
    if (!approxEq(item.auditPassRate, gt.auditPassRate)) {
      recordMismatch('H3', `volunteer:${item.volunteerUserId}`, 'auditPassRate', gt.auditPassRate, item.auditPassRate);
    }
    if (item.childCompletionCount !== gt.childCompletionCount) {
      recordMismatch('H2', `volunteer:${item.volunteerUserId}`, 'childCompletionCount', gt.childCompletionCount, item.childCompletionCount);
    }
  }

  agentLog('H4', 'stats-verify.ts', 'volunteer verification done', {
    checked: serviceVol.items.length,
    mismatches: mismatches.filter((m) => m.entity.startsWith('volunteer:')).length,
  });

  // --- College: service vs ground truth (child-only canonical) ---
  const serviceCol = await StatsService.getCollegeRanking({ metric: 'score', period: 'all', page: 1, pageSize: 1000 });
  const truthCol = await groundTruthCollegeMetricsChildOnly();

  console.log(`Colleges: service=${serviceCol.items.length}, groundTruth=${truthCol.size}`);

  for (const item of serviceCol.items) {
    const gt = truthCol.get(item.collegeId);
    if (!gt) continue;

    if (item.volunteerActiveCount !== gt.volunteerActiveCount) {
      recordMismatch('H0', `college:${item.collegeId}`, 'volunteerActiveCount', gt.volunteerActiveCount, item.volunteerActiveCount);
    }
    if (item.publishedVideoCount !== gt.publishedVideoCount) {
      recordMismatch('H0', `college:${item.collegeId}`, 'publishedVideoCount', gt.publishedVideoCount, item.publishedVideoCount);
    }
    if (item.liveFinishedCount !== gt.liveFinishedCount) {
      recordMismatch('H1', `college:${item.collegeId}`, 'liveFinishedCount', gt.liveFinishedCount, item.liveFinishedCount);
    }
    if (item.totalTeachingMinutes !== gt.totalTeachingMinutes) {
      recordMismatch('H4', `college:${item.collegeId}`, 'totalTeachingMinutes', gt.totalTeachingMinutes, item.totalTeachingMinutes);
    }
    if (!approxEq(item.auditPassRate, gt.auditPassRate)) {
      recordMismatch('H3', `college:${item.collegeId}`, 'auditPassRate', gt.auditPassRate, item.auditPassRate);
    }
    if (item.childCompletionCount !== gt.childCompletionCount) {
      recordMismatch('H2', `college:${item.collegeId}`, 'childCompletionCount', gt.childCompletionCount, item.childCompletionCount);
    }
  }

  // --- Cross-consistency: sum volunteer metrics per college vs college aggregate ---
  const volByCollege = new Map<number, { teaching: number; live: number; completion: number }>();
  for (const item of serviceVol.items) {
    const cur = volByCollege.get(item.collegeId) ?? { teaching: 0, live: 0, completion: 0 };
    cur.teaching += item.teachingMinutes;
    cur.live += item.liveFinishedCount;
    cur.completion += item.childCompletionCount;
    volByCollege.set(item.collegeId, cur);
  }

  for (const item of serviceCol.items) {
    const sum = volByCollege.get(item.collegeId);
    if (!sum) continue;
    if (sum.teaching !== item.totalTeachingMinutes) {
      recordMismatch(
        'H4',
        `college:${item.collegeId}`,
        'sumVolunteerTeaching vs collegeTotal',
        sum.teaching,
        item.totalTeachingMinutes,
        'volunteer sum should equal college total if same filters'
      );
    }
    if (sum.live !== item.liveFinishedCount) {
      recordMismatch(
        'H1',
        `college:${item.collegeId}`,
        'sumVolunteerLive vs collegeLive',
        sum.live,
        item.liveFinishedCount
      );
    }
    if (sum.completion !== item.childCompletionCount) {
      recordMismatch(
        'H2',
        `college:${item.collegeId}`,
        'sumVolunteerCompletion vs collegeCompletion',
        sum.completion,
        item.childCompletionCount
      );
    }
  }

  await checkCollegeLiveFilterGap();
  await checkCollegeCompletionNonChild();

  // --- Score sanity: recompute volunteer scores ---
  const rows = serviceVol.items.map((r) => ({ ...r }));
  const mins = rows.map((r) => r.teachingMinutes);
  const lives = rows.map((r) => r.liveFinishedCount);
  const completions = rows.map((r) => r.childCompletionCount);
  const rates = rows.map((r) => r.auditPassRate ?? 0);
  const norm = (values: number[]) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return values.map(() => (max > 0 ? 1 : 0));
    return values.map((v) => (v - min) / (max - min));
  };
  const normTeaching = norm(mins);
  const normLive = norm(lives);
  const normCompletion = norm(completions);
  const normRate = norm(rates);
  for (let i = 0; i < rows.length; i++) {
    const expectedScore =
      Math.round((0.35 * normTeaching[i] + 0.25 * normLive[i] + 0.2 * normRate[i] + 0.2 * normCompletion[i]) * 1000) / 10;
    if (rows[i].score !== expectedScore) {
      recordMismatch('H5', `volunteer:${rows[i].volunteerUserId}`, 'score', expectedScore, rows[i].score);
    }
  }

  agentLog('H5', 'stats-verify.ts', 'score verification done', {
    checked: rows.length,
    scoreMismatches: mismatches.filter((m) => m.field === 'score').length,
  });

  // --- Report ---
  console.log('\n--- Results ---');
  if (mismatches.length === 0) {
    console.log('✅ No mismatches found — all metrics match ground truth.');
    agentLog('SUMMARY', 'stats-verify.ts', 'all passed', { mismatchCount: 0 });
  } else {
    console.log(`❌ Found ${mismatches.length} mismatch(es):\n`);
    for (const m of mismatches) {
      console.log(`  [${m.hypothesisId}] ${m.entity}.${m.field}`);
      console.log(`    expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`);
      if (m.detail) console.log(`    detail: ${m.detail}`);
    }
    agentLog('SUMMARY', 'stats-verify.ts', 'mismatches found', { mismatchCount: mismatches.length, mismatches });
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Verification failed:', err);
  agentLog('ERROR', 'stats-verify.ts', 'fatal', { error: String(err) });
  process.exit(1);
});
