import app from '../src/app';
import { prisma } from '../src/config/prisma';
import { CommentStatus, UserRole, UserStatus, VideoStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const SMOKE_PASSWORD = 'Passw0rd!';

async function ensureSmokeAccounts() {
  const passwordHash = await bcrypt.hash(SMOKE_PASSWORD, 10);
  const college = await prisma.college.findFirst({ orderBy: { id: 'asc' } });
  if (!college) throw new Error('no college found; run db:seed first');

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

  await prisma.user.upsert({
    where: { username: 'child_001' },
    update: { passwordHash, role: UserRole.CHILD, status: UserStatus.ACTIVE },
    create: {
      username: 'child_001',
      passwordHash,
      role: UserRole.CHILD,
      status: UserStatus.ACTIVE,
      childProfile: { create: { realName: 'Child One', school: 'Smoke School', grade: '3' } },
    },
  });
}

async function login(baseUrl: string, username: string, password: string) {
  const resp = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json: any = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(`login(${username}) failed: ${resp.status} ${JSON.stringify(json)}`);
  const token = json?.data?.token;
  if (!token) throw new Error(`login(${username}) missing token`);
  return token as string;
}

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

async function ensurePublishedVideo() {
  const existing = await prisma.video.findFirst({
    where: { status: VideoStatus.PUBLISHED },
    select: { id: true, collegeId: true, title: true },
  });
  if (existing) return existing;

  const volunteer = await prisma.volunteerProfile.findFirst({
    select: { userId: true, collegeId: true },
  });
  if (!volunteer) throw new Error('no volunteer profile for smoke video');

  const created = await prisma.video.create({
    data: {
      title: `smoke_comment_video_${Date.now()}`,
      url: 'https://example.com/smoke.mp4',
      status: VideoStatus.PUBLISHED,
      uploaderId: volunteer.userId,
      collegeId: volunteer.collegeId,
      publishedAt: new Date(),
    },
    select: { id: true, collegeId: true, title: true },
  });
  return created;
}

async function createPendingComment(videoId: number, authorId: number, content: string) {
  return prisma.videoComment.create({
    data: { videoId, authorId, content, status: CommentStatus.PENDING },
    select: { id: true, content: true, status: true, videoId: true },
  });
}

async function main() {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  const password = SMOKE_PASSWORD;

  const cleanupIds: number[] = [];

  try {
    await ensureSmokeAccounts();
    const platformToken = await login(baseUrl, 'platform_admin', password);
    const collegeToken = await login(baseUrl, 'college_admin', password);
    const childToken = await login(baseUrl, 'child_001', password);

    // Ensure comments enabled
    const policyResp = await fetch(`${baseUrl}/api/platform/content-policy`, {
      method: 'PUT',
      headers: authHeaders(platformToken),
      body: JSON.stringify({ commentsEnabled: true, moderationAction: 'MASK' }),
    });
    const policyJson: any = await policyResp.json().catch(() => null);
    if (!policyResp.ok) {
      throw new Error(`policy update failed: ${policyResp.status} ${JSON.stringify(policyJson)}`);
    }

    const video = await ensurePublishedVideo();
    const child = await prisma.user.findUnique({ where: { username: 'child_001' }, select: { id: true } });
    if (!child) throw new Error('child_001 not found');

    const pending1 = await createPendingComment(video.id, child.id, `smoke_pending_1_${Date.now()}`);
    const pending2 = await createPendingComment(video.id, child.id, `smoke_pending_2_${Date.now()}`);
    cleanupIds.push(pending1.id, pending2.id);

    // 1) Admin queue list (college admin)
    const listResp = await fetch(`${baseUrl}/api/videos/comments/admin?page=1&pageSize=50`, {
      headers: authHeaders(collegeToken),
    });
    const listJson: any = await listResp.json().catch(() => null);
    if (!listResp.ok) {
      throw new Error(`comments/admin failed: ${listResp.status} ${JSON.stringify(listJson)}`);
    }
    const items: any[] = listJson?.data?.items ?? [];
    const found1 = items.find((x) => x.id === pending1.id);
    const found2 = items.find((x) => x.id === pending2.id);
    if (!found1 || !found2) {
      throw new Error(`pending comments not in admin queue: ${JSON.stringify({ pending1: pending1.id, pending2: pending2.id, total: listJson?.data?.total })}`);
    }
    if (!found1.video?.title || !found1.video?.college?.name) {
      throw new Error(`admin queue item missing video/college info: ${JSON.stringify(found1.video)}`);
    }

    // 2) Dashboard pending count
    const dashResp = await fetch(`${baseUrl}/api/platform/dashboard`, {
      headers: authHeaders(collegeToken),
    });
    const dashJson: any = await dashResp.json().catch(() => null);
    if (!dashResp.ok) {
      throw new Error(`dashboard failed: ${dashResp.status} ${JSON.stringify(dashJson)}`);
    }
    const pendingReview = dashJson?.data?.comment?.pendingReview;
    if (typeof pendingReview !== 'number' || pendingReview < 2) {
      throw new Error(`expected dashboard comment.pendingReview >= 2, got ${pendingReview}`);
    }

    // 3) Reject without reason → 400
    const rejectNoReasonResp = await fetch(`${baseUrl}/api/videos/comments/${pending1.id}/audit`, {
      method: 'POST',
      headers: authHeaders(collegeToken),
      body: JSON.stringify({ pass: false }),
    });
    if (rejectNoReasonResp.status !== 400) {
      const body = await rejectNoReasonResp.json().catch(() => null);
      throw new Error(`expected reject-without-reason 400, got ${rejectNoReasonResp.status} ${JSON.stringify(body)}`);
    }

    // 4) Single audit pass
    const auditPassResp = await fetch(`${baseUrl}/api/videos/comments/${pending1.id}/audit`, {
      method: 'POST',
      headers: authHeaders(collegeToken),
      body: JSON.stringify({ pass: true }),
    });
    const auditPassJson: any = await auditPassResp.json().catch(() => null);
    if (!auditPassResp.ok) {
      throw new Error(`single audit pass failed: ${auditPassResp.status} ${JSON.stringify(auditPassJson)}`);
    }
    if (auditPassJson?.data?.status !== CommentStatus.APPROVED) {
      throw new Error(`expected APPROVED after pass, got ${auditPassJson?.data?.status}`);
    }

    // 5) Duplicate audit → 409
    const dupAuditResp = await fetch(`${baseUrl}/api/videos/comments/${pending1.id}/audit`, {
      method: 'POST',
      headers: authHeaders(collegeToken),
      body: JSON.stringify({ pass: true }),
    });
    if (dupAuditResp.status !== 409) {
      const body = await dupAuditResp.json().catch(() => null);
      throw new Error(`expected duplicate audit 409, got ${dupAuditResp.status} ${JSON.stringify(body)}`);
    }

    // 6) Public list shows approved comment
    const publicListResp = await fetch(`${baseUrl}/api/videos/${video.id}/comments?page=1&pageSize=50`);
    const publicListJson: any = await publicListResp.json().catch(() => null);
    if (!publicListResp.ok) {
      throw new Error(`public comments list failed: ${publicListResp.status} ${JSON.stringify(publicListJson)}`);
    }
    const publicItems: any[] = publicListJson?.data ?? [];
    if (!publicItems.some((x) => x.id === pending1.id)) {
      throw new Error(`approved comment not visible in public list`);
    }
    if (publicItems.some((x) => x.id === pending2.id)) {
      throw new Error(`pending comment should not appear in public list`);
    }

    // 7) Batch reject without reason → 400
    const batchRejectNoReasonResp = await fetch(`${baseUrl}/api/videos/comments/audit/batch`, {
      method: 'POST',
      headers: authHeaders(collegeToken),
      body: JSON.stringify({ ids: [pending2.id], pass: false }),
    });
    if (batchRejectNoReasonResp.status !== 400) {
      const body = await batchRejectNoReasonResp.json().catch(() => null);
      throw new Error(`expected batch reject-without-reason 400, got ${batchRejectNoReasonResp.status} ${JSON.stringify(body)}`);
    }

    // 8) Batch reject with reason
    const batchRejectResp = await fetch(`${baseUrl}/api/videos/comments/audit/batch`, {
      method: 'POST',
      headers: authHeaders(collegeToken),
      body: JSON.stringify({ ids: [pending2.id], pass: false, reason: 'smoke reject' }),
    });
    const batchRejectJson: any = await batchRejectResp.json().catch(() => null);
    if (!batchRejectResp.ok) {
      throw new Error(`batch reject failed: ${batchRejectResp.status} ${JSON.stringify(batchRejectJson)}`);
    }
    const result2 = (batchRejectJson?.data?.results ?? []).find((r: any) => r.id === pending2.id);
    if (!result2?.ok || result2.status !== CommentStatus.REJECTED) {
      throw new Error(`batch reject result unexpected: ${JSON.stringify(batchRejectJson?.data)}`);
    }

    // 9) API create comment (child) — status depends on NLP availability
    const apiCommentResp = await fetch(`${baseUrl}/api/videos/${video.id}/comments`, {
      method: 'POST',
      headers: authHeaders(childToken),
      body: JSON.stringify({ content: `smoke_api_comment_${Date.now()}` }),
    });
    const apiCommentJson: any = await apiCommentResp.json().catch(() => null);
    if (apiCommentResp.status !== 201) {
      throw new Error(`child create comment failed: ${apiCommentResp.status} ${JSON.stringify(apiCommentJson)}`);
    }
    const apiCommentId = apiCommentJson?.data?.id;
    const apiCommentStatus = apiCommentJson?.data?.status;
    if (!apiCommentId) throw new Error('create comment missing id');
    cleanupIds.push(apiCommentId);

    if (apiCommentStatus === CommentStatus.PENDING) {
      const platformListResp = await fetch(
        `${baseUrl}/api/videos/comments/admin?search=smoke_api_comment&status=PENDING`,
        { headers: authHeaders(platformToken) }
      );
      const platformListJson: any = await platformListResp.json().catch(() => null);
      if (!platformListResp.ok) {
        throw new Error(`platform comments/admin failed: ${platformListResp.status} ${JSON.stringify(platformListJson)}`);
      }
      const platformItems: any[] = platformListJson?.data?.items ?? [];
      if (!platformItems.some((x) => x.id === apiCommentId)) {
        throw new Error(`API-created pending comment not found via platform admin search`);
      }

      const batchPassResp = await fetch(`${baseUrl}/api/videos/comments/audit/batch`, {
        method: 'POST',
        headers: authHeaders(platformToken),
        body: JSON.stringify({ ids: [apiCommentId], pass: true }),
      });
      const batchPassJson: any = await batchPassResp.json().catch(() => null);
      if (!batchPassResp.ok) {
        throw new Error(`batch pass failed: ${batchPassResp.status} ${JSON.stringify(batchPassJson)}`);
      }
      if (batchPassJson?.data?.summary?.succeeded !== 1) {
        throw new Error(`batch pass summary unexpected: ${JSON.stringify(batchPassJson?.data?.summary)}`);
      }
    } else if (apiCommentStatus === CommentStatus.APPROVED) {
      // NLP unavailable → auto-approved; verify public visibility instead
      const publicAfterApiResp = await fetch(`${baseUrl}/api/videos/${video.id}/comments?page=1&pageSize=50`);
      const publicAfterApiJson: any = await publicAfterApiResp.json().catch(() => null);
      const publicAfterApiItems: any[] = publicAfterApiJson?.data ?? [];
      if (!publicAfterApiItems.some((x) => x.id === apiCommentId)) {
        throw new Error(`auto-approved API comment not visible in public list`);
      }
    } else {
      throw new Error(`unexpected API comment status: ${apiCommentStatus}`);
    }

    console.log('✅ comment audit smoke success');
    console.log(
      JSON.stringify(
        {
          videoId: video.id,
          pending1: pending1.id,
          pending2: pending2.id,
          apiCommentId,
          apiCommentStatus,
          dashboardPendingReview: pendingReview,
          adminQueueTotal: listJson?.data?.total,
        },
        null,
        2
      )
    );
  } finally {
    if (cleanupIds.length > 0) {
      await prisma.videoComment.deleteMany({ where: { id: { in: cleanupIds } } }).catch(() => null);
    }
    await prisma.$disconnect().catch(() => null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main().catch((e) => {
  console.error('❌ comment audit smoke failed');
  console.error(e);
  process.exitCode = 1;
});
