import { PrismaClient, UserRole, UserStatus, Gender, VolunteerStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1) Create a default college
  const college = await prisma.college.upsert({
    where: { name: 'Default College' },
    update: {},
    create: {
      name: 'Default College',
      isActive: true,
      sortOrder: 0,
    },
  });

  const defaultPassword = 'Passw0rd!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // 2) Platform admin (global)
  await prisma.user.upsert({
    where: { username: 'platform_admin' },
    update: {},
    create: {
      username: 'platform_admin',
      passwordHash,
      role: UserRole.PLATFORM_ADMIN,
      status: UserStatus.ACTIVE,
      adminProfile: {
        create: {
          realName: 'Platform Admin',
          collegeId: null,
        },
      },
    },
  });

  // 3) College admin (scoped to college)
  await prisma.user.upsert({
    where: { username: 'college_admin' },
    update: {},
    create: {
      username: 'college_admin',
      passwordHash,
      role: UserRole.COLLEGE_ADMIN,
      status: UserStatus.ACTIVE,
      adminProfile: {
        create: {
          realName: 'College Admin',
          collegeId: college.id,
        },
      },
    },
  });

  // 4) Volunteer
  await prisma.user.upsert({
    where: { username: 'volunteer_001' },
    update: {},
    create: {
      username: 'volunteer_001',
      passwordHash,
      role: UserRole.VOLUNTEER,
      status: UserStatus.ACTIVE,
      volunteerProfile: {
        create: {
          realName: 'Volunteer One',
          studentId: 'S0001',
          collegeId: college.id,
          phone: '13800000000',
          status: VolunteerStatus.IN_SCHOOL,
        },
      },
    },
  });

  // 5) Child
  await prisma.user.upsert({
    where: { username: 'child_001' },
    update: {},
    create: {
      username: 'child_001',
      passwordHash,
      role: UserRole.CHILD,
      status: UserStatus.ACTIVE,
      childProfile: {
        create: {
          realName: 'Child One',
          school: 'Helping Primary School',
          grade: '3',
          gender: Gender.UNKNOWN,
        },
      },
    },
  });

  console.log('✅ Seed completed');
  console.log('Default password for seeded users:', defaultPassword);
  console.log('Seeded usernames: platform_admin, college_admin, volunteer_001, child_001');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
