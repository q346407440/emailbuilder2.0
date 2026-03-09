import { useMemo } from 'react';
import type { WrapperStyle } from '@shared/types/email';
import { spacingConfigToCSS, marginConfigToLonghand, borderConfigToCSS, borderRadiusConfigToCSS, contentAlignToCSS } from '@shared/utils/styleHelpers';
import styles from './ComponentWrapper.module.css';

interface ComponentWrapperProps {
  wrapperStyle: WrapperStyle;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  componentId?: string;
  /** 为 true 时，容器会预留垂直空间，使「垂直居中/底部」对齐生效（如图片：容器 > 子内容高度时才能上下定位） */
  contentAlignMinHeight?: boolean;
  /** 为 true 时，容器高度填满父级（如铺满模式的图片在网格内需填满格子，避免底部白边） */
  fillHeight?: boolean;
}

export default function ComponentWrapper({
  wrapperStyle,
  children,
  className = '',
  onClick,
  selected,
  componentId,
  contentAlignMinHeight = false,
  fillHeight = false,
}: ComponentWrapperProps) {
  const { outerStyle, innerStyle } = useMemo(() => {
    const backgroundType = wrapperStyle.backgroundType || 'color';
    const contentAlign = wrapperStyle.contentAlign;
    const needVerticalSpace =
      contentAlignMinHeight &&
      (contentAlign.vertical === 'center' || contentAlign.vertical === 'bottom');

    const { widthMode, heightMode, fixedWidth, fixedHeight } = wrapperStyle;
    const borderRadius = borderRadiusConfigToCSS(wrapperStyle.borderRadius);
    const hasRadius = borderRadius.trim().split(/\s+/).some((v) => parseFloat(v) > 0);
    const marginLonghand = marginConfigToLonghand(wrapperStyle.margin);
    const ml = marginLonghand.marginLeft;
    const mr = marginLonghand.marginRight;
    const hasHorizontalMargin = (parseFloat(ml) || 0) > 0 || (parseFloat(mr) || 0) > 0;

    /* 外层：仅尺寸与外边距，无 overflow，选中框 ::after 不被圆角裁切 */
    const outer: React.CSSProperties = {
      ...contentAlignToCSS(contentAlign),
      ...marginLonghand,
      /* 容器高度大于子内容时，justifyContent 才能把子内容做上/中/下定位 */
      ...(needVerticalSpace ? { minHeight: 240 } : {}),
      ...(fillHeight ? { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
    };
    if (widthMode === 'fixed' && fixedWidth) {
      outer.width = fixedWidth;
      if (hasHorizontalMargin) {
        outer.marginLeft = ml;
        outer.marginRight = mr;
      }
    } else if (widthMode === 'fitContent') {
      outer.width = 'fit-content';
      if (hasHorizontalMargin) {
        outer.marginLeft = ml;
        outer.marginRight = mr;
      }
    } else {
      if (hasHorizontalMargin) {
        outer.marginLeft = ml;
        outer.marginRight = mr;
        outer.width = `calc(100% - ${ml} - ${mr})`;
      } else {
        outer.width = '100%';
      }
    }
    if (heightMode === 'fixed' && fixedHeight) {
      outer.height = fixedHeight;
    } else if (heightMode === 'fill' && !fillHeight) {
      outer.height = '100%';
    }

    /* 内层：padding、背景、圆角、overflow、边框；同时作为 flex 容器应用 contentAlign，使子内容（如图片 imgWrap）能正确左/中/右、上/中/下对齐 */
    const inner: React.CSSProperties = {
      ...contentAlignToCSS(contentAlign),
      padding: spacingConfigToCSS(wrapperStyle.padding),
      borderRadius,
      ...(widthMode === 'fitContent' ? { width: 'fit-content' } : {}),
      ...((widthMode === 'fixed' || heightMode === 'fixed' || hasRadius) ? { overflow: 'hidden' as const } : {}),
      ...borderConfigToCSS(wrapperStyle.border),
    };
    if (backgroundType === 'image' && wrapperStyle.backgroundImage) {
      inner.backgroundImage = `url(${wrapperStyle.backgroundImage})`;
      inner.backgroundSize = 'cover';
      inner.backgroundPosition = 'center';
      inner.backgroundRepeat = 'no-repeat';
    } else {
      inner.backgroundColor = wrapperStyle.backgroundColor;
    }
    if (fillHeight) {
      inner.flex = '1';
      inner.minHeight = 0;
      inner.display = 'flex';
      inner.flexDirection = 'column';
    }

    return { outerStyle: outer, innerStyle: inner };
  }, [wrapperStyle, contentAlignMinHeight, fillHeight]);

  return (
    <div
      className={`${styles.wrapper} ${className}`.trim()}
      style={outerStyle}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-selected={selected ?? false}
      data-component-id={componentId}
    >
      {/* 内层承载 padding/背景/圆角/overflow，选中框在外层 ::after 上，避免被圆角裁切 */}
      <div className={styles.inner} style={innerStyle}>
        {children}
      </div>
    </div>
  );
}
