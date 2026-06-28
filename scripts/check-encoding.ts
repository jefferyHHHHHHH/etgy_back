import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
import { prisma } from '../src/config/prisma';

async function main() {
  // Check charset
  const vars = await prisma.$queryRaw`SHOW VARIABLES LIKE 'character_set_%'` as any[];
  console.log('=== MySQL Charset ===');
  vars.forEach((v: any) => console.log(`  ${v.Variable_name} = ${v.Value}`));

  // Check table charset
  const tables = await prisma.$queryRawUnsafe("SHOW CREATE TABLE VideoComment") as any[];
  const ddl = tables[0]?.['Create Table'] || '';
  console.log('\n=== VideoComment charset ===');
  console.log(ddl.substring(ddl.indexOf('CHARSET') - 20, ddl.indexOf('CHARSET') + 30));

  // Check sensitive word charset
  const wordTables = await prisma.$queryRawUnsafe("SHOW CREATE TABLE SensitiveWord") as any[];
  const wddl = wordTables[0]?.['Create Table'] || '';
  console.log('\n=== SensitiveWord charset ===');
  console.log(wddl.substring(wddl.indexOf('CHARSET') - 20, wddl.indexOf('CHARSET') + 30));

  // Check a comment content
  const comments = await prisma.$queryRawUnsafe(
    "SELECT id, HEX(content) as hex_content, CHAR_LENGTH(content) as len FROM VideoComment ORDER BY id DESC LIMIT 3"
  ) as any[];
  console.log('\n=== Recent comments (hex) ===');
  comments.forEach((c: any) => console.log(`  id=${c.id} len=${c.len} hex=${c.hex_content?.substring(0, 40)}...`));

  // Check sensitive word
  const words = await prisma.$queryRawUnsafe(
    "SELECT word, HEX(word) as hex_word FROM SensitiveWord WHERE word = '傻逼' LIMIT 1"
  ) as any[];
  console.log('\n=== Sensitive word 傻逼 ===');
  words.forEach((w: any) => console.log(`  word=${w.word} hex=${w.hex_word}`));

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
