import { z } from 'zod';
import {
	extendZodWithOpenApi,
	OpenAPIRegistry,
	OpenApiGeneratorV3,
	type RouteConfig,
} from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const openApiRegistry = new OpenAPIRegistry();

openApiRegistry.registerComponent('securitySchemes', 'bearerAuth', {
	type: 'http',
	scheme: 'bearer',
	bearerFormat: 'JWT',
});

export const BaseResponseSchema = z
	.object({
		code: z.number().int(),
		message: z.string(),
	})
	.openapi('BaseResponse');

export const ErrorResponseSchema = BaseResponseSchema.openapi('ErrorResponse');

export const apiResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
	BaseResponseSchema.extend({
		data: dataSchema,
	});

export const registerPath = (config: RouteConfig) => {
	openApiRegistry.registerPath(config);
};

export const getOpenApiDocument = () => {
	const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);

	return generator.generateDocument({
		openapi: '3.0.3',
		info: {
			title: 'ETGY Backend API',
			version: '1.0.0',
			description:
				'API documentation generated from Zod schemas (auto sync with validation).',
		},
		servers: [{ url: '/' }],
	});
};
