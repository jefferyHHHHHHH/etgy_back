import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { ModerationService } from '../src/services/moderation.service';

async function main() {
  console.log('=== 直接测试 ModerationService ===\n');

  // 清缓存
  ModerationService.bustCache();

  // 查词库
  const words = await ModerationService.getActiveWords();
  console.log(`词库总数: ${words.length}`);
  console.log(`包含'傻逼': ${words.includes('傻逼')}`);
  console.log(`包含'海洛因': ${words.includes('海洛因')}`);

  // 查策略
  const policy = await ModerationService.getPolicy();
  console.log(`策略: moderationAction=${policy.moderationAction} commentsEnabled=${policy.commentsEnabled}`);

  // 测试1: 含'傻逼'
  console.log('\n--- 测试: 傻逼 ---');
  try {
    const r = await ModerationService.moderateOrThrow({
      scene: 'video_comment', text: '你真是个傻逼', enabledCheck: 'comments',
    });
    console.log('❌ 通过了! (预期拦截)');
  } catch (e: any) {
    console.log(`✅ 拦截: ${e.statusCode} ${e.message}`);
  }

  // 测试2: 正常
  console.log('\n--- 测试: 正常评论 ---');
  try {
    const r = await ModerationService.moderateOrThrow({
      scene: 'video_comment', text: '这个视频很不错', enabledCheck: 'comments',
    });
    console.log('✅ 通过 (预期)');
  } catch (e: any) {
    console.log(`❌ 被拦截: ${e.statusCode} ${e.message}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
