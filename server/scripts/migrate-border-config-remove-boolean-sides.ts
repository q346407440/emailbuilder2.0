/**
 * 将 BorderConfig 从「boolean 开关 + 宽度」格式迁移到「纯宽度」格式。
 *
 * 旧格式：{ mode, top: boolean, right: boolean, bottom: boolean, left: boolean,
 *            unified?, topWidth?, rightWidth?, bottomWidth?, leftWidth?, color, style }
 * 新格式：{ mode, unified?, topWidth?, rightWidth?, bottomWidth?, leftWidth?, color, style }
 *
 * 迁移规则：
 *   - unified 模式：若 top/right/bottom/left 均为 false，则 unified 置为 '0'；
 *     否则保留原 unified 值（已激活的边才有意义，但统一模式下所有边同值，直接保留）。
 *   - separate 模式：对每条边，若对应 boolean 为 false，则将该边宽度置为 '0'。
 *   - 删除 top/right/bottom/left boolean 字段。
 *
 * 涉及表：email_templates（config.border、components[*].wrapperStyle.border）
 *         composite_components（components[*].wrapperStyle.border）
 *
 * 执行：cd server && npx tsx scripts/migrate-border-config-remove-boolean-sides.ts
 */
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

interface OldBorderConfig {
  mode?: 'unified' | 'separate';
  top?: boolean;
  right?: boolean;
  bottom?: boolean;
  left?: boolean;
  unified?: string;
  topWidth?: string;
  rightWidth?: string;
  bottomWidth?: string;
  leftWidth?: string;
  color?: string;
  style?: string;
  [key: string]: unknown;
}

function migrateBorder(border: OldBorderConfig): OldBorderConfig {
  if (!border || typeof border !== 'object') return border;

  const hasBooleans =
    typeof border.top === 'boolean' ||
    typeof border.right === 'boolean' ||
    typeof border.bottom === 'boolean' ||
    typeof border.left === 'boolean';

  if (!hasBooleans) return border;

  const { top, right, bottom, left, ...rest } = border;
  const mode = rest.mode || 'unified';

  if (mode === 'unified') {
    const allOff = !top && !right && !bottom && !left;
    return { ...rest, unified: allOff ? '0' : (rest.unified || '1px') };
  } else {
    return {
      ...rest,
      topWidth: top ? (rest.topWidth || '1px') : '0',
      rightWidth: right ? (rest.rightWidth || '1px') : '0',
      bottomWidth: bottom ? (rest.bottomWidth || '1px') : '0',
      leftWidth: left ? (rest.leftWidth || '1px') : '0',
    };
  }
}

function migrateComponents(components: unknown[]): unknown[] {
  if (!Array.isArray(components)) return components;
  return components.map((comp: unknown) => {
    if (!comp || typeof comp !== 'object') return comp;
    const c = comp as Record<string, unknown>;
    const result = { ...c };
    if (c.wrapperStyle && typeof c.wrapperStyle === 'object') {
      const ws = c.wrapperStyle as Record<string, unknown>;
      if (ws.border) {
        result.wrapperStyle = { ...ws, border: migrateBorder(ws.border as OldBorderConfig) };
      }
    }
    if (Array.isArray(c.children)) {
      result.children = migrateComponents(c.children as unknown[]);
    }
    return result;
  });
}

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  let totalTemplates = 0;
  let totalComposites = 0;

  try {
    // --- email_templates ---
    const templates = await pool.query(`SELECT id, config FROM email_templates`);
    for (const row of templates.rows) {
      const config = row.config as Record<string, unknown>;
      if (!config) continue;

      let changed = false;
      const newConfig = { ...config };

      if (config.border) {
        const migrated = migrateBorder(config.border as OldBorderConfig);
        if (JSON.stringify(migrated) !== JSON.stringify(config.border)) {
          newConfig.border = migrated;
          changed = true;
        }
      }

      if (Array.isArray(config.components)) {
        const migrated = migrateComponents(config.components as unknown[]);
        if (JSON.stringify(migrated) !== JSON.stringify(config.components)) {
          newConfig.components = migrated;
          changed = true;
        }
      }

      if (changed) {
        await pool.query(`UPDATE email_templates SET config = $1 WHERE id = $2`, [newConfig, row.id]);
        totalTemplates++;
        console.log(`  template ${row.id} migrated`);
      }
    }

    // --- composite_components ---
    const composites = await pool.query(`SELECT id, components FROM composite_components`);
    for (const row of composites.rows) {
      if (!Array.isArray(row.components)) continue;
      const migrated = migrateComponents(row.components as unknown[]);
      if (JSON.stringify(migrated) !== JSON.stringify(row.components)) {
        await pool.query(`UPDATE composite_components SET components = $1 WHERE id = $2`, [migrated, row.id]);
        totalComposites++;
        console.log(`  composite ${row.id} migrated`);
      }
    }

    console.log(`\n✅ Done. templates: ${totalTemplates}, composites: ${totalComposites}`);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
