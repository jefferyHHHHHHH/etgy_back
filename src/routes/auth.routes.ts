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

const wechatMiniProgramLoginBodySchema = z.object({
	code: z.string().min(1).describe('小程序 wx.login 获取的 code（临时票据）'),
});

const wechatMiniProgramBindBodySchema = z.object({
	bindToken: z.string().min(1).describe('微信登录未绑定时返回的 bindToken（短期有效）'),
	username: z.string().min(1).describe('要绑定的系统账号（儿童）用户名'),
	password: z.string().min(1).describe('要绑定的系统账号密码'),
});

const wechatMiniProgramLoginResponseSchema = z.union([
	z.object({
		bindRequired: z.literal(true),
		bindToken: z.string(),
	}),
	z.object({
		bindRequired: z.literal(false),
		token: z.string(),
		user: z.any(),
	}),
]);

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

registerPath({
	method: 'post',
	path: '/api/auth/wechat/mini-program/login',
	summary: '微信小程序登录（code 换 openid；已绑定则直接返回 JWT）',
	tags: ['Auth'],
	description:
		'小程序端调用 wx.login() 获取 code 后调用此接口。\n\n' +
		'- 若 openid 已绑定：返回 { bindRequired: false, token, user }\n' +
		'- 若 openid 未绑定：返回 { bindRequired: true, bindToken }（短期有效，用于后续绑定）\n\n' +
		'注意：需在后端配置 WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET 才会真实请求微信 jscode2session。',
	request: {
		body: {
			content: {
				'application/json': {
					schema: wechatMiniProgramLoginBodySchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: 'OK',
			content: { 'application/json': { schema: apiResponse(wechatMiniProgramLoginResponseSchema) } },
		},
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
		502: { description: 'Bad Gateway', content: { 'application/json': { schema: ErrorResponseSchema } } },
	},
});

registerPath({
	method: 'post',
	path: '/api/auth/wechat/mini-program/bind',
	summary: '微信小程序绑定（用 bindToken + 账号密码绑定到儿童账号）',
	tags: ['Auth'],
	description:
		'当 /login 返回 bindRequired=true 时，用 bindToken + 系统账号密码完成绑定。\n\n' +
		'当前版本为 MVP 规则：仅允许绑定到 CHILD（儿童）账号。绑定成功后会返回 JWT（等同一次登录）。',
	request: {
		body: {
			content: {
				'application/json': {
					schema: wechatMiniProgramBindBodySchema,
				},
			},
		},
	},
	responses: {
		200: {
			description: 'OK',
			content: { 'application/json': { schema: apiResponse(z.object({ token: z.string(), user: z.any() })) } },
		},
		400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
		401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
		403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
		409: { description: 'Conflict', content: { 'application/json': { schema: ErrorResponseSchema } } },
		502: { description: 'Bad Gateway', content: { 'application/json': { schema: ErrorResponseSchema } } },
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

// POST /api/auth/wechat/mini-program/login
router.post('/wechat/mini-program/login', validateBody(wechatMiniProgramLoginBodySchema), AuthController.wechatMiniProgramLogin);

// POST /api/auth/wechat/mini-program/bind
router.post('/wechat/mini-program/bind', validateBody(wechatMiniProgramBindBodySchema), AuthController.wechatMiniProgramBind);

export default router;
