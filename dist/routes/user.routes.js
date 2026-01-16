"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const user_controller_1 = require("../controllers/user.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const enums_1 = require("../types/enums");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const enums_2 = require("../types/enums");
const router = (0, express_1.Router)();
const idParamSchema = zod_1.z.object({
    id: zod_1.z.string().regex(/^\d+$/, 'id must be a positive integer'),
});
const listVolunteersQuerySchema = zod_1.z.object({
    collegeId: zod_1.z.coerce.number().int().positive().optional(),
    status: zod_1.z.nativeEnum(enums_2.VolunteerStatus).optional(),
});
// Public Routes (None for now)
// Protected Routes
router.use(auth_middleware_1.authMiddleware);
router.get('/me', user_controller_1.UserController.getMe);
// Admin Routes
router.post('/children', (0, auth_middleware_1.requireRole)([enums_1.UserRole.PLATFORM_ADMIN, enums_1.UserRole.COLLEGE_ADMIN]), user_controller_1.UserController.createChild);
router.get('/volunteers', (0, auth_middleware_1.requireRole)([enums_1.UserRole.PLATFORM_ADMIN, enums_1.UserRole.COLLEGE_ADMIN]), (0, validate_middleware_1.validateQuery)(listVolunteersQuerySchema), user_controller_1.UserController.listVolunteers);
router.patch('/volunteers/:id/status', (0, auth_middleware_1.requireRole)([enums_1.UserRole.PLATFORM_ADMIN, enums_1.UserRole.COLLEGE_ADMIN]), (0, validate_middleware_1.validateParams)(idParamSchema), user_controller_1.UserController.updateVolunteerStatus);
exports.default = router;
