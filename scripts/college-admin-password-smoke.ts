/*
Smoke test for college admin password reveal/change flow (platform admin only).

Coverage:
- Unauth blocked
- Platform admin login
- GET /api/platform/college-admins returns password as '****' and should not leak passwordHash
- GET /api/platform/college-admins/:id/password reveals real password
- POST /api/platform/college-admins/:id/password updates password
- GET again returns updated password

Usage:
- Requires DB schema applied (User.passwordEnc column) + seed data containing platform_admin.
- Run: node -e "require('ts-node').register({ files: true }); require('./scripts/college-admin-password-smoke.ts');"
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

  return { status: resp.status, ok: resp.ok, json, headers: resp.headers };
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
    console.log('College admin password smoke starting...');
    console.log('Base URL:', baseUrl);

    // 0) Unauth should be blocked
    {
      const r = await http(baseUrl, 'GET', '/api/platform/college-admins/1/password');
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

    const collegeId = await ensureCollege(baseUrl, token);

    // 2) List college admins (should show password as ****)
    let adminId: number | null = null;
    let originalPassword: string | null = null;

    const list1 = await http(baseUrl, 'GET', '/api/platform/college-admins', undefined, token);
    assert(list1.status === 200, `list college admins expected 200, got ${list1.status}: ${JSON.stringify(list1.json)}`);

    const items1 = list1.json?.data ?? [];
    assert(Array.isArray(items1), `list college admins data should be array: ${JSON.stringify(list1.json)}`);

    if (items1.length > 0) {
      const u = items1[0];
      adminId = Number(u?.id);
      assert(adminId > 0, `expected college admin id, got: ${JSON.stringify(u)}`);
      assert(u?.password === '****', `expected list college admin password=****, got: ${JSON.stringify(u?.password)}`);
      assert(!('passwordHash' in u), `list college admin should not include passwordHash: keys=${Object.keys(u)}`);
    } else {
      // 2.1) Create a college admin so the rest can run
      originalPassword = `Passw0rd!_${Math.floor(Math.random() * 1000)}`;
      const username = rand('college_admin_smoke');

      const created = await http(
        baseUrl,
        'POST',
        '/api/platform/college-admins',
        {
          username,
          password: originalPassword,
          realName: '冒烟测试学院管理员',
          collegeId,
        },
        token
      );

      assert(created.status === 201, `create college admin expected 201, got ${created.status}: ${JSON.stringify(created.json)}`);
      adminId = Number(created.json?.data?.id);
      assert(adminId > 0, `create college admin missing id: ${JSON.stringify(created.json)}`);

      const list2 = await http(baseUrl, 'GET', '/api/platform/college-admins', undefined, token);
      assert(list2.status === 200, `list2 expected 200, got ${list2.status}: ${JSON.stringify(list2.json)}`);
      const u2 = (list2.json?.data ?? [])[0];
      assert(u2?.password === '****', `expected list college admin password=****, got: ${JSON.stringify(u2?.password)}`);
      assert(!('passwordHash' in u2), `list college admin should not include passwordHash: keys=${Object.keys(u2 ?? {})}`);
    }

    assert(adminId, 'adminId not resolved');

    // 3) Reveal password
    const reveal1 = await http(baseUrl, 'GET', `/api/platform/college-admins/${adminId}/password`, undefined, token);
    assert(reveal1.status === 200, `reveal password expected 200, got ${reveal1.status}: ${JSON.stringify(reveal1.json)}`);

    const revealed = reveal1.json?.data?.password;
    assert(typeof revealed === 'string' && revealed.length > 0, `expected revealed password string, got: ${JSON.stringify(reveal1.json)}`);

    if (originalPassword) {
      assert(revealed === originalPassword, `expected revealed==original for newly created user. revealed=${revealed}`);
    }

    console.log('Reveal OK:', { adminId });

    // 4) Change password
    const newPassword = `NewPassw0rd!_${Math.floor(Math.random() * 1000)}`;
    const change = await http(
      baseUrl,
      'POST',
      `/api/platform/college-admins/${adminId}/password`,
      { newPassword },
      token
    );
    assert(change.status === 200, `change password expected 200, got ${change.status}: ${JSON.stringify(change.json)}`);

    // 5) Reveal again should equal new password
    const reveal2 = await http(baseUrl, 'GET', `/api/platform/college-admins/${adminId}/password`, undefined, token);
    assert(reveal2.status === 200, `reveal2 expected 200, got ${reveal2.status}: ${JSON.stringify(reveal2.json)}`);
    assert(reveal2.json?.data?.password === newPassword, `expected revealed password == newPassword, got: ${JSON.stringify(reveal2.json)}`);

    // 6) Restore original (best-effort)
    const restoreTo = revealed;
    const restore = await http(
      baseUrl,
      'POST',
      `/api/platform/college-admins/${adminId}/password`,
      { newPassword: restoreTo },
      token
    );
    assert(restore.status === 200, `restore expected 200, got ${restore.status}: ${JSON.stringify(restore.json)}`);

    const reveal3 = await http(baseUrl, 'GET', `/api/platform/college-admins/${adminId}/password`, undefined, token);
    assert(reveal3.status === 200, `reveal3 expected 200, got ${reveal3.status}: ${JSON.stringify(reveal3.json)}`);
    assert(reveal3.json?.data?.password === restoreTo, `expected restored password, got: ${JSON.stringify(reveal3.json)}`);

    console.log('✅ College admin password smoke PASSED');
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error('❌ College admin password smoke FAILED');
  console.error(e);
  process.exit(1);
});
