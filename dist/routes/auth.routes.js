"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const enums_1 = require("../types/enums");
const router = (0, express_1.Router)();
const loginBodySchema = zod_1.z.object({
    username: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
    role: zod_1.z.nativeEnum(enums_1.UserRole).optional(),
});
const registerBodySchema = zod_1.z.object({
    username: zod_1.z.string().min(3),
    password: zod_1.z.string().min(6),
    role: zod_1.z.nativeEnum(enums_1.UserRole),
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
router.post('/login', (0, validate_middleware_1.validateBody)(loginBodySchema), auth_controller_1.AuthController.login);
// POST /api/auth/register (Dev helper)
router.post('/register', (0, validate_middleware_1.validateBody)(registerBodySchema), auth_controller_1.AuthController.register);
// POST /api/auth/logout
router.post('/logout', auth_middleware_1.authMiddleware, auth_controller_1.AuthController.logout);
exports.default = router;
