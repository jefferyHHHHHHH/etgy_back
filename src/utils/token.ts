import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
// import { UserRole } from '@prisma/client'; 
import { UserRole } from '../types/enums';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_please_change';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface TokenPayload {
  userId: number;
  role: UserRole;
  username: string; // for convenience
}

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign({ ...payload }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
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
