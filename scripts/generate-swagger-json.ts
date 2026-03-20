/*
 * Generate swagger.json (OpenAPI v3) from the in-code Zod route registry.
 *
 * NOTE:
 * - Some route modules import env-configured services (Prisma/OSS/etc).
 * - env.ts validates required vars on import (DATABASE_URL, JWT_SECRET).
 * - To keep this generator runnable in CI/local without a full .env,
 *   we set safe dummy defaults BEFORE requiring the app modules.
 */

import fs from 'fs';
import path from 'path';

function ensureEnv() {
	process.env.NODE_ENV ||= 'test';
	process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/etgy?schema=public';
	process.env.JWT_SECRET ||= '0123456789abcdef0123456789abcdef';
	// Keep swagger generation independent from runtime config.
	process.env.SWAGGER_ENABLED ||= 'true';
}

function requireAllRoutes() {
	// Import route modules to execute registerPath() side-effects.
	require(path.resolve(__dirname, '../src/routes/auth.routes'));
	require(path.resolve(__dirname, '../src/routes/user.routes'));
	require(path.resolve(__dirname, '../src/routes/children.routes'));
	require(path.resolve(__dirname, '../src/routes/content.routes'));
	require(path.resolve(__dirname, '../src/routes/live.routes'));
	require(path.resolve(__dirname, '../src/routes/meta.routes'));
	require(path.resolve(__dirname, '../src/routes/oss.routes'));
	require(path.resolve(__dirname, '../src/routes/platform.routes'));
	require(path.resolve(__dirname, '../src/routes/ai.routes'));
}

async function main() {
	ensureEnv();
	requireAllRoutes();

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { getOpenApiDocument } = require(path.resolve(__dirname, '../src/docs/openapi'));

	const doc = getOpenApiDocument({ serverUrl: '/' });

	const outPath = path.resolve(__dirname, '../swagger.json');
	fs.writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
	// eslint-disable-next-line no-console
	console.log(`✅ swagger.json generated: ${outPath}`);
}

main().catch((err) => {
	// eslint-disable-next-line no-console
	console.error('❌ Failed to generate swagger.json:', err);
	process.exit(1);
});
