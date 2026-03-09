import type { EmailComponentType } from '../types/email';

export interface ComponentLibraryItem {
  type: EmailComponentType;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

/* 顺序：内容类(文本/图片) → 布局类 → 操作(按钮) → 装饰(分割/图标)，便于按使用频率查找 */
export const COMPONENT_ITEMS: ComponentLibraryItem[] = [
  {
    type: 'text',
    label: '文本',
    desc: '文本内容块',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M4 4h12M10 4v12M7 16h6" />
      </svg>
    ),
  },
  {
    type: 'image',
    label: '图片',
    desc: '图片展示',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="16" height="14" rx="2" />
        <circle cx="6.5" cy="7.5" r="2" />
        <path d="M18 13l-4-4-6 6-2-2L2 17" />
      </svg>
    ),
  },
  {
    type: 'layout',
    label: '布局',
    desc: '多栏布局容器',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="2" width="7" height="16" rx="1.5" />
        <rect x="11" y="2" width="7" height="16" rx="1.5" />
      </svg>
    ),
  },
  {
    type: 'grid',
    label: '网格',
    desc: '网格布局容器',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="2" width="7" height="7" rx="1.5" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    type: 'button',
    label: '按钮',
    desc: '操作按钮',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="16" height="10" rx="3" />
        <path d="M7 10h6" />
      </svg>
    ),
  },
  {
    type: 'divider',
    label: '分割',
    desc: '分割线或色块',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M2 10h16" />
      </svg>
    ),
  },
  {
    type: 'icon',
    label: '图标',
    desc: '装饰图标',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="10 2 12.47 7.03 18 7.82 14 11.72 14.94 17.24 10 14.65 5.06 17.24 6 11.72 2 7.82 7.53 7.03 10 2" />
      </svg>
    ),
  },
];

export const TYPE_LABELS: Record<EmailComponentType, string> = {
  layout: '布局',
  grid: '网格',
  text: '文本',
  image: '图片',
  divider: '分割',
  button: '按钮',
  icon: '图标',
};

export const TYPE_ICONS: Record<EmailComponentType, React.ReactNode> = {
  layout: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1" y="1" width="6" height="14" rx="1" />
      <rect x="9" y="1" width="6" height="14" rx="1" />
    </svg>
  ),
  grid: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  ),
  text: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3h10M8 3v10M5.5 13h5" />
    </svg>
  ),
  image: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <circle cx="5" cy="6" r="1.5" />
      <path d="M14.5 10.5l-3.5-3.5-5 5-1.5-1.5L1.5 13" />
    </svg>
  ),
  divider: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 8h14" />
    </svg>
  ),
  button: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="8" rx="2.5" />
      <path d="M5 8h6" />
    </svg>
  ),
  icon: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="8 1.5 9.98 5.5 14.4 6.14 11.2 9.24 11.95 13.64 8 11.56 4.05 13.64 4.8 9.24 1.6 6.14 6.02 5.5 8 1.5" />
    </svg>
  ),
};
