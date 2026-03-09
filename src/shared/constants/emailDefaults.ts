/**
 * 邮件模板与组件默认值集中管理
 * 迁移、新建组件、画布/编辑器 fallback 统一从此处取默认，避免散落与漂移。
 */
import type {
  TemplateConfig,
  WrapperStyle,
  LayoutProps,
  GridProps,
  TextProps,
  ImageProps,
  DividerProps,
  ButtonProps,
  IconProps,
  ContentAlignConfig,
  BorderConfig,
} from '../types/email';
import { DEFAULT_TEXT_FONT_FAMILY } from './fontOptions';

/** 内容对齐默认（画布与 wrapper 共用语义） */
export const DEFAULT_CONTENT_ALIGN: ContentAlignConfig = { horizontal: 'center', vertical: 'top' };

/** 默认边框配置（无边框样式，用于画布与 wrapper） */
export const DEFAULT_BORDER: BorderConfig = {
  mode: 'unified',
  unified: '0',
  color: '#E0E5EB',
  style: 'solid',
};

/** 画布配置默认：用于迁移补齐、新建模板、画布/编辑器 fallback */
export function getDefaultTemplateConfig(): TemplateConfig {
  return {
    outerBackgroundColor: '#E8ECF1',
    backgroundType: 'color',
    backgroundColor: '#FFFFFF',
    padding: { mode: 'unified', unified: '0' },
    margin: { mode: 'unified', unified: '0' },
    border: { ...DEFAULT_BORDER },
    borderRadius: { mode: 'unified', unified: '0' },
    contentAlign: { ...DEFAULT_CONTENT_ALIGN },
    contentDistribution: 'packed',
    contentGap: '0px',
    width: '600px',
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
  };
}

/** 组件通用容器默认：用于迁移补齐、新建组件时作为 base */
export function getDefaultWrapperStyle(): WrapperStyle {
  return {
    widthMode: 'fill',
    heightMode: 'fitContent',
    backgroundType: 'color',
    backgroundColor: 'rgba(255, 255, 255, 0)',
    padding: { mode: 'unified', unified: '10px' },
    margin: { mode: 'unified', unified: '0' },
    border: { ...DEFAULT_BORDER },
    borderRadius: { mode: 'unified', unified: '0' },
    contentAlign: { ...DEFAULT_CONTENT_ALIGN },
  };
}

export function getDefaultLayoutProps(): LayoutProps {
  return {
    gap: '8px',
    direction: 'vertical',
    distribution: 'packed',
  };
}

export function getDefaultGridProps(): GridProps {
  return {
    columnsPerRow: 2,
    slots: 4,
    gap: '8px',
  };
}

export function getDefaultTextProps(): TextProps {
  return {
    content: '',
    fontSize: '14px',
    fontMode: 'inherit',
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
  };
}

export function getDefaultImageProps(): ImageProps {
  return {
    src: '',
    alt: '图片',
    link: '',
    sizeConfig: {
      mode: 'original',
      maxWidth: '',
      maxHeight: '',
    },
    borderRadius: { mode: 'unified', unified: '0' },
    layoutMode: false,
    layoutContentAlign: { ...DEFAULT_CONTENT_ALIGN },
    layoutPadding: { mode: 'unified', unified: '0' },
  };
}

export function getDefaultDividerProps(): DividerProps {
  return {
    dividerStyle: 'line',
    color: '#E0E5EB',
    height: '1px',
    width: '100%',
  };
}

export function getDefaultButtonProps(): ButtonProps {
  return {
    text: '按钮',
    buttonStyle: 'solid',
    backgroundColor: '#1976D2',
    textColor: '#FFFFFF',
    borderColor: '#1976D2',
    fontSize: '16px',
    fontWeight: '600',
    fontStyle: 'normal',
    textDecoration: 'none',
    fontMode: 'inherit',
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    borderRadius: '4px',
    padding: { mode: 'separate', top: '12px', right: '28px', bottom: '12px', left: '28px' },
    widthMode: 'fitContent',
    link: '',
  };
}

export function getDefaultIconProps(): IconProps {
  return {
    iconType: 'mail',
    sizeMode: 'height',
    size: '24',
    color: '#000000',
    link: '',
  };
}

/** 从 templateConfig 取 contentDistribution / contentGap 的 fallback（用于渲染与编辑） */
export function getTemplateDistributionFallback(config: Pick<TemplateConfig, 'contentDistribution' | 'contentGap'> | null | undefined): {
  contentDistribution: NonNullable<TemplateConfig['contentDistribution']>;
  contentGap: string;
} {
  const defaults = getDefaultTemplateConfig();
  return {
    contentDistribution: config?.contentDistribution === 'spaceBetween' ? 'spaceBetween' : 'packed',
    contentGap: typeof config?.contentGap === 'string' && config.contentGap.trim() ? config.contentGap : defaults.contentGap,
  };
}
