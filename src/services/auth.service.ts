import { prisma } from '../config/prisma';
import { generateToken, generateWechatBindToken, verifyWechatBindToken } from '../utils/token';
// import { UserRole } from '@prisma/client';
import { UserRole, UserStatus } from '../types/enums';
import bcrypt from 'bcryptjs';
import { WechatProvider } from '../types/enums';
import { WechatService } from './wechat.service';
import { HttpError } from '../utils/httpError';

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

  /**
   * WeChat Mini Program one-tap login.
   * - If openId is already bound: returns JWT token + user.
   * - Otherwise: returns bindRequired + bindToken (short-lived).
   */
  static async wechatMiniProgramLogin(code: string) {
    const { appId } = WechatService.getMiniProgramConfig();
    const session = await WechatService.miniProgramCodeToSession(code);

    const account = await prisma.wechatAccount.findUnique({
      where: {
        provider_appId_openId: {
          provider: WechatProvider.MINI_PROGRAM,
          appId,
          openId: session.openId,
        },
      },
      include: { user: true },
    });

    if (!account) {
      return {
        bindRequired: true,
        bindToken: generateWechatBindToken({ appId, openId: session.openId, unionId: session.unionId }),
      };
    }

    if (account.user.status === UserStatus.SUSPENDED) {
      throw new HttpError(403, 'Account suspended');
    }

    // Activate on first successful login (same as password login semantics)
    if (account.user.status === UserStatus.INACTIVE) {
      await prisma.user.update({
        where: { id: account.user.id },
        data: { status: UserStatus.ACTIVE },
      });
    }

    const token = generateToken({
      userId: account.user.id,
      role: account.user.role,
      username: account.user.username,
    });

    return { bindRequired: false, token, user: account.user };
  }

  /**
   * Bind a WeChat Mini Program openId to an existing account.
   * MVP rule (PRD): only child accounts should be bound for mini program usage.
   */
  static async wechatMiniProgramBind(params: { bindToken: string; username: string; password: string }) {
    const decoded = verifyWechatBindToken(params.bindToken);
    const { appId } = WechatService.getMiniProgramConfig();
    if (decoded.appId !== appId) {
      throw new HttpError(400, 'Bind token app mismatch');
    }

    // Verify credentials (and auto-activate if INACTIVE)
    const loginResult = await this.login(params.username, params.password);

    if (loginResult.user.role !== UserRole.CHILD) {
      throw new HttpError(403, 'Only child accounts can be bound to WeChat mini program in current version');
    }

    // Ensure openId not already bound to another user
    const existing = await prisma.wechatAccount.findUnique({
      where: {
        provider_appId_openId: {
          provider: WechatProvider.MINI_PROGRAM,
          appId,
          openId: decoded.openId,
        },
      },
    });
    if (existing && existing.userId !== loginResult.user.id) {
      throw new HttpError(409, 'This WeChat account is already bound to another user');
    }

    await prisma.wechatAccount.upsert({
      where: {
        provider_appId_openId: {
          provider: WechatProvider.MINI_PROGRAM,
          appId,
          openId: decoded.openId,
        },
      },
      create: {
        provider: WechatProvider.MINI_PROGRAM,
        appId,
        openId: decoded.openId,
        unionId: decoded.unionId,
        userId: loginResult.user.id,
      },
      update: {
        unionId: decoded.unionId,
        userId: loginResult.user.id,
      },
    });

    return loginResult;
  }
}
