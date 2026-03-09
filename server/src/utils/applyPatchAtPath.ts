/**
 * 組件樹按 path 套用 patch（與前端 componentTreeUtils 邏輯一致）
 * 使用泛型，不依賴前端類型。
 */

export type TreeNode = {
  id: string;
  props: Record<string, unknown>;
  wrapperStyle: Record<string, unknown>;
  children?: TreeNode[];
};

export function applyPatchAtPath(
  components: TreeNode[],
  path: number[],
  patch: { props?: Record<string, unknown>; wrapperStyle?: Record<string, unknown> }
): TreeNode[] {
  if (path.length === 0) return components;

  function apply(list: TreeNode[], pathIdx: number): TreeNode[] {
    const idx = path[pathIdx];
    if (idx < 0 || idx >= list.length) return list;

    const node = list[idx];
    const isTarget = pathIdx === path.length - 1;

    if (isTarget) {
      const next: TreeNode = { ...node };
      const baseProps = node.props && typeof node.props === 'object' ? node.props : {};
      const baseWrapper = node.wrapperStyle && typeof node.wrapperStyle === 'object' ? node.wrapperStyle : {};
      if (patch.props != null) {
        next.props = { ...baseProps, ...patch.props };
      } else if (!next.props) {
        next.props = { ...baseProps };
      }
      if (patch.wrapperStyle != null) {
        next.wrapperStyle = { ...baseWrapper, ...patch.wrapperStyle };
      } else if (!next.wrapperStyle) {
        next.wrapperStyle = { ...baseWrapper };
      }
      return list.map((c, i) => (i === idx ? next : c));
    }

    if (!node.children?.length) return list;
    const newChildren = apply(node.children as TreeNode[], pathIdx + 1);
    if (newChildren === node.children) return list;
    return list.map((c, i) =>
      i === idx ? { ...c, children: newChildren } : c
    );
  }

  return apply(components, 0);
}
