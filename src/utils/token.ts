import jwt from 'jsonwebtoken';
// import { UserRole } from '@prisma/client'; 
import { UserRole } from '../types/enums';
import { env } from '../config/env';

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN;

export interface TokenPayload {
  userId: number;
  role: UserRole;
  username: string; // for convenience
}

export interface WechatBindTokenPayload {
  purpose: 'wechat_mp_bind';
  appId: string;
  openId: string;
  unionId?: string;
}

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign({ ...payload }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};

export const generateWechatBindToken = (payload: Omit<WechatBindTokenPayload, 'purpose'>): string => {
  return jwt.sign({ purpose: 'wechat_mp_bind', ...payload }, JWT_SECRET, {
    expiresIn: env.WECHAT_MP_BIND_TOKEN_EXPIRE_SECONDS,
  } as jwt.SignOptions);
};

export const verifyWechatBindToken = (token: string): WechatBindTokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET) as Partial<WechatBindTokenPayload>;
  if (decoded.purpose !== 'wechat_mp_bind' || !decoded.appId || !decoded.openId) {
    throw new Error('Invalid bind token');
  }
  return decoded as WechatBindTokenPayload;
};

export const getTokenTtlSeconds = (token: string): number => {
  const decoded = jwt.decode(token) as null | { exp?: number };
  if (!decoded?.exp) {
    // Fallback: 7 days
    return 7 * 24 * 60 * 60;
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.max(decoded.exp - nowSeconds, 0);
};
