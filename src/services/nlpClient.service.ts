/**
 * Layer 2 NLP 审核客户端
 * 通过 HTTP POST 调用 Python FastAPI 微服务进行文本安全审核
 *
 * 架构:
 *   Node.js (Express)  ──HTTP POST──▶  Python FastAPI (Layer2 NLP)
 *   本文件为 Node.js 端的 HTTP 客户端
 */

import { env } from '../config/env';

export interface NlpCheckRequest {
  commentId: string;
  userId: string;
  text: string;
  scene: string;
}

export interface NlpCheckResult {
  decision: 'PASS' | 'REVIEW';
  risk_score: number;
  model_version: string;
  reason_tags: string[];
  latency_ms: number;
}

let _nlpServiceUrl: string | null = null;

function getNlpServiceUrl(): string {
  if (_nlpServiceUrl !== null) return _nlpServiceUrl;
  _nlpServiceUrl = env.LAYER2_NLP_URL || '';
  return _nlpServiceUrl;
}

/** 设置 NLP 服务地址（用于测试/动态切换） */
export function setNlpServiceUrl(url: string): void {
  _nlpServiceUrl = url;
}

/**
 * Layer 2 NLP 审核检查
 * 调用 Python 微服务进行 AI 文本安全评估
 *
 * @returns NlpCheckResult 或 null（服务不可用时返回 null，由调用方决定降级策略）
 */
export async function nlpCheck(params: {
  commentId: string;
  userId: string;
  text: string;
  scene?: string;
}): Promise<NlpCheckResult | null> {
  const baseUrl = getNlpServiceUrl();

  // 未配置 NLP 服务地址时，静默降级（所有内容放行）
  if (!baseUrl) {
    console.warn('[Layer2] NLP service URL not configured, skipping NLP check');
    return null;
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/moderation/nlp-check`;

  const body: NlpCheckRequest = {
    commentId: params.commentId,
    userId: params.userId,
    text: params.text,
    scene: params.scene || 'video_comment',
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s 超时

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      console.error(`[Layer2] NLP service returned ${resp.status}: ${await resp.text().catch(() => '')}`);
      return null; // 降级放行
    }

    const data = (await resp.json()) as NlpCheckResult;
    return data;
  } catch (err: any) {
    // 网络错误、超时等 → 降级放行，避免阻塞用户操作
    if (err.name === 'AbortError') {
      console.error('[Layer2] NLP service timeout');
    } else {
      console.error(`[Layer2] NLP service error: ${err.message}`);
    }
    return null;
  }
}

/**
 * 健康检查：检测 NLP 服务是否可用
 */
export async function nlpHealthCheck(): Promise<boolean> {
  const baseUrl = getNlpServiceUrl();
  if (!baseUrl) return false;

  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/healthz`, {
      signal: AbortSignal.timeout(3000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
