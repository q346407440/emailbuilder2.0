import { evaluateCondition } from './evaluateCondition';
import type { ComponentRules, EmailComponent } from '../types/email';

type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

/**
 * 对单个组件解析条件分支：
 * 按顺序找到首个条件满足的分支，将其 propsOverride / wrapperStyleOverride 浅合并到
 * 组件的 props / wrapperStyle 上，返回新组件对象。
 * 若无分支或均不满足条件，原样返回。
 */
export function resolveComponentBranch(
  comp: EmailComponent,
  data: Record<string, string>,
): EmailComponent {
  const compWithRules = comp as EmailComponentWithRules;
  if (!compWithRules.conditionalBranches || compWithRules.conditionalBranches.length === 0) return comp;

  for (const branch of compWithRules.conditionalBranches) {
    if (!branch.condition?.variableKey) continue;
    if (evaluateCondition(branch.condition, data)) {
      return {
        ...comp,
        props: { ...comp.props, ...branch.propsOverride } as EmailComponent['props'],
        wrapperStyle: branch.wrapperStyleOverride
          ? { ...comp.wrapperStyle, ...branch.wrapperStyleOverride }
          : comp.wrapperStyle,
      };
    }
  }
  return comp;
}

/**
 * 对组件列表（及其子组件）递归解析条件分支。
 * 应在 resolveVariableValues 之前调用，以确保分支内容中的 {{key}} 占位符也能被后续变量替换处理。
 */
export function resolveConditionalBranches(
  components: EmailComponent[],
  data: Record<string, string>,
): EmailComponent[] {
  return components.map((comp) => {
    const resolved = resolveComponentBranch(comp, data);
    if (resolved.children && resolved.children.length > 0) {
      return {
        ...resolved,
        children: resolveConditionalBranches(resolved.children, data),
      };
    }
    return resolved;
  });
}
