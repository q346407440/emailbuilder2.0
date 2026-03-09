/**
 * 使用 Node + pg 執行 schema.sql，不依賴 psql 命令。本機與伺服器通用。
 * 執行：cd server && DATABASE_URL=... tsx scripts/init-db.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, '../src/db/schema.sql');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('請設定 DATABASE_URL');
  process.exit(1);
}

const sql = fs.readFileSync(schemaPath, 'utf-8');
const client = new pg.Client({ connectionString: url });

async function main() {
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('建表完成');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
