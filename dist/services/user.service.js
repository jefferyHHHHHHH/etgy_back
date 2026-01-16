"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const server_1 = require("../server");
class UserService {
    /**
     * Get full user profile including role-specific details
     */
    static async getUserProfile(userId) {
        const user = await server_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                childProfile: true,
                volunteerProfile: {
                    include: { college: true }
                },
                adminProfile: {
                    include: { college: true }
                }
            }
        });
        if (!user)
            throw new Error('User not found');
        return user;
    }
    /**
     * Create Child Account (Admin Only)
     */
    static async createChild(data) {
        // TODO: Hash password
        const user = await server_1.prisma.user.create({
            data: {
                username: data.username,
                passwordHash: 'default_password',
                role: 'CHILD',
                status: 'ACTIVE',
                childProfile: {
                    create: {
                        realName: data.realName,
                        school: data.school,
                        grade: data.grade,
                        gender: data.gender,
                    }
                }
            },
            include: { childProfile: true }
        });
        return user;
    }
    /**
     * Create/Update Volunteer Profile (Application)
     */
    static async createVolunteerProfile(userId, data) {
        const college = await server_1.prisma.college.findUnique({ where: { id: data.collegeId } });
        if (!college)
            throw new Error('Invalid College ID');
        // Upsert or Create? Requirement assumes one per user.
        const profile = await server_1.prisma.volunteerProfile.create({
            data: {
                userId,
                realName: data.realName,
                studentId: data.studentId,
                collegeId: data.collegeId,
                phone: data.phone,
                status: 'IN_SCHOOL'
            }
        });
        return profile;
    }
    /**
     * List Volunteers (Admin)
     */
    static async listVolunteers(collegeId, status) {
        const where = {};
        if (collegeId)
            where.collegeId = collegeId;
        if (status)
            where.status = status;
        return await server_1.prisma.volunteerProfile.findMany({
            where,
            include: {
                user: { select: { username: true, id: true, status: true } },
                college: true
            }
        });
    }
    /**
     * Update Volunteer Status (Approve/Suspend)
     */
    static async updateVolunteerStatus(volunteerUserId, status) {
        return await server_1.prisma.volunteerProfile.update({
            where: { userId: volunteerUserId },
            data: { status }
        });
    }
}
exports.UserService = UserService;
