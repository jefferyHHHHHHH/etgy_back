/*
Smoke test for AI Tutor MVP.

Coverage:
- Register + login a CHILD user, send high-risk message (should not call LLM) => creates AiConversation/AiMessage/AiRiskAlert
- Fetch conversations + conversation detail
- Verify CHILD cannot list risk alerts
- Register + login a PLATFORM_ADMIN user, list risk alerts, handle the created alert
- Verify daily limit (default 5/day) enforced via Redis when available

Usage:
- Start server: npm run dev
- Run: node -e "require('ts-node').register({ files: true }); require('./scripts/ai-tutor-smoke.ts');"
*/

type Json = any;

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

async function http(method: string, path: string, body?: any, token?: string) {
  const resp = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

async function waitForReady(timeoutMs: number = 15_000) {
  const start = Date.now();
  let lastErr: any;
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await http('GET', '/health');
      if (r.status === 200) return;
      lastErr = r;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server not ready within ${timeoutMs}ms. Last error: ${JSON.stringify(lastErr)}`);
}

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function randUser(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function registerAndLogin(username: string, password: string, role: 'CHILD' | 'PLATFORM_ADMIN') {
  const reg = await http('POST', '/api/auth/register', { username, password, role });
  assert(
    reg.json?.code === 201,
    `register expected code=201, got http=${reg.status}: ${JSON.stringify(reg.json)}`
  );

  const login = await http('POST', '/api/auth/login', { username, password, role });
  assert(login.status === 200, `login expected 200, got ${login.status}: ${JSON.stringify(login.json)}`);

  const token = login.json?.data?.token;
  assert(token, 'login response missing token');
  return token as string;
}

async function main() {
  console.log('AI Tutor smoke starting...');
  console.log('Base URL:', baseUrl);

  await waitForReady();
  console.log('Server ready');

  // 1) Create users
  const childUsername = randUser('child');
  const adminUsername = randUser('padmin');
  const password = 'Passw0rd!';

  const childToken = await registerAndLogin(childUsername, password, 'CHILD');
  const adminToken = await registerAndLogin(adminUsername, password, 'PLATFORM_ADMIN');

  console.log('Created users:', { childUsername, adminUsername });

  // 2) High-risk chat (should create risk alert, no Spark needed)
  const chat1 = await http(
    'POST',
    '/api/ai/tutor/chat',
    { mode: 'emotion', message: '我不想活了，我想自杀' },
    childToken
  );
  assert(chat1.status === 200, `chat expected 200, got ${chat1.status}: ${JSON.stringify(chat1.json)}`);

  const convoId = chat1.json?.data?.conversationId;
  const risk = chat1.json?.data?.risk;
  assert(convoId && Number(convoId) > 0, 'chat response missing conversationId');
  assert(risk?.triggered === true, 'expected risk.triggered=true');
  assert(risk?.alertId && Number(risk.alertId) > 0, 'expected risk.alertId');

  console.log('High-risk chat OK:', { conversationId: convoId, alertId: risk.alertId });

  // 3) Conversation list & detail
  const list = await http('GET', '/api/ai/tutor/conversations?page=1&pageSize=10', undefined, childToken);
  assert(list.status === 200, `list conversations expected 200, got ${list.status}`);
  const items = list.json?.data?.items ?? [];
  assert(Array.isArray(items), 'conversations.items should be array');
  assert(items.some((x: any) => x.id === convoId), 'conversation should appear in list');

  const detail = await http('GET', `/api/ai/tutor/conversations/${convoId}`, undefined, childToken);
  assert(detail.status === 200, `get conversation expected 200, got ${detail.status}`);
  const messages = detail.json?.data?.messages ?? [];
  assert(Array.isArray(messages) && messages.length >= 2, 'conversation should have >=2 messages');

  console.log('Conversation history OK:', { messages: messages.length });

  // 4) Permission check: child cannot access risk alerts
  const forbidden = await http('GET', '/api/ai/risk-alerts?page=1&pageSize=10', undefined, childToken);
  assert(forbidden.status === 403, `child risk-alerts expected 403, got ${forbidden.status}`);

  console.log('Permission gate OK (child blocked)');

  // 5) Admin can list risk alerts and handle
  const alerts = await http('GET', '/api/ai/risk-alerts?status=OPEN&page=1&pageSize=20', undefined, adminToken);
  assert(alerts.status === 200, `admin list risk-alerts expected 200, got ${alerts.status}`);
  const alertItems = alerts.json?.data?.items ?? [];
  assert(Array.isArray(alertItems), 'risk alerts items should be array');
  const found = alertItems.find((a: any) => a.id === risk.alertId);
  assert(found, 'created alert should appear in admin list');

  const handled = await http('PATCH', `/api/ai/risk-alerts/${risk.alertId}/handle`, { note: 'smoke handled' }, adminToken);
  assert(handled.status === 200, `handle alert expected 200, got ${handled.status}`);
  assert(handled.json?.data?.status === 'HANDLED', 'expected status=HANDLED');

  console.log('Admin handle OK');

  // 6) Daily limit enforcement (default 5/day). We already used 1.
  let tooManyHit = false;
  for (let i = 0; i < 6; i++) {
    const r = await http('POST', '/api/ai/tutor/chat', { mode: 'emotion', message: '我不想活了' }, childToken);
    if (r.status === 429) {
      tooManyHit = true;
      break;
    }
    assert(r.status === 200, `expected 200 or 429, got ${r.status}`);
  }
  assert(tooManyHit, 'expected to hit daily limit 429 at some point');

  console.log('Daily limit OK (429 observed)');

  console.log('AI Tutor smoke PASSED');
}

main().catch((e) => {
  console.error('AI Tutor smoke FAILED');
  console.error(e);
  process.exit(1);
});
