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
