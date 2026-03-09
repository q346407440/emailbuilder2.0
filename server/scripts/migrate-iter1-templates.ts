/**
 * Iteration 1 DB 遷移腳本
 * - email_templates 表加 required_variable_keys JSONB 欄位
 * - email_templates 表加 deleted_at TIMESTAMPTZ 欄位（軟刪除）
 * - 補索引
 *
 * 執行方式：
 *   cd server && npx tsx scripts/migrate-iter1-templates.ts
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: url });

  console.log('Running Iteration 1 migration...');

  try {
    await pool.query(`
      ALTER TABLE email_templates
        ADD COLUMN IF NOT EXISTS required_variable_keys JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    console.log('✓ required_variable_keys column');

    await pool.query(`
      ALTER TABLE email_templates
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
    `);
    console.log('✓ deleted_at column');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_templates_user_deleted
        ON email_templates(user_id, deleted_at);
    `);
    console.log('✓ idx_email_templates_user_deleted');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_templates_updated
        ON email_templates(updated_at DESC);
    `);
    console.log('✓ idx_email_templates_updated');

    console.log('\n✅ Migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
