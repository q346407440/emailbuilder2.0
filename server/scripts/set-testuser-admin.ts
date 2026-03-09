/**
 * 将 testuser@test.com 设为 admin（is_admin = true），用于「保存到公共」测试。
 * 执行：cd server && DATABASE_URL=... npx tsx scripts/set-testuser-admin.ts
 */

import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('请设定 DATABASE_URL');
  process.exit(1);
}

const TESTUSER_EMAIL = 'testuser@test.com';

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const res = await client.query(
    "UPDATE users SET is_admin = true WHERE email = $1 RETURNING id, email",
    [TESTUSER_EMAIL]
  );
  await client.end();
  if (res.rowCount === 0) {
    console.warn(`未找到用户 ${TESTUSER_EMAIL}，请先注册该账号或检查数据库`);
    process.exit(0);
  }
  console.log(`已将 ${TESTUSER_EMAIL} 设为 admin`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
