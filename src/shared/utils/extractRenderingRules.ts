import type { EmailComponent, ComponentRules, RenderingRules } from '../types/email';

/**
 * 從混合組件樹中提取 renderingRules，並返回純靜態組件樹。
 * 用於遷移腳本：將舊格式（動態字段混入組件樹）轉為新格式（Layer 3 純靜態 + Layer 4 規則分離）。
 */
export function extractRenderingRules(components: EmailComponent[]): {
  staticComponents: EmailComponent[];
  renderingRules: RenderingRules;
} {
  const rules: RenderingRules = {};
  const staticComponents = components.map((node) => extractNode(node, rules));
  return { staticComponents, renderingRules: rules };
}

function extractNode(node: EmailComponent, rules: RenderingRules): EmailComponent {
  const { variableBindings, visibilityCondition, conditionalBranches, loopBinding, ...rest } = node as EmailComponent & {
    variableBindings?: unknown;
    visibilityCondition?: unknown;
    conditionalBranches?: unknown;
    loopBinding?: unknown;
  };

  const nodeRules: ComponentRules = {};
  let hasRules = false;

  if (variableBindings !== undefined) {
    nodeRules.variableBindings = variableBindings as ComponentRules['variableBindings'];
    hasRules = true;
  }
  if (visibilityCondition !== undefined) {
    nodeRules.visibilityCondition = visibilityCondition as ComponentRules['visibilityCondition'];
    hasRules = true;
  }
  if (conditionalBranches !== undefined) {
    nodeRules.conditionalBranches = conditionalBranches as ComponentRules['conditionalBranches'];
    hasRules = true;
  }
  if (loopBinding !== undefined) {
    nodeRules.loopBinding = loopBinding as ComponentRules['loopBinding'];
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
