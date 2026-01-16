"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const content_controller_1 = require("../controllers/content.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const enums_1 = require("../types/enums");
const validate_middleware_1 = require("../middlewares/validate.middleware");
const enums_2 = require("../types/enums");
const router = (0, express_1.Router)();
const idParamSchema = zod_1.z.object({
    id: zod_1.z.string().regex(/^\d+$/, 'id must be a positive integer'),
});
const listVideosQuerySchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(enums_2.VideoStatus).optional(),
    collegeId: zod_1.z.coerce.number().int().positive().optional(),
    uploaderId: zod_1.z.coerce.number().int().positive().optional(),
    search: zod_1.z.string().optional(),
});
// Protected Routes (All require login)
router.use(auth_middleware_1.authMiddleware);
// Volunteer/Child operations
// GET /api/videos - List public videos
router.get('/', (0, validate_middleware_1.validateQuery)(listVideosQuerySchema), content_controller_1.ContentController.listVideos);
// Volunteer operations
// POST /api/videos - Upload
router.post('/', (0, auth_middleware_1.requireRole)([enums_1.UserRole.VOLUNTEER]), content_controller_1.ContentController.createVideo);
// POST /api/videos/:id/submit - Submit for review
router.post('/:id/submit', (0, auth_middleware_1.requireRole)([enums_1.UserRole.VOLUNTEER]), (0, validate_middleware_1.validateParams)(idParamSchema), content_controller_1.ContentController.submitReview);
// Admin operations
// POST /api/videos/:id/audit
router.post('/:id/audit', (0, auth_middleware_1.requireRole)([enums_1.UserRole.PLATFORM_ADMIN, enums_1.UserRole.COLLEGE_ADMIN]), (0, validate_middleware_1.validateParams)(idParamSchema), content_controller_1.ContentController.auditVideo);
exports.default = router;
