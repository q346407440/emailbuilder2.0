/**
 * Iteration 7 DB 迁移
 * - users 表加 brand_config JSONB
 * - variable_schema 表 + 14 个系统预置变量
 *
 * cd server && npx tsx scripts/migrate-iter7-settings.ts
 */
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  console.log('Running Iteration 7 migration...');
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS brand_config JSONB DEFAULT '{}'`);
    console.log('✓ users.brand_config');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS variable_schema (
        key            TEXT PRIMARY KEY,
        label          TEXT NOT NULL,
        content_type   TEXT NOT NULL,
        group_name     TEXT NOT NULL,
        description    TEXT,
        shoplazza_field TEXT,
        is_custom      BOOLEAN DEFAULT FALSE,
        user_id        TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ variable_schema table');

    await pool.query(`
      INSERT INTO variable_schema (key, label, content_type, group_name, shoplazza_field) VALUES
        ('user.name',          '用户姓名',    'text',  'user',    'customer.first_name'),
        ('user.email',         '用户邮箱',    'text',  'user',    'customer.email'),
        ('shop.name',          '店铺名称',    'text',  'shop',    'shop.name'),
        ('shop.homeUrl',       '店铺首页',    'link',  'shop',    'shop.domain'),
        ('shop.logoUrl',       '店铺 Logo',   'image', 'shop',    'shop.logo_url'),
        ('product.title',      '商品标题',    'text',  'product', 'product.title'),
        ('product.price',      '商品价格',    'text',  'product', 'product.variants[0].price'),
        ('product.imageUrl',   '商品主图',    'image', 'product', 'product.images[0].src'),
        ('product.url',        '商品链接',    'link',  'product', 'product.handle'),
        ('order.id',           '订单号',      'text',  'order',   'order.name'),
        ('order.detailUrl',    '订单详情',    'link',  'order',   'order.order_status_url'),
        ('order.trackingUrl',  '物流追踪',    'link',  'order',   'fulfillment.tracking_url'),
        ('promo.code',         '优惠码',      'text',  'promo',   NULL),
        ('cart.url',           '购物车链接',  'link',  'promo',   'checkout.abandoned_checkout_url')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✓ 14 preset variables inserted');

    console.log('\n✅ Iteration 7 migration completed.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
