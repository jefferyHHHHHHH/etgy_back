import { prisma } from '../config/prisma';
import { CommentStatus, ModerationAction } from '../types/enums';
import { HttpError } from '../utils/httpError';
import { nlpCheck, nlpHealthCheck } from './nlpClient.service';
import { env } from '../config/env';

export type ContentScene = 'video_comment' | 'live_chat' | 'live_qa';

export type ContentPolicyDTO = {
  commentsEnabled: boolean;
  liveChatEnabled: boolean;
  moderationAction: ModerationAction;
  updatedAt: string;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class ModerationService {
  private static policyCache?: { value: ContentPolicyDTO; expiresAt: number };
  private static wordsCache?: { value: string[]; expiresAt: number };

  // Keep TTL small so dashboard changes apply quickly without forcing Redis.
  private static readonly CACHE_TTL_MS = 10_000;

  static async getPolicy(): Promise<ContentPolicyDTO> {
    const now = Date.now();
    if (this.policyCache && this.policyCache.expiresAt > now) {
      return this.policyCache.value;
    }

    const row = await prisma.contentPolicy.findFirst({ orderBy: { id: 'asc' } });
    const policy =
      row ??
      (await prisma.contentPolicy.create({
        data: {
          commentsEnabled: true,
          liveChatEnabled: true,
          moderationAction: ModerationAction.REJECT,
        },
      }));

    const dto: ContentPolicyDTO = {
      commentsEnabled: policy.commentsEnabled,
      liveChatEnabled: policy.liveChatEnabled,
      moderationAction: policy.moderationAction as ModerationAction,
      updatedAt: policy.updatedAt.toISOString(),
    };

    this.policyCache = { value: dto, expiresAt: now + this.CACHE_TTL_MS };
    return dto;
  }

  static async updatePolicy(patch: {
    commentsEnabled?: boolean;
    liveChatEnabled?: boolean;
    moderationAction?: ModerationAction;
  }): Promise<ContentPolicyDTO> {
    const current = await prisma.contentPolicy.findFirst({ orderBy: { id: 'asc' } });

    const updated = current
      ? await prisma.contentPolicy.update({
          where: { id: current.id },
          data: {
            ...(typeof patch.commentsEnabled === 'boolean' ? { commentsEnabled: patch.commentsEnabled } : {}),
            ...(typeof patch.liveChatEnabled === 'boolean' ? { liveChatEnabled: patch.liveChatEnabled } : {}),
            ...(patch.moderationAction ? { moderationAction: patch.moderationAction } : {}),
          },
        })
      : await prisma.contentPolicy.create({
          data: {
            commentsEnabled: patch.commentsEnabled ?? true,
            liveChatEnabled: patch.liveChatEnabled ?? true,
            moderationAction: patch.moderationAction ?? ModerationAction.REJECT,
          },
        });

    // Bust caches so changes take effect immediately.
    this.policyCache = undefined;

    return {
      commentsEnabled: updated.commentsEnabled,
      liveChatEnabled: updated.liveChatEnabled,
      moderationAction: updated.moderationAction as ModerationAction,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  static async getActiveWords(): Promise<string[]> {
    const now = Date.now();
    if (this.wordsCache && this.wordsCache.expiresAt > now) {
      return this.wordsCache.value;
    }

    const rows = await prisma.sensitiveWord.findMany({
      where: { isActive: true },
      select: { word: true },
      orderBy: [{ word: 'asc' }],
    });

    // Prefer longer first to reduce partial masking when words overlap.
    const words = rows
      .map((r: { word: string }) => r.word)
      .map((w: string) => w.trim())
      .filter(Boolean)
      .sort((a: string, b: string) => b.length - a.length || a.localeCompare(b));

    this.wordsCache = { value: words, expiresAt: now + this.CACHE_TTL_MS };
    return words;
  }

  static async moderateOrThrow(params: {
    scene: ContentScene;
    text: string;
    enabledCheck?: 'comments' | 'liveChat';
  }): Promise<{ text: string }>
  {
    const policy = await this.getPolicy();

    if (params.enabledCheck === 'comments' && !policy.commentsEnabled) {
      throw new HttpError(403, 'Comments are disabled by platform');
    }

    if (params.enabledCheck === 'liveChat' && !policy.liveChatEnabled) {
      throw new HttpError(403, 'Live chat is disabled by platform');
    }

    const text = (params.text ?? '').trim();
    if (!text) {
      return { text };
    }

    const words = await this.getActiveWords();
    if (!words.length) {
      return { text };
    }

    const matched: string[] = [];
    for (const w of words) {
      if (!w) continue;
      if (text.includes(w)) matched.push(w);
    }

    if (!matched.length) {
      return { text };
    }

    if (policy.moderationAction === ModerationAction.REJECT) {
      throw new HttpError(400, 'Content contains sensitive words');
    }

    // MASK
    let masked = text;
    for (const w of matched) {
      const replacementLen = Math.min(8, Math.max(3, w.length));
      const replacement = '*'.repeat(replacementLen);
      masked = masked.replace(new RegExp(escapeRegExp(w), 'g'), replacement);
    }

    return { text: masked };
  }

  static bustCache() {
    this.policyCache = undefined;
    this.wordsCache = undefined;
  }

  /**
   * 三层审核管道：Layer 1 (规则+词库) → Layer 2 (NLP模型) → Layer 3 (人工审核)
   *
   * 流程:
   *   1. Layer 1: 敏感词匹配
   *      - REJECT 模式 + 命中 → 直接拦截，返回 { action: 'REJECT' }
   *      - MASK 模式 + 命中 → 脱敏后继续到 Layer 2
   *      - 未命中 → 继续到 Layer 2
   *   2. Layer 2: NLP 模型评估
   *      - PASS → 返回 { action: 'APPROVE', text }
   *      - REVIEW → 返回 { action: 'PENDING', text } 等待人工审核
   *      - 服务不可用 → 降级为 PASS（避免阻塞用户）
   *
   * @returns moderation result with recommended CommentStatus
   */
  static async evaluateContentRisk(params: {
    scene: ContentScene;
    text: string;
    enabledCheck?: 'comments' | 'liveChat';
    commentId: string;
    userId: string;
  }): Promise<{
    action: 'APPROVE' | 'PENDING';
    text: string;
    riskScore?: number;
    reasonTags?: string[];
  }>
  {
    // ========== Layer 1: 敏感词 + 规则过滤 ==========
    const policy = await this.getPolicy();

    if (params.enabledCheck === 'comments' && !policy.commentsEnabled) {
      throw new HttpError(403, 'Comments are disabled by platform');
    }
    if (params.enabledCheck === 'liveChat' && !policy.liveChatEnabled) {
      throw new HttpError(403, 'Live chat is disabled by platform');
    }

    let text = (params.text ?? '').trim();
    if (!text) {
      return { action: 'APPROVE', text };
    }

    const words = await this.getActiveWords();
    let matchedWords: string[] = [];

    if (words.length > 0) {
      for (const w of words) {
        if (!w) continue;
        if (text.includes(w)) matchedWords.push(w);
      }
    }

    // Layer 1 REJECT: 明显违规直接拦截
    if (matchedWords.length > 0 && policy.moderationAction === ModerationAction.REJECT) {
      throw new HttpError(400, 'Content contains sensitive words');
    }

    // Layer 1 MASK: 脱敏后继续下级审核
    if (matchedWords.length > 0) {
      for (const w of matchedWords) {
        const replacementLen = Math.min(8, Math.max(3, w.length));
        const replacement = '*'.repeat(replacementLen);
        text = text.replace(new RegExp(escapeRegExp(w), 'g'), replacement);
      }
    }

    // ========== Layer 2: NLP 模型初判 ==========
    if (!env.LAYER2_NLP_ENABLED) {
      // NLP 未启用时降级：全部放行到人工审核
      return {
        action: 'PENDING',
        text,
        reasonTags: matchedWords.length > 0 ? ['sensitive_word_masked'] : [],
      };
    }

    const nlpResult = await nlpCheck({
      commentId: params.commentId,
      userId: params.userId,
      text,
      scene: params.scene,
    });

    if (!nlpResult) {
      // NLP 服务不可用 → 降级策略：放行（记录日志，避免阻塞用户）
      console.warn('[Moderation] Layer 2 NLP unavailable, falling back to PASS');
      return {
        action: 'APPROVE',
        text,
        reasonTags: matchedWords.length > 0 ? ['sensitive_word_masked', 'nlp_fallback'] : ['nlp_fallback'],
      };
    }

    const nlpDecision: 'APPROVE' | 'PENDING' = nlpResult.decision === 'PASS' ? 'APPROVE' : 'PENDING';

    // 合并 Layer 1 + Layer 2 的标签
    const reasonTags: string[] = [];
    if (matchedWords.length > 0) reasonTags.push('sensitive_word_masked');
    reasonTags.push(...nlpResult.reason_tags.filter((t) => t !== 'none'));

    return {
      action: nlpDecision,
      text,
      riskScore: nlpResult.risk_score,
      reasonTags,
    };
  }
}
