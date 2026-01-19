import { prisma } from '../config/prisma';
import { generateToken } from '../utils/token';
// import { UserRole } from '@prisma/client';
import { UserRole, UserStatus } from '../types/enums';
import bcrypt from 'bcryptjs';

export class AuthService {
  /**
   * Password-based login
   */
  static async login(username: string, password: string, role?: UserRole) {
    // 1. Find User
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Status checks
    if (user.status === UserStatus.SUSPENDED) {
      throw new Error('Account suspended');
    }

    // 2. Optional strict check if role is provided by client
    if (role && user.role !== role) {
      throw new Error('Role mismatch');
    }

    // 3. Validate Password
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new Error('Invalid credentials');
    }

    // PRD: accounts may be pre-created; first successful login activates the account.
    if (user.status === UserStatus.INACTIVE) {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
      });
    }

    // 4. Generate Token
    const token = generateToken({
      userId: user.id,
      role: user.role,
      username: user.username,
    });

    return { token, user };
  }

  /**
   * Register base user (Dev helper).
   */
  static async register(username: string, password: string, role: UserRole) {
    // Check if exists
    const existing = await prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      throw new Error('Username already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create User
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role,
        status: UserStatus.ACTIVE,
      },
    });

    return user;
  }
}
