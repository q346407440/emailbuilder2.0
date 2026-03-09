import type { EmailComponent } from '../types/email';

/**
 * 变量绑定已在存储层完成统一，运行时直接返回。
 */
export function normalizeComponentVariableBinding(component: EmailComponent): EmailComponent {
  return component;
}

/**
 * 递归归一化整棵组件树中的变量绑定（当前仅深拷贝递归，保留接口稳定）。
 */
export function normalizeTreeVariableBindings(components: EmailComponent[]): EmailComponent[] {
  return components.map((c) => {
    const normalized = normalizeComponentVariableBinding(c);
    if (normalized.children?.length) {
      return {
        ...normalized,
        children: normalizeTreeVariableBindings(normalized.children),
      };
    }
    return normalized;
  });
}
