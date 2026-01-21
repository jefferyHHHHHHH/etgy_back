import { prisma } from '../config/prisma';
import { ModerationAction } from '../types/enums';
import { HttpError } from '../utils/httpError';

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
}
