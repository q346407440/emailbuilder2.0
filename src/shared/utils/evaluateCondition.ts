import type { SimpleCondition } from '../types/email';

/**
 * 对单条件求值。
 * - variableKey 为空时视为条件不完整，始终返回 true（不隐藏组件）。
 * - data 中不存在该 key 时，取值视为空字符串。
 * - 数值类运算符（gt/gte/lt/lte）：两侧均解析为浮点数，任一侧 NaN 时返回 false。
 */
export function evaluateCondition(
  condition: SimpleCondition,
  data: Record<string, string>,
): boolean {
  if (!condition.variableKey) return true;
  const val = data[condition.variableKey] ?? '';
  switch (condition.operator) {
    case 'eq':         return val === (condition.value ?? '');
    case 'neq':        return val !== (condition.value ?? '');
    case 'isEmpty':    return val === '';
    case 'isNotEmpty': return val !== '';
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = parseFloat(val);
      const b = parseFloat(condition.value ?? '');
      if (isNaN(a) || isNaN(b)) return false;
      if (condition.operator === 'gt')  return a > b;
      if (condition.operator === 'gte') return a >= b;
      if (condition.operator === 'lt')  return a < b;
      return a <= b;
    }
    default: return true;
  }
}
