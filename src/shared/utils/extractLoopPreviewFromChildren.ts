/**
 * 从 Layout 的多个子组件中提取「动态列表」的 schema 与预览数据。
 * 用于「从当前子组件转为动态列表」：当父容器下有多条结构一致的 children 时，
 * 可一键生成列表变量并以其为预览数据，无需先删成一条再手填 JSON。
 */
import type { EmailComponent } from '../types/email';
import type { ArrayItemFieldDef } from '../types/emailTemplate';
import { isTextProps, isImageProps, isButtonProps } from '../types/email';

const CONTENT_PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;
const HTML_TAG_REGEX = /<[^>]+>/g;

/** 去除 HTML 标签，提取纯文字（如 "<p>点击率</p>" → "点击率"） */
function stripHtml(html: string): string {
  return html.replace(HTML_TAG_REGEX, '').trim();
}

function resolveContent(str: string, previewData?: Record<string, string>): string {
  const plain = stripHtml(str);
  if (!previewData) return plain;
  return plain.replace(CONTENT_PLACEHOLDER_REGEX, (_, key: string) => {
    const k = key?.trim();
    return k ? (previewData[k] ?? `{{${k}}}`) : plain;
  });
}

interface SlotDef {
  key: string;
  label: string;
  contentType: 'text' | 'image' | 'link';
}

/** 从单个组件子树中按顺序收集「内容槽」定义（仅第一遍用于生成 schema） */
function collectSchemaFromNode(comp: EmailComponent, slots: SlotDef[], counters: { text: number; image: number; button: number }): void {
  if (comp.type === 'text' && isTextProps(comp.props)) {
    const i = counters.text++;
    slots.push({ key: `field${i}`, label: i === 0 ? '标签' : i === 1 ? '数值' : `字段${i + 1}`, contentType: 'text' });
    return;
  }
  if (comp.type === 'image' && isImageProps(comp.props)) {
    const i = counters.image++;
    slots.push({ key: `image${i}`, label: `图片${i || ''}`, contentType: 'image' });
    slots.push({ key: `link${i}`, label: `链接${i || ''}`, contentType: 'link' });
    return;
  }
  if (comp.type === 'button' && isButtonProps(comp.props)) {
    const i = counters.button++;
    slots.push({ key: `btnText${i}`, label: `按钮文字${i || ''}`, contentType: 'text' });
    slots.push({ key: `btnLink${i}`, label: `按钮链接${i || ''}`, contentType: 'link' });
    return;
  }
  for (const child of comp.children ?? []) {
    collectSchemaFromNode(child, slots, counters);
  }
}

/** 按与 collectSchemaFromNode 相同的 DFS 顺序收集当前节点的值（仅字符串顺序） */
function collectRawValues(comp: EmailComponent, out: string[], previewData?: Record<string, string>): void {
  if (comp.type === 'text' && isTextProps(comp.props)) {
    out.push(resolveContent(comp.props.content ?? '', previewData));
    return;
  }
  if (comp.type === 'image' && isImageProps(comp.props)) {
    out.push(comp.props.src ?? '');
    out.push(comp.props.link ?? '');
    return;
  }
  if (comp.type === 'button' && isButtonProps(comp.props)) {
    out.push(comp.props.text ?? '');
    out.push(comp.props.link ?? '');
    return;
  }
  for (const child of comp.children ?? []) {
    collectRawValues(child, out, previewData);
  }
}

export interface ExtractLoopPreviewResult {
  schema: ArrayItemFieldDef[];
  items: Record<string, string>[];
}

/**
 * 当 layout 拥有至少 2 个直接子节点时，从子节点提取「列表项」的 schema 与预览数据。
 * - schema：由第一个子节点的子树结构推断（文本 / 图片+链接 / 按钮文字+链接）。
 * - items：每个直接子节点对应一条记录，键与 schema 一致，值为当前画布上的内容（会解析 {{key}}）。
 * @param component 当前选中的 layout 组件
 * @param previewData 可选，用于解析 {{key}} 的预览数据
 * @returns 若子节点数 < 2 或非 layout，返回 null
 */
export function extractPreviewFromLayoutChildren(
  component: EmailComponent,
  previewData?: Record<string, string>
): ExtractLoopPreviewResult | null {
  if (component.type !== 'layout' || !component.children || component.children.length < 2) {
    return null;
  }

  const slots: SlotDef[] = [];
  collectSchemaFromNode(component.children[0], slots, { text: 0, image: 0, button: 0 });
  if (slots.length === 0) {
    // 没有可推断的文本/图片/按钮槽，给一个默认文本字段
    slots.push({ key: 'field0', label: '内容', contentType: 'text' });
  }

  const schema: ArrayItemFieldDef[] = slots.map((s) => ({
    key: s.key,
    label: s.label,
    contentType: s.contentType === 'text' ? 'text' : s.contentType === 'image' ? 'image' : 'link',
  }));

  const items = component.children.map((child) => {
    const raw: string[] = [];
    collectRawValues(child, raw, previewData);
    const item: Record<string, string> = {};
    for (let i = 0; i < schema.length && i < raw.length; i++) {
      item[schema[i].key] = raw[i];
    }
    return item;
  });

  return { schema, items };
}
