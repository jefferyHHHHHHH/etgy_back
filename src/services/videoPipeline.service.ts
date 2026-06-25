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
