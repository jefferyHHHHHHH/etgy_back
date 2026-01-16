import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

// POST /api/auth/login
router.post('/login', AuthController.login);

// POST /api/auth/register (Dev helper)
router.post('/register', AuthController.register);

export default router;
