import { prisma } from '../server';
import { generateToken } from '../utils/token';
// import { UserRole } from '@prisma/client';
import { UserRole } from '../types/enums';
// import bcrypt from 'bcrypt'; // TODO: Install bcrypt

export class AuthService {
  /**
   * Mock Login for MVP (Real implementation needs bcrypt comparison)
   */
  static async login(username: string, role: UserRole) {
    // 1. Find User
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // 2. Validate Role (Optional strict check)
    if (user.role !== role) {
      throw new Error('Role mismatch');
    }

    // 3. Generate Token
    const token = generateToken({
      userId: user.id,
      role: user.role,
      username: user.username,
    });

    return { token, user };
  }

  /**
   * Mock Register for MVP (Just creates base user)
   */
  static async register(username: string, role: UserRole) {
    // Check if exists
    const existing = await prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      throw new Error('Username already exists');
    }

    // Create User
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash: 'hashed_password_placeholder', // TODO: Use bcrypt
        role,
        status: 'ACTIVE',
      },
    });

    return user;
  }
}
