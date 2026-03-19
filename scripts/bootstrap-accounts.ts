import { PrismaClient, UserRole, UserStatus, Gender, VolunteerStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

type Env = {
	NODE_ENV?: string;
	BOOTSTRAP_PASSWORD?: string;
	BOOTSTRAP_COLLEGE_NAME?: string;
	BOOTSTRAP_FORCE_PROD?: string;
};

function isTrue(value: string | undefined) {
	return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}

async function main() {
	const env = process.env as Env;
	const nodeEnv = env.NODE_ENV ?? 'development';
	if (nodeEnv === 'production' && !isTrue(env.BOOTSTRAP_FORCE_PROD)) {
		throw new Error(
			'❌ Refusing to bootstrap accounts in production. Set BOOTSTRAP_FORCE_PROD=true if you really want to do this.'
		);
	}

	const collegeName = env.BOOTSTRAP_COLLEGE_NAME ?? 'Default College';
	const password = env.BOOTSTRAP_PASSWORD ?? '123456';
	const passwordHash = await bcrypt.hash(password, 10);

	const college = await prisma.college.upsert({
		where: { name: collegeName },
		update: {},
		create: { name: collegeName, isActive: true, sortOrder: 0 },
	});

	// Platform admin
	await prisma.user.upsert({
		where: { username: 'platform' },
		update: {
			passwordHash,
			role: UserRole.PLATFORM_ADMIN,
			status: UserStatus.ACTIVE,
		},
		create: {
			username: 'platform',
			passwordHash,
			role: UserRole.PLATFORM_ADMIN,
			status: UserStatus.ACTIVE,
			adminProfile: {
				create: {
					realName: '平台管理员',
					collegeId: null,
				},
			},
		},
	});

	// College admin
	await prisma.user.upsert({
		where: { username: 'admin' },
		update: {
			passwordHash,
			role: UserRole.COLLEGE_ADMIN,
			status: UserStatus.ACTIVE,
		},
		create: {
			username: 'admin',
			passwordHash,
			role: UserRole.COLLEGE_ADMIN,
			status: UserStatus.ACTIVE,
			adminProfile: {
				create: {
					realName: '学院管理员',
					collegeId: college.id,
				},
			},
		},
	});

	// Volunteer
	await prisma.user.upsert({
		where: { username: 'volunteer' },
		update: {
			passwordHash,
			role: UserRole.VOLUNTEER,
			status: UserStatus.ACTIVE,
		},
		create: {
			username: 'volunteer',
			passwordHash,
			role: UserRole.VOLUNTEER,
			status: UserStatus.ACTIVE,
			volunteerProfile: {
				create: {
					realName: '志愿者',
					studentId: 'VOL0001',
					collegeId: college.id,
					phone: '13800000000',
					gender: Gender.UNKNOWN,
					status: VolunteerStatus.IN_SCHOOL,
				},
			},
		},
	});

	// Child account
	await prisma.user.upsert({
		where: { username: '王夕晨' },
		update: {
			passwordHash,
			role: UserRole.CHILD,
			status: UserStatus.ACTIVE,
		},
		create: {
			username: '王夕晨',
			passwordHash,
			role: UserRole.CHILD,
			status: UserStatus.ACTIVE,
			childProfile: {
				create: {
					realName: '王夕晨',
					school: '未填写',
					grade: '未填写',
					gender: Gender.UNKNOWN,
					collegeId: college.id,
				},
			},
		},
	});

	console.log('✅ Bootstrap accounts completed');
	console.log(`- College: ${collegeName} (id=${college.id})`);
	console.log('- Users: platform / admin / volunteer / 王夕晨');
	console.log(`- Password: ${password}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
