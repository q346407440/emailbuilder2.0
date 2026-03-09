/**
 * 一次性迁移脚本：将文本组件从「Markdown content + 独立样式 props」转为「content 存 HTML」。
 * - 对 type===text 且 props 含 fontSize/color/fontWeight/lineHeight 的节点：
 *   用 markdown-it 将 content 转为 HTML，再用旧样式包一层 div，写回 props.content；
 *   删除 props.fontSize、color、fontWeight、lineHeight，保留 fontMode、fontFamily。
 * - 已是新格式（无上述旧键）的 text 节点不动。
 *
 * 执行：cd server && DATABASE_URL=... npx tsx scripts/migrate-text-props-to-html.ts
 */

import pg from 'pg';
import MarkdownIt from 'markdown-it';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const md = new MarkdownIt({ html: true, breaks: true });
const DEFAULT_FONT_FAMILY = "'Source Sans 3', sans-serif";

interface OldTextProps {
  content?: string;
  fontSize?: string;
  color?: string;
  fontWeight?: string;
  lineHeight?: string;
  fontMode?: 'inherit' | 'custom';
  fontFamily?: string;
  [k: string]: unknown;
}

function isOldTextProps(props: unknown): props is OldTextProps {
  if (!props || typeof props !== 'object') return false;
  const p = props as Record<string, unknown>;
  return 'content' in p && ('fontSize' in p || 'color' in p || 'fontWeight' in p || 'lineHeight' in p);
}

/** 将旧 text props 转为新格式：content 为带样式的 HTML，仅保留 fontMode/fontFamily */
function migrateTextProps(props: OldTextProps): { content: string; fontMode: 'inherit' | 'custom'; fontFamily: string } {
  const rawContent = typeof props.content === 'string' ? props.content : '';
  const htmlContent = md.render(rawContent.trim() || '').trim();

  const fontSize = typeof props.fontSize === 'string' && props.fontSize ? props.fontSize : '16px';
  const color = typeof props.color === 'string' && props.color ? props.color : '#5C6B7A';
  const fontWeight = typeof props.fontWeight === 'string' && props.fontWeight ? props.fontWeight : '400';
  const lineHeight = typeof props.lineHeight === 'string' && props.lineHeight ? props.lineHeight : '1.5';
  const fontMode = props.fontMode === 'custom' ? 'custom' : 'inherit';
  const fontFamily =
    typeof props.fontFamily === 'string' && props.fontFamily.trim() ? props.fontFamily : DEFAULT_FONT_FAMILY;

  const style = `font-size:${fontSize};color:${color};font-weight:${fontWeight};line-height:${lineHeight}`;
  const wrapped = htmlContent ? `<div style="${style}">${htmlContent}</div>` : `<p style="${style}"> </p>`;

  return { content: wrapped, fontMode, fontFamily };
}

/** 递归遍历组件树，迁移所有 text 节点 */
function migrateComponentTree(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(migrateComponentTree);
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const result: Record<string, unknown> = { ...obj };

    if (result.type === 'text' && result.props && typeof result.props === 'object') {
      const props = result.props as OldTextProps;
      if (isOldTextProps(props)) {
        result.props = migrateTextProps(props);
      }
    }

    if (Array.isArray(result.children)) {
      result.children = result.children.map(migrateComponentTree);
    }

    return result;
  }
  return node;
}

async function migrateEmailTemplates() {
  const { rows } = await pool.query<{ id: string; components: unknown }>(
    `SELECT id, components FROM email_templates WHERE components::text LIKE '%"type":"text"%'`
  );

  console.log(`[email_templates] 检查 ${rows.length} 条含 text 组件的记录`);

  let updated = 0;
  for (const row of rows) {
    const components = Array.isArray(row.components) ? row.components : [];
    const migrated = components.map(migrateComponentTree);
    const changed = JSON.stringify(migrated) !== JSON.stringify(components);
    if (changed) {
      await pool.query('UPDATE email_templates SET components = $1, updated_at = $2 WHERE id = $3', [
        JSON.stringify(migrated),
        Date.now(),
        row.id,
      ]);
      updated++;
      console.log(`  ✓ 已更新 template: ${row.id}`);
    }
  }
  console.log(`[email_templates] 共更新 ${updated} 条`);
}

async function migrateCompositeComponents() {
  const { rows } = await pool.query<{ id: string; component: unknown }>(
    `SELECT id, component FROM composite_components WHERE status = 'active' AND component::text LIKE '%"type":"text"%'`
  );

  console.log(`[composite_components] 检查 ${rows.length} 条含 text 组件的记录`);

  let updated = 0;
  for (const row of rows) {
    const migrated = migrateComponentTree(row.component);
    const changed = JSON.stringify(migrated) !== JSON.stringify(row.component);
    if (changed) {
      await pool.query('UPDATE composite_components SET component = $1, updated_at = $2 WHERE id = $3', [
        JSON.stringify(migrated),
        Date.now(),
        row.id,
      ]);
      updated++;
      console.log(`  ✓ 已更新 composite: ${row.id}`);
    }
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
    console.log('\n✅ 迁移完成：text 组件已转为 content(HTML) + fontMode + fontFamily');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
