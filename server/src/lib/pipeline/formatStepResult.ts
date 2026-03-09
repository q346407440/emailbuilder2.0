/**
 * 将各 pipeline 步骤的原始 JSON 输出格式化为用户可读的文本。
 * 仅做规则转换，不调用 LLM。
 */

import type {
  GroundingSection,
  ExtractedIcon,
  ExtractedRegionText,
  ResolvedTokens,
} from './types.js';

function formatGrounding(data: unknown): string {
  if (!Array.isArray(data) || data.length === 0) return '未识别到任何区域';
  const sections = data as GroundingSection[];
  const lines: string[] = [`识别到 ${sections.length} 个区域：`];
  for (const s of sections) {
    lines.push(`• ${s.id}  —  ${s.region}`);
    if (s.components) {
      lines.push(`  内容：${s.components}`);
    }
    if (s.layoutHints?.align) {
      lines.push(`  对齐：${s.layoutHints.align}`);
    }
  }
  return lines.join('\n');
}

function formatTokens(data: unknown): string {
  if (!data || typeof data !== 'object') return '（无设计风格数据）';
  const t = data as Partial<ResolvedTokens>;
  const lines: string[] = ['提取到以下设计风格：'];

  if (t.colors) {
    lines.push('\n颜色：');
    const entries: Array<[string, string]> = [
      ['主色', t.colors.primary],
      ['标题色', t.colors.heading],
      ['正文色', t.colors.body],
      ['强调色', t.colors.accent],
      ['淡底色', t.colors.mutedBg],
      ['卡片色', t.colors.cardBg],
    ];
    for (const [label, val] of entries) {
      if (val) lines.push(`  ${label}  ${val}`);
    }
  }

  if (t.canvasBg || t.contentBg) {
    lines.push('\n画布：');
    if (t.canvasBg) lines.push(`  画布背景  ${t.canvasBg}`);
    if (t.contentBg) lines.push(`  内容背景  ${t.contentBg}`);
  }

  if (t.typography) {
    lines.push('\n排版：');
    const ty = t.typography as Record<string, { fontSize?: string; fontWeight?: string }>;
    const typoMap: Array<[string, string]> = [
      ['h1', '大标题'],
      ['h2', '小标题'],
      ['body', '正文'],
      ['caption', '辅助'],
    ];
    for (const [key, label] of typoMap) {
      const entry = ty[key];
      if (entry?.fontSize) {
        const weight = entry.fontWeight ? `  字重 ${entry.fontWeight}` : '';
        lines.push(`  ${label}  ${entry.fontSize}${weight}`);
      }
    }
  }

  if (t.spacing) {
    lines.push('\n间距：');
    const sp = t.spacing as unknown as Record<string, unknown>;
    const spacingMap: Array<[string, string]> = [
      ['section', '区块'],
      ['element', '元素'],
      ['tight', '紧凑'],
      ['containerMaxWidth', '最大宽度'],
    ];
    for (const [key, label] of spacingMap) {
      if (sp[key]) lines.push(`  ${label}  ${sp[key]}`);
    }
  }

  return lines.join('\n');
}

function formatIcons(data: unknown): string {
  if (!Array.isArray(data)) return '（无图标数据）';
  const icons = data as ExtractedIcon[];
  if (icons.length === 0) return '（未提取到图标）';
  const lines: string[] = [`提取到 ${icons.length} 个图标：`];
  for (const icon of icons) {
    const kind = icon.systemIconType
      ? `系统内置（${icon.systemIconType}）`
      : icon.svgDataUrl
        ? '自定义 SVG'
        : '待提取';
    lines.push(`• ${icon.id}  —  ${icon.label}（${kind}）`);
  }
  return lines.join('\n');
}

function formatTexts(data: unknown): string {
  if (!Array.isArray(data)) return '（无文案数据）';
  const regions = data as ExtractedRegionText[];
  if (regions.length === 0) return '（未提取到文案）';
  const total = regions.reduce((sum, r) => sum + r.texts.length, 0);
  const lines: string[] = [`提取到 ${regions.length} 个区域、共 ${total} 段文案：`];
  for (const region of regions) {
    lines.push(`\n• [${region.regionId}]`);
    for (const text of region.texts) {
      const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
      lines.push(`  "${preview}"`);
    }
  }
  return lines.join('\n');
}

export type FormattableStep = 'grounding' | 'tokens' | 'icon_extraction' | 'text_extraction';

const FORMATTABLE_STEPS = new Set<string>(['grounding', 'tokens', 'icon_extraction', 'text_extraction']);

export function isFormattableStep(step: string): step is FormattableStep {
  return FORMATTABLE_STEPS.has(step);
}

export function formatStepResultForDisplay(step: string, rawJson: string): string {
  if (!isFormattableStep(step)) return rawJson;
  try {
    const data: unknown = JSON.parse(rawJson);
    switch (step) {
      case 'grounding': return formatGrounding(data);
      case 'tokens': return formatTokens(data);
      case 'icon_extraction': return formatIcons(data);
      case 'text_extraction': return formatTexts(data);
    }
  } catch {
    // JSON parse failed, return raw
  }
  return rawJson;
}
