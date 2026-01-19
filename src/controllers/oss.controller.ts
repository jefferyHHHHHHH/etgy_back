import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import OssService from '../services/oss.service';
import { HttpError } from '../utils/httpError';
import fs from 'fs/promises';

export class OssController {
  /**
   * POST /api/oss/upload-url
   * Returns a presigned PUT URL for direct upload.
   */
  static async createUploadUrl(req: Request, res: Response) {
    try {
      const { key, prefix, filename, contentType, expiresInSeconds } = req.body as {
        key?: string;
        prefix?: string;
        filename?: string;
        contentType?: string;
        expiresInSeconds?: number;
      };

      let finalKey = key?.trim();
      if (!finalKey) {
        const safePrefix = (prefix ?? 'uploads').replace(/^\/+/, '').replace(/\/+$/, '');
        const ext = filename && filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
        finalKey = `${safePrefix}/${Date.now()}-${randomUUID()}${ext}`;
      }

      const result = await OssService.presignPutObject({
        key: finalKey,
        contentType,
        expiresInSeconds,
      });

      return res.status(200).json({
        code: 200,
        message: 'Success',
        data: result,
      });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  /**
   * POST /api/oss/upload/images | /api/oss/upload/videos
   * Backend receives multipart file and uploads to S3-compatible storage.
   */
  static async uploadFile(req: Request, res: Response) {
    try {
      const folder = (req.params.folder as 'images' | 'videos') || 'images';
      if (folder !== 'images' && folder !== 'videos') {
        throw new HttpError(400, 'folder must be images or videos');
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) throw new HttpError(400, 'file is required');

      const { key, purpose, expiresInSeconds } = req.body as {
        key?: string;
        purpose?: string;
        expiresInSeconds?: number;
      };

      const finalKey = key?.trim()
        ? key.trim()
        : OssService.generateKey({
            folder,
            purpose,
            originalName: file.originalname,
            contentType: file.mimetype,
          });

      await OssService.putObjectFromFile({
        key: finalKey,
        filePath: file.path,
        contentType: file.mimetype,
      });

      // cleanup temp file
      await fs.unlink(file.path).catch(() => undefined);

      // Provide an immediate preview/play URL (private bucket), for convenience.
      const urlResult = await OssService.getPlayableUrl({
        keyOrUrl: finalKey,
        expiresInSeconds: expiresInSeconds ? Number(expiresInSeconds) : undefined,
      });

      return res.status(200).json({
        code: 200,
        message: 'Success',
        data: {
          folder,
          key: finalKey,
          contentType: file.mimetype,
          size: file.size,
          url: urlResult.url,
          expiresInSeconds: urlResult.expiresInSeconds,
        },
      });
    } catch (error: any) {
      // cleanup temp file on failure too
      const file = (req as any).file as Express.Multer.File | undefined;
      if (file?.path) {
        await fs.unlink(file.path).catch(() => undefined);
      }

      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }

  /**
   * GET /api/oss/url?keyOrUrl=...
   * Returns a presigned GET URL for private objects.
   */
  static async getUrl(req: Request, res: Response) {
    try {
      const { keyOrUrl, expiresInSeconds } = req.query as {
        keyOrUrl?: string;
        expiresInSeconds?: string;
      };

      if (!keyOrUrl) throw new HttpError(400, 'keyOrUrl is required');

      const result = await OssService.getPlayableUrl({
        keyOrUrl,
        expiresInSeconds: expiresInSeconds ? Number(expiresInSeconds) : undefined,
      });

      return res.status(200).json({
        code: 200,
        message: 'Success',
        data: { url: result.url, expiresInSeconds: result.expiresInSeconds },
      });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ code: error.statusCode, message: error.message });
      }
      return res.status(400).json({ code: 400, message: error.message });
    }
  }
}
