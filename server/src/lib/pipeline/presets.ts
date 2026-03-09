/**
 * 预设系统：调色板、间距、字号 + 每种组件类型的默认 props 和 wrapperStyle。
 * 复用 useEmailStore 工厂函数的默认值。
 */

import type {
  ColorTokens,
  SpacingTokens,
  TypographyTokens,
  ColorPresetName,
  SpacingPresetName,
  TypographyPresetName,
  CompactComponentType,
} from './types.js';

// ── 调色板预设 ───────────────────────────────────────────────────────

export const COLOR_PRESETS: Record<ColorPresetName, ColorTokens> = {
  'corporate-blue': {
    primary: '#1976D2', heading: '#1A1A1A', body: '#5C6B7A',
    accent: '#FF6B35', mutedBg: '#F5F7FA', cardBg: '#FFFFFF', border: '#E0E5EB',
  },
  'elegant-dark': {
    primary: '#000000', heading: '#1A1A1A', body: '#4A4A4A',
    accent: '#C9A96E', mutedBg: '#F8F8F8', cardBg: '#FFFFFF', border: '#E8E8E8',
  },
  'warm-commerce': {
    primary: '#E85D3A', heading: '#2D2D2D', body: '#666666',
    accent: '#F5A623', mutedBg: '#FFF8F5', cardBg: '#FFFFFF', border: '#F0E6E0',
  },
  'fresh-green': {
    primary: '#16A34A', heading: '#1A1A1A', body: '#5C6B7A',
    accent: '#2563EB', mutedBg: '#F0FDF4', cardBg: '#FFFFFF', border: '#D1E7DD',
  },
  'soft-purple': {
    primary: '#7C3AED', heading: '#1E1B4B', body: '#6B7280',
    accent: '#EC4899', mutedBg: '#FAF5FF', cardBg: '#FFFFFF', border: '#E9D5FF',
  },
  'minimal-mono': {
    primary: '#374151', heading: '#111827', body: '#6B7280',
    accent: '#374151', mutedBg: '#F9FAFB', cardBg: '#FFFFFF', border: '#E5E7EB',
  },
};

// ── 间距预设 ──────────────────────────────────────────────────────────

export const SPACING_PRESETS: Record<SpacingPresetName, SpacingTokens> = {
  compact:  { section: '16px', element: '8px',  tight: '4px' },
  standard: { section: '24px', element: '12px', tight: '6px' },
  spacious: { section: '32px', element: '16px', tight: '8px' },
  generous: { section: '40px', element: '20px', tight: '10px' },
};

// ── 字号预设 ──────────────────────────────────────────────────────────

export const TYPOGRAPHY_PRESETS: Record<TypographyPresetName, TypographyTokens> = {
  standard: {
    h1:      { fontSize: '28px', fontWeight: '700' },
    h2:      { fontSize: '20px', fontWeight: '600' },
    body:    { fontSize: '14px', fontWeight: '400' },
    caption: { fontSize: '12px', fontWeight: '400' },
  },
  large: {
    h1:      { fontSize: '32px', fontWeight: '700' },
    h2:      { fontSize: '24px', fontWeight: '600' },
    body:    { fontSize: '16px', fontWeight: '400' },
    caption: { fontSize: '13px', fontWeight: '400' },
  },
  compact: {
    h1:      { fontSize: '24px', fontWeight: '700' },
    h2:      { fontSize: '18px', fontWeight: '600' },
    body:    { fontSize: '13px', fontWeight: '400' },
    caption: { fontSize: '11px', fontWeight: '400' },
  },
};

// ── 组件默认 Props（复用 useEmailStore 工厂函数值） ──────────────────

const DEFAULT_FONT_FAMILY = "'Source Sans 3', sans-serif";

export const DEFAULT_PROPS_BY_TYPE: Record<CompactComponentType, Record<string, unknown>> = {
  layout: {
    gap: '10px',
    direction: 'horizontal',
  },
  grid: {
    columnsPerRow: 2,
    slots: 4,
    gap: '10px',
  },
  text: {
    content: '',
    fontSize: '16px',
    color: '#5C6B7A',
    fontWeight: '400',
    lineHeight: '1.5',
    fontMode: 'inherit',
    fontFamily: DEFAULT_FONT_FAMILY,
  },
  image: {
    src: '',
    alt: '图片',
    link: '',
    sizeConfig: { mode: 'fill' },
    borderRadius: { mode: 'unified', unified: '0' },
    layoutMode: false,
    layoutContentAlign: { horizontal: 'center', vertical: 'top' },
    layoutPadding: { mode: 'unified', unified: '0' },
  },
  divider: {
    dividerStyle: 'line',
    color: '#E0E5EB',
    height: '1px',
    width: '100%',
  },
  button: {
    text: '按钮',
    buttonStyle: 'solid',
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    borderColor: '#000000',
    fontSize: '14px',
    fontMode: 'inherit',
    fontFamily: DEFAULT_FONT_FAMILY,
    borderRadius: '0',
    padding: { mode: 'separate', top: '14px', right: '40px', bottom: '14px', left: '40px' },
    widthMode: 'fitContent',
    link: '',
  },
  icon: {
    iconType: 'mail',
    sizeMode: 'height',
    size: '32',
    color: '#1976D2',
    link: '',
  },
};

// ── 组件默认 WrapperStyle ────────────────────────────────────────────

const BASE_WRAPPER = {
  widthMode: 'fill',
  heightMode: 'fitContent',
  backgroundType: 'color',
  backgroundColor: 'rgba(255, 255, 255, 0)',
  padding: { mode: 'unified', unified: '10px' },
  margin: { mode: 'unified', unified: '0' },
  border: {
    mode: 'unified',
    top: false, right: false, bottom: false, left: false,
    unified: '1px',
    color: '#E0E5EB',
    style: 'solid',
  },
  borderRadius: { mode: 'unified', unified: '0' },
  contentAlign: { horizontal: 'center', vertical: 'top' },
} as const;

export const DEFAULT_WRAPPER_BY_TYPE: Record<CompactComponentType, Record<string, unknown>> = {
  layout: {
    ...BASE_WRAPPER,
    padding: { mode: 'unified', unified: '10px' },
  },
  grid: {
    ...BASE_WRAPPER,
    padding: { mode: 'unified', unified: '10px' },
  },
  text: {
    ...BASE_WRAPPER,
    contentAlign: { horizontal: 'center', vertical: 'top' },
    backgroundType: 'color',
    backgroundColor: 'rgba(255, 255, 255, 0)',
    padding: { mode: 'unified', unified: '0' },
    margin: { mode: 'unified', unified: '0' },
  },
  image: {
    ...BASE_WRAPPER,
    padding: { mode: 'unified', unified: '0' },
  },
  divider: {
    ...BASE_WRAPPER,
    backgroundType: 'color',
    backgroundColor: 'rgba(255, 255, 255, 0)',
    padding: { mode: 'separate', top: '10px', right: '0', bottom: '10px', left: '0' },
    margin: { mode: 'unified', unified: '0' },
  },
  button: {
    ...BASE_WRAPPER,
    contentAlign: { horizontal: 'center', vertical: 'top' },
    backgroundType: 'color',
    backgroundColor: 'rgba(255, 255, 255, 0)',
    padding: { mode: 'unified', unified: '10px' },
    margin: { mode: 'unified', unified: '0' },
  },
  icon: {
    ...BASE_WRAPPER,
    contentAlign: { horizontal: 'center', vertical: 'top' },
    backgroundType: 'color',
    backgroundColor: 'rgba(255, 255, 255, 0)',
    padding: { mode: 'unified', unified: '0' },
    margin: { mode: 'unified', unified: '0' },
  },
};
