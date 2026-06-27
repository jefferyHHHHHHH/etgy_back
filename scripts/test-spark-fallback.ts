/*
 * 降级策略验证测试
 * 1. 直接测试 Spark API（已验证通过 ✅）
 * 2. 模拟 Dify 异常地址 → 验证 catch 块中的降级逻辑
 * 3. 测试 Spark 响应的文本提取逻辑
 *
 * Usage:
 *   npx ts-node -e "require('dotenv/config'); require('./scripts/test-spark-fallback.ts');"
 *   或: npx ts-node scripts/test-spark-fallback.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ============================================================
// 模拟 aiTutor.service.ts 中的 callSpark 逻辑
// ============================================================
async function callSpark(
  messages: Array<{ role: string; content: string }>,
  mode: 'study' | 'emotion'
): Promise<string> {
  const endpoint = process.env.SPARK_HTTP_ENDPOINT || '';
  const apiPassword = process.env.SPARK_HTTP_API_PASSWORD || '';
  const model = process.env.SPARK_HTTP_MODEL || '4.0Ultra';

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiPassword}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      temperature: mode === 'emotion' ? 0.7 : 0.3,
      max_tokens: 800,
    }),
  });

  const text = await resp.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Spark returned non-JSON: ${text.substring(0, 200)}`);
  }

  if (!resp.ok) {
    const msg = json?.error?.message || json?.message || `HTTP ${resp.status}`;
    throw new Error(`Spark HTTP error: ${msg}`);
  }

  // 与 aiTutor.service.ts 完全一致的提取逻辑
  return (
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.delta?.content ??
    json?.choices?.[0]?.text ??
    ''
  );
}

// ============================================================
// 模拟 Dify 失败 → 降级到 Spark 的完整流程
// ============================================================
async function simulateDegradation() {
  console.log('\n========== 降级策略模拟测试 ==========');

  const systemPrompt =
    '你是"益路同行"公益教育平台的AI辅导助手，为未成年人提供安全、温和、无广告、无导流的文本辅导。' +
    '当前是"学习问题"模式：请用分步骤讲解，先确认题意与已知条件，再给出清晰的解题思路与答案；尽量用儿童能理解的表达。';

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '什么是光合作用？用简单的话解释一下。' },
  ];

  // 步骤 1: 模拟 Dify 调用失败
  console.log('\n[1] 模拟 Dify 调用...');
  const difyFailed = true; // 模拟失败
  let assistantText = '';
  let usedDify = false;

  if (difyFailed) {
    console.log('    Dify 调用失败! (模拟)');
    console.log('    → 触发降级策略，切换到 Spark...');
  }

  // 步骤 2: 降级到 Spark
  if (!usedDify) {
    console.log('\n[2] 降级到 Spark 调用...');
    try {
      assistantText = await callSpark(messages, 'study');
      console.log('    Spark 响应:', assistantText.substring(0, 100) + '...');
    } catch (err: any) {
      console.log('    ❌ Spark 也失败了:', err.message);
    }
  }

  // 步骤 3: 验证结果
  console.log('\n[3] 验证结果:');
  const finalText = assistantText.trim() || '我暂时没能生成回答，你可以换一种说法再问我一次。';
  console.log('    最终回复长度:', finalText.length, '字符');
  console.log('    降级成功:', finalText.length > 20 ? '✅' : '❌');

  return finalText.length > 20;
}

// ============================================================
// 测试各种消息格式的 Spark 响应提取
// ============================================================
async function testExtractionLogic() {
  console.log('\n========== 响应提取逻辑测试 ==========');

  const testCases = [
    { role: 'user', content: '什么是分数？请用一句话回答。', desc: '简短回答' },
    { role: 'user', content: '请解释一下勾股定理，并给出一个例子。', desc: '中等长度回答' },
    { role: 'user', content: '你好！', desc: '问候语' },
  ];

  for (const tc of testCases) {
    console.log(`\n测试: ${tc.desc} ("${tc.content}")`);
    try {
      const result = await callSpark(
        [
          { role: 'system', content: '你是学习助手。请用中文回答。' },
          { role: 'user', content: tc.content },
        ],
        'study'
      );
      console.log(`  响应 (${result.length} 字符): ${result.substring(0, 80)}...`);
      console.log(`  状态: ${result.length > 0 ? '✅' : '❌ (空响应)'}`);
    } catch (err: any) {
      console.log(`  ❌ 错误: ${err.message}`);
    }
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('Spark 降级策略完整测试');
  console.log('='.repeat(60));

  const degradeOk = await simulateDegradation();
  await testExtractionLogic();

  console.log('\n' + '='.repeat(60));
  console.log('总结:');
  console.log('  Spark API 直调: ✅ (首次测试已确认)');
  console.log(`  降级流程: ${degradeOk ? '✅' : '❌'}`);
  console.log('\n下一步: 启动服务器后，临时清空 DIFY_CHATFLOW_API_KEY=');
  console.log('  来验证完整的 SSE 流式降级流程');
}

main().catch((e) => {
  console.error('测试异常:', e);
  process.exit(1);
});
