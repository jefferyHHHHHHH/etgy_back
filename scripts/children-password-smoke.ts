/*
Smoke test for child password reveal/change flow.

Coverage:
- Platform admin login
- Default children list returns password as '****' (and should not leak passwordHash)
- GET /api/children/:id/password returns real password (or auto-regenerated for legacy rows)
- POST /api/children/:id/password updates password
- GET again returns updated password

Usage:
- Requires DB schema applied (User.passwordEnc column) + seed data containing platform_admin.
- Run: node -e "require('ts-node').register({ files: true }); require('./scripts/children-password-smoke.ts');"
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

async function main() {
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('Child password smoke starting...');
    console.log('Base URL:', baseUrl);

    // 0) Unauth should be blocked
    {
      const r = await http(baseUrl, 'GET', '/api/children/1/password');
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

    // 2) List children (should show password as ****)
    let childId: number | null = null;
    let originalPassword: string | null = null;

    const list1 = await http(baseUrl, 'GET', '/api/users/children?page=1&pageSize=1', undefined, token);
    assert(list1.status === 200, `list children expected 200, got ${list1.status}: ${JSON.stringify(list1.json)}`);

    const items1 = list1.json?.data?.items ?? [];
    assert(Array.isArray(items1), `list children items should be array: ${JSON.stringify(list1.json)}`);

    if (items1.length > 0) {
      const c = items1[0];
      childId = Number(c?.id);
      assert(childId > 0, `expected child id, got: ${JSON.stringify(c)}`);

      assert(c?.password === '****', `expected list child password=****, got: ${JSON.stringify(c?.password)}`);
      assert(!('passwordHash' in c), `list child should not include passwordHash: keys=${Object.keys(c)}`);
    } else {
      // 2.1) Create a child so the rest of the smoke can run
      originalPassword = `Passw0rd!_${Math.floor(Math.random() * 1000)}`;
      const username = rand('child_smoke');

      const created = await http(baseUrl, 'POST', '/api/users/children', {
        username,
        password: originalPassword,
        realName: '冒烟测试儿童',
        school: '冒烟测试小学',
        grade: '3',
        gender: 'UNKNOWN',
      }, token);

      assert(created.status === 201, `create child expected 201, got ${created.status}: ${JSON.stringify(created.json)}`);
      childId = Number(created.json?.data?.id);
      assert(childId > 0, `create child missing id: ${JSON.stringify(created.json)}`);

      // re-list to validate masking behavior
      const list2 = await http(baseUrl, 'GET', '/api/users/children?page=1&pageSize=1', undefined, token);
      assert(list2.status === 200, `list children expected 200, got ${list2.status}: ${JSON.stringify(list2.json)}`);
      const c2 = (list2.json?.data?.items ?? [])[0];
      assert(c2?.password === '****', `expected list child password=****, got: ${JSON.stringify(c2?.password)}`);
      assert(!('passwordHash' in c2), `list child should not include passwordHash: keys=${Object.keys(c2 ?? {})}`);
    }

    assert(childId, 'childId not resolved');

    // 3) Reveal password
    const reveal1 = await http(baseUrl, 'GET', `/api/children/${childId}/password`, undefined, token);
    assert(reveal1.status === 200, `reveal password expected 200, got ${reveal1.status}: ${JSON.stringify(reveal1.json)}`);

    const revealed = reveal1.json?.data?.password;
    assert(typeof revealed === 'string' && revealed.length > 0, `expected revealed password string, got: ${JSON.stringify(reveal1.json)}`);

    if (originalPassword) {
      assert(revealed === originalPassword, `expected revealed==original for newly created user. revealed=${revealed}`);
    }

    console.log('Reveal OK:', { childId, regenerated: reveal1.json?.data?.regenerated === true });

    // 4) Change password
    const newPassword = `NewPassw0rd!_${Math.floor(Math.random() * 1000)}`;
    const change = await http(baseUrl, 'POST', `/api/children/${childId}/password`, { newPassword }, token);
    assert(change.status === 200, `change password expected 200, got ${change.status}: ${JSON.stringify(change.json)}`);

    // 5) Reveal again should equal new password
    const reveal2 = await http(baseUrl, 'GET', `/api/children/${childId}/password`, undefined, token);
    assert(reveal2.status === 200, `reveal2 expected 200, got ${reveal2.status}: ${JSON.stringify(reveal2.json)}`);
    assert(reveal2.json?.data?.password === newPassword, `expected revealed password == newPassword, got: ${JSON.stringify(reveal2.json)}`);

    // 6) Restore original (best-effort)
    const restoreTo = revealed;
    const restore = await http(baseUrl, 'POST', `/api/children/${childId}/password`, { newPassword: restoreTo }, token);
    assert(restore.status === 200, `restore expected 200, got ${restore.status}: ${JSON.stringify(restore.json)}`);

    const reveal3 = await http(baseUrl, 'GET', `/api/children/${childId}/password`, undefined, token);
    assert(reveal3.status === 200, `reveal3 expected 200, got ${reveal3.status}: ${JSON.stringify(reveal3.json)}`);
    assert(reveal3.json?.data?.password === restoreTo, `expected restored password, got: ${JSON.stringify(reveal3.json)}`);

    console.log('✅ Child password smoke PASSED');
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error('❌ Child password smoke FAILED');
  console.error(e);
  process.exit(1);
});
