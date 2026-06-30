import app from '../src/app';

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
  return { status: resp.status, text };
}

async function main() {
  const target = process.argv[2] || 'http://localhost:3000';
  const liveId = process.argv[3] || '2';

  console.log('Target:', target, 'liveId:', liveId);

  const login = await http(target, 'POST', '/api/auth/login', {
    username: process.env.DEBUG_USER || 'volunteer_001',
    password: process.env.DEBUG_PASS || 'Passw0rd!',
    role: 'VOLUNTEER',
  });
  console.log('login', login.status, login.text.slice(0, 200));

  let token = '';
  try {
    token = JSON.parse(login.text)?.data?.token;
  } catch {
    // try embedded server below
  }

  if (!token) {
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const embeddedLogin = await http(baseUrl, 'POST', '/api/auth/login', {
      username: 'volunteer_001',
      password: 'Passw0rd!',
      role: 'VOLUNTEER',
    });
    token = JSON.parse(embeddedLogin.text)?.data?.token;
    const res = await http(baseUrl, 'GET', `/api/live/${liveId}`, undefined, token);
    console.log('embedded GET', res.status, res.text);
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    return;
  }

  const res = await http(target, 'GET', `/api/live/${liveId}`, undefined, token);
  console.log('GET /api/live/' + liveId, res.status);
  console.log(res.text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
