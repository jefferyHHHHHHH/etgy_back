import { Router } from 'express';
import { z } from 'zod';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { UserRole } from '../types/enums';
import { apiResponse, BaseResponseSchema, ErrorResponseSchema, registerPath } from '../docs/openapi';

const router = Router();

const loginBodySchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
	role: z.nativeEnum(UserRole).optional().describe('登录角色（可选；不传则由后端按账号类型判定/默认）'),
});

const registerBodySchema = z.object({
	username: z.string().min(3),
	password: z.string().min(6),
	role: z.nativeEnum(UserRole).describe('注册角色（开发辅助）'),
});

// OpenAPI registration
registerPath({
	method: 'post',
	path: '/api/auth/login',
	summary: '登录',
	tags: ['Auth'],
	request: {
		body: {
			content: {
				'application/json': {
					schema: loginBodySchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: 'Login success',
			content: { 'application/json': { schema: apiResponse(z.object({ token: z.string(), user: z.any() })) } },
		},
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/auth/register',
	summary: '注册（开发辅助）',
	tags: ['Auth'],
	request: {
		body: {
			content: {
				'application/json': {
					schema: registerBodySchema,
				},
			},
		},
	},
	responses: {
		201: {
			description: 'Register success',
			content: { 'application/json': { schema: apiResponse(z.any()) } },
		},
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/auth/logout',
	summary: '退出登录',
	tags: ['Auth'],
	security: [{ bearerAuth: [] }],
	responses: {
		200: { description: 'Logout success', content: { 'application/json': { schema: BaseResponseSchema } } },
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

// Beginner-friendly messages (browser address bar uses GET)
router.get('/login', (req, res) => {
	res.status(405).json({
		code: 405,
		message: 'Method Not Allowed: use POST /api/auth/login with JSON body {"username","password"}',
	});
});

router.get('/register', (req, res) => {
	res.status(405).json({
		code: 405,
		message: 'Method Not Allowed: use POST /api/auth/register with JSON body {"username","password","role"}',
	});
});

router.get('/logout', (req, res) => {
	res.status(405).json({
		code: 405,
		message: 'Method Not Allowed: use POST /api/auth/logout with header Authorization: Bearer <token>',
	});
});

// POST /api/auth/login
router.post('/login', validateBody(loginBodySchema), AuthController.login);

// POST /api/auth/register (Dev helper)
router.post('/register', validateBody(registerBodySchema), AuthController.register);

// POST /api/auth/logout
router.post('/logout', authMiddleware, AuthController.logout);

export default router;
