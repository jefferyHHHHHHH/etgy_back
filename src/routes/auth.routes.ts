import { Router } from 'express';
import { z } from 'zod';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validate.middleware';
import { UserRole } from '../types/enums';

const router = Router();

const loginBodySchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
	role: z.nativeEnum(UserRole).optional(),
});

const registerBodySchema = z.object({
	username: z.string().min(3),
	password: z.string().min(6),
	role: z.nativeEnum(UserRole),
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
