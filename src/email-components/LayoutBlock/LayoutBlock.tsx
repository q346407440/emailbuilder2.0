import { memo, useCallback, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import type { EmailComponent, LayoutProps } from '@shared/types/email';
import { isLayoutProps } from '@shared/types/email';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { getDefaultLayoutProps } from '@shared/constants/emailDefaults';
import { contentAlignToFlexForDirection } from '@shared/utils/styleHelpers';
import ComponentWrapper from '../components/ComponentWrapper/ComponentWrapper';
import { renderEmailComponent } from '../renderEmailComponent';
import styles from './LayoutBlock.module.css';

interface LayoutBlockProps {
  component: EmailComponent;
  selectedId: string | null;
  selected?: boolean;
  onSelectId: (id: string) => void;
  onSelect?: () => void;
}

/** 空容器佔位 — 整個 layout 為空時的拖放目標 */
function EmptyLayoutDrop({ layoutId }: { layoutId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `layout-empty-${layoutId}`,
    data: {
      type: 'canvas-component',
      componentId: layoutId,
      position: 'inside' as const,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.emptyLayout} ${isOver ? styles.emptyLayoutOver : ''}`}
    >
      <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
      <span className={styles.emptyText}>拖入组件</span>
    </div>
  );
}

/** 子組件之間、首尾的插入 drop zone，方向感知 */
function LayoutInsertZone({
  childId,
  position,
  direction,
}: {
  childId: string;
  position: 'before' | 'after';
  direction: 'horizontal' | 'vertical';
}) {
  const { isDragging, isTargeted } = useEmailStore(
    useShallow(
      useCallback((s) => {
        const info = s.dragOverInfo;
        return {
          isDragging: s.isDragging,
          isTargeted: info?.targetId === childId && info.position === position,
        };
      }, [childId, position])
    )
  );

  const { setNodeRef, isOver } = useDroppable({
    id: `layout-insert-${childId}-${position}`,
    data: {
      type: 'canvas-component',
      componentId: childId,
      position,
    },
  });

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={setNodeRef}
      className={`${styles.insertZone} ${isHorizontal ? styles.insertZoneH : styles.insertZoneV}`}
      data-over={isOver}
      data-dragging={isDragging || undefined}
    >
      {isTargeted && (
        <div className={`${styles.insertIndicator} ${isHorizontal ? styles.insertIndicatorH : styles.insertIndicatorV}`}>
          <span className={styles.insertDot} />
          <span className={styles.insertLine} />
          <span className={styles.insertDot} />
        </div>
      )}
    </div>
  );
}

function LayoutBlock({ component, selectedId, selected, onSelectId, onSelect }: LayoutBlockProps) {
  const isLayoutComponent = component.type === 'layout' && isLayoutProps(component.props);
  const props = isLayoutComponent ? (component.props as LayoutProps) : null;
  const def = getDefaultLayoutProps();
  const direction = props?.direction ?? def.direction;
  const distribution = props?.distribution ?? def.distribution;
  const gap = distribution === 'spaceBetween' ? '0px' : (props?.gap ?? def.gap);
  const children = useMemo(
    () => (isLayoutComponent ? component.children ?? [] : []),
    [isLayoutComponent, component.children]
  );
  const contentAlign = component.wrapperStyle.contentAlign;
  const innerAlignStyle = contentAlignToFlexForDirection(direction, contentAlign);
  const isFitContent = component.wrapperStyle.widthMode === 'fitContent';
  /* 交叉軸始終 stretch；所有影響佈局的樣式內聯，以便導出 HTML 在郵件中還原 */
  const layoutContainerStyle: React.CSSProperties = {
    display: 'flex',
    width: '100%',
    flexDirection: direction === 'horizontal' ? 'row' : 'column',
    gap,
    justifyContent: distribution === 'spaceBetween' ? 'space-between' : innerAlignStyle.justifyContent,
    alignItems: 'stretch',
    ...(isFitContent ? { width: 'fit-content' } : {}),
  };
  /* 格子在交叉軸被 stretch 時，需在格子內用 flex 對齊子內容，否則內容會貼頂 */
  const cellJustifyContent = contentAlignToFlexForDirection('vertical', contentAlign).justifyContent;

  /* 偵測是否有子組件正被拖放瞄準（before/after），若是則高亮整個容器 */
  const childIds = useMemo(() => new Set(children.map((c) => c.id)), [children]);
  const { isChildTargeted, isSelfInside } = useEmailStore(
    useShallow(
      useCallback((s) => {
        const info = s.dragOverInfo;
        const childTargeted =
          info != null &&
          childIds.has(info.targetId) &&
          (info.position === 'before' || info.position === 'after');
        const selfInside = info?.targetId === component.id && info.position === 'inside';
        return { isChildTargeted: childTargeted, isSelfInside: selfInside };
      }, [childIds, component.id])
    )
  );
  const isContainerHighlighted = isChildTargeted || isSelfInside;

  if (!isLayoutComponent) return null;

  return (
    <ComponentWrapper
      wrapperStyle={component.wrapperStyle}
      onClick={onSelect}
      selected={selected}
      componentId={component.id}
    >
      <div
        className={`${styles.layout} ${styles[direction]} ${isContainerHighlighted ? styles.layoutDropTarget : ''}`}
        style={layoutContainerStyle}
      >
        {children.length === 0 ? (
          <EmptyLayoutDrop layoutId={component.id} />
        ) : (
          children.map((child, i) => {
            const { widthMode: childWidthMode, contentAlign: childContentAlign } = child.wrapperStyle;
            const cellAlign = contentAlignToFlexForDirection(direction, childContentAlign);
            const isVertical = direction === 'vertical';
            const isFitContentCell = childWidthMode === 'fitContent';
            const cellAlignItems = cellAlign.alignItems;
            const isSpaceBetween = distribution === 'spaceBetween';
            const cellStyle: React.CSSProperties = {
              display: 'flex',
              flexDirection: 'column',
              justifyContent: child.type === 'divider' ? 'center' : cellJustifyContent,
              alignItems: cellAlignItems,
              minWidth: 0,
              minHeight: child.type === 'divider' ? 4 : 20,
              overflow: 'hidden',
              ...(isVertical
                ? { flex: '0 0 auto', alignSelf: 'stretch' }
                : isSpaceBetween
                  ? (childWidthMode === 'fill' ? { flex: '1 1 0%' } : { flex: '0 0 auto' })
                  : isFitContentCell
                    ? { flex: '0 0 auto' }
                    : { flex: '1 1 0%', alignSelf: childWidthMode === 'fill' ? 'stretch' : undefined }),
            };
            const cellWrapperStyle: React.CSSProperties = {
              position: 'relative',
              display: 'flex',
              flexDirection: direction === 'horizontal' ? 'row' : 'column',
              minWidth: 0,
              ...(direction === 'horizontal'
                ? (isSpaceBetween
                  ? { flex: childWidthMode === 'fill' ? '1 1 0%' : '0 0 auto' }
                  : { flex: isFitContentCell ? '0 0 auto' : '1 1 0%' })
                : { flex: '0 0 auto', alignSelf: 'stretch' }),
            };
            return (
              <div key={child.id} className={`${styles.cellWrapper} ${direction === 'horizontal' ? styles.cellWrapperH : styles.cellWrapperV}`} style={cellWrapperStyle}>
                {/* 第一個子組件前方的插入區 */}
                {i === 0 && (
                  <LayoutInsertZone childId={child.id} position="before" direction={direction} />
                )}
                <div className={direction === 'vertical' ? styles.cellVertical : isFitContentCell ? styles.cellAuto : styles.cell} style={cellStyle}>
                  {renderEmailComponent(child, selectedId, onSelectId)}
                </div>
                {/* 每個子組件後方的插入區 */}
                <LayoutInsertZone childId={child.id} position="after" direction={direction} />
              </div>
            );
          })
        )}
      </div>
    </ComponentWrapper>
  );
}

export default memo(LayoutBlock, (prev, next) => {
  return (
    prev.component === next.component &&
    prev.selectedId === next.selectedId &&
    prev.selected === next.selected &&
    prev.onSelectId === next.onSelectId
  );
});
