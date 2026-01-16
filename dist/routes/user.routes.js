"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const enums_1 = require("../types/enums");
const router = (0, express_1.Router)();
// Public Routes (None for now)
// Protected Routes
router.use(auth_middleware_1.authMiddleware);
router.get('/me', user_controller_1.UserController.getMe);
// Admin Routes
router.post('/children', (0, auth_middleware_1.requireRole)([enums_1.UserRole.PLATFORM_ADMIN, enums_1.UserRole.COLLEGE_ADMIN]), user_controller_1.UserController.createChild);
router.get('/volunteers', (0, auth_middleware_1.requireRole)([enums_1.UserRole.PLATFORM_ADMIN, enums_1.UserRole.COLLEGE_ADMIN]), user_controller_1.UserController.listVolunteers);
router.patch('/volunteers/:id/status', (0, auth_middleware_1.requireRole)([enums_1.UserRole.PLATFORM_ADMIN, enums_1.UserRole.COLLEGE_ADMIN]), user_controller_1.UserController.updateVolunteerStatus);
exports.default = router;
