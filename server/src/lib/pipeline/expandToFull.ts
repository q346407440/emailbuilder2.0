/**
 * Compact → Full 展开：将 LLM 输出的极简 compact 格式转为完整 EmailComponent 树。
 */

import { nanoid } from 'nanoid';
import { deepMerge } from '../../utils/deepMerge.js';
import { resolveTokenRefs } from './resolveTokens.js';
import { DEFAULT_PROPS_BY_TYPE, DEFAULT_WRAPPER_BY_TYPE } from './presets.js';
import type {
  CompactComponent,
  CompactOutput,
  ResolvedTokens,
  CompactComponentType,
  ExtractedIcon,
} from './types.js';

const VALID_TYPES = new Set<string>([
  'layout', 'grid', 'text', 'image', 'button', 'divider', 'icon',
]);

const MAX_NODES = 60;

// ── wrapper 简写展开 ─────────────────────────────────────────────────

export function expandWrapperShorthand(
  partial: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(partial)) {
    switch (key) {
      case 'padding':
        result[key] = expandSpacingShorthand(value);
        break;
      case 'margin':
        // 组件间距由父容器 gap 控制，禁止 LLM 通过 wrapper.margin 引入额外间距
        // 此处丢弃 LLM 输出的 margin，默认值 0 由 BASE_WRAPPER 的 deepMerge 保证
        break;
      case 'bg':
        result.backgroundType = 'color';
        result.backgroundColor = value;
        break;
      case 'borderRadius':
        if (typeof value === 'string') {
          result.borderRadius = { mode: 'unified', unified: value };
        } else {
          result.borderRadius = value;
        }
        break;
      case 'contentAlign':
        result.contentAlign = expandContentAlign(value);
        break;
      case 'widthMode':
        result.widthMode = value;
        break;
      case 'heightMode':
        result.heightMode = value;
        break;
      case 'border':
        result.border = expandBorderShorthand(value);
        break;
      default: {
        const VALID_WRAPPER_KEYS = new Set([
          'widthMode', 'heightMode', 'fixedWidth', 'fixedHeight',
          'backgroundType', 'backgroundColor', 'backgroundImage',
          'padding', 'margin', 'border', 'borderRadius', 'contentAlign',
        ]);
        if (VALID_WRAPPER_KEYS.has(key)) {
          result[key] = value;
        }
        break;
      }
    }
  }

  return result;
}

function expandSpacingShorthand(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parts = value.trim().split(/\s+/);
    if (parts.length === 1) {
      return { mode: 'unified', unified: parts[0] };
    }
    if (parts.length === 2) {
      return {
        mode: 'separate',
        top: parts[0], right: parts[1],
        bottom: parts[0], left: parts[1],
      };
    }
    if (parts.length === 4) {
      return {
        mode: 'separate',
        top: parts[0], right: parts[1],
        bottom: parts[2], left: parts[3],
      };
    }
    return { mode: 'unified', unified: parts[0] };
  }
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return { mode: 'unified', unified: '0' };
}

function expandContentAlign(value: unknown): Record<string, string> {
  if (typeof value === 'string') {
    const parts = value.trim().split(/\s+/);
    const horizontal = parts[0] || 'center';
    const vertical = parts[1] || 'top';
    return { horizontal, vertical };
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, string>;
    return {
      horizontal: obj.horizontal || 'center',
      vertical: obj.vertical || 'top',
    };
  }
  return { horizontal: 'center', vertical: 'top' };
}

function expandBorderShorthand(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  const src = value as Record<string, unknown>;
  const base: Record<string, unknown> = {
    mode: 'unified',
    top: false, right: false, bottom: false, left: false,
    unified: '1px',
    color: '#E0E5EB',
    style: 'solid',
  };
  for (const [k, v] of Object.entries(src)) {
    base[k] = v;
  }
  const hasSides = ['top', 'right', 'bottom', 'left'].some(
    (s) => base[s] === true
  );
  if (!hasSides) {
    base.top = true;
    base.right = true;
    base.bottom = true;
    base.left = true;
  }
  return base;
}

// ── Compact → Full 递归展开 ──────────────────────────────────────────

let nodeCount = 0;
let iconMap: Map<string, string> = new Map();

export interface ExpandedEmailComponent {
  id: string;
  type: string;
  wrapperStyle: Record<string, unknown>;
  props: Record<string, unknown>;
  children?: ExpandedEmailComponent[];
}

/** 将 $icon.xxx 引用替换为真实 SVG Data URL */
function resolveIconRefs(props: Record<string, unknown>): Record<string, unknown> {
  const result = { ...props };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && value.startsWith('$icon.')) {
      const iconId = value.slice('$icon.'.length);
      const svgDataUrl = iconMap.get(iconId);
      if (svgDataUrl) {
        result[key] = svgDataUrl;
      }
    }
  }
  return result;
}

function expandSingle(
  compact: CompactComponent,
  tokens: ResolvedTokens,
): ExpandedEmailComponent | null {
  if (nodeCount >= MAX_NODES) return null;

  if (!compact.type || !VALID_TYPES.has(compact.type)) return null;
  nodeCount++;

  const id = nanoid();
  const type = compact.type as CompactComponentType;

  // 1. 解析 props Token 引用，并替换 $icon.xxx 引用
  const resolvedProps = resolveIconRefs(resolveTokenRefs(compact.props ?? {}, tokens));

  // 2. 处理 $typo 快捷引用
  const typoKey = resolvedProps.$typo as string | undefined;
  if (typoKey) {
    const normalizedKey = typeof typoKey === 'string' && typoKey.startsWith('$')
      ? typoKey.slice(1).replace(/^typo\./, '')
      : typoKey;
    const typo = tokens.typography[normalizedKey];
    if (typo) {
      if (!resolvedProps.fontSize) resolvedProps.fontSize = typo.fontSize;
      if (!resolvedProps.fontWeight) resolvedProps.fontWeight = typo.fontWeight;
    }
    delete resolvedProps.$typo;
  }

  // 3. 合并默认 props
  const defaultProps = structuredClone(DEFAULT_PROPS_BY_TYPE[type]) ?? {};
  const finalProps = deepMerge(defaultProps, resolvedProps);

  // 4. Grid slots 自动计算
  if (type === 'grid' && compact.children) {
    const childCount = compact.children.length;
    const columnsPerRow = (finalProps.columnsPerRow as number) ?? 2;
    if (childCount > 0) {
      finalProps.slots = Math.max(childCount, columnsPerRow);
    }
  }

  // 5. 解析 wrapper Token 引用（初步）
  const resolvedWrapper = resolveTokenRefs(compact.wrapper ?? {}, tokens);

  // 6. 展开 wrapper 简写
  const expandedWrapper = expandWrapperShorthand(resolvedWrapper);

  // 6.5 再次解析：shorthand 展开后可能暴露嵌入在字符串中的 $ 引用
  const fullyResolvedWrapper = resolveTokenRefs(expandedWrapper, tokens);

  // 7. 合并默认 WrapperStyle
  const defaultWrapper = structuredClone(DEFAULT_WRAPPER_BY_TYPE[type]) ?? {};
  const finalWrapper = deepMerge(defaultWrapper, fullyResolvedWrapper);

  // 8. 递归处理 children
  let children: ExpandedEmailComponent[] | undefined;
  if (compact.children && Array.isArray(compact.children)) {
    children = [];
    for (const child of compact.children) {
      if (typeof child !== 'object' || child === null) continue;
      const expanded = expandSingle(child, tokens);
      if (expanded) children.push(expanded);
    }
    if (children.length === 0) children = undefined;
  }

  // 9. Grid: 确保 slots 等于实际 children 数量（避免空槽位）
  if (type === 'grid' && children) {
    finalProps.slots = children.length;
  }

  // 9.5 水平 layout：text/icon 子组件的 widthMode 自动修正为 fitContent
  // 在水平排列中，text/icon 若使用 fill 会等分宽度导致文字换行，应按内容收缩
  if (type === 'layout' && finalProps.direction === 'horizontal' && children) {
    children = children.map((child) => {
      if (child.type === 'text' || child.type === 'icon') {
        const ws = child.wrapperStyle as Record<string, unknown>;
        if (ws.widthMode === 'fill') {
          return { ...child, wrapperStyle: { ...ws, widthMode: 'fitContent' } };
        }
      }
      return child;
    });
  }

  // 10. Image: 有 children 时自动开启布局模式（LLM 无需显式写 layoutMode: true）
  if (type === 'image' && children && children.length > 0) {
    if (!finalProps.layoutMode) finalProps.layoutMode = true;
    if (!finalProps.layoutContentAlign) finalProps.layoutContentAlign = 'center';
    if (!finalProps.layoutPadding) finalProps.layoutPadding = '24px';
  }

  return {
    id,
    type,
    wrapperStyle: finalWrapper,
    props: finalProps,
    ...(children ? { children } : {}),
  };
}

export function expandToFull(
  compact: CompactComponent,
  tokens: ResolvedTokens,
  extractedIcons: ExtractedIcon[] = [],
): ExpandedEmailComponent | null {
  nodeCount = 0;
  iconMap = new Map(
    extractedIcons
      .filter((ic): ic is ExtractedIcon & { svgDataUrl: string } => typeof ic.svgDataUrl === 'string')
      .map((ic) => [ic.id, ic.svgDataUrl])
  );
  return expandSingle(compact, tokens);
}

// ── Canvas 配置构建 ──────────────────────────────────────────────────

export interface ExpandedCanvasConfig {
  outerBackgroundColor: string;
  backgroundType: 'color';
  backgroundColor: string;
  padding: Record<string, unknown>;
  margin: Record<string, unknown>;
  border: Record<string, unknown>;
  borderRadius: Record<string, unknown>;
  contentAlign: Record<string, string>;
  width: string;
  fontFamily: string;
}

export function buildCanvasConfig(
  canvas: CompactOutput['canvas'],
  tokens: ResolvedTokens,
): ExpandedCanvasConfig {
  const resolved = canvas
    ? resolveTokenRefs(canvas as Record<string, unknown>, tokens)
    : {};

  const rawBg = resolved.bg as string | undefined;
  const rawContentBg = resolved.contentBg as string | undefined;
  const outerBg = (rawBg && !rawBg.startsWith('$')) ? rawBg : tokens.canvasBg;
  const innerBg = (rawContentBg && !rawContentBg.startsWith('$')) ? rawContentBg : tokens.contentBg;

  return {
    outerBackgroundColor: outerBg,
    backgroundType: 'color',
    backgroundColor: innerBg,
    padding: { mode: 'unified', unified: '0' },
    margin: { mode: 'unified', unified: '0' },
    border: {
      mode: 'unified',
      top: false, right: false, bottom: false, left: false,
      unified: '1px', color: '#E0E5EB', style: 'solid',
    },
    borderRadius: { mode: 'unified', unified: '0' },
    contentAlign: { horizontal: 'center', vertical: 'top' },
    width: (resolved.width as string) ?? '600px',
    fontFamily: "'Source Sans 3', sans-serif",
  };
}

// ── JSON 容错解析 ────────────────────────────────────────────────────

export function safeParseJson<T = unknown>(raw: string): T | null {
  const trimmed = raw.trim();

  // 1) 尝试直接解析整段文本（最快、最准确）
  try {
    return JSON.parse(trimmed) as T;
  } catch { /* continue */ }

  // 2) 尝试用正则提取——优先尝试数组，避免 {[\s\S]*} 贪婪匹配跨越多个对象
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T;
    } catch {
      const fixed = fixCommonJsonErrors(arrayMatch[0]);
      try { return JSON.parse(fixed) as T; } catch { /* continue */ }
    }
  }

  // 3) 最后尝试提取单个对象
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch {
      const fixed = fixCommonJsonErrors(jsonMatch[0]);
      try { return JSON.parse(fixed) as T; } catch { /* continue */ }
    }
  }

  return null;
}

function fixCommonJsonErrors(raw: string): string {
  return raw
    .replace(/,\s*}/g, '}')
    .replace(/,\s*\]/g, ']')
    .replace(/'/g, '"');
}
