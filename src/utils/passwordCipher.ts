import crypto from 'crypto';
import { env } from '../config/env';

const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // recommended for GCM

function getKey(): Buffer {
  // Derive a stable 32-byte key from JWT_SECRET (keeps config minimal).
  // If JWT_SECRET rotates, historical encrypted passwords become undecryptable.
  // If that becomes a requirement, introduce a dedicated key + rotation strategy.
  return crypto.createHash('sha256').update(env.JWT_SECRET).digest().subarray(0, KEY_LEN);
}

export function encryptPassword(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // v1:<base64(iv|tag|ciphertext)>
  return `v1:${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
}

export function decryptPassword(payload: string): string {
  if (!payload) throw new Error('Empty payload');
  const [ver, b64] = payload.split(':', 2);
  if (ver !== 'v1' || !b64) throw new Error('Unsupported payload format');

  const raw = Buffer.from(b64, 'base64');
  if (raw.length < IV_LEN + 16) throw new Error('Invalid payload');

  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + 16);
  const ciphertext = raw.subarray(IV_LEN + 16);

  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}
