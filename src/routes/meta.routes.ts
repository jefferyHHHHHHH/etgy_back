import { Router } from 'express';
import { MetaController } from '../controllers/meta.controller';
import { apiResponse, ErrorResponseSchema, registerPath } from '../docs/openapi';
import { DictionariesSchema } from '../docs/dictionaries';

const router = Router();

// OpenAPI registration
registerPath({
	method: 'get',
	path: '/api/meta/dictionaries',
	summary: '获取字典/枚举（前端下拉选项）',
	tags: ['Meta'],
	responses: {
		200: {
			description: 'Success',
			content: { 'application/json': { schema: apiResponse(DictionariesSchema) } },
		},
		500: { description: 'Server Error', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

router.get('/dictionaries', MetaController.getDictionaries);

export default router;
