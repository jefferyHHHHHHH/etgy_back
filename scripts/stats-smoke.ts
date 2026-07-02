/*
 * Stats / rankings P0 smoke test.
 *
 * Coverage:
 * - GET /api/stats/volunteers/ranking (college / school / platform scopes)
 * - GET /api/stats/colleges/ranking (platform admin only)
 * - GET /api/stats/volunteers/me
 * - GET /api/stats/schools
 * - Redis cache HIT on repeat requests
 * - Cache invalidation after child completion
 * - Role-based access control
 *
 * Usage: npm run smoke:stats
 * Requires: MySQL + Redis + seeded users (npm run db:seed)
 */

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import redisClient from '../src/config/redis';
import { LiveStatus, UserRole, UserStatus, VideoStatus, VolunteerStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const SMOKE_PASSWORD = 'Passw0rd!';

function assert(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

type Json = any;

async function http(
  baseUrl: string,
  method: string,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; ok: boolean; json: Json; headers: Headers }> {
  const resp = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    } as any,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let json: Json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { status: resp.status, ok: resp.ok, json, headers: resp.headers };
}

async function login(baseUrl: string, username: string, password: string, role?: string) {
  const res = await http(baseUrl, 'POST', '/api/auth/login', { username, password, role });
  assert(res.status === 200, `${username} login expected 200, got ${res.status}: ${JSON.stringify(res.json)}`);
  const token = res.json?.data?.token;
  assert(token, `${username} login missing token`);
  return token as string;
}

async function ensureSmokeAccounts() {
  const passwordHash = await bcrypt.hash(SMOKE_PASSWORD, 10);
  const college = await prisma.college.upsert({
    where: { name: 'Default College' },
    update: {},
    create: { name: 'Default College', isActive: true, sortOrder: 0 },
  });

  await prisma.user.upsert({
    where: { username: 'platform_admin' },
    update: { passwordHash, role: UserRole.PLATFORM_ADMIN, status: UserStatus.ACTIVE },
    create: {
      username: 'platform_admin',
      passwordHash,
      role: UserRole.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
      adminProfile: { create: { realName: 'Platform Admin', collegeId: null } },
    },
  });

  await prisma.user.upsert({
    where: { username: 'college_admin' },
    update: { passwordHash, role: UserRole.COLLEGE_ADMIN, status: UserStatus.ACTIVE },
    create: {
      username: 'college_admin',
      passwordHash,
      role: UserRole.COLLEGE_ADMIN,
      status: UserStatus.ACTIVE,
      adminProfile: { create: { realName: 'College Admin', collegeId: college.id } },
    },
  });

  const volunteer = await prisma.user.upsert({
    where: { username: 'volunteer_001' },
    update: { passwordHash, role: UserRole.VOLUNTEER, status: UserStatus.ACTIVE },
    create: {
      username: 'volunteer_001',
      passwordHash,
      role: UserRole.VOLUNTEER,
      status: UserStatus.ACTIVE,
      volunteerProfile: {
        create: {
          realName: 'Volunteer One',
          studentId: 'S0001',
          collegeId: college.id,
          status: VolunteerStatus.IN_SCHOOL,
        },
      },
    },
    include: { volunteerProfile: true },
  });

  const child = await prisma.user.upsert({
    where: { username: 'child_001' },
    update: { passwordHash, role: UserRole.CHILD, status: UserStatus.ACTIVE },
    create: {
      username: 'child_001',
      passwordHash,
      role: UserRole.CHILD,
      status: UserStatus.ACTIVE,
      childProfile: {
        create: {
          realName: 'Child One',
          school: 'Helping Primary School',
          grade: '3',
          collegeId: college.id,
        },
      },
    },
  });

  await prisma.childProfile.upsert({
    where: { userId: child.id },
    update: { school: 'Helping Primary School', collegeId: college.id },
    create: {
      userId: child.id,
      realName: 'Child One',
      school: 'Helping Primary School',
      grade: '3',
      collegeId: college.id,
    },
  });

  if (redisClient.status === 'ready') {
    await redisClient.del(`etgy:stats:schools:${college.id}`);
    await redisClient.del(`etgy:stats:me:${volunteer.id}:all:all`);
    await redisClient.incr(`etgy:stats:ver:college:${college.id}`);
    await redisClient.incr('etgy:stats:ver:platform:0');
  }

  return { college, volunteerUserId: volunteer.id };
}

async function ensurePublishedVideo(volunteerUserId: number, collegeId: number) {
  const existing = await prisma.video.findFirst({
    where: { uploaderId: volunteerUserId, status: VideoStatus.PUBLISHED },
    select: { id: true, duration: true },
  });
  if (existing) {
    if (!existing.duration || existing.duration < 600) {
      return prisma.video.update({
        where: { id: existing.id },
        data: { duration: 600 },
        select: { id: true, duration: true },
      });
    }
    return existing;
  }

  return prisma.video.create({
    data: {
      title: `stats_smoke_video_${Date.now()}`,
      url: 'https://example.com/stats-smoke.mp4',
      duration: 600,
      status: VideoStatus.PUBLISHED,
      uploaderId: volunteerUserId,
      collegeId,
      publishedAt: new Date(),
    },
    select: { id: true, duration: true },
  });
}

async function ensureFinishedLive(volunteerUserId: number, collegeId: number) {
  const existing = await prisma.liveRoom.findFirst({
    where: { anchorId: volunteerUserId, status: LiveStatus.FINISHED },
    select: { id: true },
  });
  if (existing) return existing;

  const start = new Date(Date.now() - 3600000);
  const end = new Date(Date.now() - 3000000);
  return prisma.liveRoom.create({
    data: {
      title: `stats_smoke_live_${Date.now()}`,
      planStartTime: start,
      planEndTime: end,
      actualStart: start,
      actualEnd: end,
      status: LiveStatus.FINISHED,
      anchorId: volunteerUserId,
      collegeId,
    },
    select: { id: true },
  });
}

function assertVolunteerRankingItem(item: any) {
  assert(typeof item.rank === 'number', 'rank must be number');
  assert(typeof item.volunteerUserId === 'number', 'volunteerUserId must be number');
  assert(typeof item.realName === 'string', 'realName must be string');
  assert(typeof item.teachingMinutes === 'number', 'teachingMinutes must be number');
  assert(typeof item.liveFinishedCount === 'number', 'liveFinishedCount must be number');
  assert(typeof item.childCompletionCount === 'number', 'childCompletionCount must be number');
  assert(typeof item.score === 'number', 'score must be number');
}

async function main() {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('Stats smoke starting...');
    console.log('Base URL:', baseUrl);

    if (redisClient.status !== 'ready') {
      try {
        await redisClient.connect();
      } catch {
        console.warn('Redis connect failed; cache tests may show MISS only');
      }
    }

    const { college, volunteerUserId } = await ensureSmokeAccounts();
    const video = await ensurePublishedVideo(volunteerUserId, college.id);
    await ensureFinishedLive(volunteerUserId, college.id);

    const platformToken = await login(baseUrl, 'platform_admin', SMOKE_PASSWORD, 'PLATFORM_ADMIN');
    const collegeToken = await login(baseUrl, 'college_admin', SMOKE_PASSWORD, 'COLLEGE_ADMIN');
    const volunteerToken = await login(baseUrl, 'volunteer_001', SMOKE_PASSWORD, 'VOLUNTEER');
    const childToken = await login(baseUrl, 'child_001', SMOKE_PASSWORD, 'CHILD');

    // --- schools list ---
    console.log('→ GET /api/stats/schools (college admin)');
    const schoolsRes = await http(baseUrl, 'GET', '/api/stats/schools', undefined, collegeToken);
    assert(schoolsRes.status === 200, `schools expected 200, got ${schoolsRes.status}`);
    assert(Array.isArray(schoolsRes.json.data), 'schools data must be array');
    const schoolNames = schoolsRes.json.data.map((s: any) => s.school);
    assert(schoolNames.includes('Helping Primary School'), 'expected Helping Primary School in schools list');

    // --- volunteer college ranking ---
    console.log('→ GET /api/stats/volunteers/ranking?scope=college (volunteer)');
    const rank1 = await http(
      baseUrl,
      'GET',
      '/api/stats/volunteers/ranking?scope=college&metric=score&page=1&pageSize=10',
      undefined,
      volunteerToken
    );
    assert(rank1.status === 200, `volunteer ranking expected 200, got ${rank1.status}: ${JSON.stringify(rank1.json)}`);
    assert(rank1.json.data.scope === 'college', 'scope should be college');
    assert(rank1.json.data.total >= 1, 'total should be >= 1');
    assert(rank1.json.data.items.length >= 1, 'items should not be empty');
    assertVolunteerRankingItem(rank1.json.data.items[0]);
    assert(rank1.json.data.myRank?.rank >= 1, 'volunteer should have myRank');
    const cache1 = rank1.headers.get('x-stats-cache');
    console.log('  cache:', cache1);

    console.log('→ repeat request (expect cache HIT if Redis ready)');
    const rank2 = await http(
      baseUrl,
      'GET',
      '/api/stats/volunteers/ranking?scope=college&metric=score&page=1&pageSize=10',
      undefined,
      volunteerToken
    );
    assert(rank2.status === 200, 'repeat ranking failed');
    const cache2 = rank2.headers.get('x-stats-cache');
    console.log('  cache:', cache2);
    if (redisClient.status === 'ready') {
      assert(cache2 === 'HIT', `expected cache HIT on repeat, got ${cache2}`);
      assert(rank2.json.data.cachedAt, 'cachedAt should be set on HIT');
    }

    // --- school scope ranking ---
    console.log('→ GET /api/stats/volunteers/ranking?scope=school');
    const schoolRank = await http(
      baseUrl,
      'GET',
      `/api/stats/volunteers/ranking?scope=school&school=${encodeURIComponent('Helping Primary School')}&metric=childCompletionCount`,
      undefined,
      collegeToken
    );
    assert(schoolRank.status === 200, `school ranking expected 200, got ${schoolRank.status}`);
    assert(schoolRank.json.data.scope === 'school', 'scope should be school');

    // --- platform college ranking ---
    console.log('→ GET /api/stats/colleges/ranking (platform admin)');
    const collegeRank = await http(
      baseUrl,
      'GET',
      '/api/stats/colleges/ranking?metric=score&page=1&pageSize=20',
      undefined,
      platformToken
    );
    assert(collegeRank.status === 200, `college ranking expected 200, got ${collegeRank.status}`);
    assert(collegeRank.json.data.total >= 1, 'college total >= 1');
    assert(collegeRank.json.data.items[0].collegeName, 'college item needs collegeName');

    // --- volunteer me stats ---
    console.log('→ GET /api/stats/volunteers/me');
    const meRes = await http(baseUrl, 'GET', '/api/stats/volunteers/me', undefined, volunteerToken);
    assert(meRes.status === 200, `volunteer me expected 200, got ${meRes.status}`);
    const me = meRes.json.data;
    assert(typeof me.teachingMinutes === 'number', 'teachingMinutes');
    assert(typeof me.liveFinishedCount === 'number', 'liveFinishedCount');
    assert(me.liveFinishedCount >= 1, 'expected at least 1 finished live');
    assert(me.teachingMinutes >= 10, 'expected teaching minutes from published video');
    assert(me.ranks?.college?.rank >= 1, 'expected college rank');

    // --- RBAC: college admin cannot access platform college ranking ---
    console.log('→ RBAC: college admin blocked from /colleges/ranking');
    const forbiddenCollege = await http(
      baseUrl,
      'GET',
      '/api/stats/colleges/ranking',
      undefined,
      collegeToken
    );
    assert(forbiddenCollege.status === 403, `expected 403, got ${forbiddenCollege.status}`);

    // --- RBAC: child cannot access stats ---
    console.log('→ RBAC: child blocked from stats');
    const forbiddenChild = await http(
      baseUrl,
      'GET',
      '/api/stats/volunteers/ranking?scope=college',
      undefined,
      childToken
    );
    assert(forbiddenChild.status === 403, `expected 403 for child, got ${forbiddenChild.status}`);

    // --- cache invalidation on completion ---
    console.log('→ cache invalidation via child completion');
    const childUser = await prisma.user.findUnique({ where: { username: 'child_001' }, select: { id: true } });
    assert(childUser, 'child_001 missing');

    const completionVideo = await prisma.video.create({
      data: {
        title: `stats_smoke_completion_${Date.now()}`,
        url: 'https://example.com/stats-smoke-completion.mp4',
        duration: 300,
        status: VideoStatus.PUBLISHED,
        uploaderId: volunteerUserId,
        collegeId: college.id,
        publishedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.videoWatchLog.deleteMany({
      where: { videoId: completionVideo.id, userId: childUser.id },
    });
    if (redisClient.status === 'ready') {
      await redisClient.del(`etgy:stats:me:${volunteerUserId}:all:all`);
      await redisClient.incr(`etgy:stats:ver:college:${college.id}`);
    }

    const beforeCompletion = await http(
      baseUrl,
      'GET',
      '/api/stats/volunteers/me',
      undefined,
      volunteerToken
    );
    const beforeCount = beforeCompletion.json.data.childCompletionCount;

    const watchRes = await http(
      baseUrl,
      'POST',
      `/api/videos/${completionVideo.id}/watch`,
      { lastPositionSec: 300, watchedSeconds: 300, completed: true },
      childToken
    );
    assert(watchRes.status === 200, `watch expected 200, got ${watchRes.status}: ${JSON.stringify(watchRes.json)}`);

    const afterCompletion = await http(
      baseUrl,
      'GET',
      '/api/stats/volunteers/me',
      undefined,
      volunteerToken
    );
    assert(afterCompletion.status === 200, 'volunteer me after completion failed');
    const afterCount = afterCompletion.json.data.childCompletionCount;
    assert(
      afterCount >= beforeCount + 1,
      `childCompletionCount should increase: before=${beforeCount}, after=${afterCount}`
    );

    // --- platform scope volunteer ranking ---
    console.log('→ GET /api/stats/volunteers/ranking?scope=platform');
    const platformVolRank = await http(
      baseUrl,
      'GET',
      '/api/stats/volunteers/ranking?scope=platform&metric=score&page=1&pageSize=20',
      undefined,
      platformToken
    );
    assert(platformVolRank.status === 200, `platform volunteer ranking failed: ${JSON.stringify(platformVolRank.json)}`);
    assert(platformVolRank.json.data.scope === 'platform', 'scope should be platform');

    // --- metric variants ---
    for (const metric of ['teachingMinutes', 'liveFinishedCount', 'auditPassRate', 'childCompletionCount']) {
      const res = await http(
        baseUrl,
        'GET',
        `/api/stats/volunteers/ranking?scope=college&metric=${metric}&page=1&pageSize=5`,
        undefined,
        collegeToken
      );
      assert(res.status === 200, `metric=${metric} failed: ${JSON.stringify(res.json)}`);
    }

    console.log('✅ Stats smoke passed');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      if (redisClient.status === 'ready') await redisClient.quit();
    } catch {
      // ignore
    }
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Stats smoke failed:', err);
  process.exit(1);
});
