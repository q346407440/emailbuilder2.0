import type { EmailComponentType } from '@shared/types/email';
import type { VariableContentType } from '@shared/constants/variableSchema';

export interface VariableBindingTarget {
  propPath: string;
  label: string;
  contentType: VariableContentType;
}

export const VARIABLE_BINDING_TARGETS: Record<EmailComponentType, VariableBindingTarget[]> = {
  layout: [],
  grid: [],
  text: [],
  image: [
    { propPath: 'props.src', label: '图片地址', contentType: 'image' },
    { propPath: 'props.alt', label: '替代文本', contentType: 'text' },
    { propPath: 'props.link', label: '点击链接', contentType: 'link' },
  ],
  button: [
    { propPath: 'props.text', label: '按钮文字', contentType: 'text' },
    { propPath: 'props.link', label: '链接地址', contentType: 'link' },
  ],
  icon: [
    { propPath: 'props.link', label: '链接地址', contentType: 'link' },
    { propPath: 'props.customSrc', label: '自定义图标', contentType: 'image' },
  ],
  divider: [],
};

export function getVariableBindingTargets(type: EmailComponentType): VariableBindingTarget[] {
  return VARIABLE_BINDING_TARGETS[type] ?? [];
}
