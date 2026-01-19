import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';
import { UserRole, UserStatus } from '../types/enums';
import { HttpError } from '../utils/httpError';

export class PlatformService {
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
}
