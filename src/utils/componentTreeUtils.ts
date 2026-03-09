/**
 * 组件树按路径操作工具
 *
 * 供后端 API（如 update_component_in_template）与未来 MCP/Agent 使用。
 * path 为从根开始的 children 索引数组，例如 [0, 1] 表示根下第 1 个节点的第 2 个子节点。
 */

import type { EmailComponent, WrapperStyle } from '../types/email';

/** 按路径取得的节点；path 为空时表示根数组本身，返回 null 表示需从根遍历 */
export function getNodeAtPath(
  components: EmailComponent[],
  path: number[]
): EmailComponent | null {
  if (path.length === 0) return null;
  let current: EmailComponent[] = components;
  for (let i = 0; i < path.length; i++) {
    const idx = path[i];
    if (idx < 0 || idx >= current.length) return null;
    const node = current[idx];
    if (i === path.length - 1) return node;
    if (!node.children?.length) return null;
    current = node.children;
  }
  return null;
}

/**
 * 在组件树的指定路径节点上套用部分更新（props / wrapperStyle merge）。
 * 返回新的根组件数组（不可变更新）。
 */
export function applyPatchAtPath(
  components: EmailComponent[],
  path: number[],
  patch: {
    props?: Record<string, unknown>;
    wrapperStyle?: Partial<WrapperStyle>;
  }
): EmailComponent[] {
  if (path.length === 0) return components;

  function apply(
    list: EmailComponent[],
    pathIdx: number
  ): EmailComponent[] {
    const idx = path[pathIdx];
    if (idx < 0 || idx >= list.length) return list;

    const node = list[idx];
    const isTarget = pathIdx === path.length - 1;

    if (isTarget) {
      const next: EmailComponent = { ...node };
      if (patch.props != null) {
        next.props = { ...node.props, ...patch.props } as EmailComponent['props'];
      }
      if (patch.wrapperStyle != null) {
        next.wrapperStyle = { ...node.wrapperStyle, ...patch.wrapperStyle };
      }
      return list.map((c, i) => (i === idx ? next : c));
    }

    if (!node.children?.length) return list;
    const newChildren = apply(node.children, pathIdx + 1);
    if (newChildren === node.children) return list;
    return list.map((c, i) =>
      i === idx ? { ...c, children: newChildren } : c
    );
  }

  return apply(components, 0);
}
