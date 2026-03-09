import type { EmailComponent, RenderingRules } from '../types/email';

/**
 * 將 Layer 4 renderingRules 合併回組件樹（運行時，不修改存儲）。
 * 讓現有的 expandLoopBlocks / resolveVariableValues 等函數無需修改。
 */
export function mergeRulesIntoComponents(
  components: EmailComponent[],
  rules: RenderingRules
): EmailComponent[] {
  if (!rules || Object.keys(rules).length === 0) return components;
  return components.map((node) => mergeNode(node, rules));
}

function mergeNode(node: EmailComponent, rules: RenderingRules): EmailComponent {
  const nodeRules = rules[node.id];
  const merged: EmailComponent = nodeRules
    ? { ...node, ...nodeRules }
    : node;

  if (merged.children && merged.children.length > 0) {
    const mergedChildren = merged.children.map((child) => mergeNode(child, rules));
    return { ...merged, children: mergedChildren };
  }

  return merged;
}
