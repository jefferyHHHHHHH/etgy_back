import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { Prisma } from '@prisma/client';
import { generateDeviceBindToken, generateToken, generateWechatBindToken, verifyDeviceBindToken, verifyWechatBindToken } from '../utils/token';
// import { UserRole } from '@prisma/client';
import { UserRole, UserStatus } from '../types/enums';
import bcrypt from 'bcryptjs';
import { WechatProvider } from '../types/enums';
import { WechatService } from './wechat.service';
import { HttpError } from '../utils/httpError';

export type DeviceInfo = {
  platform?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
};

export class AuthService {
  private static isMissingTable(err: unknown, tableName: string) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (err.code !== 'P2021') return false;
    const metaTable = (err.meta as any)?.table as string | undefined;
    return metaTable === tableName || String(err.message || '').includes(tableName);
  }

  /**
   * Password-based login
   */
  static async login(
    username: string,
    password: string,
    role?: UserRole,
    options?: { deviceId?: string; deviceInfo?: DeviceInfo; skipDeviceBinding?: boolean }
  ) {
    // 1. Find User
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new HttpError(401, 'User not found');
    }

    // Status checks
    if (user.status === UserStatus.SUSPENDED) {
      throw new HttpError(403, 'Account suspended');
    }

    // 2. Optional strict check if role is provided by client
    if (role && user.role !== role) {
      throw new HttpError(403, 'Role mismatch');
    }

    // 3. Validate Password
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, 'Invalid credentials');
    }

    // PRD: accounts may be pre-created; first successful login activates the account.
    if (user.status === UserStatus.INACTIVE) {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: UserStatus.ACTIVE },
      });
    }

    const { deviceId, deviceInfo, skipDeviceBinding } = options ?? {};

    // Child device binding (app): two-step flow
    if (env.CHILD_DEVICE_BINDING_ENABLED && user.role === UserRole.CHILD && !skipDeviceBinding) {
      if (!deviceId) {
        // Keep backward compatibility for non-app callers (e.g. WeChat bind, admin tools)
        // by allowing login without device binding when deviceId is omitted.
      } else {
        let bindingTableAvailable = true;
        let binding: { deviceId: string } | null = null;
        try {
          binding = await prisma.userDeviceBinding.findUnique({
            where: { userId: user.id },
            select: { deviceId: true },
          });
        } catch (err) {
          // If the DB schema is not synced (missing table), do NOT block login.
          // This usually means the target DB didn't run `prisma db push` after schema update.
          if (this.isMissingTable(err, 'UserDeviceBinding')) {
            // eslint-disable-next-line no-console
            console.warn('Device binding table missing; skip device binding checks. Please run `prisma db push` on the target DB.');
            bindingTableAvailable = false;
            binding = null;
          } else {
            throw err;
          }
        }

    // If table doesn't exist, we cannot enforce device binding. Allow login.
    if (!bindingTableAvailable) {
      // Root fix: sync DB schema so the table exists.
    } else if (!binding) {
      const { passwordHash: _passwordHash, ...safeUser } = user;
      return {
        bindRequired: true as const,
        bindToken: generateDeviceBindToken({ userId: user.id, deviceId }),
        user: safeUser,
      };
    } else {
      if (binding.deviceId !== deviceId) {
        throw new HttpError(403, 'Device mismatch: please contact admin to reset device binding');
      }

      try {
        await prisma.userDeviceBinding.update({
          where: { userId: user.id },
          data: {
            lastSeenAt: new Date(),
            platform: deviceInfo?.platform,
            model: deviceInfo?.model,
            osVersion: deviceInfo?.osVersion,
            appVersion: deviceInfo?.appVersion,
          },
        });
      } catch (err) {
        if (this.isMissingTable(err, 'UserDeviceBinding')) {
          // eslint-disable-next-line no-console
          console.warn('Device binding table missing; skip updating lastSeenAt. Please run `prisma db push` on the target DB.');
        } else {
          throw err;
        }
      }
    }
      }
    }

    // 4. Generate Token
    const token = generateToken({
      userId: user.id,
      role: user.role,
      username: user.username,
    });

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return { token, user: safeUser };
  }

  /**
   * Confirm device binding using the bindToken returned from password login.
   * - If not bound: create binding and return JWT.
   * - If already bound to same device: idempotently returns JWT.
   */
  static async confirmDeviceBinding(params: { bindToken: string; deviceInfo?: DeviceInfo }) {
    if (!env.CHILD_DEVICE_BINDING_ENABLED) {
      throw new HttpError(403, 'Child device binding is disabled by configuration');
    }

    const decoded = verifyDeviceBindToken(params.bindToken);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new HttpError(404, 'User not found');
    if (user.role !== UserRole.CHILD) throw new HttpError(403, 'Only child accounts can bind device in current version');
    if (user.status === UserStatus.SUSPENDED) throw new HttpError(403, 'Account suspended');

    // Activate on first successful login semantics: binding is allowed only after successful password check,
    // but bind token could be confirmed later, so ensure user is ACTIVE.
    if (user.status === UserStatus.INACTIVE) {
      await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.ACTIVE } });
    }

    let existing: { deviceId: string } | null = null;
    try {
      existing = await prisma.userDeviceBinding.findUnique({
        where: { userId: user.id },
        select: { deviceId: true },
      });
    } catch (err) {
      if (this.isMissingTable(err, 'UserDeviceBinding')) {
        throw new HttpError(500, 'Device binding table is missing in DB. Please run `prisma db push` (or apply migrations) on the target database.');
      }
      throw err;
    }

    try {
      if (!existing) {
        await prisma.userDeviceBinding.create({
          data: {
            userId: user.id,
            deviceId: decoded.deviceId,
            platform: params.deviceInfo?.platform,
            model: params.deviceInfo?.model,
            osVersion: params.deviceInfo?.osVersion,
            appVersion: params.deviceInfo?.appVersion,
            boundAt: new Date(),
            lastSeenAt: new Date(),
          },
        });
      } else if (existing.deviceId === decoded.deviceId) {
        await prisma.userDeviceBinding.update({
          where: { userId: user.id },
          data: {
            lastSeenAt: new Date(),
            platform: params.deviceInfo?.platform,
            model: params.deviceInfo?.model,
            osVersion: params.deviceInfo?.osVersion,
            appVersion: params.deviceInfo?.appVersion,
          },
        });
      } else {
        throw new HttpError(409, 'User is already bound to another device');
      }
    } catch (err) {
      if (this.isMissingTable(err, 'UserDeviceBinding')) {
        throw new HttpError(500, 'Device binding table is missing in DB. Please run `prisma db push` (or apply migrations) on the target database.');
      }
      throw err;
    }

    const token = generateToken({ userId: user.id, role: user.role, username: user.username });
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
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
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
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
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
    const loginResult = await this.login(params.username, params.password, undefined, { skipDeviceBinding: true });

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
