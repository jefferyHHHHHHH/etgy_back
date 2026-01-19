import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import OssService from '../services/oss.service';
import { HttpError } from '../utils/httpError';

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
}
