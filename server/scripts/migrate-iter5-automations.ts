/**
 * Iteration 5 DB 遷移
 * - automations 自動化流程表
 * - automation_enrollments 聯繫人執行狀態表
 * - email_sends 加 automation_id 欄位
 */
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  console.log('Running Iteration 5 migration...');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS automations (
        id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name           TEXT NOT NULL,
        trigger_type   TEXT NOT NULL,
        trigger_config JSONB DEFAULT '{}',
        steps          JSONB NOT NULL DEFAULT '[]',
        status         TEXT NOT NULL DEFAULT 'draft',
        deleted_at     TIMESTAMPTZ,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ automations');
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_automations_user ON automations(user_id, deleted_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status, trigger_type);`);
    console.log('✓ automations indexes');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS automation_enrollments (
        id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
        contact_id    TEXT NOT NULL REFERENCES contacts(id),
        user_id       TEXT NOT NULL,
        current_step  INT DEFAULT 0,
        status        TEXT DEFAULT 'active',
        trigger_data  JSONB DEFAULT '{}',
        enrolled_at   TIMESTAMPTZ DEFAULT NOW(),
        next_run_at   TIMESTAMPTZ,
        completed_at  TIMESTAMPTZ,
        exited_at     TIMESTAMPTZ,
        exit_reason   TEXT
      );
    `);
    console.log('✓ automation_enrollments');
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_enrollments_automation ON automation_enrollments(automation_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_enrollments_contact ON automation_enrollments(contact_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_enrollments_next_run ON automation_enrollments(next_run_at) WHERE status = 'active';`);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique
        ON automation_enrollments(automation_id, contact_id)
        WHERE status = 'active';
    `);
    console.log('✓ automation_enrollments indexes');

    // Add automation_id to email_sends for tracking
    await pool.query(`ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS automation_id TEXT REFERENCES automations(id);`);
    await pool.query(`ALTER TABLE email_sends ADD COLUMN IF NOT EXISTS automation_enrollment_id TEXT REFERENCES automation_enrollments(id);`);
    console.log('✓ email_sends.automation_id + enrollment_id');

    console.log('\n✅ Iteration 5 migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
