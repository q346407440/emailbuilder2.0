/**
 * Pipeline 后处理：标准化 LLM 生成组件树中的间距。
 * 在结构生成完成后、返回客户端之前执行。
 *
 * 三条规则：
 *   1. 透明无边框子组件去除 padding
 *      → 此类组件没有视觉「盒子」，间距完全由父 layout/grid 的 gap 决定，
 *        自带 padding 会与父 gap 叠加导致间距失控。
 *      → 适用于父级为 layout 或 grid 的直接子组件。
 *   2. gap 上限：垂直 layout max 48px，水平 layout/grid max 40px
 *   3. padding 上限：上下 max 48px，左右 max 40px
 */

import type { ExpandedEmailComponent } from './expandToFull.js';

// ── 常量 ──────────────────────────────────────────────────────────────────────

const MAX_GAP_VERTICAL_PX = 48;
const MAX_GAP_HORIZONTAL_PX = 40;
const MAX_PADDING_TB_PX = 48;
const MAX_PADDING_LR_PX = 40;

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function parsePx(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}

function capPx(value: string, max: number): string {
  const n = parsePx(value);
  return n > max ? `${max}px` : value;
}

/** 判断背景色是否完全透明 */
function isTransparentBg(wrapperStyle: Record<string, unknown>): boolean {
  const bg = wrapperStyle.backgroundColor;
  if (!bg || bg === 'transparent') return true;
  if (typeof bg !== 'string') return false;
  if (!bg.startsWith('rgba(')) return false;
  const match = bg.match(/rgba\s*\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
  return match ? parseFloat(match[1]) === 0 : false;
}

/** 判断四边均无描边 */
function hasNoBorder(wrapperStyle: Record<string, unknown>): boolean {
  const b = wrapperStyle.border as Record<string, unknown> | undefined;
  if (!b) return true;
  return !b.top && !b.right && !b.bottom && !b.left;
}

function zeroPadding(): Record<string, unknown> {
  return { mode: 'unified', unified: '0' };
}

/** 对 SpacingConfig 各边做上限约束 */
function capSpacing(spacing: unknown): Record<string, unknown> {
  if (!spacing || typeof spacing !== 'object') return zeroPadding();
  const s = spacing as Record<string, unknown>;
  const result = { ...s };

  if (s.mode === 'unified') {
    if (typeof s.unified === 'string') {
      result.unified = capPx(s.unified, MAX_PADDING_TB_PX);
    }
  } else {
    if (typeof s.top === 'string')    result.top    = capPx(s.top,    MAX_PADDING_TB_PX);
    if (typeof s.bottom === 'string') result.bottom = capPx(s.bottom, MAX_PADDING_TB_PX);
    if (typeof s.left === 'string')   result.left   = capPx(s.left,   MAX_PADDING_LR_PX);
    if (typeof s.right === 'string')  result.right  = capPx(s.right,  MAX_PADDING_LR_PX);
  }
  return result;
}

// ── 核心递归 ──────────────────────────────────────────────────────────────────

interface ParentCtx {
  direction: 'horizontal' | 'vertical';
  hasGap: boolean;
}

function normalizeComponent(comp: ExpandedEmailComponent, parent?: ParentCtx): void {
  const ws = comp.wrapperStyle as Record<string, unknown>;
  const props = comp.props as Record<string, unknown>;

  // ── Rule 1：透明无边框 layout 子组件 → 去除 padding ─────────────────────────
  // 条件：有父 layout 提供 gap，且当前组件无背景色、无边框
  // 无论组件自身是 layout 还是其他类型均适用（只要它是 layout 的直接子节点）
  if (parent?.hasGap && isTransparentBg(ws) && hasNoBorder(ws)) {
    ws.padding = zeroPadding();
  } else if (ws.padding) {
    // ── Rule 3：对有视觉盒子的组件做 padding 上限约束 ─────────────────────────
    ws.padding = capSpacing(ws.padding);
  }

  // ── Rule 2：layout / grid 组件 gap 上限 + 递归子节点 ──────────────────────
  if (comp.type === 'layout' || comp.type === 'grid') {
    // layout 有 direction；grid 是多列水平容器
    const direction: 'horizontal' | 'vertical' =
      comp.type === 'grid' || (props.direction as string) === 'horizontal'
        ? 'horizontal'
        : 'vertical';
    const maxGap = direction === 'vertical' ? MAX_GAP_VERTICAL_PX : MAX_GAP_HORIZONTAL_PX;

    if (typeof props.gap === 'string') {
      const gapPx = parsePx(props.gap);
      if (gapPx > maxGap) props.gap = `${maxGap}px`;
    }

    const childGap = parsePx(props.gap as string);
    const childCtx: ParentCtx = { direction, hasGap: childGap > 0 };
    for (const child of comp.children ?? []) {
      normalizeComponent(child, childCtx);
    }
  } else {
    // 非 layout/grid 组件（如 image 的 layoutMode children）也递归，但不传 parentCtx
    // image overlay 内的 padding 是有意义的呼吸空间，不强制清零
    for (const child of comp.children ?? []) {
      normalizeComponent(child, undefined);
    }
  }
}

// ── 公共入口 ──────────────────────────────────────────────────────────────────

/**
 * 对 pipeline 生成的顶层组件数组做 spacing 标准化。
 * 原地修改后返回，不产生新对象（性能友好）。
 */
export function normalizeSpacing(components: ExpandedEmailComponent[]): ExpandedEmailComponent[] {
  for (const comp of components) {
    normalizeComponent(comp, undefined);
  }
  return components;
}
