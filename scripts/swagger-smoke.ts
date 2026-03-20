/*
 * Smoke test: validate that OpenAPI document includes key paths and schemas.
 * This is intentionally lightweight and does NOT require DB/Redis connectivity.
 */

import assert from 'assert';
import path from 'path';

function ensureEnv() {
	process.env.NODE_ENV ||= 'test';
	process.env.DATABASE_URL ||= 'postgresql://user:pass@localhost:5432/etgy?schema=public';
	process.env.JWT_SECRET ||= '0123456789abcdef0123456789abcdef';
	process.env.SWAGGER_ENABLED ||= 'true';
}

function requireAllRoutes() {
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

function main() {
	ensureEnv();
	requireAllRoutes();

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { getOpenApiDocument } = require(path.resolve(__dirname, '../src/docs/openapi'));
	const doc = getOpenApiDocument({ serverUrl: '/' });

	assert(doc.openapi, 'OpenAPI version missing');
	assert(doc.paths, 'OpenAPI paths missing');
	assert(doc.components?.schemas, 'OpenAPI schemas missing');

	// Key paths we touched
	assert(doc.paths['/api/videos/admin'], 'Missing path: /api/videos/admin');
	assert(doc.paths['/api/videos/mine'], 'Missing path: /api/videos/mine');

	// Key schemas we added
	assert(doc.components.schemas.AdminVideoPagedResult, 'Missing schema: AdminVideoPagedResult');
	assert(doc.components.schemas.VideoMediaUrls, 'Missing schema: VideoMediaUrls');

	// Ensure "ALL" appears in the doc for volunteer status filter
	const docJson = JSON.stringify(doc);
	assert(docJson.includes('"ALL"'), 'Expected literal "ALL" in OpenAPI doc');

	// eslint-disable-next-line no-console
	console.log('✅ Swagger smoke passed');
}

main();
