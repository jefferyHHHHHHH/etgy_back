import { env } from '../config/env';
import { HttpError } from '../utils/httpError';

export class DifyService {

  private static getConfig() {
    const baseUrl = (env.DIFY_BASE_URL ?? '').replace(/\/+$/, '');
    const apiKey = (env.DIFY_CHATFLOW_API_KEY ?? '').trim();
    const timeoutMs = Number(env.DIFY_HTTP_TIMEOUT_MS ?? 60000);

    if (!baseUrl) throw new HttpError(500, 'Dify not configured: DIFY_BASE_URL');
    if (!apiKey) throw new HttpError(500, 'Dify not configured: DIFY_CHATFLOW_API_KEY');

    return { baseUrl, apiKey, timeoutMs };
  }

  /**
   * 调用 Dify Chatflow 工作流，返回 SSE 原始字节流。
   *
   * @param params.user          — Dify 字段名是 "user"（用于会话隔离，非 "userId"）
   * @param params.conversationId — Dify 侧的 conversation_id（UUID），首次为空
   * @param params.signal         — 外部 AbortSignal（客户端断开时取消）
   */
  static async chatflowStream(params: {
    query: string;
    user: string;
    conversationId?: string;
    inputs?: Record<string, any>;
    signal?: AbortSignal;
  }): Promise<{ stream: ReadableStream<Uint8Array>; difyConversationId: string }> {
    const { baseUrl, apiKey, timeoutMs } = this.getConfig();

    const body: Record<string, any> = {
      query: params.query,
      user: params.user,
      response_mode: 'streaming',      // ★ 关键
      inputs: params.inputs ?? {},
      auto_generate_name: false,
    };
    if (params.conversationId) {
      body.conversation_id = params.conversationId;
    }

    // 超时 + 外部 signal 合并
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    // 手动串联两个 signal（兼容 es2020 target）
    const onExternalAbort = () => timeoutController.abort();
    params.signal?.addEventListener('abort', onExternalAbort, { once: true });

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat-messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: timeoutController.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      params.signal?.removeEventListener('abort', onExternalAbort);
      if (err.name === 'AbortError') {
        throw new HttpError(504, 'Dify request timed out or was aborted');
      }
      throw new HttpError(502, `Dify request failed: ${err.message}`);
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      params.signal?.removeEventListener('abort', onExternalAbort);
      let errorMsg = `Dify HTTP ${response.status}`;
      try {
        const errBody = await response.text();
        const errJson = JSON.parse(errBody);
        errorMsg = errJson.message || errJson.error || errorMsg;
      } catch { /* ignore */ }
      throw new HttpError(502, errorMsg);
    }

    const difyConversationId =
      response.headers.get('X-Conversation-Id') ||
      response.headers.get('x-conversation-id') ||
      '';

    if (!response.body) {
      clearTimeout(timeoutId);
      params.signal?.removeEventListener('abort', onExternalAbort);
      throw new HttpError(502, 'Dify returned empty response body');
    }

    // 包装 stream：结束时清理 timeout 和 listener
    const reader = response.body.getReader();
    const wrappedStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err: any) {
          controller.error(err);
        } finally {
          clearTimeout(timeoutId);
          params.signal?.removeEventListener('abort', onExternalAbort);
        }
      },
      cancel() {
        reader.cancel();
        clearTimeout(timeoutId);
        params.signal?.removeEventListener('abort', onExternalAbort);
      },
    });

    return { stream: wrappedStream, difyConversationId };
  }
}
