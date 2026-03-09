/**
 * Step 4 修正应用：解析路径、应用 patch。
 */

import { deepMerge } from '../../utils/deepMerge.js';
import { resolveTokenRefs } from './resolveTokens.js';
import { expandWrapperShorthand } from './expandToFull.js';
import type { ExpandedEmailComponent } from './expandToFull.js';
import type { Adjustment, ResolvedTokens } from './types.js';

// ── 路径解析 ─────────────────────────────────────────────────────────

/**
 * 解析 "children[2].children[0]" → 找到目标节点。
 * 路径相对于根组件，例如 "children[2]" 表示根组件的第 3 个子组件。
 */
export function resolveComponentPath(
  root: ExpandedEmailComponent,
  pathStr: string,
): ExpandedEmailComponent | null {
  if (!pathStr || pathStr.trim() === '') return root;

  const segments = pathStr.match(/children\[(\d+)\]/g);
  if (!segments) return null;

  let current: ExpandedEmailComponent = root;
  for (const seg of segments) {
    const indexMatch = seg.match(/\[(\d+)\]/);
    if (!indexMatch) return null;
    const index = parseInt(indexMatch[1], 10);
    if (!current.children || index >= current.children.length) return null;
    current = current.children[index];
  }

  return current;
}

// ── 修正应用 ─────────────────────────────────────────────────────────

export function applyAdjustments(
  fullTree: ExpandedEmailComponent,
  adjustments: Adjustment[],
  tokens: ResolvedTokens,
): ExpandedEmailComponent {
  const tree = structuredClone(fullTree);

  for (const adj of adjustments) {
    const target = resolveComponentPath(tree, adj.path);
    if (!target) continue;

    const fix = resolveTokenRefs(adj.fix as Record<string, unknown>, tokens);

    if (fix.props && typeof fix.props === 'object') {
      target.props = deepMerge(
        target.props,
        fix.props as Record<string, unknown>,
      );
    }

    if (fix.wrapper && typeof fix.wrapper === 'object') {
      const expandedWrapper = expandWrapperShorthand(
        fix.wrapper as Record<string, unknown>,
      );
      target.wrapperStyle = deepMerge(
        target.wrapperStyle,
        expandedWrapper,
      );
    }
  }

  return tree;
}
