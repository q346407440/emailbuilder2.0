/**
 * 将用户粘贴的任意 JSON 字符串解析为扁平化字段路径列表。
 *
 * 规则：
 * - 对象字段递归展开，路径用 "." 连接
 * - 数组字段：取第一个元素推断子字段结构，路径用 "[]." 连接
 *   例：data[].title、data[].price
 * - 数组本身也作为一个独立条目输出（type: "array"），供绑定数组变量使用
 * - 最大递归深度 8，防止超深嵌套
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'unknown';

export interface SchemaField {
  /** 字段路径，如 "customer.name"、"data"、"data[].title" */
  path: string;
  /** 字段类型 */
  type: FieldType;
  /** 是否为数组子字段（路径含 "[]."） */
  isArrayItem: boolean;
  /** 示例值（字符串化，最多 60 字符） */
  exampleValue?: string;
}

function inferType(value: unknown): FieldType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'object') return 'object';
  return 'unknown';
}

function toExampleString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return '';
  const s = String(value);
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
}

function collectFields(
  obj: unknown,
  prefix: string,
  isArrayItem: boolean,
  depth: number,
  result: SchemaField[]
): void {
  if (depth > 8) return;
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return;

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const type = inferType(value);

    if (type === 'array') {
      result.push({ path, type: 'array', isArrayItem, exampleValue: undefined });
      const arr = value as unknown[];
      if (arr.length > 0 && arr[0] !== null && typeof arr[0] === 'object' && !Array.isArray(arr[0])) {
        collectFields(arr[0], `${path}[]`, true, depth + 1, result);
      } else if (arr.length > 0) {
        const itemType = inferType(arr[0]);
        result.push({ path: `${path}[]`, type: itemType, isArrayItem: true, exampleValue: toExampleString(arr[0]) });
      }
    } else if (type === 'object') {
      result.push({ path, type: 'object', isArrayItem, exampleValue: undefined });
      collectFields(value, path, isArrayItem, depth + 1, result);
    } else {
      result.push({ path, type, isArrayItem, exampleValue: toExampleString(value) });
    }
  }
}

/**
 * 解析 JSON 字符串，返回扁平化字段列表。
 * 解析失败时返回 null。
 */
export function parseJsonSchema(jsonStr: string): SchemaField[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  const result: SchemaField[] = [];

  if (Array.isArray(parsed)) {
    result.push({ path: '$', type: 'array', isArrayItem: false });
    if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      collectFields(parsed[0], '$[]', true, 1, result);
    }
  } else if (typeof parsed === 'object' && parsed !== null) {
    collectFields(parsed, '', false, 0, result);
  } else {
    return null;
  }

  return result;
}

/**
 * 从 SchemaField[] 中筛选出可绑定标量变量的字段（string/number/boolean）
 */
export function getScalarFields(fields: SchemaField[]): SchemaField[] {
  return fields.filter((f) => f.type === 'string' || f.type === 'number' || f.type === 'boolean');
}

/**
 * 从 SchemaField[] 中筛选出数组类型字段（可绑定 array 变量）
 */
export function getArrayFields(fields: SchemaField[]): SchemaField[] {
  return fields.filter((f) => f.type === 'array');
}

/**
 * 获取某个数组字段的所有子字段（isArrayItem = true 且路径以 arrayPath + "[]" 开头）
 */
export function getArrayItemFields(fields: SchemaField[], arrayPath: string): SchemaField[] {
  const prefix = `${arrayPath}[].`;
  return fields.filter((f) => f.isArrayItem && f.path.startsWith(prefix));
}
