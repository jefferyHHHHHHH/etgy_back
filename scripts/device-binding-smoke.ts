/*
Smoke test for child app device binding flow.

Coverage:
- Platform admin login
- Create a child
- Child password login with deviceId returns bindRequired + bindToken (first time)
- POST /api/auth/device/bind/confirm binds and returns JWT
- Child login from same device succeeds
- Child login from different device is blocked
- Platform admin resets device binding
- Child can bind a new device again

Usage:
- Requires DB schema applied (UserDeviceBinding table) + seed data containing platform_admin.
- Run: node -e "require('ts-node').register({ files: true }); require('./scripts/device-binding-smoke.ts');"
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
		console.log('Device binding smoke starting...');
		console.log('Base URL:', baseUrl);

		// 1) Login as seeded platform admin
		const adminLogin = await http(baseUrl, 'POST', '/api/auth/login', {
			username: 'platform_admin',
			password: 'Passw0rd!',
		});
		assert(adminLogin.status === 200, `admin login expected 200, got ${adminLogin.status}: ${JSON.stringify(adminLogin.json)}`);
		const adminToken = adminLogin.json?.data?.token;
		assert(adminToken, `admin login missing token: ${JSON.stringify(adminLogin.json)}`);

		// 2) Create a child
		const childUsername = rand('child_device_smoke');
		const childPassword = `Passw0rd!_${Math.floor(Math.random() * 1000)}`;
		const created = await http(
			baseUrl,
			'POST',
			'/api/users/children',
			{
				username: childUsername,
				password: childPassword,
				realName: '冒烟测试儿童',
				school: '冒烟测试小学',
				grade: '3',
				gender: 'UNKNOWN',
			},
			adminToken
		);
		assert(created.status === 201, `create child expected 201, got ${created.status}: ${JSON.stringify(created.json)}`);
		const childId = Number(created.json?.data?.id);
		assert(childId > 0, `create child missing id: ${JSON.stringify(created.json)}`);

		const deviceA = 'device_smoke_A';
		const deviceB = 'device_smoke_B';

		// 3) First child login should require binding
		const login1 = await http(baseUrl, 'POST', '/api/auth/login', {
			username: childUsername,
			password: childPassword,
			deviceId: deviceA,
			deviceInfo: { platform: 'smoke', model: 'smoke', osVersion: '0', appVersion: '0' },
		});
		assert(login1.status === 200, `child login1 expected 200, got ${login1.status}: ${JSON.stringify(login1.json)}`);
		assert(login1.json?.data?.bindRequired === true, `expected bindRequired=true, got: ${JSON.stringify(login1.json)}`);
		const bindToken1 = login1.json?.data?.bindToken;
		assert(bindToken1, `missing bindToken: ${JSON.stringify(login1.json)}`);

		// 4) Confirm binding
		const confirm1 = await http(baseUrl, 'POST', '/api/auth/device/bind/confirm', {
			bindToken: bindToken1,
			deviceInfo: { platform: 'smoke', model: 'smoke', osVersion: '0', appVersion: '0' },
		});
		assert(confirm1.status === 200, `confirm1 expected 200, got ${confirm1.status}: ${JSON.stringify(confirm1.json)}`);
		const childToken1 = confirm1.json?.data?.token;
		assert(childToken1, `confirm1 missing token: ${JSON.stringify(confirm1.json)}`);

		// 5) Same-device login should succeed with token
		const login2 = await http(baseUrl, 'POST', '/api/auth/login', {
			username: childUsername,
			password: childPassword,
			deviceId: deviceA,
		});
		assert(login2.status === 200, `child login2 expected 200, got ${login2.status}: ${JSON.stringify(login2.json)}`);
		assert(!!login2.json?.data?.token, `expected token on same device login: ${JSON.stringify(login2.json)}`);

		// 6) Different-device login should be blocked
		const login3 = await http(baseUrl, 'POST', '/api/auth/login', {
			username: childUsername,
			password: childPassword,
			deviceId: deviceB,
		});
		assert(login3.status === 403, `child login3 expected 403, got ${login3.status}: ${JSON.stringify(login3.json)}`);

		// 7) Admin resets binding
		const reset = await http(baseUrl, 'POST', `/api/users/children/${childId}/reset-device-binding`, undefined, adminToken);
		assert(reset.status === 200, `reset expected 200, got ${reset.status}: ${JSON.stringify(reset.json)}`);
		assert(reset.json?.data?.reset === true, `reset response unexpected: ${JSON.stringify(reset.json)}`);

		// 8) After reset, new device should require binding again
		const login4 = await http(baseUrl, 'POST', '/api/auth/login', {
			username: childUsername,
			password: childPassword,
			deviceId: deviceB,
		});
		assert(login4.status === 200, `child login4 expected 200, got ${login4.status}: ${JSON.stringify(login4.json)}`);
		assert(login4.json?.data?.bindRequired === true, `expected bindRequired=true after reset, got: ${JSON.stringify(login4.json)}`);
		const bindToken2 = login4.json?.data?.bindToken;
		assert(bindToken2, `missing bindToken2: ${JSON.stringify(login4.json)}`);

		const confirm2 = await http(baseUrl, 'POST', '/api/auth/device/bind/confirm', { bindToken: bindToken2 });
		assert(confirm2.status === 200, `confirm2 expected 200, got ${confirm2.status}: ${JSON.stringify(confirm2.json)}`);
		assert(!!confirm2.json?.data?.token, `confirm2 missing token: ${JSON.stringify(confirm2.json)}`);

		console.log('✅ Device binding smoke PASSED');
	} finally {
		server.close();
	}
}

main().catch((e) => {
	console.error('❌ Device binding smoke FAILED');
	console.error(e);
	process.exit(1);
});
