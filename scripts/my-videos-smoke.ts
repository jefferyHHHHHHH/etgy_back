/*
Smoke test for volunteer endpoint: GET /api/videos/mine

Coverage:
- Unauthenticated access blocked (401)
- Non-volunteer access blocked (403)
- Volunteer can list own videos
- Status filtering works (REVIEW / REJECTED / PUBLISHED)
- REJECTED items carry rejectReason
- Response pagination headers exist

Usage:
- Requires DB available.
- Run: node -e "require('ts-node').register({ files: true }); require('./scripts/my-videos-smoke.ts');"
*/

import app from '../src/app';
import { prisma } from '../src/config/prisma';
import bcrypt from 'bcryptjs';

type Json = any;

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function rand(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function http(baseUrl: string, method: string, path: string, body?: any, token?: string) {
  const resp = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    } as any,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let json: Json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  const headers: Record<string, string> = {};
  for (const [k, v] of resp.headers.entries()) headers[k.toLowerCase()] = v;

  return { status: resp.status, ok: resp.ok, json, headers };
}

async function login(baseUrl: string, username: string, password: string) {
  const r = await http(baseUrl, 'POST', '/api/auth/login', { username, password });
  assert(r.status === 200, `login expected 200, got ${r.status}: ${JSON.stringify(r.json)}`);
  const token = r.json?.data?.token;
  assert(token, `login missing token: ${JSON.stringify(r.json)}`);
  return token as string;
}

async function ensureCollege() {
  const existing = await prisma.college.findFirst({ select: { id: true } });
  if (existing?.id) return existing.id;

  const created = await prisma.college.create({
    data: {
      name: rand('smoke_college'),
      isActive: true,
      sortOrder: 0,
    },
    select: { id: true },
  });
  return created.id;
}

async function ensureVolunteerUser() {
  const username = 'volunteer_smoke';
  const password = 'Passw0rd!';

  const collegeId = await ensureCollege();

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: 'VOLUNTEER' as any,
        status: 'ACTIVE' as any,
        volunteerProfile: {
          create: {
            realName: '冒烟志愿者',
            studentId: rand('stu'),
            collegeId,
            phone: '13800000000',
            gender: 'UNKNOWN' as any,
            status: 'IN_SCHOOL' as any,
          },
        },
      },
      select: { id: true },
    });
  }

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: (user?.id ?? (await prisma.user.findUnique({ where: { username }, select: { id: true } }))!.id) },
    select: { userId: true, collegeId: true, realName: true },
  });

  assert(profile?.userId, 'volunteerProfile missing');
  return { username, password, userId: profile!.userId, collegeId: profile!.collegeId };
}

async function ensureOtherVolunteer(collegeId: number) {
  const username = 'volunteer_smoke_other';
  const password = 'Passw0rd!';

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: 'VOLUNTEER' as any,
        status: 'ACTIVE' as any,
        volunteerProfile: {
          create: {
            realName: '冒烟志愿者2',
            studentId: rand('stu2'),
            collegeId,
            phone: '13900000000',
            gender: 'UNKNOWN' as any,
            status: 'IN_SCHOOL' as any,
          },
        },
      },
      select: { id: true },
    });
  }

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: (user?.id ?? (await prisma.user.findUnique({ where: { username }, select: { id: true } }))!.id) },
    select: { userId: true },
  });

  return { username, password, userId: profile!.userId };
}

async function ensureVideosForVolunteer(uploaderId: number, collegeId: number) {
  // create a small set of videos across statuses (idempotent-ish by title prefix)
  const prefix = 'smoke_myvideos_';

  const existing = await prisma.video.findMany({
    where: { uploaderId, title: { startsWith: prefix } },
    select: { id: true, status: true, title: true, rejectReason: true },
    take: 10,
  });

  if (existing.length >= 4) return existing;

  const now = new Date();
  const toCreate = [
    { status: 'REVIEW', rejectReason: null as any, title: `${prefix}review_${Date.now()}` },
    { status: 'REJECTED', rejectReason: '格式不符合要求（冒烟）', title: `${prefix}rejected_${Date.now()}` },
    { status: 'PUBLISHED', rejectReason: null as any, title: `${prefix}published_${Date.now()}` },
    { status: 'DRAFT', rejectReason: null as any, title: `${prefix}draft_${Date.now()}` },
  ];

  for (const v of toCreate) {
    await prisma.video.create({
      data: {
        title: v.title,
        intro: 'smoke intro',
        url: `oss://smoke/${v.title}.mp4`,
        coverUrl: null,
        duration: 60,
        gradeRange: '1-3',
        subjectTag: 'Math',
        status: v.status as any,
        rejectReason: v.rejectReason,
        uploaderId,
        collegeId,
        reviewedAt: v.status === 'REJECTED' ? now : null,
        publishedAt: v.status === 'PUBLISHED' ? now : null,
      },
      select: { id: true },
    });
  }

  return prisma.video.findMany({
    where: { uploaderId, title: { startsWith: prefix } },
    select: { id: true, status: true, title: true, rejectReason: true },
    take: 20,
  });
}

async function main() {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('My videos smoke starting...');
    console.log('Base URL:', baseUrl);

    // 0) unauth blocked
    {
      const r = await http(baseUrl, 'GET', '/api/videos/mine?page=1&pageSize=5');
      assert(r.status === 401, `expected 401, got ${r.status}: ${JSON.stringify(r.json)}`);
    }

    // 1) platform admin forbidden
    const adminToken = await login(baseUrl, 'platform_admin', 'Passw0rd!');
    {
      const r = await http(baseUrl, 'GET', '/api/videos/mine?page=1&pageSize=5', undefined, adminToken);
      assert(r.status === 403, `expected 403 for non-volunteer, got ${r.status}: ${JSON.stringify(r.json)}`);
    }

    // 2) ensure volunteer + data
    const vol = await ensureVolunteerUser();
    const other = await ensureOtherVolunteer(vol.collegeId);

    await ensureVideosForVolunteer(vol.userId, vol.collegeId);
    // create one video owned by other volunteer to ensure it never appears
    await ensureVideosForVolunteer(other.userId, vol.collegeId);

    const volToken = await login(baseUrl, vol.username, vol.password);

    // 3) list all mine
    const listAll = await http(baseUrl, 'GET', '/api/videos/mine?page=1&pageSize=50', undefined, volToken);
    assert(listAll.status === 200, `expected 200, got ${listAll.status}: ${JSON.stringify(listAll.json)}`);

    const items: any[] = listAll.json?.data ?? [];
    assert(Array.isArray(items), 'expected data to be array');
    assert(items.length > 0, 'expected at least 1 video in mine list');

    // Pagination headers
    assert(typeof listAll.headers['x-total-count'] === 'string', 'missing X-Total-Count header');
    assert(typeof listAll.headers['x-page'] === 'string', 'missing X-Page header');
    assert(typeof listAll.headers['x-page-size'] === 'string', 'missing X-Page-Size header');

    // Scope check: all uploaderId are mine
    for (const it of items) {
      assert(Number(it.uploaderId) === vol.userId, `expected uploaderId=${vol.userId}, got ${it.uploaderId}`);
    }

    // 4) status=REVIEW filter
    const listReview = await http(baseUrl, 'GET', '/api/videos/mine?status=REVIEW&page=1&pageSize=50', undefined, volToken);
    assert(listReview.status === 200, `expected 200, got ${listReview.status}`);
    const reviewItems: any[] = listReview.json?.data ?? [];
    assert(Array.isArray(reviewItems), 'expected review data array');
    assert(reviewItems.length >= 1, 'expected at least 1 REVIEW video');
    for (const it of reviewItems) assert(it.status === 'REVIEW', `expected REVIEW, got ${it.status}`);

    // 5) status=REJECTED includes rejectReason
    const listRejected = await http(baseUrl, 'GET', '/api/videos/mine?status=REJECTED&page=1&pageSize=50', undefined, volToken);
    assert(listRejected.status === 200, `expected 200, got ${listRejected.status}`);
    const rejectedItems: any[] = listRejected.json?.data ?? [];
    assert(rejectedItems.length >= 1, 'expected at least 1 REJECTED video');
    for (const it of rejectedItems) {
      assert(it.status === 'REJECTED', `expected REJECTED, got ${it.status}`);
      assert(typeof it.rejectReason === 'string' && it.rejectReason.length > 0, 'expected rejectReason non-empty');
    }

    // 6) status=PUBLISHED
    const listPublished = await http(baseUrl, 'GET', '/api/videos/mine?status=PUBLISHED&page=1&pageSize=50', undefined, volToken);
    assert(listPublished.status === 200, `expected 200, got ${listPublished.status}`);
    const pubItems: any[] = listPublished.json?.data ?? [];
    assert(pubItems.length >= 1, 'expected at least 1 PUBLISHED video');
    for (const it of pubItems) assert(it.status === 'PUBLISHED', `expected PUBLISHED, got ${it.status}`);

    console.log('✅ My videos smoke PASSED');
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error('❌ My videos smoke FAILED');
  console.error(e);
  process.exit(1);
});
