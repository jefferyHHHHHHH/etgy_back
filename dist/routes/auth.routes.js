"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const router = (0, express_1.Router)();
// POST /api/auth/login
router.post('/login', auth_controller_1.AuthController.login);
// POST /api/auth/register (Dev helper)
router.post('/register', auth_controller_1.AuthController.register);
exports.default = router;
