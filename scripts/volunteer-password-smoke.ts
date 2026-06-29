/*
Smoke test for volunteer password reveal/change flow (admin only).

Coverage:
- Unauth blocked
- Platform admin login
- Create a volunteer if none
- GET /api/users/volunteers/:id/password reveals password
- POST /api/users/volunteers/:id/password updates password
- GET again returns updated password

Usage:
- Requires DB schema applied (User.passwordEnc column) + seed data containing platform_admin.
- Run: node -e "require('ts-node').register({ files: true }); require('./scripts/volunteer-password-smoke.ts');"
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
    body: body ? JSON.stringify(body) : undefined,
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

function rand(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function ensureCollege(baseUrl: string, token: string) {
  const list = await http(baseUrl, 'GET', '/api/platform/colleges', undefined, token);
  assert(list.status === 200, `list colleges expected 200, got ${list.status}: ${JSON.stringify(list.json)}`);

  const items = list.json?.data ?? [];
  assert(Array.isArray(items), `colleges should be array: ${JSON.stringify(list.json)}`);

  if (items.length > 0) return Number(items[0].id);

  const created = await http(baseUrl, 'POST', '/api/platform/colleges', { name: rand('冒烟学院') }, token);
  assert(created.status === 201, `create college expected 201, got ${created.status}: ${JSON.stringify(created.json)}`);
  const collegeId = Number(created.json?.data?.id);
  assert(collegeId > 0, `created college missing id: ${JSON.stringify(created.json)}`);
  return collegeId;
}

async function main() {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('Volunteer password smoke starting...');
    console.log('Base URL:', baseUrl);

    // 0) Unauth should be blocked
    {
      const r = await http(baseUrl, 'GET', '/api/users/volunteers/1/password');
      assert(r.status === 401, `expected unauth 401, got ${r.status}: ${JSON.stringify(r.json)}`);
    }

    // 1) Login as seeded platform admin
    const login = await http(baseUrl, 'POST', '/api/auth/login', {
      username: 'platform_admin',
      password: 'Passw0rd!',
    });
    assert(login.status === 200, `login expected 200, got ${login.status}: ${JSON.stringify(login.json)}`);

    const token = login.json?.data?.token;
    assert(token, `login response missing token: ${JSON.stringify(login.json)}`);

    // Ensure login response does not leak encrypted payloads
    const loginUser = login.json?.data?.user;
    assert(loginUser && typeof loginUser === 'object', `login missing user object: ${JSON.stringify(login.json)}`);
    assert(!('passwordHash' in loginUser), `login user should not include passwordHash: keys=${Object.keys(loginUser)}`);
    assert(!('passwordEnc' in loginUser), `login user should not include passwordEnc: keys=${Object.keys(loginUser)}`);

    const collegeId = await ensureCollege(baseUrl, token);

    // 2) List volunteers and pick one
    let volunteerUserId: number | null = null;
    let volunteerUsername: string | null = null;
    let originalPassword: string | null = null;

    const list1 = await http(baseUrl, 'GET', '/api/users/volunteers?page=1&pageSize=1', undefined, token);
    assert(list1.status === 200, `list volunteers expected 200, got ${list1.status}: ${JSON.stringify(list1.json)}`);

    const items1 = list1.json?.data ?? [];
    assert(Array.isArray(items1), `list volunteers data should be array: ${JSON.stringify(list1.json)}`);

    if (items1.length > 0) {
      const v = items1[0];
      volunteerUserId = Number(v?.userId ?? v?.user?.id);
      volunteerUsername = String(v?.user?.username ?? '');
      assert(volunteerUserId > 0, `expected volunteer user id, got: ${JSON.stringify(v)}`);
      assert(volunteerUsername, `expected volunteer username, got: ${JSON.stringify(v)}`);
    } else {
      originalPassword = `Passw0rd!_${Math.floor(Math.random() * 1000)}`;
      const username = rand('volunteer_smoke');

      const created = await http(
        baseUrl,
        'POST',
        '/api/users/volunteers/accounts',
        {
          username,
          password: originalPassword,
          realName: '冒烟测试志愿者',
          studentId: String(Date.now()),
          collegeId,
          gender: 'UNKNOWN',
        },
        token
      );

      assert(created.status === 201, `create volunteer expected 201, got ${created.status}: ${JSON.stringify(created.json)}`);
      volunteerUserId = Number(created.json?.data?.id);
      volunteerUsername = String(created.json?.data?.username ?? username);
      assert(volunteerUserId > 0, `create volunteer missing id: ${JSON.stringify(created.json)}`);

      // Ensure create response does not leak encrypted payloads
      const createdData = created.json?.data;
      assert(createdData?.password === '****', `expected created volunteer password=****, got: ${JSON.stringify(createdData?.password)}`);
      assert(!('passwordHash' in createdData), `create volunteer should not include passwordHash: keys=${Object.keys(createdData ?? {})}`);
      assert(!('passwordEnc' in createdData), `create volunteer should not include passwordEnc: keys=${Object.keys(createdData ?? {})}`);
    }

    assert(volunteerUserId, 'volunteerUserId not resolved');

    // 3) Reveal password
    const reveal1 = await http(baseUrl, 'GET', `/api/users/volunteers/${volunteerUserId}/password`, undefined, token);
    assert(reveal1.status === 200, `reveal password expected 200, got ${reveal1.status}: ${JSON.stringify(reveal1.json)}`);

    const revealed = reveal1.json?.data?.password;
    assert(typeof revealed === 'string' && revealed.length > 0, `expected revealed password string, got: ${JSON.stringify(reveal1.json)}`);
    assert(!String(revealed).startsWith('v1:'), `expected revealed password to be plain (not v1:*), got: ${revealed}`);

    if (originalPassword) {
      assert(revealed === originalPassword, `expected revealed==original for newly created user. revealed=${revealed}`);
    }

    console.log('Reveal OK:', { volunteerUserId });

    // 4) Change password
    const newPassword = `NewPassw0rd!_${Math.floor(Math.random() * 1000)}`;
    const change = await http(
      baseUrl,
      'POST',
      `/api/users/volunteers/${volunteerUserId}/password`,
      { newPassword },
      token
    );
    assert(change.status === 200, `change password expected 200, got ${change.status}: ${JSON.stringify(change.json)}`);

    // 5) Reveal again should equal new password
    const reveal2 = await http(baseUrl, 'GET', `/api/users/volunteers/${volunteerUserId}/password`, undefined, token);
    assert(reveal2.status === 200, `reveal2 expected 200, got ${reveal2.status}: ${JSON.stringify(reveal2.json)}`);
    assert(reveal2.json?.data?.password === newPassword, `expected revealed password == newPassword, got: ${JSON.stringify(reveal2.json)}`);

    // 5b) Volunteer self-service password change should keep admin reveal in sync
    const selfChangedPassword = `SelfPassw0rd!_${Math.floor(Math.random() * 1000)}`;
    const volunteerLogin = await http(baseUrl, 'POST', '/api/auth/login', {
      username: volunteerUsername,
      password: newPassword,
    });
    assert(volunteerLogin.status === 200, `volunteer login expected 200, got ${volunteerLogin.status}: ${JSON.stringify(volunteerLogin.json)}`);

    const volunteerToken = volunteerLogin.json?.data?.token;
    assert(volunteerToken, `volunteer login missing token: ${JSON.stringify(volunteerLogin.json)}`);

    const selfChange = await http(
      baseUrl,
      'PATCH',
      '/api/users/me/password',
      { oldPassword: newPassword, newPassword: selfChangedPassword },
      volunteerToken
    );
    assert(selfChange.status === 200, `self change password expected 200, got ${selfChange.status}: ${JSON.stringify(selfChange.json)}`);

    const revealSelf = await http(baseUrl, 'GET', `/api/users/volunteers/${volunteerUserId}/password`, undefined, token);
    assert(revealSelf.status === 200, `reveal after self-change expected 200, got ${revealSelf.status}: ${JSON.stringify(revealSelf.json)}`);
    assert(
      revealSelf.json?.data?.password === selfChangedPassword,
      `expected revealed password == selfChangedPassword, got: ${JSON.stringify(revealSelf.json)}`
    );

    // 6) Restore original (best-effort)
    const restoreTo = revealed;
    const restore = await http(
      baseUrl,
      'POST',
      `/api/users/volunteers/${volunteerUserId}/password`,
      { newPassword: restoreTo },
      token
    );
    assert(restore.status === 200, `restore expected 200, got ${restore.status}: ${JSON.stringify(restore.json)}`);

    const reveal3 = await http(baseUrl, 'GET', `/api/users/volunteers/${volunteerUserId}/password`, undefined, token);
    assert(reveal3.status === 200, `reveal3 expected 200, got ${reveal3.status}: ${JSON.stringify(reveal3.json)}`);
    assert(reveal3.json?.data?.password === restoreTo, `expected restored password, got: ${JSON.stringify(reveal3.json)}`);

    console.log('✅ Volunteer password smoke PASSED');
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error('❌ Volunteer password smoke FAILED');
  console.error(e);
  process.exit(1);
});
