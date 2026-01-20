import { prisma } from '../config/prisma';
// import { UserRole, VolunteerStatus, Gender } from '@prisma/client';
import { UserRole, UserStatus, VolunteerStatus, Gender } from '../types/enums';
import bcrypt from 'bcryptjs';
import { HttpError } from '../utils/httpError';

export class UserService {
  
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

  /**
   * Update Volunteer Status (Approve/Suspend)
   */
  static async updateVolunteerStatus(volunteerUserId: number, status: VolunteerStatus) {
    return await prisma.volunteerProfile.update({
      where: { userId: volunteerUserId },
      data: { status }
    });
  }
}
