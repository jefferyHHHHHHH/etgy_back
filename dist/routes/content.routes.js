"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const content_controller_1 = require("../controllers/content.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const enums_1 = require("../types/enums");
const router = (0, express_1.Router)();
// Protected Routes (All require login)
router.use(auth_middleware_1.authMiddleware);
// Volunteer/Child operations
// GET /api/videos - List public videos
router.get('/', content_controller_1.ContentController.listVideos);
// Volunteer operations
// POST /api/videos - Upload
router.post('/', (0, auth_middleware_1.requireRole)([enums_1.UserRole.VOLUNTEER]), content_controller_1.ContentController.createVideo);
// POST /api/videos/:id/submit - Submit for review
router.post('/:id/submit', (0, auth_middleware_1.requireRole)([enums_1.UserRole.VOLUNTEER]), content_controller_1.ContentController.submitReview);
// Admin operations
// POST /api/videos/:id/audit
router.post('/:id/audit', (0, auth_middleware_1.requireRole)([enums_1.UserRole.PLATFORM_ADMIN, enums_1.UserRole.COLLEGE_ADMIN]), content_controller_1.ContentController.auditVideo);
exports.default = router;
