import { prisma } from '../config/prisma';
import { AuditAction, LiveStatus, UserRole } from '../types/enums';
import { AuditService } from './audit.service';
import { HttpError } from '../utils/httpError';

export class LiveService {
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
}
