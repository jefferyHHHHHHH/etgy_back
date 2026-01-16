"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentService = void 0;
const prisma_1 = require("../config/prisma");
const enums_1 = require("../types/enums");
const audit_service_1 = require("./audit.service");
class ContentService {
    /**
     * Create Video (Draft)
     */
    static async createVideo(uploaderId, collegeId, data) {
        if (!collegeId)
            throw new Error('Uploader must belong to a college');
        const video = await prisma_1.prisma.video.create({
            data: {
                title: data.title,
                url: data.url,
                intro: data.intro,
                coverUrl: data.coverUrl,
                duration: data.duration,
                gradeRange: data.gradeRange,
                subjectTag: data.subjectTag,
                status: enums_1.VideoStatus.DRAFT,
                uploaderId,
                collegeId
            }
        });
        await audit_service_1.AuditService.log(uploaderId, enums_1.AuditAction.CREATE, String(video.id), 'Video', `Created video ${data.title}`);
        return video;
    }
    /**
     * List Videos (Public / Filtered)
     */
    static async listVideos(filter) {
        const where = {};
        if (filter.status)
            where.status = filter.status;
        if (filter.collegeId)
            where.collegeId = filter.collegeId;
        if (filter.uploaderId)
            where.uploaderId = filter.uploaderId;
        // Simple search
        if (filter.search) {
            where.title = { contains: filter.search };
        }
        return await prisma_1.prisma.video.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                uploader: { select: { realName: true } },
                metrics: true
            }
        });
    }
    /**
     * Submit for Review
     */
    static async submitReview(videoId, userId) {
        const video = await prisma_1.prisma.video.findUnique({ where: { id: videoId } });
        if (!video)
            throw new Error('Video not found');
        if (video.uploaderId !== userId)
            throw new Error('Not owner');
        const updated = await prisma_1.prisma.video.update({
            where: { id: videoId },
            data: { status: enums_1.VideoStatus.REVIEW }
        });
        return updated;
    }
    /**
     * Audit Video (Admin)
     */
    static async auditVideo(adminUserId, videoId, pass, reason) {
        const newStatus = pass ? enums_1.VideoStatus.PUBLISHED : enums_1.VideoStatus.REJECTED;
        const items = await prisma_1.prisma.video.update({
            where: { id: videoId },
            data: {
                status: newStatus,
                rejectReason: reason || null
            }
        });
        const action = pass ? enums_1.AuditAction.REVIEW_PASS : enums_1.AuditAction.REVIEW_REJECT;
        await audit_service_1.AuditService.log(adminUserId, action, String(videoId), 'Video', reason);
        return items;
    }
}
exports.ContentService = ContentService;
