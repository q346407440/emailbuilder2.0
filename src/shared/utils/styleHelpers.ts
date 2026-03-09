import type { SpacingConfig, BorderConfig, BorderRadiusConfig, ContentAlignConfig } from '../types/email';

/**
 * 将 SpacingConfig 转换为 CSS 字符串（用于 padding 等）
 */
export function spacingConfigToCSS(config: SpacingConfig): string {
  if (config.mode === 'unified') {
    return config.unified || '0';
  }

  const top = config.top || '0';
  const right = config.right || '0';
  const bottom = config.bottom || '0';
  const left = config.left || '0';

  return `${top} ${right} ${bottom} ${left}`;
}

/**
 * 将 SpacingConfig 转为 CSS 长属性对象，确保四边单独生效（避免 shorthand 被覆盖或解析问题）
 */
export function marginConfigToLonghand(config: SpacingConfig | undefined): {
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
} {
  if (!config) {
    return { marginTop: '0', marginRight: '0', marginBottom: '0', marginLeft: '0' };
  }
  if (config.mode === 'unified') {
    const v = config.unified || '0';
    return { marginTop: v, marginRight: v, marginBottom: v, marginLeft: v };
  }
  return {
    marginTop: config.top || '0',
    marginRight: config.right || '0',
    marginBottom: config.bottom || '0',
    marginLeft: config.left || '0',
  };
}

/**
 * 将 BorderConfig 转换为 CSS border 样式对象
 */
export function borderConfigToCSS(config: BorderConfig): {
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
} {
  const result: Record<string, string> = {};
  const isZero = (w: string) => !w || w === '0' || w === '0px';

  if (config.mode === 'unified') {
    const width = config.unified || '0';
    if (!isZero(width)) {
      const val = `${width} ${config.style} ${config.color}`;
      result.borderTop = val;
      result.borderRight = val;
      result.borderBottom = val;
      result.borderLeft = val;
    }
  } else {
    const topWidth = config.topWidth || '0';
    const rightWidth = config.rightWidth || '0';
    const bottomWidth = config.bottomWidth || '0';
    const leftWidth = config.leftWidth || '0';
    if (!isZero(topWidth)) result.borderTop = `${topWidth} ${config.style} ${config.color}`;
    if (!isZero(rightWidth)) result.borderRight = `${rightWidth} ${config.style} ${config.color}`;
    if (!isZero(bottomWidth)) result.borderBottom = `${bottomWidth} ${config.style} ${config.color}`;
    if (!isZero(leftWidth)) result.borderLeft = `${leftWidth} ${config.style} ${config.color}`;
  }
  
  return result;
}

/**
 * 将 BorderRadiusConfig 转换为 CSS 字符串
 */
export function borderRadiusConfigToCSS(config: BorderRadiusConfig | undefined): string {
  if (!config) return '0';
  if (config.mode === 'unified') {
    return config.unified || '0';
  }
  const topLeft = config.topLeft || '0';
  const topRight = config.topRight || '0';
  const bottomRight = config.bottomRight || '0';
  const bottomLeft = config.bottomLeft || '0';
  return `${topLeft} ${topRight} ${bottomRight} ${bottomLeft}`;
}

const VERTICAL_MAP = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const;
const HORIZONTAL_MAP = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/**
 * 将 ContentAlignConfig 转换为 flex 布局样式（容器为 column，子内容按水平/垂直对齐）
 */
export function contentAlignToCSS(config: ContentAlignConfig | undefined): {
  display: 'flex';
  flexDirection: 'column';
  justifyContent: string;
  alignItems: string;
} {
  if (!config) {
    return { display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'flex-start' };
  }
  return {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: VERTICAL_MAP[config.vertical],
    alignItems: HORIZONTAL_MAP[config.horizontal],
  };
}

/**
 * 将 ContentAlignConfig 按给定 flex 方向转换为 justifyContent / alignItems。
 * 用于布局组件内层：row 时水平=主轴、垂直=交叉轴；column 时垂直=主轴、水平=交叉轴。
 */
export function contentAlignToFlexForDirection(
  direction: 'horizontal' | 'vertical',
  config: ContentAlignConfig | undefined
): { justifyContent: string; alignItems: string } {
  if (!config) {
    return { justifyContent: 'flex-start', alignItems: 'flex-start' };
  }
  if (direction === 'horizontal') {
    return {
      justifyContent: HORIZONTAL_MAP[config.horizontal],
      alignItems: VERTICAL_MAP[config.vertical],
    };
  }
  return {
    justifyContent: VERTICAL_MAP[config.vertical],
    alignItems: HORIZONTAL_MAP[config.horizontal],
  };
}
