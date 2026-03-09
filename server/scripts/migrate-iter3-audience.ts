/**
 * Iteration 3 DB 遷移腳本
 * - segments 表（靜態分組）
 * - segment_contacts 關聯表
 * - contacts 加 unsubscribe_token 欄位
 * - import_jobs 表（追蹤 CSV 導入進度，不依賴 Redis）
 *
 * 執行：cd server && npx tsx scripts/migrate-iter3-audience.ts
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: url });

  console.log('Running Iteration 3 migration...');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS segments (
        id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL DEFAULT 'static',
        rules       JSONB DEFAULT '{}',
        count_cache INT DEFAULT 0,
        deleted_at  TIMESTAMPTZ,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ segments table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_segments_user ON segments(user_id, deleted_at);
    `);
    console.log('✓ idx_segments_user');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS segment_contacts (
        segment_id TEXT NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
        contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        PRIMARY KEY (segment_id, contact_id)
      );
    `);
    console.log('✓ segment_contacts table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_seg_contacts_contact ON segment_contacts(contact_id);
    `);
    console.log('✓ idx_seg_contacts_contact');

    await pool.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT;
    `);
    console.log('✓ contacts.unsubscribe_token column');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_contacts_unsub_token ON contacts(unsubscribe_token)
        WHERE unsubscribe_token IS NOT NULL;
    `);
    console.log('✓ idx_contacts_unsub_token');

    // Import jobs table – tracks CSV import progress without needing Redis
    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_jobs (
        id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status         TEXT NOT NULL DEFAULT 'pending',
        total          INT DEFAULT 0,
        processed      INT DEFAULT 0,
        skipped        INT DEFAULT 0,
        errors         INT DEFAULT 0,
        error_details  JSONB DEFAULT '[]',
        segment_id     TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ import_jobs table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_import_jobs_user ON import_jobs(user_id);
    `);
    console.log('✓ idx_import_jobs_user');

    console.log('\n✅ Iteration 3 migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
