import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

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
router.post('/login', AuthController.login);

// POST /api/auth/register (Dev helper)
router.post('/register', AuthController.register);

// POST /api/auth/logout
router.post('/logout', authMiddleware, AuthController.logout);

export default router;
