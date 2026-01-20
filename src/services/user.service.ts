import { prisma } from '../config/prisma';
// import { UserRole, VolunteerStatus, Gender } from '@prisma/client';
import { UserRole, UserStatus, VolunteerStatus, Gender } from '../types/enums';
import bcrypt from 'bcryptjs';
import { HttpError } from '../utils/httpError';

export class UserService {

  private static generateTempPassword(len: number = 10) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < len; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }
  
  /**
   * Get full user profile including role-specific details
   */
  static async getUserProfile(userId: number) {
    const user = await prisma.user.findUnique({
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
    
    if (!user) throw new Error('User not found');
    
    return user;
  }

  /**
   * Create Child Account (Admin Only)
   */
  static async createChild(data: {
    username: string;
    password: string;
    realName: string;
    school: string;
    grade: string;
    gender: Gender;
    status?: UserStatus;
  }) {
    const username = data.username.trim();
    if (!username) throw new HttpError(400, 'username is required');
    if (!data.password || data.password.length < 6) throw new HttpError(400, 'password must be at least 6 chars');

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: UserRole.CHILD,
        status: data.status ?? UserStatus.INACTIVE,
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
   * Batch create children (platform admin provisioning).
   * Returns per-row result to make imports easier.
   */
  static async createChildrenBatch(items: Array<{
    username: string;
    password: string;
    realName: string;
    school: string;
    grade: string;
    gender: Gender;
    status?: UserStatus;
  }>) {
    const results: Array<
      | { ok: true; username: string; userId: number }
      | { ok: false; username: string; message: string }
    > = [];

    for (const item of items) {
      const username = (item.username ?? '').trim();
      if (!username) {
        results.push({ ok: false, username: item.username, message: 'username is required' });
        continue;
      }
      try {
        const passwordHash = await bcrypt.hash(item.password, 10);
        const created = await prisma.user.create({
          data: {
            username,
            passwordHash,
            role: UserRole.CHILD,
            status: item.status ?? UserStatus.INACTIVE,
            childProfile: {
              create: {
                realName: item.realName,
                school: item.school,
                grade: item.grade,
                gender: item.gender,
              },
            },
          },
          select: { id: true, username: true },
        });
        results.push({ ok: true, username: created.username, userId: created.id });
      } catch (e: any) {
        results.push({ ok: false, username, message: e?.message || 'create failed' });
      }
    }

    return {
      total: items.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  static async listChildren(query: {
    search?: string;
    school?: string;
    grade?: string;
    page: number;
    pageSize: number;
  }) {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const search = (query.search ?? '').trim();
    const school = (query.school ?? '').trim();
    const grade = (query.grade ?? '').trim();

    const where: any = {
      role: UserRole.CHILD,
      childProfile: {
        isNot: null,
      },
    };

    if (search) {
      where.OR = [
        { username: { contains: search } },
        { childProfile: { realName: { contains: search } } },
      ];
    }
    if (school) {
      where.childProfile = { ...(where.childProfile ?? {}), school: { contains: school } };
    }
    if (grade) {
      where.childProfile = { ...(where.childProfile ?? {}), grade: { contains: grade } };
    }

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: [{ id: 'desc' }],
        skip,
        take: pageSize,
        include: { childProfile: true },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items,
    };
  }

  /**
   * Create volunteer base account + profile (admin provisioning).
   */
  static async createVolunteerAccount(params: {
    username: string;
    password: string;
    realName: string;
    studentId: string;
    collegeId: number;
    phone?: string;
    status?: UserStatus;
  }) {
    const username = params.username.trim();
    if (!username) throw new HttpError(400, 'username is required');
    if (!params.password || params.password.length < 6) throw new HttpError(400, 'password must be at least 6 chars');
    if (!params.realName?.trim()) throw new HttpError(400, 'realName is required');
    if (!params.studentId?.trim()) throw new HttpError(400, 'studentId is required');

    const college = await prisma.college.findUnique({ where: { id: params.collegeId } });
    if (!college) throw new HttpError(400, 'Invalid collegeId');

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) throw new HttpError(409, 'Username already exists');

    const passwordHash = await bcrypt.hash(params.password, 10);
    return prisma.user.create({
      data: {
        username,
        passwordHash,
        role: UserRole.VOLUNTEER,
        status: params.status ?? UserStatus.ACTIVE,
        volunteerProfile: {
          create: {
            realName: params.realName.trim(),
            studentId: params.studentId.trim(),
            collegeId: params.collegeId,
            phone: params.phone,
            status: VolunteerStatus.IN_SCHOOL,
          },
        },
      },
      include: {
        volunteerProfile: { include: { college: true } },
      },
    });
  }

  static async changePassword(userId: number, oldPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) throw new HttpError(400, 'newPassword must be at least 6 chars');

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, 'User not found');

    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) throw new HttpError(400, 'Old password incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { userId, changed: true };
  }

  /**
   * Create/Update Volunteer Profile (Application)
   */
  static async createVolunteerProfile(userId: number, data: {
    realName: string;
    studentId: string;
    collegeId: number;
    phone: string;
  }) {
    const college = await prisma.college.findUnique({ where: { id: data.collegeId } });
    if (!college) throw new Error('Invalid College ID');

    // Upsert or Create? Requirement assumes one per user.
    const profile = await prisma.volunteerProfile.create({
      data: {
        userId,
        realName: data.realName,
        studentId: data.studentId,
        collegeId: data.collegeId,
        phone: data.phone,
        status: VolunteerStatus.IN_SCHOOL
      }
    });
    
    return profile;
  }

  /**
   * List Volunteers (Admin)
   */
  static async listVolunteers(collegeId: number | undefined, status?: VolunteerStatus) {
    const where: any = {};
    if (collegeId) where.collegeId = collegeId;
    if (status) where.status = status;

    return await prisma.volunteerProfile.findMany({
      where,
      include: {
        user: { select: { username: true, id: true, status: true } },
        college: true
      }
    });
  }

  static async listVolunteersPaged(query: {
    operatorRole: UserRole;
    operatorUserId: number;
    operatorCollegeId?: number;
    collegeId?: number;
    volunteerStatus?: VolunteerStatus;
    userStatus?: UserStatus;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    // Scope
    let scopedCollegeId: number | undefined = query.collegeId;
    if (query.operatorRole === UserRole.COLLEGE_ADMIN) {
      if (!query.operatorCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      scopedCollegeId = query.operatorCollegeId;
    }

    const search = (query.search ?? '').trim();
    const where: any = {
      ...(scopedCollegeId ? { collegeId: scopedCollegeId } : {}),
      ...(query.volunteerStatus ? { status: query.volunteerStatus } : {}),
      ...(query.userStatus ? { user: { is: { status: query.userStatus } } } : {}),
    };

    if (search) {
      where.OR = [
        { realName: { contains: search } },
        { studentId: { contains: search } },
        { user: { is: { username: { contains: search } } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.volunteerProfile.count({ where }),
      prisma.volunteerProfile.findMany({
        where,
        orderBy: [{ userId: 'desc' }],
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, username: true, status: true, role: true, createdAt: true } },
          college: true,
        },
      }),
    ]);

    return { page, pageSize, total, items };
  }

  static async setVolunteerSuspended(params: {
    operatorRole: UserRole;
    operatorUserId: number;
    operatorCollegeId?: number;
    volunteerUserId: number;
    suspended: boolean;
  }) {
    const { operatorRole, operatorCollegeId, volunteerUserId, suspended } = params;

    if (operatorRole !== UserRole.COLLEGE_ADMIN && operatorRole !== UserRole.PLATFORM_ADMIN) {
      throw new HttpError(403, 'Forbidden');
    }

    const profile = await prisma.volunteerProfile.findUnique({
      where: { userId: volunteerUserId },
      include: { user: true },
    });
    if (!profile) throw new HttpError(404, 'Volunteer not found');

    if (operatorRole === UserRole.COLLEGE_ADMIN) {
      if (!operatorCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      if (profile.collegeId !== operatorCollegeId) throw new HttpError(403, 'Forbidden: cross-college access');
    }

    // Keep child/other roles safe
    if (profile.user.role !== UserRole.VOLUNTEER) throw new HttpError(400, 'Target user is not a volunteer');

    const nextUserStatus = suspended ? UserStatus.SUSPENDED : UserStatus.ACTIVE;
    const nextVolunteerStatus = suspended ? VolunteerStatus.SUSPENDED : VolunteerStatus.IN_SCHOOL;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: volunteerUserId },
        data: { status: nextUserStatus },
      });
      return tx.volunteerProfile.update({
        where: { userId: volunteerUserId },
        data: { status: nextVolunteerStatus },
        include: { user: { select: { id: true, username: true, status: true, role: true } }, college: true },
      });
    });

    return updated;
  }

  static async resetChildPassword(childUserId: number) {
    const user = await prisma.user.findUnique({ where: { id: childUserId }, include: { childProfile: true } });
    if (!user) throw new HttpError(404, 'User not found');
    if (user.role !== UserRole.CHILD) throw new HttpError(400, 'Target user is not a child');

    const tempPassword = this.generateTempPassword(10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await prisma.user.update({ where: { id: childUserId }, data: { passwordHash } });

    return { userId: childUserId, tempPassword };
  }

  static async updateChildStatus(childUserId: number, status: UserStatus) {
    const user = await prisma.user.findUnique({ where: { id: childUserId } });
    if (!user) throw new HttpError(404, 'User not found');
    if (user.role !== UserRole.CHILD) throw new HttpError(400, 'Target user is not a child');

    const updated = await prisma.user.update({
      where: { id: childUserId },
      data: { status },
      include: { childProfile: true },
    });

    return updated;
  }

  /**
   * Update Volunteer Status (Approve/Suspend)
   */
  static async updateVolunteerStatus(params: {
    operatorRole: UserRole;
    operatorUserId: number;
    operatorCollegeId?: number;
    volunteerUserId: number;
    status: VolunteerStatus;
  }) {
    const { operatorRole, operatorCollegeId, volunteerUserId, status } = params;

    if (operatorRole !== UserRole.COLLEGE_ADMIN && operatorRole !== UserRole.PLATFORM_ADMIN) {
      throw new HttpError(403, 'Forbidden');
    }

    const profile = await prisma.volunteerProfile.findUnique({
      where: { userId: volunteerUserId },
      include: { user: true },
    });
    if (!profile) throw new HttpError(404, 'Volunteer not found');

    if (operatorRole === UserRole.COLLEGE_ADMIN) {
      if (!operatorCollegeId) throw new HttpError(400, 'Admin must belong to a college');
      if (profile.collegeId !== operatorCollegeId) throw new HttpError(403, 'Forbidden: cross-college access');
    }

    if (profile.user.role !== UserRole.VOLUNTEER) throw new HttpError(400, 'Target user is not a volunteer');

    const nextUserStatus = status === VolunteerStatus.SUSPENDED ? UserStatus.SUSPENDED : UserStatus.ACTIVE;

    return prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: volunteerUserId }, data: { status: nextUserStatus } });
      return tx.volunteerProfile.update({
        where: { userId: volunteerUserId },
        data: { status },
        include: { user: { select: { id: true, username: true, status: true, role: true } }, college: true },
      });
    });
  }
}
