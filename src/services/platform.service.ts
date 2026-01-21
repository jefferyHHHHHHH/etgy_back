import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';
import { AuditAction, LiveStatus, ModerationAction, UserRole, UserStatus, VideoStatus } from '../types/enums';
import { HttpError } from '../utils/httpError';
import { ModerationService } from './moderation.service';

export class PlatformService {
  private static async getCollegeIdForCollegeAdmin(userId: number) {
    const profile = await prisma.adminProfile.findUnique({ where: { userId }, select: { collegeId: true } });
    return profile?.collegeId ?? null;
  }

  static async listColleges() {
    return prisma.college.findMany({
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  static async createCollege(data: { name: string; isActive?: boolean; sortOrder?: number }) {
    const name = data.name.trim();
    if (!name) throw new HttpError(400, 'College name is required');

    return prisma.college.create({
      data: {
        name,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  static async updateCollege(collegeId: number, data: { name?: string; isActive?: boolean; sortOrder?: number }) {
    const update: any = {};
    if (typeof data.name === 'string') update.name = data.name.trim();
    if (typeof data.isActive === 'boolean') update.isActive = data.isActive;
    if (typeof data.sortOrder === 'number') update.sortOrder = data.sortOrder;

    try {
      return await prisma.college.update({
        where: { id: collegeId },
        data: update,
      });
    } catch (e: any) {
      throw new HttpError(400, e?.message || 'Update college failed');
    }
  }

  /**
   * Platform admin creates college admin accounts (PRD: 平台管理员负责添加/删除学院管理员账号)
   */
  static async createCollegeAdminAccount(data: {
    username: string;
    password: string;
    realName: string;
    collegeId: number;
  }) {
    const username = data.username.trim();
    const realName = data.realName.trim();
    if (!username) throw new HttpError(400, 'username is required');
    if (!data.password || data.password.length < 6) throw new HttpError(400, 'password must be at least 6 chars');
    if (!realName) throw new HttpError(400, 'realName is required');

    const college = await prisma.college.findUnique({ where: { id: data.collegeId } });
    if (!college) throw new HttpError(400, 'Invalid collegeId');

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) throw new HttpError(409, 'Username already exists');

    const passwordHash = await bcrypt.hash(data.password, 10);

    return prisma.user.create({
      data: {
        username,
        passwordHash,
        role: UserRole.COLLEGE_ADMIN,
        status: UserStatus.ACTIVE,
        adminProfile: {
          create: {
            realName,
            collegeId: data.collegeId,
          },
        },
      },
      include: {
        adminProfile: { include: { college: true } },
      },
    });
  }

  static async listCollegeAdminAccounts(collegeId?: number) {
    return prisma.user.findMany({
      where: {
        role: UserRole.COLLEGE_ADMIN,
        ...(collegeId
          ? {
              adminProfile: {
                collegeId,
              },
            }
          : {}),
      },
      orderBy: [{ id: 'desc' }],
      include: {
        adminProfile: { include: { college: true } },
      },
    });
  }

  static async deleteCollegeAdminAccount(collegeAdminUserId: number, operatorUserId: number) {
    if (collegeAdminUserId === operatorUserId) {
      throw new HttpError(400, '不能删除当前登录账号');
    }

    const user = await prisma.user.findUnique({
      where: { id: collegeAdminUserId },
      include: { adminProfile: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    if (user.role !== UserRole.COLLEGE_ADMIN) throw new HttpError(400, '目标用户不是学院管理员');

    await prisma.user.delete({ where: { id: collegeAdminUserId } });
    return { id: collegeAdminUserId, deleted: true };
  }

  static async updateCollegeAdminAccount(collegeAdminUserId: number, data: { realName?: string; collegeId?: number }) {
    const user = await prisma.user.findUnique({ where: { id: collegeAdminUserId }, include: { adminProfile: true } });
    if (!user) throw new HttpError(404, 'User not found');
    if (user.role !== UserRole.COLLEGE_ADMIN) throw new HttpError(400, '目标用户不是学院管理员');

    const updateUser: any = {};
    const updateProfile: any = {};

    if (typeof data.realName === 'string') updateProfile.realName = data.realName.trim();
    if (typeof data.collegeId === 'number') {
      const college = await prisma.college.findUnique({ where: { id: data.collegeId } });
      if (!college) throw new HttpError(400, 'Invalid collegeId');
      updateProfile.collegeId = data.collegeId;
    }

    if (!Object.keys(updateProfile).length && !Object.keys(updateUser).length) {
      throw new HttpError(400, 'No fields to update');
    }

    return prisma.user.update({
      where: { id: collegeAdminUserId },
      data: {
        ...updateUser,
        adminProfile: {
          update: updateProfile,
        },
      },
      include: { adminProfile: { include: { college: true } } },
    });
  }

  static async updateCollegeAdminStatus(collegeAdminUserId: number, operatorUserId: number, status: UserStatus) {
    if (collegeAdminUserId === operatorUserId) {
      throw new HttpError(400, '不能停用当前登录账号');
    }

    const user = await prisma.user.findUnique({ where: { id: collegeAdminUserId } });
    if (!user) throw new HttpError(404, 'User not found');
    if (user.role !== UserRole.COLLEGE_ADMIN) throw new HttpError(400, '目标用户不是学院管理员');

    return prisma.user.update({
      where: { id: collegeAdminUserId },
      data: { status },
      include: { adminProfile: { include: { college: true } } },
    });
  }

  static async listAuditLogs(
    operatorUserId: number,
    operatorRole: UserRole,
    query: {
      collegeId?: number;
      action?: AuditAction;
      operatorId?: number;
      targetType?: string;
      targetId?: string;
      startTime?: string;
      endTime?: string;
      page: number;
      pageSize: number;
    }
  ) {
    let scopedCollegeId: number | undefined = query.collegeId;
    if (operatorRole === UserRole.COLLEGE_ADMIN) {
      const cid = await this.getCollegeIdForCollegeAdmin(operatorUserId);
      if (!cid) throw new HttpError(400, '学院管理员账号未绑定学院');
      scopedCollegeId = cid;
    }

    const where: any = {};
    if (query.action) where.action = query.action;
    if (query.operatorId) where.operatorId = query.operatorId;
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = String(query.targetId);

    if (query.startTime || query.endTime) {
      where.createdAt = {};
      if (query.startTime) where.createdAt.gte = new Date(query.startTime);
      if (query.endTime) where.createdAt.lte = new Date(query.endTime);
    }

    // 学院范围：通过“操作人所属学院”来做隔离（覆盖视频/直播审核、发布、下线、志愿者/管理员操作等大部分关键行为）
    if (scopedCollegeId) {
      where.operator = {
        OR: [
          { volunteerProfile: { collegeId: scopedCollegeId } },
          { adminProfile: { collegeId: scopedCollegeId } },
        ],
      };
    }

    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          operator: {
            select: {
              id: true,
              username: true,
              role: true,
              adminProfile: { include: { college: true } },
              volunteerProfile: { include: { college: true } },
            },
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items,
    };
  }

  static async getDashboardStats(operatorUserId: number, operatorRole: UserRole, collegeId?: number) {
    let scopedCollegeId: number | undefined = collegeId;
    if (operatorRole === UserRole.COLLEGE_ADMIN) {
      const cid = await this.getCollegeIdForCollegeAdmin(operatorUserId);
      if (!cid) throw new HttpError(400, '学院管理员账号未绑定学院');
      scopedCollegeId = cid;
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const videoWhere: any = scopedCollegeId ? { collegeId: scopedCollegeId } : {};
    const liveWhere: any = scopedCollegeId ? { collegeId: scopedCollegeId } : {};

    const [
      videoTotal,
      liveTotal,
      videoByStatus,
      liveByStatus,
      todayNewVideos,
      todayNewLives,
      volunteerCount,
    ] = await Promise.all([
      prisma.video.count({ where: videoWhere }),
      prisma.liveRoom.count({ where: liveWhere }),
      prisma.video.groupBy({ by: ['status'], where: videoWhere, _count: { _all: true } }),
      prisma.liveRoom.groupBy({ by: ['status'], where: liveWhere, _count: { _all: true } }),
      prisma.video.count({ where: { ...videoWhere, createdAt: { gte: startOfToday } } }),
      prisma.liveRoom.count({ where: { ...liveWhere, createdAt: { gte: startOfToday } } }),
      prisma.volunteerProfile.count({
        where: {
          ...(scopedCollegeId ? { collegeId: scopedCollegeId } : {}),
          user: { status: UserStatus.ACTIVE },
        },
      }),
    ]);

    const toMap = <T extends { status: any; _count: { _all: number } }>(rows: T[]) => {
      const map: Record<string, number> = {};
      for (const r of rows) map[String(r.status)] = r._count._all;
      return map;
    };

    const videoStatusCounts = toMap(videoByStatus as any);
    const liveStatusCounts = toMap(liveByStatus as any);

    // 常用关键指标（便于前端直接用）
    const videoPendingReview = videoStatusCounts[VideoStatus.REVIEW] ?? 0;
    const videoApproved = videoStatusCounts[VideoStatus.APPROVED] ?? 0;
    const videoPublished = videoStatusCounts[VideoStatus.PUBLISHED] ?? 0;

    const livePendingReview = liveStatusCounts[LiveStatus.REVIEW] ?? 0;
    const livePassed = liveStatusCounts[LiveStatus.PASSED] ?? 0;
    const livePublished = liveStatusCounts[LiveStatus.PUBLISHED] ?? 0;
    const liveLiving = liveStatusCounts[LiveStatus.LIVING] ?? 0;

    return {
      scope: {
        collegeId: scopedCollegeId ?? null,
      },
      totals: {
        videoTotal,
        liveTotal,
        volunteerActiveCount: volunteerCount,
      },
      today: {
        newVideos: todayNewVideos,
        newLives: todayNewLives,
      },
      video: {
        byStatus: videoStatusCounts,
        pendingReview: videoPendingReview,
        approved: videoApproved,
        published: videoPublished,
      },
      live: {
        byStatus: liveStatusCounts,
        pendingReview: livePendingReview,
        passed: livePassed,
        published: livePublished,
        living: liveLiving,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Content Moderation (Sensitive words + feature switches)
  // ---------------------------------------------------------------------------

  static async getContentPolicy() {
    return ModerationService.getPolicy();
  }

  static async updateContentPolicy(data: {
    commentsEnabled?: boolean;
    liveChatEnabled?: boolean;
    moderationAction?: ModerationAction;
  }) {
    return ModerationService.updatePolicy(data);
  }

  static async listSensitiveWords(query: { q?: string; isActive?: boolean; page: number; pageSize: number }) {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;
    if (query.q && query.q.trim()) {
      where.word = { contains: query.q.trim() };
    }

    const [total, items] = await Promise.all([
      prisma.sensitiveWord.count({ where }),
      prisma.sensitiveWord.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip,
        take: pageSize,
      }),
    ]);

    return { items, total, page, pageSize };
  }

  static async createSensitiveWord(data: { word: string; isActive?: boolean }) {
    const word = (data.word ?? '').trim();
    if (!word) throw new HttpError(400, 'word is required');
    if (word.length > 64) throw new HttpError(400, 'word too long');

    try {
      const created = await prisma.sensitiveWord.create({
        data: {
          word,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
        },
      });
      ModerationService.bustCache();
      return created;
    } catch (e: any) {
      if (typeof e?.message === 'string' && e.message.includes('Unique constraint')) {
        throw new HttpError(409, 'Sensitive word already exists');
      }
      throw new HttpError(400, e?.message || 'Create sensitive word failed');
    }
  }

  static async batchCreateSensitiveWords(data: { words: string[]; overwrite?: boolean }) {
    const raw = Array.isArray(data.words) ? data.words : [];
    const words = raw
      .map((w) => String(w ?? '').trim())
      .filter(Boolean)
      .map((w) => (w.length > 64 ? w.slice(0, 64) : w));

    if (!words.length) throw new HttpError(400, 'words is required');

    const uniqueWords = Array.from(new Set(words));

    if (data.overwrite) {
      // Upsert-like behavior: delete existing then create
      await prisma.sensitiveWord.deleteMany({ where: { word: { in: uniqueWords } } });
    }

    const result = await prisma.sensitiveWord.createMany({
      data: uniqueWords.map((word) => ({ word, isActive: true })),
      skipDuplicates: true,
    });

    ModerationService.bustCache();
    return { requested: uniqueWords.length, created: result.count };
  }

  static async updateSensitiveWord(id: number, data: { isActive?: boolean }) {
    if (!Number.isFinite(id)) throw new HttpError(400, 'Invalid id');
    if (typeof data.isActive !== 'boolean') throw new HttpError(400, 'isActive is required');

    try {
      const updated = await prisma.sensitiveWord.update({
        where: { id },
        data: { isActive: data.isActive },
      });
      ModerationService.bustCache();
      return updated;
    } catch (e: any) {
      throw new HttpError(404, 'Sensitive word not found');
    }
  }

  static async deleteSensitiveWord(id: number) {
    if (!Number.isFinite(id)) throw new HttpError(400, 'Invalid id');
    try {
      await prisma.sensitiveWord.delete({ where: { id } });
      ModerationService.bustCache();
      return { id, deleted: true };
    } catch (e: any) {
      throw new HttpError(404, 'Sensitive word not found');
    }
  }

  static async exportSensitiveWords(params: { format: 'txt' | 'csv'; isActive?: boolean }) {
    const format = params.format === 'csv' ? 'csv' : 'txt';
    const where: any = {};
    if (typeof params.isActive === 'boolean') where.isActive = params.isActive;

    const rows = await prisma.sensitiveWord.findMany({
      where,
      orderBy: [{ word: 'asc' }],
      select: { word: true },
    });

    const words = rows
      .map((r: { word: string }) => r.word)
      .map((w: string) => w.trim())
      .filter(Boolean);

    if (format === 'csv') {
      const header = 'word';
      const lines = words.map((w) => {
        // Quote if contains comma/quote/newline
        if (/[",\n\r]/.test(w)) {
          return '"' + w.replace(/"/g, '""') + '"';
        }
        return w;
      });
      const content = [header, ...lines].join('\n') + '\n';
      return {
        filename: `sensitive-words-${Date.now()}.csv`,
        contentType: 'text/csv; charset=utf-8',
        content,
      };
    }

    const content = words.join('\n') + (words.length ? '\n' : '');
    return {
      filename: `sensitive-words-${Date.now()}.txt`,
      contentType: 'text/plain; charset=utf-8',
      content,
    };
  }

  private static parseWordsFromTxt(text: string) {
    return (text ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => !l.startsWith('#'));
  }

  private static parseWordsFromCsv(text: string) {
    const lines = (text ?? '').split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (!lines.length) return [] as string[];

    // If first line looks like header containing "word", skip it.
    const first = lines[0].toLowerCase();
    const startIndex = first.includes('word') ? 1 : 0;

    const out: string[] = [];
    for (const line of lines.slice(startIndex)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) continue;

      // Minimal CSV: take first column, handle simple quoted field
      let col = trimmed;
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx >= 0) col = trimmed.slice(0, commaIdx);

      col = col.trim();
      if (col.startsWith('"') && col.endsWith('"') && col.length >= 2) {
        col = col.slice(1, -1).replace(/""/g, '"');
      }

      col = col.trim();
      if (col) out.push(col);
    }
    return out;
  }

  static async importSensitiveWords(params: { format: 'txt' | 'csv'; overwrite: boolean; text: string }) {
    const format = params.format === 'csv' ? 'csv' : 'txt';
    const words =
      format === 'csv'
        ? this.parseWordsFromCsv(params.text)
        : this.parseWordsFromTxt(params.text);

    return this.batchCreateSensitiveWords({ words, overwrite: params.overwrite });
  }
}
