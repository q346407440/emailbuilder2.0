/**
 * 递归深合并工具函数。
 * target 为基底，source 中的非 undefined 值覆盖 target。
 * 数组直接替换（不逐元素合并），纯对象递归合并。
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const srcVal = (source as Record<string, unknown>)[key];
    if (srcVal === undefined) continue;

    const tgtVal = result[key];

    if (
      isPlainObject(tgtVal) &&
      isPlainObject(srcVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>
      );
    } else {
      result[key] = srcVal;
    }
  }

  return result as T;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}
