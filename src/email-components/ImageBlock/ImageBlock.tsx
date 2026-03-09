import { memo } from 'react';
import type { EmailComponent, ImageProps, ImageSizeConfig } from '@shared/types/email';
import { isImageProps } from '@shared/types/email';
import ComponentWrapper from '../components/ComponentWrapper/ComponentWrapper';
import { renderEmailComponent } from '../renderEmailComponent';
import { contentAlignToCSS, borderRadiusConfigToCSS, spacingConfigToCSS } from '@shared/utils/styleHelpers';
import { useDroppable } from '@dnd-kit/core';
import styles from './ImageBlock.module.css';

interface ImageBlockProps {
  component: EmailComponent;
  selected?: boolean;
  onSelect?: () => void;
  selectedId: string | null;
  onSelectId: (id: string) => void;
}

/** 布局模式下的空插槽占位 — 仅图标，整个覆盖层即为插槽 */
function EmptySlotPrompt() {
  return (
    <svg className={styles.slotIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

/** 无图片时的占位元素；在容器内自适应宽高，不溢出小容器 */
function ImagePlaceholder({
  sizeConfig,
  borderRadiusCSS,
}: {
  sizeConfig: ImageSizeConfig;
  borderRadiusCSS: string;
}) {
  const placeholderStyle: React.CSSProperties = {
    boxSizing: 'border-box',
    maxWidth: '100%',
  };
  placeholderStyle.borderRadius = borderRadiusCSS;

  if (sizeConfig.mode === 'fixed') {
    placeholderStyle.width = sizeConfig.width ?? '300px';
    placeholderStyle.height = sizeConfig.height ?? '200px';
    placeholderStyle.minHeight = '48px';
    placeholderStyle.maxHeight = '100%';
  } else if (sizeConfig.mode === 'fill') {
    placeholderStyle.width = '100%';
    placeholderStyle.minHeight = 0;
    placeholderStyle.aspectRatio = '3 / 2';
  } else if (sizeConfig.mode === 'original') {
    placeholderStyle.width = '300px';
    placeholderStyle.aspectRatio = '3 / 2';
    if (sizeConfig.maxWidth) {
      placeholderStyle.maxWidth = sizeConfig.maxWidth;
    }
    if (sizeConfig.maxHeight) {
      placeholderStyle.maxHeight = sizeConfig.maxHeight;
    }
  }

  return (
    <div className={styles.placeholder} style={placeholderStyle}>
      <svg
        className={styles.placeholderIcon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* 外框 */}
        <rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="2" />
        {/* 山景 */}
        <path
          d="M6 32l10-12 8 9 6-5 12 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 太阳 */}
        <circle cx="33" cy="19" r="3.5" stroke="currentColor" strokeWidth="2" />
      </svg>
    </div>
  );
}

function ImageBlock({
  component,
  selected,
  onSelect,
  selectedId,
  onSelectId,
}: ImageBlockProps) {
  const { setNodeRef: setOverlayRef, isOver } = useDroppable({
    id: `img-overlay-${component.id}`,
    data: {
      type: 'canvas-component',
      componentId: component.id,
      position: 'inside',
    },
  });
  if (component.type !== 'image' || !isImageProps(component.props)) return null;
  const props = component.props as ImageProps;
  const hasSrc = !!props.src;
  const children = component.children ?? [];
  // 有子内容时自动进入布局模式（不依赖 props.layoutMode 显式标记）
  const isLayoutMode = children.length > 0 || props.layoutMode === true;

  const sizeConfig = props.sizeConfig;

  const imageBorderRadiusCSS = borderRadiusConfigToCSS(props.borderRadius);

  // 根据尺寸配置计算图片样式；objectFit 由模式决定，不再使用 props.objectFit
  const getImageStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {};

    if (sizeConfig.mode === 'original') {
      // 原图尺寸：保持比例，超出可视区域时等比缩放 (contain)，可设最大宽高
      style.width = 'auto';
      style.height = 'auto';
      style.objectFit = 'contain';
      if (sizeConfig.maxWidth) style.maxWidth = sizeConfig.maxWidth;
      if (sizeConfig.maxHeight) style.maxHeight = sizeConfig.maxHeight;
    } else if (sizeConfig.mode === 'fill') {
      // 铺满容器：固定填满裁切 (cover)
      style.width = '100%';
      style.height = '100%';
      style.objectFit = 'cover';
    } else {
      // 固定尺寸：等比裁切铺满 (cover)
      style.width = sizeConfig.width ?? '300px';
      style.height = sizeConfig.height ?? '200px';
      style.objectFit = 'cover';
      style.objectPosition = 'center';
    }

    if (imageBorderRadiusCSS && imageBorderRadiusCSS !== '0') {
      style.borderRadius = imageBorderRadiusCSS;
      style.overflow = 'hidden';
    }
    return style;
  };

  const imageStyle = getImageStyle();
  Object.assign(imageStyle, { display: 'block' as const, maxWidth: '100%' });

  const imageContent = hasSrc ? (
    <img
      src={props.src}
      alt={props.alt}
      className={styles.img}
      style={imageStyle}
    />
  ) : (
    <ImagePlaceholder sizeConfig={sizeConfig} borderRadiusCSS={imageBorderRadiusCSS} />
  );

  const isFillMode = sizeConfig.mode === 'fill';
  const isFixedContainer =
    component.wrapperStyle.widthMode === 'fixed' || component.wrapperStyle.heightMode === 'fixed';
  const imgWrapStyle: React.CSSProperties = {
    display: 'block',
    width: isFillMode ? '100%' : 'fit-content',
    maxWidth: '100%',
    lineHeight: 0,
    ...(isFillMode ? { height: '100%' } : {}),
    // 固定尺寸容器中，避免子项被 flex 对齐参与拉伸/压缩，从而出现“对齐影响容器表现”
    ...(!isLayoutMode && isFixedContainer
      ? { flexGrow: 0, flexShrink: 0, minWidth: 0, minHeight: 0 }
      : {}),
  };

  // ─── 非布局模式：单纯展示图片 ───
  if (!isLayoutMode) {
    const content = props.link && hasSrc ? (
      <a href={props.link} style={isFillMode ? { width: '100%', height: '100%', display: 'block' } : undefined}>
        {imageContent}
      </a>
    ) : imageContent;
    return (
      <ComponentWrapper
        wrapperStyle={component.wrapperStyle}
        onClick={onSelect}
        selected={selected}
        componentId={component.id}
      >
        <div className={`${styles.imgWrap} ${isFillMode ? styles.imgWrapFill : ''}`.trim()} style={imgWrapStyle}>
          {content}
        </div>
      </ComponentWrapper>
    );
  }

  // ─── 布局模式：双层结构（图片 + 叠加层） ───
  // ID 使用 img-overlay- 前缀以避免与 CanvasBlock 的 drop-${id}-inside 冲突

  const hasChildren = children.length > 0;
  const layoutPadding = props.layoutPadding;
  const layoutContentAlign = props.layoutContentAlign ?? component.wrapperStyle.contentAlign;

  // 統一結構：容器高度由圖片決定，overlay 不撐高。導出 prepareEmailHtml 的 transformImageLayoutMode 需與此語義一致；
  // 若 layoutPadding 擴展為四邊分離，需在 transformImageLayoutMode 中同步處理 overlay 內邊距。
  const isFixedMode = sizeConfig.mode === 'fixed';
  const isOriginalMode = sizeConfig.mode === 'original';
  const shrinkWrapContainer = !isFillMode;
  const layoutContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: shrinkWrapContainer ? 'fit-content' : '100%',
    maxWidth: '100%',
    ...(isFixedMode
      ? {
          width: sizeConfig.width ?? '300px',
          height: sizeConfig.height ?? '200px',
        }
      : {}),
    ...(isOriginalMode && sizeConfig.maxWidth ? { maxWidth: sizeConfig.maxWidth } : {}),
    overflow: 'hidden',
    borderRadius: imageBorderRadiusCSS,
  };

  const imageLayerStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 0,
    lineHeight: 0,
    width: '100%',
    height: isFixedMode ? '100%' : undefined,
  };

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    flexWrap: 'wrap',
    padding: spacingConfigToCSS(layoutPadding),
    ...(hasChildren
      ? {
          ...contentAlignToCSS(layoutContentAlign),
          gap: '8px',
        }
      : {
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.5)',
          border: '1.5px dashed #E0E5EB',
        }),
  };

  return (
    <ComponentWrapper
      wrapperStyle={component.wrapperStyle}
      onClick={onSelect}
      selected={selected}
      componentId={component.id}
      fillHeight={isFillMode}
    >
      <div
        className={`${styles.layoutContainer} ${isFillMode ? styles.imgWrapFill : ''}`.trim()}
        style={layoutContainerStyle}
      >
        {/* 底层：图片，自然宽高比撑开容器高度 */}
        <div className={styles.imageLayer} style={imageLayerStyle}>{imageContent}</div>

        {/* 叠加层：始终 position:absolute 浮在图片上方，不影响容器高度 */}
        <div
          ref={setOverlayRef}
          className={`${styles.overlayLayer} ${isOver ? styles.overlayLayerOver : ''} ${!hasChildren ? styles.overlayLayerEmpty : ''}`.trim()}
          style={overlayStyle}
        >
          {/* 空状态：仅图标提示 */}
          {!hasChildren && <EmptySlotPrompt />}
          
          {/* 渲染子级 */}
          {children.map((child) => (
            <div key={child.id}>
              {renderEmailComponent(child, selectedId, onSelectId)}
            </div>
          ))}
        </div>
      </div>
    </ComponentWrapper>
  );
}

export default memo(ImageBlock, (prev, next) => {
  return (
    prev.component === next.component &&
    prev.selected === next.selected &&
    prev.selectedId === next.selectedId &&
    prev.onSelectId === next.onSelectId
  );
});
