/**
 * Iteration 2 DB 遷移腳本
 * - 建立 shop_integrations 表（Shoplazza 私有 App 集成）
 * - 建立 webhook_events 表（Webhook 冪等性記錄）
 * - 建立 contacts 表（聯繫人，Iter-3 繼續補充）
 * - 建立 abandoned_checkouts 表（棄單追蹤）
 *
 * 執行：cd server && npx tsx scripts/migrate-iter2-integrations.ts
 */
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: url });

  console.log('Running Iteration 2 migration...');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_integrations (
        id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform          TEXT NOT NULL DEFAULT 'shoplazza',
        shop_domain       TEXT NOT NULL,
        shop_name         TEXT,
        access_token      TEXT NOT NULL,
        webhook_secret    TEXT,
        subscribed_topics JSONB DEFAULT '[]',
        status            TEXT NOT NULL DEFAULT 'active',
        last_synced_at    TIMESTAMPTZ,
        connected_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(platform, shop_domain)
      );
    `);
    console.log('✓ shop_integrations table');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_shop_integrations_user ON shop_integrations(user_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_shop_integrations_domain ON shop_integrations(shop_domain);`);
    console.log('✓ shop_integrations indexes');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id           TEXT PRIMARY KEY,
        topic        TEXT NOT NULL,
        shop_domain  TEXT NOT NULL,
        status       TEXT DEFAULT 'pending',
        payload      JSONB,
        error        TEXT,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        UNIQUE(id)
      );
    `);
    console.log('✓ webhook_events table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email                 TEXT NOT NULL,
        name                  TEXT,
        status                TEXT DEFAULT 'subscribed',
        source                TEXT DEFAULT 'shoplazza_sync',
        shoplazza_customer_id TEXT,
        custom_fields         JSONB DEFAULT '{}',
        deleted_at            TIMESTAMPTZ,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, email)
      );
    `);
    console.log('✓ contacts table');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_contacts_user_status ON contacts(user_id, status, deleted_at);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(user_id, email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_contacts_shoplazza_id ON contacts(shoplazza_customer_id);`);
    console.log('✓ contacts indexes');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS abandoned_checkouts (
        id           TEXT PRIMARY KEY,
        shop_domain  TEXT NOT NULL,
        user_id      TEXT NOT NULL,
        contact_id   TEXT REFERENCES contacts(id),
        cart_data    JSONB,
        status       TEXT DEFAULT 'pending',
        trigger_at   TIMESTAMPTZ,
        converted_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ abandoned_checkouts table');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_abandoned_trigger ON abandoned_checkouts(trigger_at, status);`);
    console.log('✓ abandoned_checkouts index');

    console.log('\n✅ Iteration 2 migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
