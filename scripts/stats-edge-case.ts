/*
 * Inject edge-case data to expose latent stats bugs, then verify.
 * Usage: node -e "require('ts-node').register({ files: true }); require('./scripts/stats-edge-case.ts');"
 */

import { prisma } from '../src/config/prisma';
import { StatsService } from '../src/services/stats.service';
import { StatsCacheService } from '../src/services/statsCache.service';
import { LiveStatus, UserRole, UserStatus, VideoStatus, VolunteerStatus } from '../src/types/enums';
import * as fs from 'fs';
import * as path from 'path';

const LOG_PATH = path.join(__dirname, '..', 'debug-93a79b.log');
const DEBUG_ENDPOINT = 'http://127.0.0.1:7743/ingest/03a0fb0f-c655-4cc5-9a21-21a9c8f9997a';
const SESSION_ID = '93a79b';

function agentLog(hypothesisId: string, message: string, data: Record<string, unknown>) {
  const payload = { sessionId: SESSION_ID, hypothesisId, location: 'stats-edge-case.ts', message, data, timestamp: Date.now(), runId: 'edge-case' };
  // #region agent log
  fetch(DEBUG_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION_ID }, body: JSON.stringify(payload) }).catch(() => {});
  try { fs.appendFileSync(LOG_PATH, JSON.stringify(payload) + '\n'); } catch { /* ignore */ }
  // #endregion
}

async function main() {
  const college = await prisma.college.findFirst({ where: { isActive: true } });
  if (!college) throw new Error('No active college');

  const volunteer = await prisma.volunteerProfile.findFirst({
    where: { collegeId: college.id, status: VolunteerStatus.IN_SCHOOL },
    include: { user: true },
  });
  if (!volunteer) throw new Error('No volunteer');

  // Edge case 1: FINISHED live without actualStart/actualEnd
  const badLive = await prisma.liveRoom.create({
    data: {
      title: `edge_bad_live_${Date.now()}`,
      planStartTime: new Date(),
      planEndTime: new Date(),
      status: LiveStatus.FINISHED,
      anchorId: volunteer.userId,
      collegeId: college.id,
      actualStart: null,
      actualEnd: null,
    },
  });

  // Edge case 2: non-child (volunteer) completion
  const video = await prisma.video.findFirst({
    where: { uploaderId: volunteer.userId, status: VideoStatus.PUBLISHED },
  });
  if (!video) throw new Error('No published video for volunteer');

  await prisma.videoWatchLog.upsert({
    where: { videoId_userId: { videoId: video.id, userId: volunteer.userId } },
    update: { completed: true, watchedSeconds: 300, lastPositionSec: 300 },
    create: { videoId: video.id, userId: volunteer.userId, completed: true, watchedSeconds: 300, lastPositionSec: 300 },
  });

  agentLog('H1-SETUP', 'created edge cases', { badLiveId: badLive.id, volunteerCompletion: true });

  await StatsCacheService.bumpVersion('college', college.id);
  await StatsCacheService.bumpVersion('platform', 0);

  const colRank = await StatsService.getCollegeRanking({ metric: 'liveFinishedCount', period: 'all', page: 1, pageSize: 100 });
  const volRank = await StatsService.getVolunteerRanking({
    scope: 'college',
    collegeId: college.id,
    metric: 'liveFinishedCount',
    period: 'all',
    page: 1,
    pageSize: 100,
  });

  const collegeItem = colRank.items.find((c) => c.collegeId === college.id);
  const volunteerItem = volRank.items.find((v) => v.volunteerUserId === volunteer.userId);

  const collegeLive = collegeItem?.liveFinishedCount ?? 0;
  const volunteerLive = volunteerItem?.liveFinishedCount ?? 0;

  agentLog('H1', 'live count after bad live', {
    collegeLive,
    volunteerLive,
    gap: collegeLive - volunteerLive,
    badLiveCountedByCollege: collegeLive > volunteerLive,
  });

  const colCompletion = await StatsService.getCollegeRanking({ metric: 'childCompletionCount', period: 'all', page: 1, pageSize: 100 });
  const volCompletion = await StatsService.getVolunteerRanking({
    scope: 'college',
    collegeId: college.id,
    metric: 'childCompletionCount',
    period: 'all',
    page: 1,
    pageSize: 100,
  });

  const collegeComp = colCompletion.items.find((c) => c.collegeId === college.id)?.childCompletionCount ?? 0;
  const volunteerComp = volCompletion.items.find((v) => v.volunteerUserId === volunteer.userId)?.childCompletionCount ?? 0;

  agentLog('H2', 'completion after volunteer self-watch', {
    collegeComp,
    volunteerComp,
    collegeIncludesNonChild: collegeComp > volunteerComp,
  });

  console.log('--- Edge Case Results ---');
  console.log(`H1 live gap (college - volunteer): ${collegeLive - volunteerLive} (expected 1 if bug)`);
  console.log(`H2 completion gap (college - volunteer): ${collegeComp - volunteerComp} (expected 1 if bug)`);

  // Cleanup
  await prisma.liveRoom.delete({ where: { id: badLive.id } });
  await prisma.videoWatchLog.deleteMany({ where: { videoId: video.id, userId: volunteer.userId } });

  const bugs: string[] = [];
  if (collegeLive > volunteerLive) bugs.push('H1: college liveFinishedCount counts FINISHED without actualStart/actualEnd');
  if (collegeComp > volunteerComp) bugs.push('H2: college childCompletionCount includes non-child completions');

  if (bugs.length) {
    console.log('\n❌ Latent bugs confirmed:');
    bugs.forEach((b) => console.log('  -', b));
    agentLog('SUMMARY', 'bugs confirmed', { bugs });
    process.exitCode = 1;
  } else {
    console.log('\n✅ No latent bugs detected in edge cases');
    agentLog('SUMMARY', 'edge cases clean', {});
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
