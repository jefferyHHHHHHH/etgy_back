import { prisma } from '../config/prisma';
import { AuditAction, LiveMessageType, LiveStatus, UserRole } from '../types/enums';
import { AuditService } from './audit.service';
import { HttpError } from '../utils/httpError';

export class LiveService {
  static async listPublicLives(params: {
    tab?: 'upcoming' | 'living' | 'ended';
    collegeId?: number;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page && Number.isFinite(params.page) ? Math.max(1, params.page) : 1;
    const pageSize = params.pageSize && Number.isFinite(params.pageSize)
      ? Math.min(50, Math.max(1, params.pageSize))
      : 20;
    const skip = (page - 1) * pageSize;

    const where: any = {
      status: { in: [LiveStatus.PUBLISHED, LiveStatus.LIVING, LiveStatus.FINISHED] },
    };

    if (params.collegeId) where.collegeId = params.collegeId;
    if (params.search && params.search.trim()) {
      where.OR = [
        { title: { contains: params.search.trim() } },
        { intro: { contains: params.search.trim() } },
      ];
    }

    if (params.tab === 'upcoming') {
      where.status = LiveStatus.PUBLISHED;
    } else if (params.tab === 'living') {
      where.status = LiveStatus.LIVING;
    } else if (params.tab === 'ended') {
      where.status = LiveStatus.FINISHED;
    }

    const orderBy =
      params.tab === 'ended'
        ? ({ actualEnd: 'desc' } as any)
        : ({ planStartTime: 'asc' } as any);

    const [total, items] = await Promise.all([
      prisma.liveRoom.count({ where }),
      prisma.liveRoom.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          title: true,
          intro: true,
          planStartTime: true,
          planEndTime: true,
          actualStart: true,
          actualEnd: true,
          status: true,
          rejectReason: true,
          // Public should never receive pushUrl.
            // 公开列表不应返回 pushUrl（仅主播可见）。
          pullUrl: true,
          anchorId: true,
          collegeId: true,
          createdAt: true,
          updatedAt: true,
          anchor: { select: { realName: true, userId: true, collegeId: true } },
          college: true,
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  static async listMyLives(params: {
    anchorUserId: number;
    status?: LiveStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page && Number.isFinite(params.page) ? Math.max(1, params.page) : 1;
    const pageSize = params.pageSize && Number.isFinite(params.pageSize)
      ? Math.min(50, Math.max(1, params.pageSize))
      : 20;
    const skip = (page - 1) * pageSize;

    const where: any = { anchorId: params.anchorUserId };
    if (params.status) where.status = params.status;

    const [total, items] = await Promise.all([
      prisma.liveRoom.count({ where }),
      prisma.liveRoom.findMany({
        where,
        orderBy: { createdAt: 'desc' } as any,
        skip,
        take: pageSize,
        include: {
          college: true,
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  static async listLivesAdmin(params: {
    viewerRole: UserRole;
    viewerCollegeId?: number;
    status?: LiveStatus;
    collegeId?: number;
    anchorId?: number;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page && Number.isFinite(params.page) ? Math.max(1, params.page) : 1;
    const pageSize = params.pageSize && Number.isFinite(params.pageSize)
      ? Math.min(50, Math.max(1, params.pageSize))
      : 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (params.viewerRole === UserRole.COLLEGE_ADMIN) {
      if (!params.viewerCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      where.collegeId = params.viewerCollegeId;
    } else if (params.viewerRole === UserRole.PLATFORM_ADMIN) {
      if (params.collegeId) where.collegeId = params.collegeId;
    } else {
      throw new HttpError(403, 'Forbidden');
    }

    if (params.status) {
      where.status = params.status;
    } else {
      where.status = LiveStatus.REVIEW;
    }

    if (params.anchorId) where.anchorId = params.anchorId;
    if (params.search && params.search.trim()) {
      where.OR = [
        { title: { contains: params.search.trim() } },
        { intro: { contains: params.search.trim() } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.liveRoom.count({ where }),
      prisma.liveRoom.findMany({
        where,
        orderBy: { createdAt: 'desc' } as any,
        skip,
        take: pageSize,
        include: {
          anchor: { select: { realName: true, userId: true, collegeId: true } },
          college: true,
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  static async getLiveById(params: {
    liveId: number;
    viewerRole?: UserRole;
    viewerUserId?: number;
    viewerCollegeId?: number;
  }) {
    const { liveId, viewerRole, viewerUserId, viewerCollegeId } = params;

    const live = await prisma.liveRoom.findUnique({
      where: { id: liveId },
      include: {
        anchor: { select: { realName: true, userId: true, collegeId: true } },
        college: true,
      },
    });

    if (!live) throw new HttpError(404, 'Live not found');

    // Guest or child: only visible statuses
    // 游客/儿童：仅可见已上架/直播中/已结束
    if (!viewerRole || viewerRole === UserRole.CHILD) {
      const visible = [LiveStatus.PUBLISHED, LiveStatus.LIVING, LiveStatus.FINISHED] as const;
      if (!visible.includes(live.status as (typeof visible)[number])) throw new HttpError(404, 'Live not found');
      return { ...live, pushUrl: null } as any;
    }

    if (viewerRole === UserRole.PLATFORM_ADMIN) return live;

    if (viewerRole === UserRole.VOLUNTEER) {
      if (live.status === LiveStatus.PUBLISHED || live.status === LiveStatus.LIVING || live.status === LiveStatus.FINISHED) {
        // Non-owner volunteers should not see pushUrl.
        return { ...live, pushUrl: null } as any;
      }
      if (!viewerUserId) throw new HttpError(401, 'Unauthorized');
      if (live.anchorId !== viewerUserId) throw new HttpError(404, 'Live not found');
      return live;
    }

    if (viewerRole === UserRole.COLLEGE_ADMIN) {
      if (live.status === LiveStatus.PUBLISHED || live.status === LiveStatus.LIVING || live.status === LiveStatus.FINISHED) return live;
      if (!viewerCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      if (live.collegeId !== viewerCollegeId) throw new HttpError(404, 'Live not found');
      return live;
    }

    throw new HttpError(403, 'Forbidden');
  }

  static async createLiveDraft(anchorUserId: number, collegeId: number | undefined, data: {
    title: string;
    intro?: string;
    planStartTime: Date;
    planEndTime: Date;
  }) {
    if (!collegeId) throw new HttpError(400, 'Anchor must belong to a college');
    if (data.planEndTime <= data.planStartTime) throw new HttpError(400, 'Invalid plan time range');

    const live = await prisma.liveRoom.create({
      data: {
        title: data.title,
        intro: data.intro,
        planStartTime: data.planStartTime,
        planEndTime: data.planEndTime,
        status: LiveStatus.DRAFT,
        anchorId: anchorUserId,
        collegeId,
      },
    });

    await AuditService.log(anchorUserId, AuditAction.CREATE, String(live.id), 'LiveRoom', `Created live draft ${data.title}`);
    return live;
  }

  static async submitReview(liveId: number, anchorUserId: number) {
    const live = await prisma.liveRoom.findUnique({ where: { id: liveId } });
    if (!live) throw new HttpError(404, 'Live not found');
    if (live.anchorId !== anchorUserId) throw new HttpError(403, 'Forbidden: not owner');

    const allowedStatuses: LiveStatus[] = [LiveStatus.DRAFT, LiveStatus.REJECTED];
    if (!allowedStatuses.includes(live.status)) {
      throw new HttpError(400, `Invalid status transition: ${live.status} -> REVIEW`);
    }

    const updated = await prisma.liveRoom.update({
      where: { id: liveId },
      data: {
        status: LiveStatus.REVIEW,
        rejectReason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    });

    await AuditService.log(anchorUserId, AuditAction.UPDATE, String(liveId), 'LiveRoom', 'Submitted for review');
    return updated;
  }

  /**
   * Live audit (skeleton): college-admin only, first-writer-wins.
   * NOTE: publishing / start / vendor token generation will be implemented later.
   */
  static async auditLive(params: {
    adminUserId: number;
    adminRole: UserRole;
    adminCollegeId?: number;
    liveId: number;
    pass: boolean;
    reason?: string;
  }) {
    const { adminUserId, adminRole, adminCollegeId, liveId, pass, reason } = params;

    if (adminRole !== UserRole.COLLEGE_ADMIN) {
      throw new HttpError(403, 'Forbidden: only college admin can audit lives');
    }
    if (!adminCollegeId) throw new HttpError(400, 'Admin must belong to a college');
    if (!pass && (!reason || !reason.trim())) throw new HttpError(400, 'Reject reason is required');

    const newStatus = pass ? LiveStatus.PASSED : LiveStatus.REJECTED;

    const result = await prisma.liveRoom.updateMany({
      where: {
        id: liveId,
        status: LiveStatus.REVIEW,
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
      const current = await prisma.liveRoom.findUnique({ where: { id: liveId }, select: { id: true, status: true, collegeId: true } });
      if (!current) throw new HttpError(404, 'Live not found');
      if (current.collegeId !== adminCollegeId) throw new HttpError(403, 'Forbidden: cross-college access');
      if (current.status !== LiveStatus.REVIEW) {
        throw new HttpError(409, `Conflict: live already audited (current status: ${current.status})`);
      }
      throw new HttpError(409, 'Conflict: audit not applied');
    }

    const action = pass ? AuditAction.REVIEW_PASS : AuditAction.REVIEW_REJECT;
    await AuditService.log(adminUserId, action, String(liveId), 'LiveRoom', reason);

    return await prisma.liveRoom.findUnique({ where: { id: liveId } });
  }

  /**
   * Publish live after PASS (volunteer)
   */
  static async publishLive(anchorUserId: number, liveId: number) {
    const result = await prisma.liveRoom.updateMany({
      where: {
        id: liveId,
        anchorId: anchorUserId,
        status: LiveStatus.PASSED,
      },
      data: {
        status: LiveStatus.PUBLISHED,
        publishedBy: anchorUserId,
        publishedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      const current = await prisma.liveRoom.findUnique({
        where: { id: liveId },
        select: { id: true, status: true, anchorId: true },
      });
      if (!current) throw new HttpError(404, 'Live not found');
      if (current.anchorId !== anchorUserId) throw new HttpError(403, 'Forbidden: not owner');
      throw new HttpError(400, `Invalid status transition: ${current.status} -> PUBLISHED`);
    }

    await AuditService.log(anchorUserId, AuditAction.PUBLISH, String(liveId), 'LiveRoom', 'Published');
    return prisma.liveRoom.findUnique({ where: { id: liveId } });
  }

  /**
   * Offline live (volunteer self-offline OR admin force-offline)
   */
  static async offlineLive(params: {
    operatorUserId: number;
    operatorRole: UserRole;
    operatorCollegeId?: number;
    liveId: number;
    reason?: string;
  }) {
    const { operatorUserId, operatorRole, operatorCollegeId, liveId, reason } = params;

    const adminRoles: UserRole[] = [UserRole.COLLEGE_ADMIN, UserRole.PLATFORM_ADMIN];
    if (adminRoles.includes(operatorRole)) {
      if (!reason || !reason.trim()) {
        throw new HttpError(400, 'Offline reason is required for admins');
      }
    }

    const where: any = {
      id: liveId,
      status: { in: [LiveStatus.PUBLISHED, LiveStatus.LIVING, LiveStatus.FINISHED] },
    };

    if (operatorRole === UserRole.VOLUNTEER) {
      where.anchorId = operatorUserId;
    } else if (operatorRole === UserRole.COLLEGE_ADMIN) {
      if (!operatorCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      where.collegeId = operatorCollegeId;
    } else if (operatorRole === UserRole.PLATFORM_ADMIN) {
      // global
    } else {
      throw new HttpError(403, 'Forbidden');
    }

    const result = await prisma.liveRoom.updateMany({
      where,
      data: {
        status: LiveStatus.OFFLINE,
        offlineBy: operatorUserId,
        offlineAt: new Date(),
        offlineReason: reason ? reason.trim() : null,
      },
    });

    if (result.count !== 1) {
      const current = await prisma.liveRoom.findUnique({
        where: { id: liveId },
        select: { id: true, status: true, anchorId: true, collegeId: true },
      });
      if (!current) throw new HttpError(404, 'Live not found');
      throw new HttpError(403, 'Forbidden');
    }

    await AuditService.log(operatorUserId, AuditAction.OFFLINE, String(liveId), 'LiveRoom', reason);
    return prisma.liveRoom.findUnique({ where: { id: liveId } });
  }

  static async startLive(anchorUserId: number, liveId: number) {
    const result = await prisma.liveRoom.updateMany({
      where: {
        id: liveId,
        anchorId: anchorUserId,
        status: LiveStatus.PUBLISHED,
      },
      data: {
        status: LiveStatus.LIVING,
        actualStart: new Date(),
      },
    });

    if (result.count !== 1) {
      const current = await prisma.liveRoom.findUnique({
        where: { id: liveId },
        select: { id: true, status: true, anchorId: true },
      });
      if (!current) throw new HttpError(404, 'Live not found');
      if (current.anchorId !== anchorUserId) throw new HttpError(403, 'Forbidden: not owner');
      throw new HttpError(400, `Invalid status transition: ${current.status} -> LIVING`);
    }

    await AuditService.log(anchorUserId, AuditAction.UPDATE, String(liveId), 'LiveRoom', 'Start live');
    return prisma.liveRoom.findUnique({ where: { id: liveId } });
  }

  static async finishLive(anchorUserId: number, liveId: number) {
    return this.finishLiveWithReplay(anchorUserId, liveId, undefined);
  }

  static async finishLiveWithReplay(anchorUserId: number, liveId: number, replayVideoId?: number) {
    const result = await prisma.liveRoom.updateMany({
      where: {
        id: liveId,
        anchorId: anchorUserId,
        status: LiveStatus.LIVING,
      },
      data: {
        status: LiveStatus.FINISHED,
        actualEnd: new Date(),
        ...(replayVideoId ? { replayVideoId } : {}),
      },
    });

    if (result.count !== 1) {
      const current = await prisma.liveRoom.findUnique({
        where: { id: liveId },
        select: { id: true, status: true, anchorId: true },
      });
      if (!current) throw new HttpError(404, 'Live not found');
      if (current.anchorId !== anchorUserId) throw new HttpError(403, 'Forbidden: not owner');
      throw new HttpError(400, `Invalid status transition: ${current.status} -> FINISHED`);
    }

    await AuditService.log(anchorUserId, AuditAction.UPDATE, String(liveId), 'LiveRoom', 'Finish live');
    return prisma.liveRoom.findUnique({ where: { id: liveId } });
  }

  static async listMessages(params: {
    liveId: number;
    viewerRole: UserRole;
    viewerUserId: number;
    viewerCollegeId?: number;
    afterId?: number;
    limit?: number;
  }) {
    // Access control uses existing visibility rules
    await this.getLiveById({
      liveId: params.liveId,
      viewerRole: params.viewerRole,
      viewerUserId: params.viewerUserId,
      viewerCollegeId: params.viewerCollegeId,
    });

    const limit = params.limit && Number.isFinite(params.limit) ? Math.min(100, Math.max(1, params.limit)) : 50;
    const where: any = { liveId: params.liveId };
    if (params.afterId && Number.isFinite(params.afterId)) {
      where.id = { gt: params.afterId };
    }

    const items = await prisma.liveMessage.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit,
      include: {
        sender: { select: { id: true, username: true, role: true, childProfile: true } },
      },
    });

    return items;
  }

  static async sendMessage(params: {
    liveId: number;
    senderId: number;
    senderRole: UserRole;
    senderCollegeId?: number;
    type?: LiveMessageType;
    content: string;
  }) {
    const live = await prisma.liveRoom.findUnique({
      where: { id: params.liveId },
      select: { id: true, status: true, collegeId: true },
    });
    if (!live) throw new HttpError(404, 'Live not found');

    // Only allow chatting during LIVING
    if (live.status !== LiveStatus.LIVING) {
      throw new HttpError(400, `Live is not in progress (current: ${live.status})`);
    }

    // College admin is limited to own college
    if (params.senderRole === UserRole.COLLEGE_ADMIN) {
      if (!params.senderCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      if (live.collegeId !== params.senderCollegeId) throw new HttpError(404, 'Live not found');
    }

    const text = (params.content ?? '').trim();
    if (!text) throw new HttpError(400, 'content is required');
    if (text.length > 500) throw new HttpError(400, 'content too long');

    const type = params.type ?? LiveMessageType.CHAT;

    const created = await prisma.liveMessage.create({
      data: {
        liveId: params.liveId,
        senderId: params.senderId,
        type,
        content: text,
      },
      include: {
        sender: { select: { id: true, username: true, role: true, childProfile: true } },
      },
    });

    return created;
  }

  static async getStreamInfo(params: {
    liveId: number;
    viewerRole: UserRole;
    viewerUserId: number;
    viewerCollegeId?: number;
  }) {
    const live = await prisma.liveRoom.findUnique({
      where: { id: params.liveId },
      select: { id: true, anchorId: true, collegeId: true, pushUrl: true, pullUrl: true },
    });

    if (!live) throw new HttpError(404, 'Live not found');

    if (params.viewerRole === UserRole.VOLUNTEER) {
      if (live.anchorId !== params.viewerUserId) {
        // Volunteer can only get stream info for own lives
        throw new HttpError(404, 'Live not found');
      }
      return { liveId: live.id, pushUrl: live.pushUrl ?? null, pullUrl: live.pullUrl ?? null };
    }

    if (params.viewerRole === UserRole.COLLEGE_ADMIN) {
      if (!params.viewerCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      if (live.collegeId !== params.viewerCollegeId) throw new HttpError(404, 'Live not found');
      return { liveId: live.id, pushUrl: live.pushUrl ?? null, pullUrl: live.pullUrl ?? null };
    }

    if (params.viewerRole === UserRole.PLATFORM_ADMIN) {
      return { liveId: live.id, pushUrl: live.pushUrl ?? null, pullUrl: live.pullUrl ?? null };
    }

    if (params.viewerRole === UserRole.CHILD) {
      // Child can only see pull url
      return { liveId: live.id, pushUrl: null, pullUrl: live.pullUrl ?? null };
    }

    throw new HttpError(403, 'Forbidden');
  }
}
