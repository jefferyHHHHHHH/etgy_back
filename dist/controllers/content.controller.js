"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentController = void 0;
const content_service_1 = require("../services/content.service");
const user_service_1 = require("../services/user.service");
class ContentController {
    static async createVideo(req, res) {
        try {
            const user = req.user;
            // Fetch profile to get collegeId
            const profile = await user_service_1.UserService.getUserProfile(user.userId);
            const collegeId = profile?.volunteerProfile?.collegeId; // Assuming volunteer
            const video = await content_service_1.ContentService.createVideo(user.userId, collegeId, req.body);
            res.json({ code: 201, message: 'Video created', data: video });
        }
        catch (error) {
            res.status(400).json({ code: 400, message: error.message });
        }
    }
    static async listVideos(req, res) {
        try {
            const { status, collegeId, uploaderId, search } = req.query;
            const list = await content_service_1.ContentService.listVideos({
                status: status,
                collegeId: collegeId ? Number(collegeId) : undefined,
                uploaderId: uploaderId ? Number(uploaderId) : undefined,
                search: search
            });
            res.json({ code: 200, message: 'Success', data: list });
        }
        catch (error) {
            res.status(500).json({ code: 500, message: error.message });
        }
    }
    static async submitReview(req, res) {
        try {
            const { id } = req.params;
            const user = req.user;
            await content_service_1.ContentService.submitReview(Number(id), user.userId);
            res.json({ code: 200, message: 'Submitted for review' });
        }
        catch (error) {
            res.status(400).json({ code: 400, message: error.message });
        }
    }
    static async auditVideo(req, res) {
        try {
            const { id } = req.params;
            const { pass, reason } = req.body;
            const user = req.user;
            const result = await content_service_1.ContentService.auditVideo(user.userId, Number(id), pass, reason);
            res.json({ code: 200, message: 'Audit complete', data: result });
        }
        catch (error) {
            res.status(400).json({ code: 400, message: error.message });
        }
    }
}
exports.ContentController = ContentController;
