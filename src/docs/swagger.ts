import type { Express, NextFunction, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env';
import { getOpenApiDocument } from './openapi';

export const registerSwagger = (app: Express) => {
	if (!env.SWAGGER_ENABLED) {
		return;
	}

	app.get('/api/docs.json', (req: Request, res: Response) => {
		res.setHeader('Content-Type', 'application/json');
		// Avoid stale Swagger UI caused by aggressive caching (esp. during local dev).
		res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
		res.setHeader('Pragma', 'no-cache');
		res.setHeader('Expires', '0');
		res.status(200).send(getOpenApiDocument());
	});

	app.use(
		'/api/docs',
		(req: Request, res: Response, next: NextFunction) => {
			// Swagger UI assets are static and often cached with ETag.
			// During local/LAN testing, cached responses may keep old security headers.
			res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
			res.setHeader('Pragma', 'no-cache');
			res.setHeader('Expires', '0');
			next();
		},
		swaggerUi.serve,
		swaggerUi.setup(undefined, {
			swaggerOptions: {
				url: '/api/docs.json',
				displayRequestDuration: true,
			},
		})
	);
};
