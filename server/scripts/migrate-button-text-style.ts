/**
 * 一次性迁移脚本：为按钮组件补充新增的文字样式 props（fontWeight / fontStyle / textDecoration）。
 * - 对 type===button 且 props 缺少上述字段的节点：补入默认值。
 * - fontWeight 默认 '600'（保持原来硬编码值）。
 * - fontStyle 默认 'normal'，textDecoration 默认 'none'。
 * - 已有这些字段的节点不修改。
 *
 * 执行：cd server && DATABASE_URL=... npx tsx scripts/migrate-button-text-style.ts
 */

import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

interface ButtonPropsRaw {
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  [k: string]: unknown;
}

function needsMigration(props: unknown): props is ButtonPropsRaw {
  if (!props || typeof props !== 'object') return false;
  const p = props as Record<string, unknown>;
  return !('fontWeight' in p) || !('fontStyle' in p) || !('textDecoration' in p);
}

function migrateButtonProps(props: ButtonPropsRaw): ButtonPropsRaw {
  return {
    ...props,
    fontWeight: typeof props.fontWeight === 'string' ? props.fontWeight : '600',
    fontStyle: props.fontStyle === 'italic' ? 'italic' : 'normal',
    textDecoration: (['underline', 'line-through'] as string[]).includes(props.textDecoration as string)
      ? props.textDecoration
      : 'none',
  };
}

function migrateComponentTree(components: unknown[]): { changed: boolean; components: unknown[] } {
  let changed = false;
  const result = components.map((c) => {
    if (!c || typeof c !== 'object') return c;
    const comp = c as Record<string, unknown>;
    const children = comp.children as unknown[] | undefined;
    const migratedChildren = Array.isArray(children)
      ? migrateComponentTree(children)
      : { changed: false, components: [] };

    if (comp.type === 'button' && needsMigration(comp.props)) {
      changed = true;
      return {
        ...comp,
        props: migrateButtonProps(comp.props as ButtonPropsRaw),
        ...(Array.isArray(children) ? { children: migratedChildren.components } : {}),
      };
    }
    if (migratedChildren.changed) {
      changed = true;
      return { ...comp, children: migratedChildren.components };
    }
    return comp;
  });
  return { changed, components: result };
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows: templates } = await client.query<{ id: string; components: unknown }>(
      'SELECT id, components FROM email_templates',
    );
    console.log(`处理 email_templates：共 ${templates.length} 条`);
    let tUpdated = 0;
    for (const row of templates) {
      const components = Array.isArray(row.components) ? row.components : [];
      const { changed, components: migrated } = migrateComponentTree(components);
      if (changed) {
        await client.query('UPDATE email_templates SET components = $1 WHERE id = $2', [
          JSON.stringify(migrated),
          row.id,
        ]);
        tUpdated++;
      }
    }
    console.log(`  → 更新了 ${tUpdated} 条 email_templates`);

    const { rows: composites } = await client.query<{ id: string; component: unknown }>(
      'SELECT id, component FROM composite_components',
    );
    console.log(`处理 composite_components：共 ${composites.length} 条`);
    let cUpdated = 0;
    for (const row of composites) {
      const compArr = row.component ? [row.component] : [];
      const { changed, components: migrated } = migrateComponentTree(compArr);
      if (changed) {
        await client.query('UPDATE composite_components SET component = $1 WHERE id = $2', [
          JSON.stringify(migrated[0]),
          row.id,
        ]);
        cUpdated++;
      }
    }
    console.log(`  → 更新了 ${cUpdated} 条 composite_components`);

    console.log('迁移完成。');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('迁移失败：', err);
  process.exit(1);
});
