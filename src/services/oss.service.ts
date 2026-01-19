import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

class OssService {
  private client: S3Client | null = null;

  private sanitizeSegment(value: string) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return '';
    // Keep simple & safe for S3 keys
    return v.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  }

  private guessExt(params: { originalName?: string; contentType?: string }) {
    const fromName = params.originalName ? path.extname(params.originalName).toLowerCase() : '';
    if (fromName && fromName.length <= 10) return fromName;

    const ct = (params.contentType || '').toLowerCase();
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/quicktime': '.mov',
      'video/webm': '.webm',
    };
    return map[ct] || '';
  }

  /**
   * Key naming convention (recommended):
   * - images/YYYY/MM/DD/<purpose?>/<timestamp>-<uuid><ext>
   * - videos/YYYY/MM/DD/<timestamp>-<uuid><ext>
   */
  generateKey(params: {
    folder: 'images' | 'videos';
    purpose?: string;
    originalName?: string;
    contentType?: string;
  }) {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const ext = this.guessExt({ originalName: params.originalName, contentType: params.contentType });
    const base = `${Date.now()}-${randomUUID()}${ext}`;

    const safePurpose = this.sanitizeSegment(params.purpose || '');
    const segments = [params.folder, yyyy, mm, dd];
    if (params.folder === 'images' && safePurpose) segments.push(safePurpose);
    segments.push(base);
    return segments.join('/');
  }

  private ensureConfigured() {
    const missing: string[] = [];
    if (!env.OSS_ACCESS_KEY_ID) missing.push('OSS_ACCESS_KEY_ID');
    if (!env.OSS_ACCESS_KEY_SECRET) missing.push('OSS_ACCESS_KEY_SECRET');
    if (!env.OSS_BUCKET) missing.push('OSS_BUCKET');
    if (!env.OSS_REGION) missing.push('OSS_REGION');
    if (!env.OSS_ENDPOINT) missing.push('OSS_ENDPOINT');

    if (missing.length > 0) {
      throw new HttpError(500, `OSS not configured: missing ${missing.join(', ')}`);
    }
  }

  private getPresignExpiresSeconds(defaultValue = 15 * 60) {
    const v = env.OSS_PRESIGN_EXPIRES_SECONDS;
    if (!v) return defaultValue;
    // Safety: keep it within 1min..24h
    return Math.min(24 * 60 * 60, Math.max(60, v));
  }

  private normalizeKey(key: string) {
    const k = String(key || '').trim();
    if (!k) throw new HttpError(400, 'key is required');
    return k.startsWith('/') ? k.slice(1) : k;
  }

  private isHttpUrl(value: string) {
    return /^https?:\/\//i.test(value);
  }

  private getClient() {
    if (this.client) return this.client;
    this.ensureConfigured();

    const bucket = env.OSS_BUCKET!;
    const endpointUrl = new URL(env.OSS_ENDPOINT!);

    // Qiniu may provide bucket endpoint like: https://etgy.s3.cn-south-1.qiniucs.com
    // AWS SDK prefers endpoint without bucket; strip it if present.
    let endpoint = endpointUrl;
    let forcePathStyle = false;
    if (endpointUrl.hostname.toLowerCase().startsWith(`${bucket.toLowerCase()}.`)) {
      endpoint = new URL(endpointUrl.toString());
      endpoint.hostname = endpointUrl.hostname.slice(bucket.length + 1);
      forcePathStyle = false;
    }

    this.client = new S3Client({
      region: env.OSS_REGION!,
      endpoint: endpoint.toString(),
      forcePathStyle,
      credentials: {
        accessKeyId: env.OSS_ACCESS_KEY_ID!,
        secretAccessKey: env.OSS_ACCESS_KEY_SECRET!,
      },
    });

    return this.client;
  }

  /**
   * If caller passes a full URL, return it directly.
   * If caller passes an object key, return a presigned GET URL.
   */
  async getPlayableUrl(params: { keyOrUrl: string; expiresInSeconds?: number }) {
    const value = String(params.keyOrUrl || '').trim();
    if (!value) throw new HttpError(400, 'keyOrUrl is required');
    if (this.isHttpUrl(value)) return { url: value, expiresInSeconds: 0 };

    const key = this.normalizeKey(value);
    const expiresInSeconds = params.expiresInSeconds ?? this.getPresignExpiresSeconds();

    const client = this.getClient();
    const command = new GetObjectCommand({ Bucket: env.OSS_BUCKET!, Key: key });
    const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    return { url, expiresInSeconds };
  }

  async presignPutObject(params: {
    key: string;
    contentType?: string;
    expiresInSeconds?: number;
  }) {
    const key = this.normalizeKey(params.key);
    const expiresInSeconds = params.expiresInSeconds ?? this.getPresignExpiresSeconds();

    const client = this.getClient();
    const command = new PutObjectCommand({
      Bucket: env.OSS_BUCKET!,
      Key: key,
      ContentType: params.contentType,
    });
    const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

    return {
      method: 'PUT' as const,
      url,
      key,
      expiresInSeconds,
    };
  }

  async putObjectFromFile(params: { key: string; filePath: string; contentType?: string }) {
    const key = this.normalizeKey(params.key);
    const client = this.getClient();

    if (!fs.existsSync(params.filePath)) {
      throw new HttpError(400, 'upload temp file not found');
    }

    const body = fs.createReadStream(params.filePath);
    await client.send(
      new PutObjectCommand({
        Bucket: env.OSS_BUCKET!,
        Key: key,
        Body: body,
        ContentType: params.contentType,
      })
    );

    return { key };
  }

  async deleteObject(key: string) {
    const k = this.normalizeKey(key);
    const client = this.getClient();
    await client.send(new DeleteObjectCommand({ Bucket: env.OSS_BUCKET!, Key: k }));
    return true;
  }
}

export default new OssService();
