/*
Live + Agora RTC token smoke test.

Coverage:
- Volunteer creates live draft -> submit -> college admin audit pass
- Volunteer publish -> start
- Volunteer gets publisher Agora RTC token
- Child gets subscriber Agora RTC token
- Public list tabs (upcoming/living/ended)
- Child sends live chat message during LIVING
- Volunteer finish live

Usage:
  npm run smoke:live

Requires:
- DB schema applied + seed users (volunteer_001, college_admin, child_001 / Passw0rd!)
- Optional: AGORA_APP_ID + AGORA_APP_CERTIFICATE for token payload checks
*/

import app from '../src/app';

type Json = any;

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function http(baseUrl: string, method: string, path: string, body?: any, token?: string) {
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

  return { status: resp.status, ok: resp.ok, json };
}

async function login(baseUrl: string, username: string, password: string, role?: string) {
  const res = await http(baseUrl, 'POST', '/api/auth/login', { username, password, role });
  assert(res.status === 200, `${username} login expected 200, got ${res.status}: ${JSON.stringify(res.json)}`);
  const token = res.json?.data?.token;
  assert(token, `${username} login missing token`);
  return token as string;
}

async function main() {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;
  const agoraConfigured = Boolean(
    (process.env.AGORA_APP_ID ?? '').trim() && (process.env.AGORA_APP_CERTIFICATE ?? '').trim()
  );

  try {
    console.log('Live smoke starting...');
    console.log('Base URL:', baseUrl);
    console.log('Agora configured:', agoraConfigured);

    const volunteerToken = await login(baseUrl, 'volunteer_001', 'Passw0rd!', 'VOLUNTEER');
    const adminToken = await login(baseUrl, 'college_admin', 'Passw0rd!', 'COLLEGE_ADMIN');
    const childToken = await login(baseUrl, 'child_001', 'Passw0rd!', 'CHILD');

    const now = Date.now();
    const create = await http(
      baseUrl,
      'POST',
      '/api/live',
      {
        title: `smoke_live_${now}`,
        intro: 'live smoke test',
        planStartTime: new Date(now + 60_000).toISOString(),
        planEndTime: new Date(now + 3_600_000).toISOString(),
      },
      volunteerToken
    );
    assert(create.status === 201 || create.status === 200, `create live failed: ${create.status} ${JSON.stringify(create.json)}`);
    const liveId = create.json?.data?.id;
    assert(liveId, 'create live missing id');

    const submit = await http(baseUrl, 'POST', `/api/live/${liveId}/submit`, undefined, volunteerToken);
    assert(submit.status === 200, `submit failed: ${submit.status}`);

    const adminReviewList = await http(baseUrl, 'GET', '/api/live/admin', undefined, adminToken);
    assert(adminReviewList.status === 200, `admin review list failed: ${adminReviewList.status}`);
    const pendingIds = (adminReviewList.json?.data?.items ?? []).map((i: any) => i.id);
    assert(pendingIds.includes(liveId), 'submitted live should appear in /api/live/admin for college admin');

    const publicList = await http(baseUrl, 'GET', '/api/live');
    assert(publicList.status === 200, `public live list failed: ${publicList.status}`);
    const publicIds = (publicList.json?.data?.items ?? []).map((i: any) => i.id);
    assert(!publicIds.includes(liveId), 'REVIEW live must not appear in public /api/live');

    const audit = await http(
      baseUrl,
      'POST',
      `/api/live/${liveId}/audit`,
      { pass: true, reason: 'smoke pass' },
      adminToken
    );
    assert(audit.status === 200, `audit failed: ${audit.status}`);

    const publish = await http(baseUrl, 'POST', `/api/live/${liveId}/publish`, undefined, volunteerToken);
    assert(publish.status === 200, `publish failed: ${publish.status}`);

    const upcoming = await http(baseUrl, 'GET', '/api/live?tab=upcoming');
    assert(upcoming.status === 200, `public upcoming failed: ${upcoming.status}`);
    const upcomingIds = (upcoming.json?.data?.items ?? []).map((i: any) => i.id);
    assert(upcomingIds.includes(liveId), 'published live should appear in upcoming tab');

    const start = await http(baseUrl, 'POST', `/api/live/${liveId}/start`, undefined, volunteerToken);
    assert(start.status === 200, `start failed: ${start.status}`);
    assert(start.json?.data?.status === 'LIVING', 'start should set LIVING');

    const living = await http(baseUrl, 'GET', '/api/live?tab=living');
    assert(living.status === 200, `public living failed: ${living.status}`);
    const livingIds = (living.json?.data?.items ?? []).map((i: any) => i.id);
    assert(livingIds.includes(liveId), 'living live should appear in living tab');

    const mine = await http(baseUrl, 'GET', '/api/live/mine', undefined, volunteerToken);
    assert(mine.status === 200, `mine failed: ${mine.status}`);
    const mineIds = (mine.json?.data?.items ?? []).map((i: any) => i.id);
    assert(mineIds.includes(liveId), 'volunteer mine should include created live');

    if (agoraConfigured) {
      const pubToken = await http(baseUrl, 'POST', `/api/live/${liveId}/agora/rtc-token`, undefined, volunteerToken);
      assert(pubToken.status === 200, `volunteer rtc-token failed: ${pubToken.status} ${JSON.stringify(pubToken.json)}`);
      assert(pubToken.json?.data?.role === 'publisher', 'volunteer should be publisher');
      assert(pubToken.json?.data?.channelName === `etgy_live_${liveId}`, 'channelName mismatch');
      assert(typeof pubToken.json?.data?.token === 'string' && pubToken.json.data.token.length > 0, 'missing token');

      const subToken = await http(baseUrl, 'POST', `/api/live/${liveId}/agora/rtc-token`, undefined, childToken);
      assert(subToken.status === 200, `child rtc-token failed: ${subToken.status} ${JSON.stringify(subToken.json)}`);
      assert(subToken.json?.data?.role === 'subscriber', 'child should be subscriber');
      assert(subToken.json?.data?.uid, 'child token missing uid');
    } else {
      const noAgora = await http(baseUrl, 'POST', `/api/live/${liveId}/agora/rtc-token`, undefined, volunteerToken);
      assert(noAgora.status === 400, `expected 400 when Agora not configured, got ${noAgora.status}`);
      console.warn('Skipped Agora token payload checks (AGORA_APP_ID / AGORA_APP_CERTIFICATE not set)');
    }

    const chat = await http(
      baseUrl,
      'POST',
      `/api/live/${liveId}/messages`,
      { content: 'smoke hello' },
      childToken
    );
    assert(chat.status === 201, `child chat failed: ${chat.status} ${JSON.stringify(chat.json)}`);

    const messages = await http(baseUrl, 'GET', `/api/live/${liveId}/messages`, undefined, childToken);
    assert(messages.status === 200, `list messages failed: ${messages.status}`);
    assert((messages.json?.data ?? []).length >= 1, 'messages should not be empty');

    const finish = await http(baseUrl, 'POST', `/api/live/${liveId}/finish`, {}, volunteerToken);
    assert(finish.status === 200, `finish failed: ${finish.status}`);
    assert(finish.json?.data?.status === 'FINISHED', 'finish should set FINISHED');

    const ended = await http(baseUrl, 'GET', '/api/live?tab=ended');
    assert(ended.status === 200, `public ended failed: ${ended.status}`);
    const endedIds = (ended.json?.data?.items ?? []).map((i: any) => i.id);
    assert(endedIds.includes(liveId), 'finished live should appear in ended tab');

    console.log('✅ Live smoke passed');
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

main().catch((err) => {
  console.error('❌ Live smoke failed:', err);
  process.exit(1);
});
