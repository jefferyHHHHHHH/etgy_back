# Dify.cloud 集成 + SSE 流式响应 — MVP 最小化落地方案

> **目标**：用最少代码让 AI 辅导流式对话跑通。敏感词、高危检测、每日限额等风控功能全部通过开关关闭，保留占位钩子，后续按需逐一开启。

---

## MVP 范围（本次）

```
✅ Dify Chatflow SSE 流式接入
✅ 打字机效果逐字透传到前端
✅ 会话管理（创建/多轮对话）
✅ 消息持久化（USER / ASSISTANT）
✅ Dify 未配置时 fallback 到 Spark
✅ compression / rateLimit 跳过 SSE（基础设施修复）

⏸️ 敏感词过滤      → 开关关闭，占位保留
⏸️ 高危内容检测    → 开关关闭，占位保留
⏸️ 每日限额        → 开关关闭，占位保留
⏸️ 审计日志        → 开关关闭，占位保留
⏸️ 视频→Whisper    → 仅一行注释占位
```

---

## 架构（MVP 简化版）

```
App (Client)
  │  POST /api/ai/tutor/chat/stream  (Accept: text/event-stream)
  ▼
Express Backend
  ├─ authMiddleware → validateBody → AiController
  └─ AiTutorService.chatStream()
      ├─ 校验：角色、输入长度
      ├─ [占位/关闭] 高危检测、敏感词、每日限额
      ├─ 创建/查找会话
      ├─ 持久化用户消息
      ├─ 调用 DifyService.chatflowStream() → 逐 chunk 透传
      └─ 持久化 AI 回复
```

---

## 实施步骤

```
Step 1  → src/app.ts                   compression + rateLimit 跳过 SSE
Step 2  → prisma/schema.prisma         AiConversation 加 difyConversationId + provider 字段
Step 3  → npx prisma migrate dev       执行迁移
Step 4  → src/config/env.ts            新增 Dify + 风控开关环境变量
Step 5  → .env.example                 同步模板
Step 6  → src/utils/sse.ts             新建：SSE 写入器 + 心跳
Step 7  → src/services/dify.service.ts 新建：Dify API 封装
Step 8  → src/services/aiTutor.service.ts 新增 chatStream()，风控全部开关化
Step 9  → src/controllers/ai.controller.ts 新增 chatTutorStream()
Step 10 → src/routes/ai.routes.ts      新增 SSE 路由 + OpenAPI
Step 11 → src/services/videoPipeline.service.ts 新建：一行占位
```

---

## Step 1: `src/app.ts` — compression + rateLimit 跳过 SSE

### 1.1 compression filter（修改现有 `app.use(compression())` 行，约第 106 行）

```typescript
// 修改前:
app.use(compression());

// 修改后:
app.use(compression({
  filter: (req, _res) => {
    // SSE 流式端点不能被压缩——压缩会缓冲整个响应体，阻塞打字机效果
    if (req.path.startsWith('/api/ai/tutor/chat/stream')) return false;
    if (req.headers.accept?.includes('text/event-stream')) return false;
    return compression.filter(req, _res);
  },
}));
```

### 1.2 rateLimit skip（修改 rateLimit 配置，约第 112-120 行）

```typescript
app.use('/api', rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS ?? 60 * 1000,
  limit: env.RATE_LIMIT_MAX ?? (isProd ? 120 : 1000),
  standardHeaders: true,
  legacyHeaders: false,
  // ★ 新增：
  skip: (req) => req.path === '/api/ai/tutor/chat/stream',
}));
```

---

## Step 2-3: Prisma Schema 扩展

### 2.1 `prisma/schema.prisma` — 修改 AiConversation 模型（约第 455-467 行）

只加两个字段，其余不变：

```prisma
model AiConversation {
  id                 Int         @id @default(autoincrement())
  userId             Int
  user               User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  mode               AiTutorMode
  // ★ MVP 新增
  difyConversationId String?     // Dify 侧 conversation_id (UUID)
  provider           String?     @default("spark") // "dify" | "spark"

  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  messages           AiMessage[]
  riskAlerts          AiRiskAlert[]

  @@index([userId, updatedAt])
}
```

### 2.2 执行迁移

```bash
npx prisma migrate dev --name add_dify_conversation_id
```

> `AiMessage` 不在此次加 `metadata` 字段——MVP 不需要。后续有需求时再加。

---

## Step 4: 环境变量

### 4.1 `src/config/env.ts` — 在 Zod schema 中新增

在 Spark 配置块之后添加：

```typescript
// ========== Dify (AI orchestration) ==========
DIFY_BASE_URL: z.string().url().default('https://api.dify.ai/v1'),
DIFY_CHATFLOW_API_KEY: z.string().min(1).optional(),
DIFY_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),

// ========== AI Tutor 风控开关（MVP 阶段全部关闭，后续按需开启）==========
AI_TUTOR_MODERATION_ENABLED: z.coerce.boolean().default(false),
AI_TUTOR_RISK_DETECTION_ENABLED: z.coerce.boolean().default(false),
AI_TUTOR_DAILY_LIMIT_ENABLED: z.coerce.boolean().default(false),
AI_TUTOR_AUDIT_ENABLED: z.coerce.boolean().default(false),
```

### 4.2 `.env.example` — 末尾追加

```bash
# Dify.cloud (AI 编排平台)
DIFY_BASE_URL=https://api.dify.ai/v1
DIFY_CHATFLOW_API_KEY=
DIFY_HTTP_TIMEOUT_MS=60000

# AI Tutor 风控开关（生产环境上线前全部开启为 true）
AI_TUTOR_MODERATION_ENABLED=false
AI_TUTOR_RISK_DETECTION_ENABLED=false
AI_TUTOR_DAILY_LIMIT_ENABLED=false
AI_TUTOR_AUDIT_ENABLED=false
```

---

## Step 5: `.env.example` 同步

同 Step 4.2，已完成。

---

## Step 6: `src/utils/sse.ts` — SSE 写入工具（新建）

```typescript
import { Response } from 'express';

/**
 * 初始化 SSE 响应头，必须在任何 res.write() 之前调用。
 * ★ 前置条件：compression 已通过 Phase 0 的 filter 跳过此路由。
 */
export function initSSE(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',          // 禁用 Nginx 代理缓冲
  });
  res.flushHeaders();
}

/**
 * 发送一个 SSE 命名事件。
 * 多行 data 自动拆为多条 "data:" 行，符合 SSE 规范。
 */
export function sendSSEEvent(res: Response, event: string, data: unknown): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  let lines = `event: ${event}\n`;
  for (const line of payload.split('\n')) {
    lines += `data: ${line}\n`;
  }
  lines += '\n';   // 空行终止
  res.write(lines);
}

/** SSE 心跳注释行（客户端不触发 onmessage） */
export function sendHeartbeat(res: Response): void {
  res.write(': heartbeat\n\n');
}

/** 结束 SSE 流 */
export function endSSE(res: Response): void {
  res.end();
}

/**
 * 启动心跳定时器，返回 cleanup 函数。
 * R1 推理可能 10-30 秒无 token 输出，心跳防止 CDN/代理超时断连。
 */
export function startHeartbeat(res: Response, intervalMs = 15000): () => void {
  const timer = setInterval(() => {
    try { sendHeartbeat(res); } catch { clearInterval(timer); }
  }, intervalMs);
  return () => clearInterval(timer);
}
```

---

## Step 7: `src/services/dify.service.ts` — Dify API 封装（新建）

```typescript
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
```

---

## Step 8: `src/services/aiTutor.service.ts` — 新增 chatStream()（改造现有文件）

### 8.1 文件顶部新增 import

```typescript
import { DifyService } from './dify.service';
import { initSSE, sendSSEEvent, endSSE, startHeartbeat } from '../utils/sse';
```

### 8.2 在 `AiTutorService` 类中新增以下方法

> **不删除任何现有代码**，`chat()` 方法完全保留不动。新增代码追加在现有方法之后。

```typescript
// ── Provider 判断 ─────────────────────────────────────────

private static useDify(): boolean {
  return !!(env.DIFY_CHATFLOW_API_KEY?.trim());
}

// ── 风控开关（MVP 阶段全部返回 false，即关闭）────────────

private static moderationEnabled(): boolean {
  return env.AI_TUTOR_MODERATION_ENABLED === true;
}

private static riskDetectionEnabled(): boolean {
  return env.AI_TUTOR_RISK_DETECTION_ENABLED === true;
}

private static dailyLimitEnabled(): boolean {
  return env.AI_TUTOR_DAILY_LIMIT_ENABLED === true;
}

private static auditEnabled(): boolean {
  return env.AI_TUTOR_AUDIT_ENABLED === true;
}

// ── SSE 流式对话（MVP 核心）──────────────────────────────

/**
 * SSE 流式 AI 辅导对话。
 * MVP 阶段：只做基础校验 + Dify/Spark 调用。风控全部走开关，默认关闭。
 */
static async chatStream(params: {
  userId: number;
  mode: AiTutorMode;
  message: string;
  conversationId?: number;
  clientIp?: string;
  res: Response;
}): Promise<void> {
  const { res } = params;
  const cfg = this.getConfig();

  // ════════════════════════════════════════════════
  // Phase A: 基础校验（可返回 JSON 错误）
  // ════════════════════════════════════════════════

  // A1. 开关
  if (!cfg.enabled) {
    throw new HttpError(403, 'AI 辅导暂未开启');
  }

  // A2. 角色
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
  });
  if (!user) throw new HttpError(404, 'User not found');
  if (user.role !== UserRole.CHILD) {
    throw new HttpError(403, 'Only child accounts can use AI tutor');
  }

  // A3. 输入
  const mode: AiTutorMode = params.mode === 'emotion' ? 'emotion' : 'study';
  const textRaw = normalizeInput(params.message);
  if (!textRaw) throw new HttpError(400, 'message 不能为空');
  if (textRaw.length > cfg.maxInputLength) {
    throw new HttpError(400, `message 长度不能超过 ${cfg.maxInputLength}`);
  }

  // A4. [开关] 每日限额
  if (this.dailyLimitEnabled()) {
    await this.enforceDailyLimit(params.userId);
  }

  // A5. [开关] 高危检测 — MVP 关闭，走正常对话路径
  let riskText = textRaw;
  if (this.riskDetectionEnabled()) {
    const risk = detectHighRisk(riskText);
    if (risk) {
      // TODO: 开启后走本地安全回复（当前占位，直接 fallthrough 到正常对话）
    }
  }

  // A6. [开关] 敏感词审核 — MVP 关闭，原文透传
  if (this.moderationEnabled()) {
    const moderated = await ModerationService.moderateOrThrow({
      scene: 'live_qa',
      text: riskText,
    });
    riskText = moderated.text;
  }

  // A7. 创建/查找会话
  const modeEnum = toModeEnum(mode);
  const conversation = await (async () => {
    if (params.conversationId) {
      const existing = await prisma.aiConversation.findUnique({
        where: { id: params.conversationId },
      });
      if (!existing || existing.userId !== params.userId) {
        throw new HttpError(404, 'conversation not found');
      }
      return existing;
    }
    return prisma.aiConversation.create({
      data: { userId: params.userId, mode: modeEnum as any },
    });
  })();

  // A8. 持久化用户消息
  await prisma.aiMessage.create({
    data: {
      conversationId: conversation.id,
      role: 'USER' as any,
      content: riskText,
    },
  });

  // ════════════════════════════════════════════════
  // Phase B: 打开 SSE + 流式对话
  // ════════════════════════════════════════════════

  const existingDifyCid: string | undefined =
    (conversation as any).difyConversationId || undefined;

  let fullText = '';
  let usageMeta: any = null;

  initSSE(res);
  const cleanupHeartbeat = startHeartbeat(res);

  // 客户端断开 → 取消上游
  const abortController = new AbortController();
  const onClose = () => abortController.abort();
  res.on('close', onClose);

  try {
    if (this.useDify()) {
      // ── Dify 路径 ────────────────────────────────
      const { stream, difyConversationId: newCid } = await DifyService.chatflowStream({
        query: riskText,
        user: String(params.userId),
        conversationId: existingDifyCid,
        inputs: { mode },
        signal: abortController.signal,
      });

      // 首次请求回填 Dify conversation_id
      if (newCid && !existingDifyCid) {
        await prisma.aiConversation.update({
          where: { id: conversation.id },
          data: { difyConversationId: newCid, provider: 'dify' },
        });
      }

      // 逐 chunk 读取 Dify SSE → 透传
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              // 只处理 message / message_end / error 三种事件（MVP 最小集）
              const evt = parsed.event;
              if (evt === 'message' && parsed.answer) {
                fullText += parsed.answer;
                sendSSEEvent(res, 'text_chunk', { content: parsed.answer });
              } else if (evt === 'message_end') {
                if (parsed.metadata?.usage) usageMeta = parsed.metadata.usage;
              } else if (evt === 'error') {
                sendSSEEvent(res, 'error', {
                  code: parsed.code || 'DIFY_ERROR',
                  message: parsed.message || 'Dify workflow error',
                });
              }
              // workflow_started / node_started / ping / etc → 忽略
            } catch { /* 非 JSON 行忽略 */ }
          }
        }
      }
    } else {
      // ── Spark 降级路径 ───────────────────────────
      const ctx = await prisma.aiMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { id: 'desc' },
        take: Math.max(0, cfg.contextMessages),
      });

      const messages = [
        { role: 'system' as const, content: this.systemPrompt(mode) },
        ...ctx.reverse().map((m) => ({
          role: m.role === ('ASSISTANT' as any) ? ('assistant' as const)
            : m.role === ('SYSTEM' as any) ? ('system' as const)
            : ('user' as const),
          content: m.content,
        })),
      ];

      const resp = await SparkService.chatCompletions({
        messages,
        stream: false,
        temperature: mode === 'emotion' ? 0.7 : 0.3,
        max_tokens: 800,
      });

      const assistantText =
        resp?.choices?.[0]?.message?.content ??
        resp?.choices?.[0]?.delta?.content ??
        resp?.choices?.[0]?.text ?? '';
      fullText = normalizeInput(assistantText) || '我暂时没能生成回答，你可以换一种说法再问我一次。';

      // 模拟逐字输出（保持前端 SSE 消费格式统一）
      for (const char of fullText) {
        sendSSEEvent(res, 'text_chunk', { content: char });
      }
    }

    // ════════════════════════════════════════════════
    // Phase C: 持久化 + 发送 text_complete
    // ════════════════════════════════════════════════

    sendSSEEvent(res, 'text_complete', {
      full_text: fullText,
      metadata: usageMeta || {},
    });

    // 持久化 AI 回复
    if (fullText) {
      await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'ASSISTANT' as any,
          content: fullText,
        },
      });
    }

    // [开关] 审计日志
    if (this.auditEnabled()) {
      await AuditService.log(
        params.userId,
        'CREATE' as any,
        String(conversation.id),
        'AiMessage',
        `AI tutor streaming (mode=${mode}, provider=${this.useDify() ? 'dify' : 'spark'})`,
        params.clientIp,
      ).catch(() => {});
    }

  } catch (err: any) {
    const errorMessage =
      err instanceof HttpError ? err.message : 'AI 服务暂时不可用，请稍后再试';
    sendSSEEvent(res, 'error', {
      code: err instanceof HttpError ? String(err.statusCode) : 'UNKNOWN',
      message: errorMessage,
    });
  } finally {
    res.off('close', onClose);
    cleanupHeartbeat();
    sendSSEEvent(res, 'done', {});
    endSSE(res);
  }
}
```

### 8.3 关键设计说明

| 决策 | 理由 |
|------|------|
| MVP 只处理 `message` / `message_end` / `error` 三种事件 | 前端只需要打字机效果，workflow 内部节点事件对 MVP 无价值 |
| `text_complete` 在流结束后外层统一发送 | 避免 `message_end` 时 `fullText` 还未收集完的问题 |
| 风控每个功能独立开关 | 后续逐个开启时互不影响 |
| 高危检测开启后 `if (risk)` 分支目前占位 | 开启后需要补上安全回复逻辑（复用现有 `safeHighRiskResponse`） |
| 不删除 Spark 降级路径 | 未配 Dify 时自动回退，零配置即可跑通已有的非流式逻辑 |

---

## Step 9: `src/controllers/ai.controller.ts` — 新增方法

在类末尾（最后一个方法 `handleRiskAlert` 之后）追加：

```typescript
/**
 * POST /api/ai/tutor/chat/stream
 * SSE 流式 AI 辅导对话
 */
static async chatTutorStream(req: Request, res: Response) {
  try {
    await AiTutorService.chatStream({
      userId: req.user!.userId,
      mode: req.body.mode,
      message: req.body.message,
      conversationId: req.body.conversationId,
      clientIp: req.ip,
      res,
    });
    // ★ service 已经直接操作 res 完成 SSE，此处不调用 res.json()
  } catch (err: any) {
    // SSE header 未发送时 = Phase A 校验错误，返回 JSON
    if (!res.headersSent) {
      if (err instanceof HttpError) {
        return fail(res, err.message, err.statusCode);
      }
      return fail(res, 'Internal server error', 500);
    }
  }
}
```

---

## Step 10: `src/routes/ai.routes.ts` — 新增路由

### 10.1 路由注册（放在 `router.post('/tutor/chat', ...)` 之后）

```typescript
// SSE 流式对话
router.post(
  '/tutor/chat/stream',
  authMiddleware,
  requireRole([UserRole.CHILD]),
  validateBody(tutorChatBodySchema),
  AiController.chatTutorStream,
);
```

### 10.2 OpenAPI 注册（放在文件末尾 `export default router;` 之前）

```typescript
registerPath({
  method: 'post',
  path: '/api/ai/tutor/chat/stream',
  summary: 'AI 辅导流式对话 (SSE)',
  description:
    '通过 SSE 协议实现打字机效果的流式 AI 对话。' +
    '事件: text_chunk, text_complete, error, done。',
  tags: ['AI'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: tutorChatBodySchema } } },
  },
  responses: {
    200: { description: 'SSE 事件流 (text/event-stream)' },
    400: { description: 'Bad Request', content: { 'application/json': { schema: ErrorResponseSchema } } },
    401: { description: 'Unauthorized', content: { 'application/json': { schema: ErrorResponseSchema } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: ErrorResponseSchema } } },
  },
});
```

---

## Step 11: `src/services/videoPipeline.service.ts` — 占位（新建）

```typescript
/**
 * 视频异步处理流水线 — MVP 阶段仅占位。
 *
 * [TODO] 后续实现：
 *   1. ffmpeg 提取音频
 *   2. 入队 Redis Queue
 *   3. Whisper 语音识别 → 带时间戳文稿
 *   4. Dify 知识库 API 批量导入切片
 *   5. 更新视频处理状态
 */
export class VideoPipelineService {
  static async onVideoUploaded(_videoId: number): Promise<void> {
    // 占位 — 后续在此触发异步流水线
  }
}
```

---

## SSE 事件协议（MVP 最小集）

| 事件 | 触发 | payload |
|------|------|---------|
| `text_chunk` | LLM 逐 token | `{ "content": "同" }` |
| `text_complete` | 回答结束 | `{ "full_text": "同学你好...", "metadata": {} }` |
| `error` | 异常 | `{ "code": "...", "message": "..." }` |
| `done` | 流结束 | `{}` |

前端消费示例：

```
event:text_chunk
data:{"content":"同"}

event:text_chunk
data:{"content":"学"}

event:text_complete
data:{"full_text":"同学你好！","metadata":{}}

event:done
data:{}
```

---

## 启动验证

### 1. 编译检查

```bash
npx tsc --noEmit
```

### 2. 启动后端

```bash
npm run dev
```

### 3. 测试 SSE 端点（需替换有效 JWT）

```bash
curl -N -X POST http://localhost:3000/api/ai/tutor/chat/stream \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <valid_jwt_token>' \
  -d '{"mode":"study","message":"什么是光合作用"}'
```

预期：逐行输出 `data:{"content":"..."}` 格式的 SSE 数据。

### 4. 未配 Dify 时 Spark 降级测试

`.env` 中 `DIFY_CHATFLOW_API_KEY=` 留空，再次调用端点，验证 Spark 非流式回答通过模拟逐字输出正常返回。

---

## 风控功能开启清单（后续迭代）

当需要开启某个风控功能时，只需改环境变量 + 确认占位代码逻辑：

| 功能 | 环境变量 | 设为 `true` 后的行为 |
|------|----------|---------------------|
| 每日限额 | `AI_TUTOR_DAILY_LIMIT_ENABLED=true` | 复用 `enforceDailyLimit()`，Redis INCR |
| 高危检测 | `AI_TUTOR_RISK_DETECTION_ENABLED=true` | `detectHighRisk()` + `safeHighRiskResponse()` 拦截 |
| 敏感词过滤 | `AI_TUTOR_MODERATION_ENABLED=true` | `ModerationService.moderateOrThrow()` REJECT/MASK |
| 审计日志 | `AI_TUTOR_AUDIT_ENABLED=true` | `AuditService.log()` 持久化操作记录 |

---

## 与你需要确认的信息

| # | 问题 | 影响 |
|---|------|------|
| 1 | Dify 平台已有 Chatflow 工作流？如果没有，可以用 Dify 的默认 Chatflow 模板快速建一个 | 后端代码不依赖工作流具体配置，任何能接受 `query` + 返回 SSE 的 Chatflow 都可以 |
| 2 | Dify Chatflow 的 `inputs` 变量名叫什么？（本方案用 `mode`） | 如果叫别的名字，改 `inputs: { mode }` 这一行即可 |
| 3 | `.env` 中的 `DIFY_CHATFLOW_API_KEY` 实际值 | 没配就走 Spark 降级，不影响功能 |

**回答完这 3 个问题（或者直接说"先按默认来"），我立刻开始逐个文件落地。**
