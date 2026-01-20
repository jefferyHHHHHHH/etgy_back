import { prisma } from '../config/prisma';
import { AuditAction, CommentStatus, UserRole, VideoStatus } from '../types/enums';
import { AuditService } from './audit.service';
import { HttpError } from '../utils/httpError';

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
	grade?: string;
	subject?: string;
	sort?: 'latest' | 'hot';
	page?: number;
	pageSize?: number;
    viewerRole?: UserRole;
    viewerUserId?: number;
    viewerCollegeId?: number;
  }) {
    const where: any = {};

	  const page = filter.page && Number.isFinite(filter.page) ? Math.max(1, filter.page) : 1;
	  const pageSize = filter.pageSize && Number.isFinite(filter.pageSize) ? Math.min(50, Math.max(1, filter.pageSize)) : 20;
	  const skip = (page - 1) * pageSize;

    // Guest/public viewer: only published videos are accessible.
    if (!filter.viewerRole) {
      where.status = VideoStatus.PUBLISHED;
      if (filter.status && filter.status !== VideoStatus.PUBLISHED) {
        throw new HttpError(401, 'Unauthorized: login required to access non-published videos');
      }

	  // Defense-in-depth: searching requires login.
	  if (filter.search && filter.search.trim().length > 0) {
	    throw new HttpError(401, 'Unauthorized: login required to search');
	  }
    }

    // Default visibility rules (PRD-aligned)
    // - Child: only published (global, not bound to college)
    // - Volunteer: only own videos
    // - College admin: only own college
    // - Platform admin: can filter freely
    if (filter.viewerRole === UserRole.CHILD) {
      // Children can browse ALL published content across colleges.
      where.status = VideoStatus.PUBLISHED;

      // Prevent bypass via query params
      if (filter.status && filter.status !== VideoStatus.PUBLISHED) {
        throw new HttpError(403, 'Forbidden: children can only access published videos');
      }
    }

    if (filter.viewerRole === UserRole.VOLUNTEER) {
      if (!filter.viewerUserId) throw new HttpError(401, 'Unauthorized');

      // Strong scope: volunteers can only access their own videos.
      where.uploaderId = filter.viewerUserId;
    }

    if (filter.viewerRole === UserRole.COLLEGE_ADMIN) {
      if (!filter.viewerCollegeId) throw new HttpError(400, 'Admin must belong to a college');

      // Strong scope: college admins can only access their own college.
      where.collegeId = filter.viewerCollegeId;
    }

    // Explicit filters override defaults when provided
    if (filter.viewerRole === UserRole.PLATFORM_ADMIN) {
      if (filter.status) where.status = filter.status;
      if (filter.collegeId) where.collegeId = filter.collegeId;
      if (filter.uploaderId) where.uploaderId = filter.uploaderId;
    } else {
      // Non-platform roles can still pass some safe filters (like status=PUBLISHED for children)
      if (filter.status && filter.viewerRole !== UserRole.CHILD) {
        where.status = filter.status;
      }
      // NOTE: collegeId/uploaderId are treated as scope constraints for non-platform roles.
    }
    
    // Simple search
    if (filter.search) {
    where.OR = [
      { title: { contains: filter.search } },
      { intro: { contains: filter.search } },
    ];
    }

  // Filters
  if (filter.grade) {
    // MVP: gradeRange stored as string like "1-3"; use contains as a pragmatic filter.
    where.gradeRange = { contains: filter.grade };
  }
  if (filter.subject) {
    where.subjectTag = { contains: filter.subject };
  }

  // Sorting
  const sort = filter.sort ?? 'latest';
  const orderBy =
    sort === 'hot'
      ? ([{ metrics: { playCount: 'desc' } }, { createdAt: 'desc' }] as any)
      : ({ createdAt: 'desc' } as any);

  const [total, items] = await Promise.all([
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
      uploader: { select: { realName: true } },
      metrics: true,
      },
    }),
  ]);

  return { items, total, page, pageSize };
  }

  /**
   * Get video detail with role-scoped authorization.
   */
  static async getVideoById(params: {
    videoId: number;
    viewerRole?: UserRole;
    viewerUserId?: number;
    viewerCollegeId?: number;
  }) {
    const { videoId, viewerRole, viewerUserId, viewerCollegeId } = params;

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { uploader: { select: { realName: true, collegeId: true } }, metrics: true, college: true },
    });

    if (!video) throw new HttpError(404, 'Video not found');

    // Guest or child: only published
    if (!viewerRole || viewerRole === UserRole.CHILD) {
      if (video.status !== VideoStatus.PUBLISHED) {
        throw new HttpError(404, 'Video not found');
      }
      return video;
    }

    // Platform admin: can view any status
    if (viewerRole === UserRole.PLATFORM_ADMIN) {
      return video;
    }

    // Volunteer: own videos + published videos
    if (viewerRole === UserRole.VOLUNTEER) {
      if (video.status === VideoStatus.PUBLISHED) return video;
      if (!viewerUserId) throw new HttpError(401, 'Unauthorized');
      if (video.uploaderId !== viewerUserId) throw new HttpError(404, 'Video not found');
      return video;
    }

    // College admin: own college + published videos
    if (viewerRole === UserRole.COLLEGE_ADMIN) {
      if (video.status === VideoStatus.PUBLISHED) return video;
      if (!viewerCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      if (video.collegeId !== viewerCollegeId) throw new HttpError(404, 'Video not found');
      return video;
    }

    throw new HttpError(403, 'Forbidden');
  }

  /**
   * Submit for Review
   */
  static async submitReview(videoId: number, userId: number) {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new HttpError(404, 'Video not found');
    if (video.uploaderId !== userId) throw new HttpError(403, 'Forbidden: not owner');

    const allowedStatuses: VideoStatus[] = [VideoStatus.DRAFT, VideoStatus.REJECTED];
    if (!allowedStatuses.includes(video.status)) {
      throw new HttpError(400, `Invalid status transition: ${video.status} -> REVIEW`);
    }

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: {
        status: VideoStatus.REVIEW,
        rejectReason: null,
        reviewedBy: null,
        reviewedAt: null,
      }
    });

    await AuditService.log(userId, AuditAction.UPDATE, String(videoId), 'Video', 'Submitted for review');
    return updated;
  }

  /**
   * Audit Video (Admin)
   */
  static async auditVideo(
    adminUserId: number,
    adminRole: UserRole,
    adminCollegeId: number | undefined,
    videoId: number,
    pass: boolean,
    reason?: string
  ) {
    // PRD: platform admin cannot participate in daily review.
    if (adminRole !== UserRole.COLLEGE_ADMIN) {
      throw new HttpError(403, 'Forbidden: only college admin can audit videos');
    }
    if (!adminCollegeId) {
      throw new HttpError(400, 'Admin must belong to a college');
    }
    if (!pass && (!reason || !reason.trim())) {
      throw new HttpError(400, 'Reject reason is required');
    }

    const newStatus = pass ? VideoStatus.APPROVED : VideoStatus.REJECTED;

    // Strong-consistency "抢先制": only first update on REVIEW wins
    const result = await prisma.video.updateMany({
      where: {
        id: videoId,
        status: VideoStatus.REVIEW,
        collegeId: adminCollegeId,
      },
      data: {
        status: newStatus,
        rejectReason: pass ? null : (reason || null),
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      const current = await prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, status: true, collegeId: true },
      });

      if (!current) throw new HttpError(404, 'Video not found');
      if (current.collegeId !== adminCollegeId) throw new HttpError(403, 'Forbidden: cross-college access');
      if (current.status !== VideoStatus.REVIEW) {
        throw new HttpError(409, `Conflict: video already audited (current status: ${current.status})`);
      }
      throw new HttpError(409, 'Conflict: audit not applied');
    }

    const action = pass ? AuditAction.REVIEW_PASS : AuditAction.REVIEW_REJECT;
    await AuditService.log(adminUserId, action, String(videoId), 'Video', reason);

    return await prisma.video.findUnique({
      where: { id: videoId },
      include: { uploader: { select: { realName: true } }, metrics: true },
    });
  }

  /**
   * Batch audit videos (College Admin only)
   * - Strong-consistency: first update on REVIEW wins per video
   * - Returns per-id result for admin UI
   */
  static async auditVideosBatch(params: {
    adminUserId: number;
    adminRole: UserRole;
    adminCollegeId: number | undefined;
    ids: number[];
    pass: boolean;
    reason?: string;
  }) {
    const { adminUserId, adminRole, adminCollegeId, ids, pass, reason } = params;

    if (adminRole !== UserRole.COLLEGE_ADMIN) {
      throw new HttpError(403, 'Forbidden: only college admin can audit videos');
    }
    if (!adminCollegeId) {
      throw new HttpError(400, 'Admin must belong to a college');
    }

    const uniqueIds = Array.from(new Set((ids ?? []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)));
    if (uniqueIds.length === 0) throw new HttpError(400, 'ids is required');
    if (!pass && (!reason || !reason.trim())) {
      throw new HttpError(400, 'Reject reason is required');
    }

    const newStatus = pass ? VideoStatus.APPROVED : VideoStatus.REJECTED;
    const results: Array<
      | { id: number; ok: true; status: VideoStatus }
      | { id: number; ok: false; status?: VideoStatus; message: string }
    > = [];

    for (const videoId of uniqueIds) {
      const update = await prisma.video.updateMany({
        where: {
          id: videoId,
          status: VideoStatus.REVIEW,
          collegeId: adminCollegeId,
        },
        data: {
          status: newStatus,
          rejectReason: pass ? null : (reason || null),
          reviewedBy: adminUserId,
          reviewedAt: new Date(),
        },
      });

      if (update.count === 1) {
        const action = pass ? AuditAction.REVIEW_PASS : AuditAction.REVIEW_REJECT;
        await AuditService.log(adminUserId, action, String(videoId), 'Video', reason);
        results.push({ id: videoId, ok: true, status: newStatus });
        continue;
      }

      const current = await prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, status: true, collegeId: true },
      });

      if (!current) {
        results.push({ id: videoId, ok: false, message: 'Video not found' });
        continue;
      }
      if (current.collegeId !== adminCollegeId) {
        results.push({ id: videoId, ok: false, status: current.status, message: 'Forbidden: cross-college access' });
        continue;
      }
      if (current.status !== VideoStatus.REVIEW) {
        results.push({
          id: videoId,
          ok: false,
          status: current.status,
          message: `Conflict: video already audited (current status: ${current.status})`,
        });
        continue;
      }
      results.push({ id: videoId, ok: false, status: current.status, message: 'Conflict: audit not applied' });
    }

    return {
      total: uniqueIds.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /**
   * Publish Video (Volunteer)
   * PRD: audit pass does NOT auto-publish.
   */
  static async publishVideo(volunteerUserId: number, videoId: number) {
    const result = await prisma.video.updateMany({
      where: {
        id: videoId,
        uploaderId: volunteerUserId,
        status: VideoStatus.APPROVED,
      },
      data: {
        status: VideoStatus.PUBLISHED,
        publishedBy: volunteerUserId,
        publishedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      const current = await prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, status: true, uploaderId: true },
      });
      if (!current) throw new HttpError(404, 'Video not found');
      if (current.uploaderId !== volunteerUserId) throw new HttpError(403, 'Forbidden: not owner');
      throw new HttpError(400, `Invalid status transition: ${current.status} -> PUBLISHED`);
    }

    await AuditService.log(volunteerUserId, AuditAction.PUBLISH, String(videoId), 'Video', 'Published');
    return await prisma.video.findUnique({
      where: { id: videoId },
      include: { uploader: { select: { realName: true } }, metrics: true },
    });
  }

  /**
   * Offline Video (Volunteer self-offline OR Admin force-offline)
   */
  static async offlineVideo(params: {
    operatorUserId: number;
    operatorRole: UserRole;
    operatorCollegeId?: number;
    videoId: number;
    reason?: string;
  }) {
    const { operatorUserId, operatorRole, operatorCollegeId, videoId, reason } = params;

    const adminRoles: UserRole[] = [UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN];
    if (adminRoles.includes(operatorRole)) {
      if (!reason || !reason.trim()) {
        throw new HttpError(400, 'Offline reason is required for admins');
      }
    }

    // Build scope filter
    const where: any = { id: videoId, status: VideoStatus.PUBLISHED };

    if (operatorRole === UserRole.VOLUNTEER) {
      where.uploaderId = operatorUserId;
    } else if (operatorRole === UserRole.COLLEGE_ADMIN) {
      if (!operatorCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      where.collegeId = operatorCollegeId;
    } else if (operatorRole === UserRole.PLATFORM_ADMIN) {
      // global scope
    } else {
      throw new HttpError(403, 'Forbidden');
    }

    const result = await prisma.video.updateMany({
      where,
      data: {
        status: VideoStatus.OFFLINE,
        offlineBy: operatorUserId,
        offlineAt: new Date(),
        offlineReason: reason ? reason.trim() : null,
      },
    });

    if (result.count !== 1) {
      const current = await prisma.video.findUnique({
        where: { id: videoId },
        select: { id: true, status: true, uploaderId: true, collegeId: true },
      });
      if (!current) throw new HttpError(404, 'Video not found');
      if (current.status !== VideoStatus.PUBLISHED) {
        throw new HttpError(409, `Conflict: only published videos can be offlined (current status: ${current.status})`);
      }
      throw new HttpError(403, 'Forbidden');
    }

    await AuditService.log(operatorUserId, AuditAction.OFFLINE, String(videoId), 'Video', reason);
    return await prisma.video.findUnique({
      where: { id: videoId },
      include: { uploader: { select: { realName: true } }, metrics: true },
    });
  }

  /**
   * Update video metadata (volunteer only, draft/rejected)
   */
  static async updateVideo(volunteerUserId: number, videoId: number, data: {
    title?: string;
    url?: string;
    intro?: string;
    coverUrl?: string;
    duration?: number;
    gradeRange?: string;
    subjectTag?: string;
  }) {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new HttpError(404, 'Video not found');
    if (video.uploaderId !== volunteerUserId) throw new HttpError(403, 'Forbidden: not owner');

    const allowed: VideoStatus[] = [VideoStatus.DRAFT, VideoStatus.REJECTED];
    if (!allowed.includes(video.status)) {
      throw new HttpError(400, `Invalid status: only DRAFT/REJECTED can be edited (current: ${video.status})`);
    }

    const update: any = {};
    if (typeof data.title === 'string') update.title = data.title;
    if (typeof data.url === 'string') update.url = data.url;
    if (typeof data.intro === 'string') update.intro = data.intro;
    if (typeof data.coverUrl === 'string') update.coverUrl = data.coverUrl;
    if (typeof data.duration === 'number') update.duration = data.duration;
    if (typeof data.gradeRange === 'string') update.gradeRange = data.gradeRange;
    if (typeof data.subjectTag === 'string') update.subjectTag = data.subjectTag;

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: update,
      include: { uploader: { select: { realName: true } }, metrics: true },
    });

    await AuditService.log(volunteerUserId, AuditAction.UPDATE, String(videoId), 'Video', 'Updated video metadata');
    return updated;
  }

  static async deleteVideo(volunteerUserId: number, videoId: number) {
    const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true, uploaderId: true, status: true, title: true } });
    if (!video) throw new HttpError(404, 'Video not found');
    if (video.uploaderId !== volunteerUserId) throw new HttpError(403, 'Forbidden: not owner');

    const allowed: VideoStatus[] = [VideoStatus.DRAFT, VideoStatus.REJECTED];
    if (!allowed.includes(video.status)) {
      throw new HttpError(400, `Only DRAFT/REJECTED videos can be deleted (current: ${video.status})`);
    }

    await prisma.video.delete({ where: { id: videoId } });
    await AuditService.log(volunteerUserId, AuditAction.DELETE, String(videoId), 'Video', `Deleted video ${video.title}`);
    return { id: videoId, deleted: true };
  }

  static async toggleLike(userId: number, videoId: number) {
    const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true, status: true } });
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new HttpError(404, 'Video not found');

    return prisma.$transaction(async (tx) => {
      const existing = await tx.videoLike.findUnique({ where: { videoId_userId: { videoId, userId } } });
      if (existing) {
        await tx.videoLike.delete({ where: { videoId_userId: { videoId, userId } } });
        await tx.videoMetrics.upsert({
          where: { videoId },
          update: { likeCount: { decrement: 1 } },
          create: { videoId, playCount: 0, likeCount: 0, favCount: 0 },
        });
        return { liked: false };
      }

      await tx.videoLike.create({ data: { videoId, userId } });
      await tx.videoMetrics.upsert({
        where: { videoId },
        update: { likeCount: { increment: 1 } },
        create: { videoId, playCount: 0, likeCount: 1, favCount: 0 },
      });
      return { liked: true };
    });
  }

  static async toggleFavorite(userId: number, videoId: number) {
    const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true, status: true } });
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new HttpError(404, 'Video not found');

    return prisma.$transaction(async (tx) => {
      const existing = await tx.videoFavorite.findUnique({ where: { videoId_userId: { videoId, userId } } });
      if (existing) {
        await tx.videoFavorite.delete({ where: { videoId_userId: { videoId, userId } } });
        await tx.videoMetrics.upsert({
          where: { videoId },
          update: { favCount: { decrement: 1 } },
          create: { videoId, playCount: 0, likeCount: 0, favCount: 0 },
        });
        return { favorited: false };
      }

      await tx.videoFavorite.create({ data: { videoId, userId } });
      await tx.videoMetrics.upsert({
        where: { videoId },
        update: { favCount: { increment: 1 } },
        create: { videoId, playCount: 0, likeCount: 0, favCount: 1 },
      });
      return { favorited: true };
    });
  }

  static async createVideoComment(userId: number, videoId: number, content: string) {
    const video = await prisma.video.findUnique({ where: { id: videoId }, select: { id: true, status: true } });
    if (!video || video.status !== VideoStatus.PUBLISHED) throw new HttpError(404, 'Video not found');

    const text = (content ?? '').trim();
    if (!text) throw new HttpError(400, 'content is required');

    const created = await prisma.videoComment.create({
      data: {
        videoId,
        authorId: userId,
        content: text,
        status: CommentStatus.PENDING,
      },
      include: { author: { select: { id: true, username: true, role: true, childProfile: true } } },
    });

    await AuditService.log(userId, AuditAction.CREATE, String(created.id), 'VideoComment', 'Created comment');
    return created;
  }

  static async listVideoComments(params: {
    videoId: number;
    viewerRole?: UserRole;
    viewerUserId?: number;
    viewerCollegeId?: number;
    page: number;
    pageSize: number;
  }) {
    const page = Math.max(params.page || 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 50);
    const skip = (page - 1) * pageSize;

    const video = await prisma.video.findUnique({
      where: { id: params.videoId },
      select: { id: true, status: true, uploaderId: true, collegeId: true },
    });
    if (!video) throw new HttpError(404, 'Video not found');

    // Public/child must only access published videos
    if (!params.viewerRole || params.viewerRole === UserRole.CHILD) {
      if (video.status !== VideoStatus.PUBLISHED) throw new HttpError(404, 'Video not found');
    }

    // Determine visibility of comment statuses
    let allowAllStatuses = false;
    if (params.viewerRole === UserRole.PLATFORM_ADMIN) {
      allowAllStatuses = true;
    } else if (params.viewerRole === UserRole.COLLEGE_ADMIN) {
      if (!params.viewerCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      allowAllStatuses = video.collegeId === params.viewerCollegeId;
    } else if (params.viewerRole === UserRole.VOLUNTEER) {
      allowAllStatuses = Boolean(params.viewerUserId) && video.uploaderId === params.viewerUserId;
    }

    const where: any = { videoId: params.videoId };
    if (!allowAllStatuses) {
      where.status = CommentStatus.APPROVED;
    }

    const [total, items] = await Promise.all([
      prisma.videoComment.count({ where }),
      prisma.videoComment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          author: { select: { id: true, username: true, role: true, childProfile: true } },
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  static async auditVideoComment(params: {
    adminUserId: number;
    adminRole: UserRole;
    adminCollegeId?: number;
    commentId: number;
    pass: boolean;
    reason?: string;
  }) {
    const { adminUserId, adminRole, adminCollegeId, commentId, pass, reason } = params;

    if (adminRole !== UserRole.COLLEGE_ADMIN && adminRole !== UserRole.PLATFORM_ADMIN) {
      throw new HttpError(403, 'Forbidden');
    }
    if (!pass && (!reason || !reason.trim())) throw new HttpError(400, 'Reject reason is required');

    const comment = await prisma.videoComment.findUnique({
      where: { id: commentId },
      include: { video: { select: { id: true, collegeId: true } } },
    });
    if (!comment) throw new HttpError(404, 'Comment not found');

    if (adminRole === UserRole.COLLEGE_ADMIN) {
      if (!adminCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      if (comment.video.collegeId !== adminCollegeId) throw new HttpError(403, 'Forbidden: cross-college access');
    }

    const newStatus = pass ? CommentStatus.APPROVED : CommentStatus.REJECTED;
    const updated = await prisma.videoComment.update({
      where: { id: commentId },
      data: {
        status: newStatus,
        rejectReason: pass ? null : (reason || null),
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
      },
      include: { author: { select: { id: true, username: true, role: true, childProfile: true } } },
    });

    const action = pass ? AuditAction.REVIEW_PASS : AuditAction.REVIEW_REJECT;
    await AuditService.log(adminUserId, action, String(commentId), 'VideoComment', reason);
    return updated;
  }

  static async upsertWatchLog(params: {
    videoId: number;
    userId: number;
    viewerRole: UserRole;
    viewerCollegeId?: number;
    lastPositionSec: number;
    watchedSecondsDelta: number;
    completed?: boolean;
  }) {
    // Ensure access (children only published; volunteers/admins follow existing getVideo rules)
    await this.getVideoById({
      videoId: params.videoId,
      viewerRole: params.viewerRole,
      viewerUserId: params.userId,
      viewerCollegeId: params.viewerCollegeId,
    });

    const lastPositionSec = Math.max(0, Math.floor(params.lastPositionSec || 0));
    const delta = Math.max(0, Math.floor(params.watchedSecondsDelta || 0));

    return prisma.$transaction(async (tx) => {
      const existing = await tx.videoWatchLog.findUnique({ where: { videoId_userId: { videoId: params.videoId, userId: params.userId } } });

      if (!existing) {
        const created = await tx.videoWatchLog.create({
          data: {
            videoId: params.videoId,
            userId: params.userId,
            lastPositionSec,
            watchedSeconds: delta,
            completed: Boolean(params.completed ?? false),
          },
        });

        await tx.videoMetrics.upsert({
          where: { videoId: params.videoId },
          update: { playCount: { increment: 1 } },
          create: { videoId: params.videoId, playCount: 1, likeCount: 0, favCount: 0 },
        });

        return created;
      }

      const updated = await tx.videoWatchLog.update({
        where: { videoId_userId: { videoId: params.videoId, userId: params.userId } },
        data: {
          lastPositionSec,
          watchedSeconds: { increment: delta },
          ...(typeof params.completed === 'boolean' ? { completed: params.completed || existing.completed } : {}),
        },
      });

      return updated;
    });
  }

  static async listMyWatchLogs(params: {
    userId: number;
    page: number;
    pageSize: number;
    videoId?: number;
    completed?: boolean;
  }) {
    const page = Math.max(params.page || 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {
      userId: params.userId,
      ...(typeof params.videoId === 'number' ? { videoId: params.videoId } : {}),
      ...(typeof params.completed === 'boolean' ? { completed: params.completed } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.videoWatchLog.count({ where }),
      prisma.videoWatchLog.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    return { page, pageSize, total, items };
  }

  static async getVolunteerVideoDashboard(volunteerUserId: number) {
    const videos = await prisma.video.findMany({
      where: { uploaderId: volunteerUserId },
      include: { metrics: true },
      orderBy: [{ createdAt: 'desc' }],
    });

    const statusCounts = await prisma.video.groupBy({
      by: ['status'],
      where: { uploaderId: volunteerUserId },
      _count: { _all: true },
    });

    const map: Record<string, number> = {};
    for (const row of statusCounts as any) map[String(row.status)] = row._count._all;

    const approved = map[VideoStatus.APPROVED] ?? 0;
    const rejected = map[VideoStatus.REJECTED] ?? 0;
    const reviewedTotal = approved + rejected;
    const passRate = reviewedTotal === 0 ? null : approved / reviewedTotal;

    const totals = videos.reduce(
      (acc, v) => {
        acc.play += v.metrics?.playCount ?? 0;
        acc.like += v.metrics?.likeCount ?? 0;
        acc.fav += v.metrics?.favCount ?? 0;
        return acc;
      },
      { play: 0, like: 0, fav: 0 }
    );

    return {
      totals: {
        videoCount: videos.length,
        playCount: totals.play,
        likeCount: totals.like,
        favCount: totals.fav,
        passRate,
      },
      byStatus: map,
      videos,
    };
  }
}
