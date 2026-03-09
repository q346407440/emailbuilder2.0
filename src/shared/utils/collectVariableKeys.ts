import type { ComponentRules, EmailComponent, RenderingRules } from '../types/email';
import { mergeRulesIntoComponents } from './mergeRulesIntoComponents';

const CONTENT_PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;
type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

/**
 * 遍历组件树，收集所有变量 key，返回去重后的 string[]。
 * 来源：renderingRules 中的 variableBindings/visibilityCondition/loopBinding，以及 props.content 中的 {{key}}。
 * 需传入 renderingRules 以正确读取 Layer 4 动态字段（Layer 3 组件树为纯静态，不含这些字段）。
 */
export function collectVariableKeys(components: EmailComponent[], renderingRules?: RenderingRules): string[] {
  const keys = new Set<string>();

  // 合併 Layer 4 規則，確保能讀到動態字段
  const merged = renderingRules && Object.keys(renderingRules).length > 0
    ? mergeRulesIntoComponents(components, renderingRules)
    : components;

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;

    const obj = node as Record<string, unknown>;

    if (isEmailComponent(node)) {
      const comp = node as EmailComponentWithRules;
      if (comp.variableBindings) {
        Object.values(comp.variableBindings).forEach((k) => {
          const key = typeof k === 'string' ? k.trim() : '';
          // item.* 是循环区块内的字段占位符，不是独立变量
          if (key && !key.startsWith('item.')) keys.add(key);
        });
      }
      const props = comp.props as unknown as Record<string, unknown>;
      if (typeof props?.content === 'string') {
        let m: RegExpExecArray | null;
        CONTENT_PLACEHOLDER_REGEX.lastIndex = 0;
        while ((m = CONTENT_PLACEHOLDER_REGEX.exec(props.content)) !== null) {
          const key = m[1]?.trim();
          // item.* 是循环区块内的字段占位符，不是独立变量
          if (key && !key.startsWith('item.')) keys.add(key);
        }
      }
      if (comp.visibilityCondition?.variableKey) {
        keys.add(comp.visibilityCondition.variableKey.trim());
      }
      // 循环区块的数组变量本身需要被收集（供 TopNav 分类为 arrayVariable）
      if (comp.loopBinding?.variableKey) {
        keys.add(comp.loopBinding.variableKey.trim());
      }
    }

    for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
        val.forEach(visit);
      } else if (val && typeof val === 'object') {
        visit(val);
      }
    }
  }

  function isEmailComponent(n: unknown): n is EmailComponent {
    return (
      n != null &&
      typeof n === 'object' &&
      'id' in n &&
      'type' in n &&
      'props' in n &&
      'wrapperStyle' in n
    );
  }

  (merged as EmailComponentWithRules[]).forEach(visit);
  return Array.from(keys);
}
