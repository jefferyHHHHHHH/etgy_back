import bcrypt from 'bcryptjs';
import { UserRole } from '../types/enums';
import { HttpError } from './httpError';
import { decryptPassword } from './passwordCipher';

/** Roles whose plaintext password may be stored in passwordEnc for admin reveal. */
export const ROLES_WITH_RECOVERABLE_PASSWORD = new Set<UserRole>([
  UserRole.CHILD,
  UserRole.VOLUNTEER,
  UserRole.COLLEGE_ADMIN,
]);

export function revealStoredPassword(passwordEnc: string | null | undefined): string {
  if (!passwordEnc) {
    throw new HttpError(409, '密码不可查看：未记录可恢复密码，请通过「修改密码」重新设置');
  }
  try {
    return decryptPassword(passwordEnc);
  } catch {
    throw new HttpError(409, '密码不可查看：密码记录已损坏，请通过「修改密码」重新设置');
  }
}

/** Decrypt passwordEnc and verify it matches the live passwordHash. */
export async function revealStoredPasswordWithHashCheck(
  passwordEnc: string | null | undefined,
  passwordHash: string
): Promise<string> {
  const password = revealStoredPassword(passwordEnc);
  const ok = await bcrypt.compare(password, passwordHash);
  if (!ok) {
    throw new HttpError(
      409,
      '密码不可查看：记录与当前账号不一致（可能曾自助改密或历史数据不同步），请通过「修改密码」重新设置'
    );
  }
  return password;
}
