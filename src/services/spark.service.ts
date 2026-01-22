import crypto from 'crypto';
import { env } from '../config/env';
import { HttpError } from '../utils/httpError';

export type SparkChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type SparkChatMessage = {
  role: SparkChatRole;
  content: string;
};

export type SparkChatCompletionsRequest = {
  model?: string;
  messages: SparkChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
};

export class SparkService {
  static getHttpConfig() {
    const endpoint = (env.SPARK_HTTP_ENDPOINT ?? '').trim();
    const apiPassword = (env.SPARK_HTTP_API_PASSWORD ?? '').trim();
    const model = (env.SPARK_HTTP_MODEL ?? '').trim() || '4.0Ultra';

    if (!endpoint) {
      throw new HttpError(400, 'Spark HTTP not configured: set SPARK_HTTP_ENDPOINT');
    }
    if (!apiPassword) {
      throw new HttpError(400, 'Spark HTTP not configured: set SPARK_HTTP_API_PASSWORD');
    }

    return { endpoint, apiPassword, model };
  }

  /**
   * Spark HTTP OpenAPI (OpenAI-compatible) chat completions.
   * Note: streaming (SSE) is not handled here; keep stream=false for now.
   */
  static async chatCompletions(req: SparkChatCompletionsRequest) {
    const { endpoint, apiPassword, model: defaultModel } = this.getHttpConfig();

    const payload = {
      model: (req.model ?? defaultModel).trim(),
      messages: req.messages,
      stream: Boolean(req.stream ?? false),
      ...(typeof req.temperature === 'number' ? { temperature: req.temperature } : {}),
      ...(typeof req.max_tokens === 'number' ? { max_tokens: req.max_tokens } : {}),
    };

    if (!payload.messages?.length) {
      throw new HttpError(400, 'messages is required');
    }
    if (payload.stream) {
      throw new HttpError(400, 'stream=true is not supported in this endpoint wrapper yet');
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiPassword}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let json: any;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!resp.ok) {
      const msg = (json && (json.error?.message || json.message)) || `Spark HTTP request failed: HTTP ${resp.status}`;
      throw new HttpError(502, msg);
    }

    return json;
  }

  static getWsConfig() {
    const wsUrl = (env.SPARK_WS_URL ?? '').trim();
    const appId = (env.SPARK_WS_APP_ID ?? '').trim();
    const apiKey = (env.SPARK_WS_API_KEY ?? '').trim();
    const apiSecret = (env.SPARK_WS_API_SECRET ?? '').trim();

    if (!wsUrl || !appId || !apiKey || !apiSecret) {
      throw new HttpError(
        400,
        'Spark WebSocket not configured: set SPARK_WS_URL, SPARK_WS_APP_ID, SPARK_WS_API_KEY, SPARK_WS_API_SECRET'
      );
    }

    return { wsUrl, appId, apiKey, apiSecret };
  }

  /**
   * Generate signed Spark WebSocket URL using iFlytek generic URL authentication.
   * This only builds the URL; it does not open a WS connection.
   */
  static buildSignedWsUrl() {
    const { wsUrl, apiKey, apiSecret } = this.getWsConfig();

    const u = new URL(wsUrl);
    const host = u.host;
    const path = u.pathname;

    const date = new Date().toUTCString();
    const signing = `host: ${host}\n` + `date: ${date}\n` + `GET ${path} HTTP/1.1`;

    const signature = crypto.createHmac('sha256', apiSecret).update(signing).digest('base64');
    const authorizationOrigin =
      `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');

    u.searchParams.set('authorization', authorization);
    u.searchParams.set('date', date);
    u.searchParams.set('host', host);

    return u.toString();
  }
}
