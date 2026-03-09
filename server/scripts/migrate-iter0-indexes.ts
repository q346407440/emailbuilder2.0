/**
 * Iteration 0 DB 遷移腳本
 * - 補齊現有表的索引
 * - 建立 refresh_tokens 表
 *
 * 執行方式：
 *   cd server && DATABASE_URL=... npx tsx scripts/migrate-iter0-indexes.ts
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: url });

  console.log('Running Iteration 0 migration...');

  try {
    // ── 補齊現有表的索引（使用正確的表名）────────────────────────────────────
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
    `);
    console.log('✓ idx_email_templates_user_id');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_templates_is_public ON email_templates(is_public);
    `);
    console.log('✓ idx_email_templates_is_public');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_composite_components_user_id ON composite_components(user_id);
    `);
    console.log('✓ idx_composite_components_user_id');

    // ── Refresh Token 表 ───────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      );
    `);
    console.log('✓ refresh_tokens table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    `);
    console.log('✓ idx_refresh_tokens_user_id');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
    `);
    console.log('✓ idx_refresh_tokens_hash');

    // ── 清理過期/撤銷的 refresh token (可選) ────────────────────────────────
    // CREATE INDEX for partial scan on active tokens
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active
        ON refresh_tokens(user_id, expires_at)
        WHERE revoked_at IS NULL;
    `);
    console.log('✓ idx_refresh_tokens_active');

    console.log('\n✅ Migration completed successfully.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
