import { useRef, useEffect, useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { RiArrowDownLine, RiArrowUpLine, RiChatForwardLine, RiDeleteBinLine, RiDragMoveLine, RiFileCopyLine, RiStackLine } from 'react-icons/ri';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { useChatStore } from '@features/ai-chat/store/useChatStore';
import type { EmailComponent } from '@shared/types/email';
import { captureElementPreview } from '@shared/utils/capturePreview';
import CreateCompositeWizard from './CreateCompositeWizard';
import styles from './FloatingActions.module.css';

/**
 * FloatingActions — 选中组件时出现的浮窗操作面板。
 * 自动判断组件在可视区域中的位置，决定浮窗出现在右上或右下。
 * 任意选中的组件均可「创建复合组件」保存为可复用块。
 */
export default function FloatingActions() {
  const selectedId = useEmailStore((s) => s.selectedId);
  const removeComponent = useEmailStore((s) => s.removeComponent);
  const insertFullComponent = useEmailStore((s) => s.insertFullComponent);
  const selectComponent = useEmailStore((s) => s.selectComponent);
  const findComponent = useEmailStore((s) => s.findComponent);
  const getSiblingInfo = useEmailStore((s) => s.getSiblingInfo);
  const moveComponent = useEmailStore((s) => s.moveComponent);
  const dragOverInfo = useEmailStore((s) => s.dragOverInfo);
  const isDragging = useEmailStore((s) => s.isDragging);
  const [position, setPosition] = useState<'top-right' | 'bottom-right'>('bottom-right');
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const floatRef = useRef<HTMLDivElement>(null);

  // 创建复合组件向导
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  // 缓存打开向导时的组件快照，避免 selectedId 变化导致向导卸载
  const [wizardComponent, setWizardComponent] = useState<EmailComponent | null>(null);

  const selectedComponent = selectedId ? findComponent(selectedId) : null;
  const canCreateComposite = !!selectedComponent;

  const setPendingComponent = useChatStore((s) => s.setPendingComponent);

  // 僅從浮窗的「拖動圖標」觸發拖拽，用於在預覽區重排組件
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable(
    selectedId && selectedComponent
      ? {
          id: `canvas-selected-${selectedId}`,
          data: {
            source: 'canvas-selected' as const,
            componentId: selectedId,
            componentType: selectedComponent.type,
          },
        }
      : { id: 'canvas-selected-placeholder', data: undefined }
  );

  const computePosition = useCallback(() => {
    if (!selectedId) {
      setCoords(null);
      return;
    }

    // 优先选择 ComponentWrapper（data-selected 属性存在的元素），而非 CanvasBlock 的 <li>
    const el = document.querySelector(`[data-component-id="${selectedId}"][data-selected]`)
      || document.querySelector(`[data-component-id="${selectedId}"]`);
    if (!el) {
      setCoords(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const floatHeight = 36;
    const gap = 6;
    const rightOffset = 8;

    const floatWidth = 236; // 7 buttons × 32px + 6 gaps × 2px

    const spaceBelow = viewportHeight - rect.bottom;
    const placeBelow = spaceBelow >= floatHeight + gap + 10;

    const left = rect.right - rightOffset - floatWidth;

    if (placeBelow) {
      setPosition('bottom-right');
      setCoords({ top: rect.bottom + gap, left });
    } else {
      setPosition('top-right');
      setCoords({ top: rect.top - floatHeight - gap, left });
    }
  }, [selectedId]);

  // 当选中 ID 变化或滚动时重新计算位置
  useEffect(() => {
    computePosition();

    // 监听可能改变位置的事件
    const canvasScroll = document.querySelector('[class*="canvasScroll"]');
    const handleScroll = () => computePosition();
    const handleResize = () => computePosition();

    window.addEventListener('resize', handleResize);
    canvasScroll?.addEventListener('scroll', handleScroll);

    // 使用 MutationObserver 监听 DOM 变化（例如其他组件被添加或删除）
    const observer = new MutationObserver(() => {
      requestAnimationFrame(computePosition);
    });
    const root = document.getElementById('root');
    if (root) {
      observer.observe(root, { childList: true, subtree: true, attributes: true });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      canvasScroll?.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, [computePosition]);

  const siblingInfo = selectedId ? getSiblingInfo(selectedId) : null;
  const canMoveUp = !!(siblingInfo && siblingInfo.index > 0);
  const canMoveDown = !!(siblingInfo && siblingInfo.index < siblingInfo.siblingCount - 1);

  const handleMoveUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!siblingInfo || !canMoveUp) return;
    moveComponent(siblingInfo.index, siblingInfo.index - 1, siblingInfo.parentId ?? undefined);
  };

  const handleMoveDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!siblingInfo || !canMoveDown) return;
    moveComponent(siblingInfo.index, siblingInfo.index + 1, siblingInfo.parentId ?? undefined);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedComponent) return;
    insertFullComponent(selectedComponent, selectedId!, 'after');
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedId) {
      removeComponent(selectedId);
      selectComponent(null);
    }
  };

  const handleSendToChat = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedComponent || !selectedId) return;

    const captureId = selectedId;
    const captureComp = selectedComponent;

    // 立即顯示卡片（snapshotLoading = true），不阻塞 UI
    setPendingComponent({
      id: captureId,
      type: captureComp.type,
      snapshot: '',
      snapshotLoading: true,
      componentJson: captureComp as unknown as Record<string, unknown>,
    });

    const el =
      document.querySelector<HTMLElement>(`[data-component-id="${captureId}"][data-selected]`) ??
      document.querySelector<HTMLElement>(`[data-component-id="${captureId}"]`);

    if (el) {
      try {
        const elWidth = Math.max(320, Math.round(el.getBoundingClientRect().width) || 600);
        const dataUrl = await captureElementPreview(el, {
          width: elWidth,
          backgroundColor: '#FFFFFF',
        });
        const current = useChatStore.getState().pendingComponent;
        if (current?.id === captureId) {
          setPendingComponent({
            id: captureId,
            type: captureComp.type,
            snapshot: dataUrl ?? '',
            snapshotLoading: false,
            componentJson: captureComp as unknown as Record<string, unknown>,
          });
        }
      } catch (err) {
        console.warn('[FloatingActions] snapshot failed:', err);
        const current = useChatStore.getState().pendingComponent;
        if (current?.id === captureId) {
          setPendingComponent({ ...current, snapshotLoading: false });
        }
      }
    } else {
      const current = useChatStore.getState().pendingComponent;
      if (current?.id === captureId) {
        setPendingComponent({ ...current, snapshotLoading: false });
      }
    }
  }, [selectedComponent, selectedId, setPendingComponent]);

  const handleCreateComposite = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 打开向导时缓存当前选中组件的快照
    if (selectedComponent) {
      setWizardComponent(selectedComponent);
      setShowCreateWizard(true);
    }
  };

  // 浮窗按钮是否可见（拖拽中 / 无选中 / 无坐标 时隐藏）
  const showFloatButtons = !!(selectedId && coords && !dragOverInfo && !isDragging);

  return (
    <>
      {/* 浮窗操作按钮 */}
      {showFloatButtons && (
        <div
          ref={floatRef}
          className={`${styles.floating} ${position === 'top-right' ? styles.fromTop : styles.fromBottom}`}
          style={{
            top: coords!.top,
            left: coords!.left,
          }}
        >
          {/* 僅此按鈕可觸發拖拽，用於在預覽區移動組件位置 */}
          <button
            ref={setDragRef}
            type="button"
            className={`${styles.actionBtn} ${styles.dragHandle}`}
            title="拖動以移動組件位置"
            aria-label="拖動以移動組件位置"
            {...listeners}
            {...attributes}
          >
            <RiDragMoveLine size={15} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleMoveUp}
            disabled={!canMoveUp}
            title="上移"
            aria-label="上移"
          >
            <RiArrowUpLine size={15} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleMoveDown}
            disabled={!canMoveDown}
            title="下移"
            aria-label="下移"
          >
            <RiArrowDownLine size={15} />
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.aiSendBtn}`}
            onClick={handleSendToChat}
            title="携带到 AI 对话"
            aria-label="携带到 AI 对话"
          >
            <RiChatForwardLine size={15} />
          </button>
          {canCreateComposite && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={handleCreateComposite}
              title="创建复合组件"
            >
              <RiStackLine size={15} />
            </button>
          )}
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleCopy}
            title="复制组件"
          >
            <RiFileCopyLine size={15} />
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleDelete}
            title="删除组件"
          >
            <RiDeleteBinLine size={15} />
          </button>
        </div>
      )}

      {/* 创建复合组件向导（使用缓存的组件快照，独立于实时选中状态，避免弹窗被意外卸载） */}
      {wizardComponent && (
        <CreateCompositeWizard
          open={showCreateWizard}
          onClose={() => {
            setShowCreateWizard(false);
            setWizardComponent(null);
          }}
          component={wizardComponent}
        />
      )}
    </>
  );
}
