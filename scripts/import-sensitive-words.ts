/*
 * 敏感词库一键导入脚本
 * 读取 D:\project\etgy_projects\敏感词库\ 下所有 .txt 文件
 * 合并、去重、清理 → 写入 SensitiveWord 表
 *
 * Usage: npx ts-node scripts/import-sensitive-words.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const { prisma } = await import('../src/config/prisma');

  const LIB_DIR = 'D:\\project\\etgy_projects\\敏感词库';

  const files = fs.readdirSync(LIB_DIR).filter((f) => f.endsWith('.txt'));
  console.log(`发现 ${files.length} 个词库文件:\n`);

  // 1. 读取所有文件并合并
  const rawWords: string[] = [];
  for (const file of files) {
    const filePath = path.join(LIB_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')); // 跳过空行和注释

    console.log(`  ${file}: ${lines.length} 条`);
    rawWords.push(...lines);
  }

  console.log(`\n合并总计: ${rawWords.length} 条`);

  // 2. 去重 + 排序
  const uniqueWords = [...new Set(rawWords)]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));

  console.log(`去重后: ${uniqueWords.length} 条`);

  // 3. 显示样本
  console.log('\n样本 (前20条):');
  uniqueWords.slice(0, 20).forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  console.log('  ...');
  console.log(`  ${uniqueWords.length - 10}-${uniqueWords.length}. (后10条):`);
  uniqueWords.slice(-10).forEach((w, i) => console.log(`  ${uniqueWords.length - 9 + i}. ${w}`));

  // 4. 确认
  console.log(`\n⚠ 即将清空现有 ${await prisma.sensitiveWord.count()} 条敏感词`);
  console.log(`⚠ 并导入 ${uniqueWords.length} 条去重后的敏感词`);
  console.log('按 Ctrl+C 取消，或继续...');

  // 等待3秒
  await new Promise((r) => setTimeout(r, 3000));

  // 5. 清空旧数据 + 批量导入
  console.log('\n清空旧数据...');
  await prisma.sensitiveWord.deleteMany();

  console.log('导入中...');
  let imported = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < uniqueWords.length; i += BATCH_SIZE) {
    const batch = uniqueWords.slice(i, i + BATCH_SIZE);
    await prisma.sensitiveWord.createMany({
      data: batch.map((word) => ({ word, isActive: true })),
      skipDuplicates: true,
    });
    imported += batch.length;
    process.stdout.write(`\r  进度: ${imported}/${uniqueWords.length} (${Math.round((imported / uniqueWords.length) * 100)}%)`);
  }

  console.log('\n');

  // 6. 验证
  const count = await prisma.sensitiveWord.count({ where: { isActive: true } });
  console.log(`✅ 导入完成! 当前活跃敏感词: ${count} 条`);

  // 7. 确保评论开启 + REJECT 策略
  const policy = await prisma.contentPolicy.findFirst({ orderBy: { id: 'asc' } });
  if (policy) {
    await prisma.contentPolicy.update({
      where: { id: policy.id },
      data: { commentsEnabled: true, moderationAction: 'REJECT' as any },
    });
    console.log('✅ 审核策略已更新: commentsEnabled=true, moderationAction=REJECT');
  }

  await prisma.$disconnect();
  console.log('\n完成!');
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
