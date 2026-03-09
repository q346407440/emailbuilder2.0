/**
 * Iteration 4 DB 遷移
 * - broadcasts 廣播活動表
 * - email_sends 單封發送記錄
 * - email_events 追蹤事件
 * - tracking_links 點擊追蹤鏈接
 *
 * cd server && npx tsx scripts/migrate-iter4-broadcasts.ts
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  console.log('Running Iteration 4 migration...');
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS broadcasts (
        id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        subject       TEXT NOT NULL DEFAULT '',
        preview_text  TEXT,
        status        TEXT NOT NULL DEFAULT 'draft',
        template_id   TEXT REFERENCES email_templates(id),
        segment_id    TEXT REFERENCES segments(id),
        rendered_html TEXT,
        scheduled_at  TIMESTAMPTZ,
        sent_at       TIMESTAMPTZ,
        total_count   INT DEFAULT 0,
        sent_count    INT DEFAULT 0,
        failed_count  INT DEFAULT 0,
        deleted_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ broadcasts');
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_broadcasts_user ON broadcasts(user_id, deleted_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_broadcasts_scheduled ON broadcasts(scheduled_at) WHERE status = 'scheduled';`);
    console.log('✓ broadcasts indexes');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_sends (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        broadcast_id TEXT REFERENCES broadcasts(id) ON DELETE CASCADE,
        contact_id   TEXT NOT NULL REFERENCES contacts(id),
        user_id      TEXT NOT NULL,
        status       TEXT DEFAULT 'queued',
        message_id   TEXT,
        sent_at      TIMESTAMPTZ,
        opened_at    TIMESTAMPTZ,
        clicked_at   TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_sends_broadcast ON email_sends(broadcast_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_sends_contact ON email_sends(contact_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_sends_status ON email_sends(status);`);
    console.log('✓ email_sends');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_events (
        id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        send_id    TEXT NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        meta       JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_events_send ON email_events(send_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_email_events_type_time ON email_events(type, created_at);`);
    console.log('✓ email_events');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tracking_links (
        id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        send_id      TEXT NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
        original_url TEXT NOT NULL,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ tracking_links');

    console.log('\n✅ Iteration 4 migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
