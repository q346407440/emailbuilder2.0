import type { BusinessFieldType } from '../types/composite';
import type { EmailComponentType } from '../types/email';

/**
 * 可绑定属性定义：
 * - propPath: 属性路径（如 "props.src"），用于运行时读写
 * - label: 中文显示名称
 */
export interface BindablePropDef {
  propPath: string;
  label: string;
}

/**
 * 按组件类型列出所有可绑定属性。
 * key 为 EmailComponentType，value 为属性定义数组。
 */
export const BINDABLE_PROPS_BY_COMPONENT_TYPE: Record<EmailComponentType, BindablePropDef[]> = {
  text: [{ propPath: 'props.content', label: '文本内容' }],
  image: [
    { propPath: 'props.src', label: '图片地址' },
    { propPath: 'props.alt', label: '替代文本' },
    { propPath: 'props.link', label: '链接地址' },
  ],
  button: [
    { propPath: 'props.text', label: '按钮文字' },
    { propPath: 'props.backgroundColor', label: '背景颜色' },
    { propPath: 'props.textColor', label: '文字颜色' },
    { propPath: 'props.borderColor', label: '边框颜色' },
    { propPath: 'props.fontSize', label: '字号' },
    { propPath: 'props.borderRadius', label: '圆角' },
    { propPath: 'props.link', label: '链接地址' },
  ],
  icon: [
    { propPath: 'props.size', label: '图标大小' },
    { propPath: 'props.color', label: '图标颜色' },
    { propPath: 'props.link', label: '链接地址' },
    { propPath: 'props.customSrc', label: '自定义图标' },
  ],
  divider: [
    { propPath: 'props.color', label: '分割线颜色' },
    { propPath: 'props.height', label: '高度' },
    { propPath: 'props.width', label: '宽度' },
  ],
  layout: [
    { propPath: 'props.gap', label: '间距' },
  ],
  grid: [
    { propPath: 'props.gap', label: '间距' },
  ],
};

/** 所有组件类型共有的 wrapperStyle 可绑定属性 */
export const BINDABLE_WRAPPER_PROPS: BindablePropDef[] = [
  { propPath: 'wrapperStyle.backgroundColor', label: '容器背景颜色' },
  { propPath: 'wrapperStyle.backgroundImage', label: '容器背景图片' },
];

/**
 * 按业务字段类型筛选可绑定的 propPath。
 * 返回该字段类型允许绑定的 propPath 集合。
 */
export const ALLOWED_PROP_PATHS_BY_FIELD_TYPE: Record<BusinessFieldType, Set<string>> = {
  image: new Set([
    'props.src',
    'props.customSrc',
    'wrapperStyle.backgroundImage',
  ]),
  text: new Set([
    'props.content',
    'props.text',
    'props.alt',
    'props.link',
    'props.fontWeight',
  ]),
  color: new Set([
    'props.color',
    'props.backgroundColor',
    'props.textColor',
    'props.borderColor',
    'wrapperStyle.backgroundColor',
  ]),
  number: new Set([
    'props.fontSize',
    'props.lineHeight',
    'props.size',
    'props.height',
    'props.width',
    'props.borderRadius',
    'props.gap',
  ]),
};

/**
 * 根据业务字段类型，筛选某个组件类型的可绑定属性列表。
 */
export function getFilteredBindableProps(
  componentType: EmailComponentType,
  fieldType: BusinessFieldType
): BindablePropDef[] {
  const allowed = ALLOWED_PROP_PATHS_BY_FIELD_TYPE[fieldType];
  const componentProps = BINDABLE_PROPS_BY_COMPONENT_TYPE[componentType] || [];
  const wrapperProps = BINDABLE_WRAPPER_PROPS;

  return [...componentProps, ...wrapperProps].filter((p) => allowed.has(p.propPath));
}
