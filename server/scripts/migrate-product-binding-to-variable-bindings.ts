/**
 * 一次性迁移脚本：将旧 dataBinding（商品绑定）迁移为 variableBindings + variablePreviewSource。
 *
 * 执行：
 *   cd server && DATABASE_URL=... npx tsx scripts/migrate-product-binding-to-variable-bindings.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

type ProductBindingField =
  | 'product.image'
  | 'product.title'
  | 'product.price'
  | 'product.compareAtPrice'
  | 'product.url';

const PRODUCT_FIELD_TO_VARIABLE_KEY: Record<ProductBindingField, string> = {
  'product.image': 'product.imageUrl',
  'product.title': 'product.title',
  'product.price': 'product.price',
  'product.compareAtPrice': 'product.compareAtPrice',
  'product.url': 'product.url',
};

function migrateNode(node: unknown): { next: unknown; changed: boolean } {
  if (Array.isArray(node)) {
    let changed = false;
    const next = node.map((child) => {
      const migrated = migrateNode(child);
      if (migrated.changed) changed = true;
      return migrated.next;
    });
    return { next, changed };
  }

  if (!node || typeof node !== 'object') {
    return { next: node, changed: false };
  }

  const obj = node as Record<string, unknown>;
  let changed = false;
  const nextObj: Record<string, unknown> = { ...obj };

  if (Array.isArray(obj.children)) {
    const migratedChildren = migrateNode(obj.children);
    if (migratedChildren.changed) changed = true;
    nextObj.children = migratedChildren.next;
  }

  const rawDataBinding = obj.dataBinding;
  if (
    rawDataBinding &&
    typeof rawDataBinding === 'object' &&
    (rawDataBinding as Record<string, unknown>).source === 'shop_product'
  ) {
    const db = rawDataBinding as Record<string, unknown>;
    const mapping = db.mapping && typeof db.mapping === 'object'
      ? (db.mapping as Record<string, unknown>)
      : {};

    const existingVariableBindings =
      obj.variableBindings && typeof obj.variableBindings === 'object'
        ? ({ ...(obj.variableBindings as Record<string, unknown>) } as Record<string, unknown>)
        : {};

    for (const [propPath, rawField] of Object.entries(mapping)) {
      if (typeof rawField !== 'string') continue;
      const mappedKey =
        PRODUCT_FIELD_TO_VARIABLE_KEY[rawField as ProductBindingField] ?? rawField;
      existingVariableBindings[propPath] = mappedKey;
    }

    if (Object.keys(existingVariableBindings).length > 0) {
      nextObj.variableBindings = existingVariableBindings;
    }

    const product = db.product;
    if (product && typeof product === 'object') {
      nextObj.variablePreviewSource = {
        type: 'product',
        snapshot: product,
      };
    }

    delete nextObj.dataBinding;
    changed = true;
  }

  return { next: nextObj, changed };
}

async function migrateEmailTemplates() {
  const { rows } = await pool.query<{ id: string; components: unknown }>(
    `SELECT id, components FROM email_templates WHERE components::text LIKE '%"dataBinding"%'`
  );

  console.log(`[email_templates] 检查 ${rows.length} 条可能含 dataBinding 的记录`);
  let updated = 0;
  for (const row of rows) {
    const migrated = migrateNode(row.components);
    if (!migrated.changed) continue;
    await pool.query('UPDATE email_templates SET components = $1, updated_at = $2 WHERE id = $3', [
      JSON.stringify(migrated.next),
      Date.now(),
      row.id,
    ]);
    updated++;
    console.log(`  ✓ 已更新 template: ${row.id}`);
  }
  console.log(`[email_templates] 共更新 ${updated} 条`);
}

async function migrateCompositeComponents() {
  const { rows } = await pool.query<{ id: string; component: unknown }>(
    `SELECT id, component FROM composite_components WHERE status = 'active' AND component::text LIKE '%"dataBinding"%'`
  );

  console.log(`[composite_components] 检查 ${rows.length} 条可能含 dataBinding 的记录`);
  let updated = 0;
  for (const row of rows) {
    const migrated = migrateNode(row.component);
    if (!migrated.changed) continue;
    await pool.query('UPDATE composite_components SET component = $1, updated_at = $2 WHERE id = $3', [
      JSON.stringify(migrated.next),
      Date.now(),
      row.id,
    ]);
    updated++;
    console.log(`  ✓ 已更新 composite: ${row.id}`);
  }
  console.log(`[composite_components] 共更新 ${updated} 条`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('请设置 DATABASE_URL');
    process.exit(1);
  }
  try {
    await migrateEmailTemplates();
    await migrateCompositeComponents();
    console.log('\n✅ 迁移完成：dataBinding 已转换为 variableBindings + variablePreviewSource');
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
