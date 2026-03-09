/**
 * 验证管线：createTemplateFromImage 完成后自动运行，检查生成模板的各维度质量。
 *
 * V1-V6：规则类检查，互相无依赖，可并行执行。
 * V3b：LLM 文本比较（imageQuery vs component alt），与 V1-V6 并行。
 * V5b：规则类，与 V1-V6 并行。
 * V7：LLM 多模态视觉对比，需画布截图，必须串行在 V1-V6 之后单独触发。
 */

import { callLlmCollect, type LlmMessage } from '../llm/llmClient.js';
import type {
  VerificationIssue,
  VerifyStepName,
  VerifyCallbacks,
  VerifyContext,
  GroundingSection,
} from './types.js';

// ── 常量 ──────────────────────────────────────────────────────────────

const VALID_SYSTEM_ICON_TYPES = new Set([
  'mail', 'phone', 'location', 'link', 'star', 'heart', 'check', 'arrow-right',
  'instagram', 'tiktok', 'youtube', 'facebook', 'twitter',
]);

// margin 是 BASE_WRAPPER 的内部合法字段（默认 0），由系统维护，不应被标记为禁止字段。
// 这里只列出完全不在组件规范内的 CSS 属性（LLM 不应输出，运行时也不应存在）。
const FORBIDDEN_WRAPPER_FIELDS = new Set([
  'position', 'transform', 'translateY', 'zIndex',
  'top', 'left', 'right', 'bottom', 'display', 'overflow',
  'flexDirection', 'flexWrap', 'alignItems', 'justifyContent',
  'textAlign', 'letterSpacing', 'textTransform',
]);

// ── 工具函数 ──────────────────────────────────────────────────────────

interface FlatComponent {
  id: string;
  type: string;
  props: Record<string, unknown>;
  wrapperStyle: Record<string, unknown>;
  children?: FlatComponent[];
}

function flattenComponents(components: unknown[]): FlatComponent[] {
  const result: FlatComponent[] = [];
  function traverse(comp: unknown) {
    if (!comp || typeof comp !== 'object') return;
    const c = comp as FlatComponent;
    result.push(c);
    if (Array.isArray(c.children)) c.children.forEach(traverse);
  }
  components.forEach(traverse);
  return result;
}

function parsePx(val: unknown): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ── V1：结构完整性 ────────────────────────────────────────────────────

function runCheckStructure(ctx: VerifyContext): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const flat = flattenComponents(ctx.components);

  // 检查空 grid slots
  for (const comp of flat) {
    if (comp.type === 'grid') {
      const slots = parsePx(comp.props.slots) ?? parsePx(comp.props.columnsPerRow) ?? 0;
      const childCount = Array.isArray(comp.children) ? comp.children.length : 0;
      if (slots > 0 && childCount < slots) {
        issues.push({
          step: 'verify_structure',
          code: 'grid_missing_children',
          componentId: comp.id,
          detail: `grid 声明 ${slots} 个 slot，但只有 ${childCount} 个子组件`,
          expected: slots,
          actual: childCount,
        });
      }
    }
  }

  // 检查顶层组件数量是否与 sections 数量差异过大
  const sectionCount = ctx.sections.length;
  const topLevelCount = ctx.components.length;
  if (sectionCount > 0 && Math.abs(topLevelCount - sectionCount) > Math.max(3, sectionCount)) {
    issues.push({
      step: 'verify_structure',
      code: 'structure_count_mismatch',
      detail: `设计图有 ${sectionCount} 个区域，但生成了 ${topLevelCount} 个顶层组件`,
      expected: sectionCount,
      actual: topLevelCount,
    });
  }

  return issues;
}

// ── V2：文案覆盖 ─────────────────────────────────────────────────────

function runCheckText(ctx: VerifyContext): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  if (ctx.extractedTexts.length === 0) return issues;

  const flat = flattenComponents(ctx.components);
  // 收集所有文本类组件的内容
  const allTexts: string[] = [];
  for (const comp of flat) {
    if (comp.type === 'text' || comp.type === 'button') {
      const raw = String(comp.props.content ?? comp.props.text ?? '').trim();
      const content = comp.type === 'text' ? raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : raw;
      if (content) allTexts.push(content.toLowerCase());
    }
  }
  const joinedText = allTexts.join(' ');

  for (const region of ctx.extractedTexts) {
    for (const expected of region.texts) {
      if (!expected || expected.trim().length < 2) continue;
      const normalized = expected.trim().toLowerCase();
      // 宽松匹配：只要核心词（≥4字符）出现即视为覆盖
      const coreWords = normalized.split(/\s+/).filter((w) => w.length >= 4);
      const missingWords = coreWords.filter((w) => !joinedText.includes(w));
      if (missingWords.length > 0 && missingWords.length >= Math.ceil(coreWords.length * 0.6)) {
        issues.push({
          step: 'verify_text',
          code: 'missing_text',
          regionId: region.regionId,
          detail: `文案未覆盖：「${expected}」`,
          expected,
        });
      }
    }
  }

  return issues;
}

// ── V3：图片有效性 ────────────────────────────────────────────────────

function runCheckImages(ctx: VerifyContext): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const flat = flattenComponents(ctx.components);

  for (const comp of flat) {
    if (comp.type !== 'image') continue;
    const src = String(comp.props.src ?? '').trim();
    if (!src) {
      issues.push({
        step: 'verify_images',
        code: 'empty_src',
        componentId: comp.id,
        detail: 'image 组件 src 为空',
      });
    } else if (!src.startsWith('http')) {
      issues.push({
        step: 'verify_images',
        code: 'invalid_src',
        componentId: comp.id,
        detail: `image src 格式无效：${src.slice(0, 60)}`,
        actual: src,
      });
    }
  }

  return issues;
}

// ── V3b：图片与设计图一致性 ───────────────────────────────────────────

async function runCheckImageMatch(
  ctx: VerifyContext,
  signal?: AbortSignal,
): Promise<VerificationIssue[]> {
  const issues: VerificationIssue[] = [];
  const imageSections = ctx.sections.filter((s) => s.hasImage && s.imageQuery);
  if (imageSections.length === 0) return issues;

  const flat = flattenComponents(ctx.components);
  const imageComps = flat.filter((c) => c.type === 'image');

  for (const section of imageSections) {
    const query = section.imageQuery!.toLowerCase();
    const queryWords = query.split(/\s+/).filter((w) => w.length >= 3);

    // 找到对应的图片组件（按顺序匹配）
    const matchingComp = imageComps.find((c) => {
      const alt = String(c.props.alt ?? '').toLowerCase();
      return queryWords.some((w) => alt.includes(w));
    });

    if (!matchingComp) {
      // 没有找到语义匹配的图片组件，直接提 issue 建议替换
      issues.push({
        step: 'verify_image_match',
        code: 'should_replace',
        regionId: section.id,
        detail: `区域 "${section.region}" 需要图片（${section.imageQuery}），但未找到语义匹配的图片组件`,
        suggestedQuery: section.imageQuery,
      });
    }
  }

  // 如果有多个 section 需要图片，用 LLM 做一次整体判断
  if (imageSections.length > 0 && imageComps.length > 0 && !signal?.aborted) {
    try {
      const prompt = buildImageMatchPrompt(imageSections, imageComps);
      const messages: LlmMessage[] = [{ role: 'user', content: prompt }];
      const raw = await callLlmCollect('pipeline', messages, IMAGE_MATCH_SYSTEM, signal);
      const parsed = safeParseSimpleJson<ImageMatchResult[]>(raw);
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          if (!r.match && r.regionId) {
            const already = issues.find(
              (i) => i.regionId === r.regionId && i.code === 'should_replace',
            );
            if (!already) {
              issues.push({
                step: 'verify_image_match',
                code: 'should_replace',
                regionId: r.regionId,
                detail: r.reason ?? `区域图片与设计参考不一致`,
                suggestedQuery: r.suggestedQuery,
              });
            }
          }
        }
      }
    } catch {
      // LLM 调用失败，跳过，规则检查结果仍有效
    }
  }

  return issues;
}

interface ImageMatchResult {
  regionId: string;
  match: boolean;
  reason?: string;
  suggestedQuery?: string;
}

const IMAGE_MATCH_SYSTEM = `你是图片内容核查助手。仅输出 JSON 数组，每项包含 regionId、match(bool)、reason(可选)、suggestedQuery(可选)。`;

function buildImageMatchPrompt(
  sections: GroundingSection[],
  imageComps: FlatComponent[],
): string {
  const sectionsStr = sections
    .map((s) => `- region: ${s.region}, id: ${s.id}, imageQuery: ${s.imageQuery}`)
    .join('\n');
  const compsStr = imageComps
    .map((c) => `- id: ${c.id}, alt: ${c.props.alt ?? '(无)'}`)
    .join('\n');
  return `设计图期望的图片区域：\n${sectionsStr}\n\n当前画布图片组件：\n${compsStr}\n\n请判断每个区域的图片语义是否匹配。对不匹配的给出 suggestedQuery（英文 2-4 词）。输出 JSON 数组。`;
}

// ── V4：图标有效性 ────────────────────────────────────────────────────

function runCheckIcons(ctx: VerifyContext): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const flat = flattenComponents(ctx.components);

  for (const comp of flat) {
    if (comp.type !== 'icon') continue;
    const iconType = String(comp.props.iconType ?? '');

    if (iconType && iconType !== 'custom' && !VALID_SYSTEM_ICON_TYPES.has(iconType)) {
      issues.push({
        step: 'verify_icons',
        code: 'invalid_icon_type',
        componentId: comp.id,
        detail: `iconType "${iconType}" 不在系统图标白名单中`,
        actual: iconType,
      });
    }

    if (iconType === 'custom') {
      const customSrc = String(comp.props.customSrc ?? '');
      if (!customSrc) {
        issues.push({
          step: 'verify_icons',
          code: 'missing_custom_src',
          componentId: comp.id,
          detail: 'iconType=custom 但 customSrc 为空',
        });
      }
    }
  }

  return issues;
}

// ── V5：间距与对齐 ────────────────────────────────────────────────────

function runCheckSpacing(ctx: VerifyContext): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const flat = flattenComponents(ctx.components);

  for (const comp of flat) {
    if (comp.type === 'layout' || comp.type === 'grid') {
      // 检查 layout gap 是否为 0（对有多个子组件的容器）
      const childCount = Array.isArray(comp.children) ? comp.children.length : 0;
      if (childCount > 1) {
        const gap = parsePx(comp.props.gap);
        if (gap === 0 || gap === null) {
          issues.push({
            step: 'verify_spacing',
            code: 'zero_gap',
            componentId: comp.id,
            detail: `layout/grid 有 ${childCount} 个子组件，但 gap 为 0 或未设置`,
            actual: comp.props.gap,
          });
        }
      }
    }

    // 检查叠层图片的 layoutContentAlign
    if (comp.type === 'image') {
      const hasChildren = Array.isArray(comp.children) && comp.children.length > 0;
      const layoutMode = comp.props.layoutMode === true || hasChildren;
      if (layoutMode) {
        const lca = comp.props.layoutContentAlign;
        if (lca && typeof lca === 'object') {
          issues.push({
            step: 'verify_spacing',
            code: 'invalid_layout_content_align',
            componentId: comp.id,
            detail: 'layoutContentAlign 应为字符串（"left"|"center"|"right"），不应是对象',
            actual: lca,
          });
        }
      }
    }
  }

  return issues;
}

// ── V5b：字号与图标尺寸 ───────────────────────────────────────────────

function runCheckTypography(ctx: VerifyContext): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  if (ctx.sections.length === 0) return issues;

  const flat = flattenComponents(ctx.components);
  const tokenH1 = parsePx(ctx.tokens.typography.h1?.fontSize);
  const tokenBody = parsePx(ctx.tokens.typography.body?.fontSize);

  for (const comp of flat) {
    if (comp.type === 'text') {
      // text 组件字号现存储在 content HTML 内，不再从 props.fontSize 读取；跳过字号校验
      const fsMatch = typeof comp.props.content === 'string' && comp.props.content.match(/font-size:\s*(\d+)px/);
      const fs = fsMatch ? parsePx(fsMatch[1] + 'px') : null;
      if (fs !== null && tokenH1 !== null && fs > tokenH1 + 8) {
        issues.push({
          step: 'verify_typography',
          code: 'font_too_large',
          componentId: comp.id,
          detail: `字号 ${fs}px 超过 h1 token（${tokenH1}px）+8px 容差`,
          expected: `≤ ${tokenH1 + 8}`,
          actual: fs,
        });
      }
      if (fs !== null && tokenBody !== null && fs > 0 && fs < tokenBody - 4) {
        issues.push({
          step: 'verify_typography',
          code: 'font_too_small',
          componentId: comp.id,
          detail: `字号 ${fs}px 小于 body token（${tokenBody}px）- 4px 容差`,
          expected: `≥ ${tokenBody - 4}`,
          actual: fs,
        });
      }
    }

    if (comp.type === 'icon') {
      const size = parsePx(comp.props.size);
      if (size !== null && (size < 12 || size > 64)) {
        issues.push({
          step: 'verify_typography',
          code: 'icon_size_unusual',
          componentId: comp.id,
          detail: `图标尺寸 ${size}px 超出正常范围（12-64px）`,
          actual: size,
        });
      }
    }
  }

  return issues;
}

// ── V6：组件约束 ─────────────────────────────────────────────────────

function runCheckConstraints(ctx: VerifyContext): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const flat = flattenComponents(ctx.components);

  for (const comp of flat) {
    const ws = comp.wrapperStyle ?? {};
    for (const field of FORBIDDEN_WRAPPER_FIELDS) {
      if (field in ws) {
        issues.push({
          step: 'verify_constraints',
          code: 'forbidden_wrapper_field',
          componentId: comp.id,
          detail: `wrapperStyle 包含不支持的字段 "${field}"`,
          actual: ws[field],
        });
      }
    }

    // 检查按钮是否有 width 属性
    if (comp.type === 'button' && 'width' in comp.props) {
      issues.push({
        step: 'verify_constraints',
        code: 'button_has_width',
        componentId: comp.id,
        detail: '按钮不支持 width 属性，应使用 widthMode 控制',
        actual: comp.props.width,
      });
    }
  }

  return issues;
}

// ── V7：视觉对比（LLM 多模态） ────────────────────────────────────────

const VISUAL_VERIFY_SYSTEM = `你是邮件模板视觉验证助手。对比原始设计图和当前画布截图，找出明显差异。
输出 JSON 数组，每项包含：{ "area": "区域名称", "issue": "差异描述", "severity": "high|medium|low" }。
如果视觉高度一致，输出空数组 []。
只关注明显的视觉差异（如缺失区块、颜色明显不符、文字布局错误、图片完全不对），忽略细微的字体大小差异。`;

export async function runVisualVerify(
  originalImageDataUrl: string,
  screenshotBase64: string,
  callbacks: Pick<VerifyCallbacks, 'onStepStart' | 'onStepComplete' | 'onStepResult'>,
  signal?: AbortSignal,
): Promise<VerificationIssue[]> {
  callbacks.onStepStart('verify_visual');
  const issues: VerificationIssue[] = [];

  try {
    const messages: LlmMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: originalImageDataUrl } },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` } },
          { type: 'text', text: '第一张是原始设计图，第二张是当前画布截图。请对比找出明显差异，输出 JSON 数组。' },
        ] as LlmMessage['content'],
      },
    ];

    const raw = await callLlmCollect('vision', messages, VISUAL_VERIFY_SYSTEM, signal);
    const parsed = safeParseSimpleJson<Array<{ area: string; issue: string; severity: string }>>(raw);

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.issue && item.severity !== 'low') {
          issues.push({
            step: 'verify_visual',
            code: 'visual_diff',
            detail: `[${item.area ?? '未知区域'}] ${item.issue}`,
          });
        }
      }
    }

    const resultText =
      issues.length === 0
        ? '视觉对比通过，未发现明显差异'
        : `发现 ${issues.length} 处视觉差异：\n${issues.map((i) => `  - ${i.detail}`).join('\n')}`;

    callbacks.onStepResult?.('verify_visual', resultText);
  } catch (err) {
    console.warn('[verify] V7 visual verify failed:', err);
  }

  callbacks.onStepComplete('verify_visual');
  return issues;
}

// ── 主入口：V1-V6 并行 ────────────────────────────────────────────────

export async function runVerifyPipeline(
  ctx: VerifyContext,
  callbacks: VerifyCallbacks,
  signal?: AbortSignal,
): Promise<VerificationIssue[]> {
  // verify_image_match 和 verify_visual(V7) 都需要等 LLM 结果，放在一起让用户体验更连贯
  const steps: VerifyStepName[] = [
    'verify_structure', 'verify_text', 'verify_images',
    'verify_icons', 'verify_spacing', 'verify_typography', 'verify_constraints',
    'verify_image_match',
  ];

  for (const step of steps) callbacks.onStepStart(step);

  const results = await Promise.all([
    // V1
    Promise.resolve(runCheckStructure(ctx)).then((r) => {
      callbacks.onStepComplete('verify_structure');
      const out = formatIssues('verify_structure', r);
      callbacks.onStepResult?.('verify_structure', out);
      return r;
    }),
    // V2
    Promise.resolve(runCheckText(ctx)).then((r) => {
      callbacks.onStepComplete('verify_text');
      callbacks.onStepResult?.('verify_text', formatIssues('verify_text', r));
      return r;
    }),
    // V3
    Promise.resolve(runCheckImages(ctx)).then((r) => {
      callbacks.onStepComplete('verify_images');
      callbacks.onStepResult?.('verify_images', formatIssues('verify_images', r));
      return r;
    }),
    // V4
    Promise.resolve(runCheckIcons(ctx)).then((r) => {
      callbacks.onStepComplete('verify_icons');
      callbacks.onStepResult?.('verify_icons', formatIssues('verify_icons', r));
      return r;
    }),
    // V5
    Promise.resolve(runCheckSpacing(ctx)).then((r) => {
      callbacks.onStepComplete('verify_spacing');
      callbacks.onStepResult?.('verify_spacing', formatIssues('verify_spacing', r));
      return r;
    }),
    // V5b
    Promise.resolve(runCheckTypography(ctx)).then((r) => {
      callbacks.onStepComplete('verify_typography');
      callbacks.onStepResult?.('verify_typography', formatIssues('verify_typography', r));
      return r;
    }),
    // V6
    Promise.resolve(runCheckConstraints(ctx)).then((r) => {
      callbacks.onStepComplete('verify_constraints');
      callbacks.onStepResult?.('verify_constraints', formatIssues('verify_constraints', r));
      return r;
    }),
    // V3b（LLM 调用，与 V7 视觉对比同类，放在最后紧邻 V7）
    runCheckImageMatch(ctx, signal).then((r) => {
      callbacks.onStepComplete('verify_image_match');
      callbacks.onStepResult?.('verify_image_match', formatIssues('verify_image_match', r));
      return r;
    }),
  ]);

  return results.flat();
}

// ── 工具函数 ──────────────────────────────────────────────────────────

function formatIssues(step: string, issues: VerificationIssue[]): string {
  if (issues.length === 0) return `✓ 通过`;
  return issues.map((i) => `✗ [${i.code}] ${i.detail ?? ''}`).join('\n');
}

function safeParseSimpleJson<T>(raw: string): T | null {
  try {
    const match = raw.match(/```(?:json)?\s*([\s\S]+?)```/) ?? raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    const str = match ? match[1].trim() : raw.trim();
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/** 将 VerificationIssue[] 转换为适合 LLM fix step 的任务描述 */
export function issueToTaskDescription(issue: VerificationIssue): string {
  const parts: string[] = [];
  if (issue.detail) parts.push(issue.detail);
  if (issue.componentId) parts.push(`目标组件 ID: ${issue.componentId}`);
  if (issue.expected !== undefined) parts.push(`期望值: ${JSON.stringify(issue.expected)}`);
  if (issue.actual !== undefined) parts.push(`当前值: ${JSON.stringify(issue.actual)}`);
  if (issue.suggestedQuery) parts.push(`建议搜索词: ${issue.suggestedQuery}`);
  return parts.join('；');
}

/** 根据 issue 类型返回该步骤需要的最小工具集描述（若已知 componentId 则省略 getTemplateState） */
export function getMinimalToolsForIssue(issue: VerificationIssue): string {
  const hasComponentId = !!issue.componentId;
  if (issue.code === 'should_replace' || issue.code === 'empty_src' || issue.code === 'invalid_src') {
    return hasComponentId ? MINIMAL_TOOLS_IMAGE_FIX_WITH_ID : MINIMAL_TOOLS_IMAGE_FIX;
  }
  if (issue.code === 'missing_text' || issue.code === 'missing') {
    return MINIMAL_TOOLS_ADD_FIX;
  }
  return hasComponentId ? MINIMAL_TOOLS_UPDATE_FIX_WITH_ID : MINIMAL_TOOLS_UPDATE_FIX;
}

const MINIMAL_TOOLS_UPDATE_FIX = `可用工具：
- getTemplateState：获取当前组件树（必须先调用以获取最新组件 ID）
- getComponentState：查询单个组件的当前 props/wrapperStyle（componentId）
- getComponentPreview：截图单个组件当前外观（componentId），返回图片供视觉对比
- updateTemplateComponent：更新组件属性（componentId, afterPatch）
- markPlanStepDone：标记当前步骤完成（stepIndex），完成后立即调用`;

const MINIMAL_TOOLS_UPDATE_FIX_WITH_ID = `可用工具：
- getComponentState：查询单个组件的当前 props/wrapperStyle（componentId）
- getComponentPreview：截图单个组件当前外观（componentId），返回图片供视觉对比
- updateTemplateComponent：更新组件属性（componentId, afterPatch）
- markPlanStepDone：标记当前步骤完成（stepIndex），完成后立即调用`;

const MINIMAL_TOOLS_IMAGE_FIX = `可用工具：
- getTemplateState：获取当前组件树
- getComponentState：查询单个组件的当前 props/wrapperStyle（componentId）
- getComponentPreview：截图单个组件当前外观（componentId），返回图片供视觉对比
- searchPexelsImage：搜索 Pexels 图片（query, width, orientation）
- updateTemplateComponent：更新组件 src
- markPlanStepDone：标记当前步骤完成（stepIndex），完成后立即调用`;

const MINIMAL_TOOLS_IMAGE_FIX_WITH_ID = `可用工具：
- getComponentState：查询单个组件的当前 props/wrapperStyle（componentId）
- getComponentPreview：截图单个组件当前外观（componentId），返回图片供视觉对比
- searchPexelsImage：搜索 Pexels 图片（query, width, orientation）
- updateTemplateComponent：更新组件 src
- markPlanStepDone：标记当前步骤完成（stepIndex），完成后立即调用`;

const MINIMAL_TOOLS_ADD_FIX = `可用工具：
- getTemplateState：获取当前组件树
- getComponentState：查询单个组件的当前 props/wrapperStyle（componentId）
- addComponentToTemplate：添加组件（type, parentId, afterPatch）
- updateTemplateComponent：更新组件属性
- markPlanStepDone：标记当前步骤完成（stepIndex），完成后立即调用`;

/** 构造 fix step 的精简 system prompt */
export function buildFixStepSystemPrompt(issue: VerificationIssue, stepIndex: number, totalSteps: number): string {
  const tools = getMinimalToolsForIssue(issue);
  const hasComponentId = !!issue.componentId;
  const componentIdHint = hasComponentId
    ? `\n目标组件 ID: ${issue.componentId}（已确认，可直接使用 getComponentState 查看其当前属性，无需调用 getTemplateState 扫描全树）`
    : '';

  const step1Rule = hasComponentId
    ? `1. 直接调用 getComponentState({ "componentId": "${issue.componentId}" }) 查看当前属性，无需调用 getTemplateState。`
    : `1. **必须先调用 getTemplateState** 获取最新组件树和每个组件的 id 字段，不得跳过或推测 id。`;

  return `你是邮件模板修复助手。当前任务是修复第 ${stepIndex + 1}/${totalSteps} 步。

## 任务
${issueToTaskDescription(issue)}${componentIdHint}

## 执行规则（严格按顺序执行，不得跳过）
${step1Rule}
2. 根据任务执行必要的修复工具调用（updateTemplateComponent 等，使用已知或步骤 1 中获取的真实 id）。
3. 本步骤只有一个任务，完成即可，不要进行范围外的修改。
4. 修复完成后，立即调用 markPlanStepDone({ "stepIndex": ${stepIndex} })，无需其他操作。

## 回复规范
- 每次工具调用前，先用 1-2 句话简述你的分析和操作意图。
- 不要只输出工具调用而不说话；简要的文字说明有助于用户理解修复过程。

${tools}

## 工具调用格式
<tool name="工具名">{"参数名": "值"}</tool>`;
}
