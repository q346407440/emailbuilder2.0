/**
 * 四層架構遷移腳本：三層混合 → 四層分離
 *
 * 將 email_templates 和 email_projects 中組件樹裡的動態邏輯字段
 * （variableBindings / visibilityCondition / conditionalBranches / loopBinding）
 * 提取到獨立的 rendering_rules 欄位，組件樹保留純靜態結構。
 *
 * 執行方式：
 *   cd server && npx tsx scripts/migrate-three-to-four-layers.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Pool } = pg;

// ============================================================
// 類型定義（與前端 src/shared/types/email.ts 保持一致）
// ============================================================

interface SimpleCondition {
  variableKey: string;
  operator: string;
  value?: string;
}

interface ComponentBranch {
  id: string;
  label?: string;
  condition: SimpleCondition;
  propsOverride: Record<string, unknown>;
  wrapperStyleOverride?: Record<string, unknown>;
}

interface LoopBinding {
  variableKey: string;
  previewIndex?: number;
  expandDirection?: 'vertical' | 'horizontal';
}

interface ComponentRules {
  variableBindings?: Record<string, string>;
  visibilityCondition?: SimpleCondition;
  conditionalBranches?: ComponentBranch[];
  loopBinding?: LoopBinding;
}

type RenderingRules = Record<string, ComponentRules>;

interface EmailComponent {
  id: string;
  type: string;
  children?: EmailComponent[];
  variableBindings?: Record<string, string>;
  visibilityCondition?: SimpleCondition;
  conditionalBranches?: ComponentBranch[];
  loopBinding?: LoopBinding;
  [key: string]: unknown;
}

// ============================================================
// 核心邏輯：提取 renderingRules，返回純靜態組件樹
// ============================================================

function extractNode(node: EmailComponent, rules: RenderingRules): EmailComponent {
  const { variableBindings, visibilityCondition, conditionalBranches, loopBinding, ...rest } = node;

  const nodeRules: ComponentRules = {};
  let hasRules = false;

  if (variableBindings !== undefined) {
    nodeRules.variableBindings = variableBindings;
    hasRules = true;
  }
  if (visibilityCondition !== undefined) {
    nodeRules.visibilityCondition = visibilityCondition;
    hasRules = true;
  }
  if (conditionalBranches !== undefined) {
    nodeRules.conditionalBranches = conditionalBranches;
    hasRules = true;
  }
  if (loopBinding !== undefined) {
    nodeRules.loopBinding = loopBinding;
    hasRules = true;
  }

  if (hasRules) {
    rules[node.id] = nodeRules;
  }

  const staticNode = rest as EmailComponent;

  if (staticNode.children && staticNode.children.length > 0) {
    const staticChildren = staticNode.children.map((child) => extractNode(child, rules));
    return { ...staticNode, children: staticChildren };
  }

  return staticNode;
}

function extractRenderingRules(components: EmailComponent[]): {
  staticComponents: EmailComponent[];
  renderingRules: RenderingRules;
} {
  const rules: RenderingRules = {};
  const staticComponents = components.map((node) => extractNode(node, rules));
  return { staticComponents, renderingRules: rules };
}

// ============================================================
// 主遷移邏輯
// ============================================================

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

  const result = {
    templates: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
    projects: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
  };

  try {
    // ---- 確保欄位存在（冪等） ----
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'email_templates' AND column_name = 'rendering_rules'
        ) THEN
          ALTER TABLE email_templates ADD COLUMN rendering_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
        END IF;
      END $$;
    `);
    console.log('✓ email_templates.rendering_rules 欄位確認');

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'email_projects' AND column_name = 'rendering_rules'
        ) THEN
          ALTER TABLE email_projects ADD COLUMN rendering_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
        END IF;
      END $$;
    `);
    console.log('✓ email_projects.rendering_rules 欄位確認');

    // ---- 遷移 email_templates ----
    console.log('\n開始遷移 email_templates...');
    const templatesRes = await pool.query<{ id: string; components: unknown }>(
      `SELECT id, components FROM email_templates WHERE deleted_at IS NULL`
    );
    result.templates.total = templatesRes.rows.length;

    for (const row of templatesRes.rows) {
      try {
        const components = row.components as EmailComponent[];
        if (!Array.isArray(components)) {
          result.templates.skipped++;
          continue;
        }

        const { staticComponents, renderingRules } = extractRenderingRules(components);
        const rulesCount = Object.keys(renderingRules).length;

        await pool.query(
          `UPDATE email_templates SET components = $1, rendering_rules = $2 WHERE id = $3`,
          [JSON.stringify(staticComponents), JSON.stringify(renderingRules), row.id]
        );

        result.templates.migrated++;
        if (rulesCount > 0) {
          console.log(`  ✓ template ${row.id}: 提取 ${rulesCount} 個組件規則`);
        }
      } catch (err) {
        const msg = `template ${row.id}: ${err instanceof Error ? err.message : String(err)}`;
        result.templates.errors.push(msg);
        console.error(`  ✗ ${msg}`);
      }
    }

    // ---- 遷移 email_projects ----
    console.log('\n開始遷移 email_projects...');
    const projectsRes = await pool.query<{ id: string; components: unknown }>(
      `SELECT id, components FROM email_projects`
    );
    result.projects.total = projectsRes.rows.length;

    for (const row of projectsRes.rows) {
      try {
        const components = row.components as EmailComponent[];
        if (!Array.isArray(components)) {
          result.projects.skipped++;
          continue;
        }

        const { staticComponents, renderingRules } = extractRenderingRules(components);
        const rulesCount = Object.keys(renderingRules).length;

        await pool.query(
          `UPDATE email_projects SET components = $1, rendering_rules = $2 WHERE id = $3`,
          [JSON.stringify(staticComponents), JSON.stringify(renderingRules), row.id]
        );

        result.projects.migrated++;
        if (rulesCount > 0) {
          console.log(`  ✓ project ${row.id}: 提取 ${rulesCount} 個組件規則`);
        }
      } catch (err) {
        const msg = `project ${row.id}: ${err instanceof Error ? err.message : String(err)}`;
        result.projects.errors.push(msg);
        console.error(`  ✗ ${msg}`);
      }
    }
  } finally {
    await pool.end();
  }

  // ---- 輸出摘要 ----
  console.log('\n========== 遷移摘要 ==========');
  console.log(`email_templates: 共 ${result.templates.total} 條，遷移 ${result.templates.migrated}，跳過 ${result.templates.skipped}，錯誤 ${result.templates.errors.length}`);
  console.log(`email_projects:  共 ${result.projects.total} 條，遷移 ${result.projects.migrated}，跳過 ${result.projects.skipped}，錯誤 ${result.projects.errors.length}`);

  const outputPath = path.join(process.cwd(), '..', 'tmp', 'migrate-four-layers-result.json');
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`\n詳細結果已寫入 tmp/migrate-four-layers-result.json`);
  } catch {
    console.log('\n（tmp 目錄寫入失敗，結果僅輸出至控制台）');
  }

  if (result.templates.errors.length > 0 || result.projects.errors.length > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('遷移腳本執行失敗：', err);
  process.exit(1);
});
