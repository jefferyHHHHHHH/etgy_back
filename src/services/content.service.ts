import { prisma } from '../server';
import { VideoStatus, AuditAction, UserRole } from '../types/enums';
import { AuditService } from './audit.service';

export class ContentService {
  
  /**
   * Create Video (Draft)
   */
  static async createVideo(uploaderId: number, collegeId: number | undefined, data: {
    title: string;
    url: string;
    intro?: string;
    coverUrl?: string;
    duration?: number;
    gradeRange?: string;
    subjectTag?: string;
  }) {
    if (!collegeId) throw new Error('Uploader must belong to a college');

    const video = await prisma.video.create({
      data: {
        title: data.title,
        url: data.url,
        intro: data.intro,
        coverUrl: data.coverUrl,
        duration: data.duration,
        gradeRange: data.gradeRange,
        subjectTag: data.subjectTag,
        status: VideoStatus.DRAFT,
        uploaderId,
        collegeId
      }
    });

    await AuditService.log(uploaderId, AuditAction.CREATE, String(video.id), 'Video', `Created video ${data.title}`);
    return video;
  }

  /**
   * List Videos (Public / Filtered)
   */
  static async listVideos(filter: {
    status?: VideoStatus;
    collegeId?: number;
    uploaderId?: number;
    search?: string;
  }) {
    const where: any = {};
    if (filter.status) where.status = filter.status;
    if (filter.collegeId) where.collegeId = filter.collegeId;
    if (filter.uploaderId) where.uploaderId = filter.uploaderId;
    
    // Simple search
    if (filter.search) {
      where.title = { contains: filter.search };
    }

    return await prisma.video.findMany({
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
  static async submitReview(videoId: number, userId: number) {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new Error('Video not found');
    if (video.uploaderId !== userId) throw new Error('Not owner');

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.REVIEW }
    });
    return updated;
  }

  /**
   * Audit Video (Admin)
   */
  static async auditVideo(
    adminUserId: number, 
    videoId: number, 
    pass: boolean, 
    reason?: string
  ) {
    const newStatus = pass ? VideoStatus.PUBLISHED : VideoStatus.REJECTED;
    const items = await prisma.video.update({
      where: { id: videoId },
      data: { 
        status: newStatus,
        rejectReason: reason || null
      }
    });

    const action = pass ? AuditAction.REVIEW_PASS : AuditAction.REVIEW_REJECT;
    await AuditService.log(adminUserId, action, String(videoId), 'Video', reason);
    
    return items;
  }
}
