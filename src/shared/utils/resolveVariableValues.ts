import type { ComponentRules, EmailComponent, ProductBindingSnapshot } from '../types/email';

const VARIABLE_KEY_TO_SNAPSHOT_KEY: Record<string, keyof ProductBindingSnapshot> = {
  'product.imageUrl': 'imageUrl',
  'product.title': 'title',
  'product.price': 'price',
  'product.compareAtPrice': 'compareAtPrice',
  'product.url': 'url',
};

const CONTENT_PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;
type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

function getValueFromSnapshot(key: string, snapshot: ProductBindingSnapshot): string {
  const prop = VARIABLE_KEY_TO_SNAPSHOT_KEY[key];
  if (prop) {
    const v = snapshot[prop];
    return typeof v === 'string' ? v : '';
  }
  return '';
}

/**
 * 用 previewData + 组件的 variablePreviewSource 解析组件树中的变量，返回新树（不修改原树）。
 */
export function resolveVariableValues(
  components: EmailComponent[],
  previewData: Record<string, string>
): EmailComponent[] {
  return components.map((c) => resolveNode(c, previewData));
}

function resolveNode(
  node: EmailComponent,
  previewData: Record<string, string>
): EmailComponent {
  const nodeWithRules = node as EmailComponentWithRules;
  const vb = nodeWithRules.variableBindings;
  const snapshot =
    node.variablePreviewSource?.type === 'product' ? node.variablePreviewSource.snapshot : null;

  let newProps = node.props as unknown as Record<string, unknown>;

  // 1) variableBindings：用 previewData 或 snapshot（product.*）填充
  if (vb && typeof newProps === 'object') {
    newProps = { ...newProps } as Record<string, unknown>;
    for (const [propPath, variableKey] of Object.entries(vb)) {
      if (typeof variableKey !== 'string') continue;
      let value: string;
      if (variableKey.startsWith('product.') && snapshot) {
        value = getValueFromSnapshot(variableKey, snapshot);
      } else {
        value = previewData[variableKey] ?? '';
      }
      if (value !== undefined && value !== '') {
        const path = propPath.startsWith('props.') ? propPath.split('.').slice(1) : propPath.split('.');
        setByPath(newProps, path, value);
      }
    }
  }

  // 2) props.content 中的 {{key}} 替换
  if (typeof newProps?.content === 'string') {
    const content = (newProps.content as string).replace(CONTENT_PLACEHOLDER_REGEX, (_, key: string) => {
      const k = key?.trim();
      if (!k) return '{{}}';
      if (node.variablePreviewSource?.type === 'product' && k.startsWith('product.')) {
        return getValueFromSnapshot(k, node.variablePreviewSource.snapshot) || previewData[k] || `{{${k}}}`;
      }
      return previewData[k] ?? `{{${k}}}`;
    });
    newProps = { ...newProps, content };
  }

  const children = node.children?.map((child) => resolveNode(child, previewData));

  if ((newProps as unknown) === node.props && children === node.children) return node;
  return {
    ...node,
    props: newProps as unknown as EmailComponent['props'],
    ...(children ? { children } : {}),
  };
}

function setByPath(target: Record<string, unknown>, path: string[], value: string): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    target[path[0]] = value;
    return;
  }
  const [head, ...rest] = path;
  let cursor = target[head];
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
    target[head] = {};
    cursor = target[head];
  }
  setByPath(cursor as Record<string, unknown>, rest, value);
}
