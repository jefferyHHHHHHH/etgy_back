import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env';
import { getOpenApiDocument } from './openapi';

export const registerSwagger = (app: Express) => {
	if (!env.SWAGGER_ENABLED) {
		return;
	}

	app.get('/api/docs.json', (req: Request, res: Response) => {
		res.setHeader('Content-Type', 'application/json');
		res.status(200).send(getOpenApiDocument());
	});

	app.use(
		'/api/docs',
		swaggerUi.serve,
		swaggerUi.setup(undefined, {
			swaggerOptions: {
				url: '/api/docs.json',
				displayRequestDuration: true,
			},
		})
	);
};
