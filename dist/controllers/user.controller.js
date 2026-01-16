"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const user_service_1 = require("../services/user.service");
// import { UserRole, VolunteerStatus } from '@prisma/client';
const enums_1 = require("../types/enums");
class UserController {
    /**
     * GET /api/users/me
     */
    static async getMe(req, res) {
        try {
            const userId = req.user.userId;
            const user = await user_service_1.UserService.getUserProfile(userId);
            res.json({ code: 200, message: 'Success', data: user });
        }
        catch (error) {
            res.status(500).json({ code: 500, message: error.message });
        }
    }
    /**
     * POST /api/users/children (Platform Admin Only)
     */
    static async createChild(req, res) {
        try {
            const data = req.body;
            const child = await user_service_1.UserService.createChild(data);
            res.json({ code: 201, message: 'Child created', data: child });
        }
        catch (error) {
            res.status(400).json({ code: 400, message: error.message });
        }
    }
    /**
     * GET /api/users/volunteers
     */
    static async listVolunteers(req, res) {
        try {
            // If College Admin, force collegeId filter
            const user = req.user;
            let collegeId;
            if (user.role === enums_1.UserRole.COLLEGE_ADMIN) {
                const profile = await user_service_1.UserService.getUserProfile(user.userId);
                collegeId = profile?.adminProfile?.collegeId || undefined;
            }
            // If Platform Admin, optional query param
            else if (user.role === enums_1.UserRole.PLATFORM_ADMIN) {
                collegeId = req.query.collegeId ? Number(req.query.collegeId) : undefined;
            }
            else {
                return res.status(403).json({ code: 403, message: 'Forbidden' });
            }
            const status = req.query.status; // Cast to enum
            const list = await user_service_1.UserService.listVolunteers(collegeId, status);
            res.json({ code: 200, message: 'Success', data: list });
        }
        catch (error) {
            res.status(500).json({ code: 500, message: error.message });
        }
    }
    /**
     * PATCH /api/users/volunteers/:id/status
     */
    static async updateVolunteerStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const result = await user_service_1.UserService.updateVolunteerStatus(Number(id), status);
            res.json({ code: 200, message: 'Status updated', data: result });
        }
        catch (error) {
            res.status(400).json({ code: 400, message: error.message });
        }
    }
}
exports.UserController = UserController;
