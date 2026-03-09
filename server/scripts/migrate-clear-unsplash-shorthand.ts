/**
 * 一次性迁移脚本：清除 email_templates 和 composite_components 表中
 * 所有以 "unsplash:" 开头的简写 src 值（设为空字符串）。
 * 以 "https://images.unsplash.com/" 开头的完整 URL 保留不动。
 *
 * 执行：cd server && npx tsx scripts/migrate-clear-unsplash-shorthand.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** 递归遍历 JSONB 组件树，将 unsplash: 简写 src 清空，完整 URL 不动 */
function clearUnsplashShorthand(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(clearUnsplashShorthand);
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = { ...obj };

    // 修复 props.src
    if (result.props && typeof result.props === 'object') {
      const props = result.props as Record<string, unknown>;
      if (typeof props.src === 'string' && props.src.startsWith('unsplash:')) {
        result.props = { ...props, src: '' };
      }
    }

    // 递归 children
    if (Array.isArray(result.children)) {
      result.children = result.children.map(clearUnsplashShorthand);
    }

    return result;
  }
  return node;
}

async function migrateEmailTemplates() {
  const { rows } = await pool.query<{ id: string; components: unknown }>(
    `SELECT id, components FROM email_templates WHERE components::text LIKE '%unsplash:%'`
  );

  console.log(`[email_templates] 发现 ${rows.length} 条含 unsplash: 简写的记录`);

  for (const row of rows) {
    const fixed = clearUnsplashShorthand(row.components);
    await pool.query('UPDATE email_templates SET components = $1 WHERE id = $2', [
      JSON.stringify(fixed),
      row.id,
    ]);
    console.log(`  ✓ 已更新 template: ${row.id}`);
  }
}

async function migrateCompositeComponents() {
  const { rows } = await pool.query<{ id: string; component: unknown }>(
    `SELECT id, component FROM composite_components WHERE component::text LIKE '%unsplash:%'`
  );

  console.log(`[composite_components] 发现 ${rows.length} 条含 unsplash: 简写的记录`);

  for (const row of rows) {
    const fixed = clearUnsplashShorthand(row.component);
    await pool.query('UPDATE composite_components SET component = $1 WHERE id = $2', [
      JSON.stringify(fixed),
      row.id,
    ]);
    console.log(`  ✓ 已更新 composite: ${row.id}`);
  }
}

async function main() {
  try {
    await migrateEmailTemplates();
    await migrateCompositeComponents();
    console.log('\n✅ 迁移完成：unsplash: 简写 src 已清空，完整 URL 保留不动');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
