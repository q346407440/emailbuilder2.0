/**
 * 将 variable_schema 表中系统预置变量的 label 从繁体改为简体（一次性数据修复）。
 * 部署后执行一次：cd server && npx tsx scripts/migrate-variable-schema-simplified-chinese.ts
 */
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const LABELS_ZH_CN: Record<string, string> = {
  'user.name': '用户姓名',
  'user.email': '用户邮箱',
  'shop.name': '店铺名称',
  'shop.homeUrl': '店铺首页',
  'shop.logoUrl': '店铺 Logo',
  'product.title': '商品标题',
  'product.price': '商品价格',
  'product.imageUrl': '商品主图',
  'product.url': '商品链接',
  'order.id': '订单号',
  'order.detailUrl': '订单详情',
  'order.trackingUrl': '物流追踪',
  'promo.code': '优惠码',
  'cart.url': '购物车链接',
};

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  console.log('Updating variable_schema labels to Simplified Chinese...');
  try {
    for (const [key, label] of Object.entries(LABELS_ZH_CN)) {
      const r = await pool.query(
        `UPDATE variable_schema SET label = $1 WHERE key = $2`,
        [label, key]
      );
      if (r.rowCount && r.rowCount > 0) console.log(`  ${key} -> ${label}`);
    }
    console.log('\n✅ variable_schema labels updated.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
