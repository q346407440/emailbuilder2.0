import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { EmailComponent, GridProps } from '@shared/types/email';
import { isGridProps } from '@shared/types/email';
import ComponentWrapper from '../components/ComponentWrapper/ComponentWrapper';
import { renderEmailComponent } from '../renderEmailComponent';
import styles from './GridBlock.module.css';

interface GridBlockProps {
  component: EmailComponent;
  selectedId: string | null;
  selected?: boolean;
  onSelectId: (id: string) => void;
  onSelect?: () => void;
}

/** 空插槽佔位 — 可作為拖放目標 */
function EmptySlot({ gridId, index }: { gridId: string; index: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `grid-slot-${gridId}-${index}`,
    data: {
      type: 'canvas-component',
      componentId: gridId,
      position: 'inside' as const,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.cell} ${styles.emptySlot} ${isOver ? styles.emptySlotOver : ''}`}
    >
      <div className={styles.slotPlaceholder}>
        <svg className={styles.slotIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

function GridBlock({ component, selectedId, selected, onSelectId, onSelect }: GridBlockProps) {
  if (component.type !== 'grid' || !isGridProps(component.props)) return null;
  const props = component.props as GridProps;
  const columnsPerRow = Math.min(6, Math.max(1, props.columnsPerRow));
  const totalSlots = Math.max(1, props.slots);
  const gap = props.gap;
  const children = component.children ?? [];

  // 计算空插槽数量：总插槽数 - 已填充子组件数，最少 0
  const emptySlotCount = Math.max(0, totalSlots - children.length);

  return (
    <ComponentWrapper
      wrapperStyle={component.wrapperStyle}
      onClick={onSelect}
      selected={selected}
      componentId={component.id}
    >
      <div
        className={styles.grid}
        style={{
          display: 'grid',
          width: '100%',
          minHeight: 40,
          gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
          gap,
        }}
      >
        {/* 渲染已有子组件：铺满时相对于网格格子撑满，自适应时跟随内容；样式内联以便导出在邮件中还原 */}
        {children.map((child) => {
          const { widthMode: childWidthMode } = child.wrapperStyle;
          const cellStyle: React.CSSProperties = {
            minWidth: 0,
            minHeight: child.type === 'divider' ? 4 : 20,
            justifyContent: child.type === 'divider' ? 'center' : undefined,
            display: child.type === 'divider' ? 'flex' : undefined,
            flexDirection: child.type === 'divider' ? 'column' as const : undefined,
            overflow: 'hidden',
            ...(childWidthMode === 'fill' ? { justifySelf: 'stretch' as const } : {}),
          };
          return (
            <div key={child.id} className={styles.cell} style={cellStyle}>
              {renderEmailComponent(child, selectedId, onSelectId)}
            </div>
          );
        })}
        {/* 空插槽占位：补齐至总插槽数量 */}
        {Array.from({ length: emptySlotCount }).map((_, i) => (
          <EmptySlot
            key={`empty-${component.id}-${children.length + i}`}
            gridId={component.id}
            index={children.length + i}
          />
        ))}
      </div>
    </ComponentWrapper>
  );
}

export default memo(GridBlock, (prev, next) => {
  return (
    prev.component === next.component &&
    prev.selectedId === next.selectedId &&
    prev.selected === next.selected &&
    prev.onSelectId === next.onSelectId
  );
});
