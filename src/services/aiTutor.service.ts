import redisClient from '../config/redis';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { UserRole } from '../types/enums';
import { HttpError } from '../utils/httpError';
import { ModerationService } from './moderation.service';
import { SparkService } from './spark.service';
import { AuditService } from './audit.service';

export type AiTutorMode = 'study' | 'emotion';

type RiskMatch = {
  riskType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  keywords: string[];
};

const normalizeInput = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

const toModeEnum = (mode: AiTutorMode) => {
  return mode === 'emotion' ? 'EMOTION' : 'STUDY';
};

const todayKeyUtc = () => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const secondsUntilTomorrowUtc = () => {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return Math.max(1, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
};

const detectHighRisk = (text: string): RiskMatch | null => {
  const t = text.toLowerCase();

  // Self-harm / suicide high-risk keywords (MVP). Keep conservative to reduce false positives.
  const selfHarmKeywords: string[] = [
    '自杀',
    '自残',
    '割腕',
    '跳楼',
    '上吊',
    '不想活',
    '想死',
    '结束生命',
    '活不下去',
    '想结束',
  ];

  const matched = selfHarmKeywords.filter((k) => t.includes(k));
  if (matched.length > 0) {
    return { riskType: 'SELF_HARM', severity: 'HIGH', keywords: matched };
  }

  // Extremism / violence / weapon-making (MVP keyword gate).
  const violenceKeywords: string[] = [
    '炸弹',
    '爆炸物',
    '燃烧瓶',
    '枪',
    '手枪',
    '步枪',
    '刀',
    '开枪',
    '杀人',
    '袭击',
    '恐怖',
    '恐怖袭击',
    '极端主义',
    '爆破',
  ];
  const matchedViolence = violenceKeywords.filter((k) => t.includes(k));
  if (matchedViolence.length > 0) {
    return { riskType: 'EXTREMISM_VIOLENCE', severity: 'HIGH', keywords: matchedViolence };
  }

  return null;
};

export class AiTutorService {
  static getConfig() {
    return {
      enabled: Boolean(env.AI_TUTOR_ENABLED ?? true),
      dailyLimit: Number(env.AI_TUTOR_DAILY_LIMIT ?? 5),
      maxInputLength: Number(env.AI_TUTOR_MAX_INPUT_LENGTH ?? 200),
      contextMessages: Number(env.AI_TUTOR_CONTEXT_MESSAGES ?? 8),
    };
  }

  private static async enforceDailyLimit(userId: number) {
    const { dailyLimit } = this.getConfig();
    if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) return;

    // Fail-open if Redis is unavailable (same philosophy as token blacklist).
    if (redisClient.status !== 'ready') {
      return;
    }

    const key = `ai:tutor:daily:${userId}:${todayKeyUtc()}`;
    try {
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, secondsUntilTomorrowUtc());
      }
      if (count > dailyLimit) {
        throw new HttpError(429, `今日 AI 辅导次数已达上限（${dailyLimit} 次）`);
      }
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      // Redis error: fail-open.
      return;
    }
  }

  private static systemPrompt(mode: AiTutorMode) {
    const base =
      '你是“益路同行”公益教育平台的AI辅导助手，为未成年人提供安全、温和、无广告、无导流的文本辅导。' +
      '你需要：1) 不索取/不输出个人敏感信息；2) 不提供违法或危险行为的指导；3) 遇到自伤自杀等高风险内容时，优先建议联系老师/监护人/当地紧急求助。';

    if (mode === 'emotion') {
      return (
        base +
        '当前是“情绪倾诉”模式：请先共情、安抚，再用简单问题引导表达感受；给出可执行的小步骤（呼吸、写下来、找可信赖的大人求助等）。'
      );
    }

    return (
      base +
      '当前是“学习问题”模式：请用分步骤讲解，先确认题意与已知条件，再给出清晰的解题思路与答案；尽量用儿童能理解的表达。'
    );
  }

  private static safeHighRiskResponse(riskType: string) {
    if (riskType === 'SELF_HARM') {
      return (
        '我能感受到你现在真的很难受。\n' +
        '如果你有伤害自己的想法或已经处在危险中，请马上去找身边可信赖的大人（老师/家长/亲属）陪着你，或立刻拨打当地紧急电话求助。\n' +
        '你愿意告诉我：现在让你最难受的事情是什么？我会认真听你说。'
      );
    }

    return (
      '这个话题可能涉及伤害他人或危险行为，我不能帮助你进行相关的做法、步骤或工具制作。\n' +
      '如果你是因为害怕、愤怒或压力而想到这些，请尽快和身边可信赖的大人（老师/家长）聊一聊，或者把你遇到的具体情况告诉我，我可以帮你用更安全的方式处理情绪和问题。'
    );
  }

  static async chat(params: {
    userId: number;
    mode: AiTutorMode;
    message: string;
    conversationId?: number;
    clientIp?: string;
  }) {
    const cfg = this.getConfig();
    if (!cfg.enabled) {
      throw new HttpError(403, 'AI 辅导暂未开启');
    }

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      include: { childProfile: true },
    });
    if (!user) throw new HttpError(404, 'User not found');
    if (user.role !== UserRole.CHILD) throw new HttpError(403, 'Only child accounts can use AI tutor');

    const mode: AiTutorMode = params.mode === 'emotion' ? 'emotion' : 'study';
    const textRaw = normalizeInput(params.message);

    if (!textRaw) throw new HttpError(400, 'message 不能为空');
    if (textRaw.length > cfg.maxInputLength) {
      throw new HttpError(400, `message 长度不能超过 ${cfg.maxInputLength}`);
    }

    // Daily limit first (avoid abuse).
    await this.enforceDailyLimit(params.userId);

    // High-risk detection (self-harm / extremism etc) should run before sensitive-word rejection,
    // otherwise admins may lose the alert signal when moderationAction=REJECT.
    const risk = detectHighRisk(textRaw);

    // Sensitive words policy (mask/reject) - reuse existing moderation switches.
    // For high-risk inputs we skip masking/rejecting and handle via the risk flow.
    const moderated = risk ? { text: textRaw } : await ModerationService.moderateOrThrow({ scene: 'live_qa', text: textRaw });

    // Resolve / create conversation
    const modeEnum = toModeEnum(mode);

    const conversation = await (async () => {
      if (params.conversationId) {
        const existing = await prisma.aiConversation.findUnique({ where: { id: params.conversationId } });
        if (!existing || existing.userId !== params.userId) {
          throw new HttpError(404, 'conversation not found');
        }
        // Keep mode fixed per conversation.
        return existing;
      }
      return prisma.aiConversation.create({
        data: {
          userId: params.userId,
          mode: modeEnum as any,
        },
      });
    })();

    // Persist user message
    await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'USER' as any,
        content: moderated.text,
      },
    });

    if (risk) {
      const collegeId = user.childProfile?.collegeId ?? null;
      const alert = await prisma.aiRiskAlert.create({
        data: {
          conversationId: conversation.id,
          userId: user.id,
          collegeId,
          mode: modeEnum as any,
          severity: (risk.severity ?? 'HIGH') as any,
          riskType: risk.riskType,
          inputText: moderated.text,
          matchedKeywords: risk.keywords.join(', '),
        },
      });

      await AuditService.log(
        user.id,
        'CREATE' as any,
        String(alert.id),
        'AiRiskAlert',
        `AI tutor risk detected: ${risk.riskType}`,
        params.clientIp
      );

      const assistantText = this.safeHighRiskResponse(risk.riskType);

      await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT' as any,
          content: assistantText,
        },
      });

      return {
        conversationId: conversation.id,
        risk: {
          triggered: true,
          riskType: risk.riskType,
          severity: risk.severity,
          alertId: alert.id,
        },
        answer: assistantText,
      };
    }

    // Load context messages
    const ctx = await prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { id: 'desc' },
      take: Math.max(0, cfg.contextMessages),
    });

    const messages = [
      { role: 'system' as const, content: this.systemPrompt(mode) },
      ...ctx
        .reverse()
        .map((m) => ({
          role: m.role === ('ASSISTANT' as any) ? ('assistant' as const) : m.role === ('SYSTEM' as any) ? ('system' as const) : ('user' as const),
          content: m.content,
        })),
    ];

    // Call Spark HTTP (OpenAI-compatible)
    const resp = await SparkService.chatCompletions({
      messages,
      stream: false,
      temperature: mode === 'emotion' ? 0.7 : 0.3,
      max_tokens: 800,
    });

    const assistantText =
      resp?.choices?.[0]?.message?.content ??
      resp?.choices?.[0]?.delta?.content ??
      resp?.choices?.[0]?.text ??
      '';

    const finalText = normalizeInput(assistantText) || '我暂时没能生成回答，你可以换一种说法再问我一次。';

    await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT' as any,
        content: finalText,
      },
    });

    return {
      conversationId: conversation.id,
      risk: { triggered: false },
      answer: finalText,
    };
  }

  static async listConversations(params: { userId: number; page: number; pageSize: number }) {
    const page = Math.max(params.page || 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 50);
    const skip = (page - 1) * pageSize;

    const where = { userId: params.userId };

    const [total, items] = await Promise.all([
      prisma.aiConversation.count({ where }),
      prisma.aiConversation.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          messages: {
            orderBy: { id: 'desc' },
            take: 1,
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((c) => ({
        id: c.id,
        mode: c.mode,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessage: c.messages?.[0] ? { role: c.messages[0].role, content: c.messages[0].content } : null,
      })),
    };
  }

  static async getConversation(params: { userId: number; conversationId: number }) {
    const convo = await prisma.aiConversation.findUnique({
      where: { id: params.conversationId },
      include: {
        messages: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!convo || convo.userId !== params.userId) {
      throw new HttpError(404, 'conversation not found');
    }

    return convo;
  }

  static async listRiskAlerts(params: {
    viewerUserId: number;
    viewerRole: UserRole;
    viewerCollegeId?: number;
    status?: 'OPEN' | 'HANDLED';
    collegeId?: number;
    page: number;
    pageSize: number;
  }) {
    const page = Math.max(params.page || 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (params.status) {
      where.status = params.status;
    }

    // College admin can only see its own.
    if (params.viewerRole === UserRole.COLLEGE_ADMIN) {
      if (!params.viewerCollegeId) {
        throw new HttpError(403, 'College scope missing');
      }
      where.collegeId = params.viewerCollegeId;
    } else if (params.viewerRole === UserRole.PLATFORM_ADMIN) {
      if (params.collegeId) where.collegeId = params.collegeId;
    } else {
      throw new HttpError(403, 'Forbidden');
    }

    const [total, items] = await Promise.all([
      prisma.aiRiskAlert.count({ where }),
      prisma.aiRiskAlert.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, username: true, role: true, childProfile: true } },
          college: true,
          handledByUser: { select: { id: true, username: true, role: true } },
        },
      }),
    ]);

    return { page, pageSize, total, items };
  }

  static async handleRiskAlert(params: {
    viewerUserId: number;
    viewerRole: UserRole;
    viewerCollegeId?: number;
    id: number;
    note?: string;
    clientIp?: string;
  }) {
    const alert = await prisma.aiRiskAlert.findUnique({ where: { id: params.id } });
    if (!alert) throw new HttpError(404, 'Risk alert not found');

    // Scope enforcement
    if (params.viewerRole === UserRole.COLLEGE_ADMIN) {
      if (!params.viewerCollegeId || alert.collegeId !== params.viewerCollegeId) {
        throw new HttpError(403, 'Forbidden');
      }
    } else if (params.viewerRole !== UserRole.PLATFORM_ADMIN) {
      throw new HttpError(403, 'Forbidden');
    }

    const updated = await prisma.aiRiskAlert.update({
      where: { id: params.id },
      data: {
        status: 'HANDLED' as any,
        handledAt: new Date(),
        handledBy: params.viewerUserId,
        handleNote: params.note?.trim() || null,
      },
    });

    await AuditService.log(
      params.viewerUserId,
      'UPDATE' as any,
      String(updated.id),
      'AiRiskAlert',
      'Marked as handled',
      params.clientIp
    );

    return updated;
  }
}
