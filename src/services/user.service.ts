import { prisma } from '../server';
// import { UserRole, VolunteerStatus, Gender } from '@prisma/client';
import { UserRole, VolunteerStatus, Gender } from '../types/enums';

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
      } as any
    });
    
    if (!user) throw new Error('User not found');
    
    return user;
  }

  /**
   * Create Child Account (Admin Only)
   */
  static async createChild(data: {
    username: string;
    realName: string;
    school: string;
    grade: string;
    gender: Gender;
  }) {
    // TODO: Hash password
    const user = await prisma.user.create({
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
        status: 'IN_SCHOOL'
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
