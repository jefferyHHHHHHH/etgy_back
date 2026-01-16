"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
// POST /api/auth/login
router.post('/login', auth_controller_1.AuthController.login);
// POST /api/auth/register (Dev helper)
router.post('/register', auth_controller_1.AuthController.register);
// POST /api/auth/logout
router.post('/logout', auth_middleware_1.authMiddleware, auth_controller_1.AuthController.logout);
exports.default = router;
