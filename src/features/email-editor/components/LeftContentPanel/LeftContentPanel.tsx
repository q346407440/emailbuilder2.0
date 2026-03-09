import React, { memo, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { captureElementPreview } from '@shared/utils/capturePreview';
import { useShallow } from 'zustand/react/shallow';
import { useEmailStore, isContainerComponent } from '@features/email-editor/store/useEmailStore';
import { useCompositeStore } from '@features/composite-library/store/useCompositeStore';
import { toast } from '@shared/store/useToastStore';
import { useEmailTemplateStore, DEFAULT_TEMPLATE_PREVIEW_PATH } from '@features/template-management/store/useEmailTemplateStore';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import type { EmailComponent } from '@shared/types/email';
import { isImageProps } from '@shared/types/email';
import type { CompositeComponent } from '@shared/types/composite';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { COMPONENT_ITEMS, TYPE_LABELS, TYPE_ICONS } from '@shared/constants/componentLibrary';
import { DEFAULT_TEXT_FONT_FAMILY } from '@shared/constants/fontOptions';
import type { TemplateConfig } from '@shared/types/email';
import type { SavedEmailTemplate } from '@shared/types/emailTemplate';
import { renderEmailComponent } from '@email-components/renderEmailComponent';
import { spacingConfigToCSS, borderConfigToCSS, borderRadiusConfigToCSS, contentAlignToCSS } from '@shared/utils/styleHelpers';
import Modal, { ModalInput, ModalFooter, ConfirmText, ConfirmHighlight } from '@shared/ui/Modal';
import CreateCompositeWizard from '@features/composite-library/components/CreateCompositeWizard/CreateCompositeWizard';
import { fetchServerAssetBlob } from '@shared/api/serverApi';
import TemplateVariableView from './TemplateVariableView';
import TemplateLogicView from './TemplateLogicView';
import LeftPanelSubTabs from './LeftPanelSubTabs';
import canvasStyles from '../Canvas/Canvas.module.css';
import styles from './LeftContentPanel.module.css';

// ===== Tree Drop Gap =====

const TreeDropGap = memo(function TreeDropGap({
  targetId,
  position,
  depth,
}: {
  targetId: string;
  position: 'before' | 'after' | 'inside';
  depth: number;
}) {
  const { isDragging, isActive } = useEmailStore(
    useShallow(
      useCallback(
        (s) => ({
          isDragging: s.isDragging,
          isActive:
            s.treeDragOverInfo?.targetId === targetId &&
            s.treeDragOverInfo.position === position,
        }),
        [targetId, position]
      )
    )
  );

  const { setNodeRef, isOver } = useDroppable({
    id: `tree-drop-${targetId}-${position}`,
    data: { type: 'tree-drop', targetId, position },
  });

  const showIndicator = isOver || isActive;
  const isInside = position === 'inside';

  return (
    <div
      ref={setNodeRef}
      className={`${styles.treeDropGap} ${isDragging ? styles.treeDropGapVisible : ''} ${showIndicator ? styles.treeDropGapActive : ''} ${isInside ? styles.treeDropGapInside : ''} ${showIndicator && isInside ? styles.treeDropGapInsideActive : ''}`}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
      data-position={position}
      title={isInside ? '放入为子组件' : position === 'before' ? '插入到上方' : '插入到下方'}
    >
      {showIndicator && (
        isInside ? <div className={styles.treeInsertionBlock} /> : <div className={styles.treeInsertionLine} />
      )}
    </div>
  );
});

// ===== Tree View (Template components) =====

const TreeNode = memo(function TreeNode({
  component,
  depth,
  isFirst,
}: {
  component: EmailComponent;
  depth: number;
  isFirst?: boolean;
}) {
  /* 细粒度订阅：仅订阅「本节点是否被选中/展开」，避免任意组件选中/展开时所有 TreeNode 重渲染 */
  const isSelected = useEmailStore(
    useCallback((s) => s.selectedId === component.id, [component.id])
  );
  const isExpanded = useEmailStore(
    useCallback((s) => s.expandedTreeIds.includes(component.id), [component.id])
  );
  /* actions 引用稳定，合并为一次浅比较订阅 */
  const {
    selectComponent,
    toggleTreeNode,
    removeComponent,
    moveComponent,
    getSiblingInfo,
  } = useEmailStore(
    useShallow((s) => ({
      selectComponent: s.selectComponent,
      toggleTreeNode: s.toggleTreeNode,
      removeComponent: s.removeComponent,
      moveComponent: s.moveComponent,
      getSiblingInfo: s.getSiblingInfo,
    }))
  );

  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ placement: 'bottom' | 'top' | 'left' | 'right'; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);

  const siblingInfo = getSiblingInfo(component.id);
  const canMoveUp = siblingInfo ? siblingInfo.index > 0 : false;
  const canMoveDown = siblingInfo ? siblingInfo.index < siblingInfo.siblingCount - 1 : false;

  const computeMenuPosition = useCallback(() => {
    if (!moreBtnRef.current) return null;
    const rect = moreBtnRef.current.getBoundingClientRect();
    return computeTreeRowMenuPosition(rect);
  }, []);

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleScrollOrResize = () => {
      const next = computeMenuPosition();
      setMenuPosition(next);
    };
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [showMenu, computeMenuPosition]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target as Node;
      if (menuRef.current?.contains(el) || moreBtnRef.current?.contains(el)) return;
      if ((el as Element).closest?.('[data-tree-row-menu]')) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, closeMenu]);

  const handleMoveUp = useCallback(() => {
    if (!siblingInfo || !canMoveUp) return;
    closeMenu();
    moveComponent(siblingInfo.index, siblingInfo.index - 1, siblingInfo.parentId ?? undefined);
  }, [siblingInfo, canMoveUp, moveComponent, closeMenu]);

  const handleMoveDown = useCallback(() => {
    if (!siblingInfo || !canMoveDown) return;
    closeMenu();
    moveComponent(siblingInfo.index, siblingInfo.index + 1, siblingInfo.parentId ?? undefined);
  }, [siblingInfo, canMoveDown, moveComponent, closeMenu]);

  const handleDeleteConfirm = useCallback(() => {
    removeComponent(component.id);
    setShowDeleteConfirm(false);
    closeMenu();
    toast('已删除组件', 'success');
  }, [component.id, removeComponent, closeMenu]);

  const isContainer = isContainerComponent(component);
  const hasChildren = isContainer && Array.isArray(component.children) && component.children.length > 0;
  const isImageLayoutMode = component.type === 'image' && isImageProps(component.props) && component.props.layoutMode === true;

  // 复合组件模式判断
  const compositeMode = component.compositeInstance?.mode;
  const isBusinessComposite = compositeMode === 'business';
  const isNativeComposite = compositeMode === 'native';
  // 业务复合组件禁止展开
  const canExpand = isContainer && !isBusinessComposite;

  // 让每个 tree row 可拖拽
  const { attributes, listeners, setNodeRef: setDragRef, isDragging: isNodeDragging } = useDraggable({
    id: `tree-drag-${component.id}`,
    data: { source: 'tree', componentId: component.id, componentType: component.type },
  });

  return (
    <div className={styles.treeNode}>
      {/* 第一个节点的 before gap */}
      {isFirst && <TreeDropGap targetId={component.id} position="before" depth={depth} />}

      <div
        ref={setDragRef}
        data-tree-id={component.id}
        className={`${styles.treeRow} ${isSelected ? styles.treeRowSelected : ''} ${isNodeDragging ? styles.treeRowDragging : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={(e) => {
          e.stopPropagation();
          selectComponent(component.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectComponent(component.id);
          }
        }}
        {...listeners}
        {...attributes}
      >
        {canExpand ? (
          <button
            type="button"
            className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleTreeNode(component.id);
            }}
            onPointerDown={(e) => {
              // 阻止 chevron 触发拖拽
              e.stopPropagation();
            }}
            aria-label={isExpanded ? '收起' : '展开'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2l4 3-4 3" />
            </svg>
          </button>
        ) : isContainer && isBusinessComposite ? (
          /* 业务复合组件：展示禁用状态的 chevron */
          <span className={`${styles.chevron} ${styles.chevronDisabled}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2l4 3-4 3" />
            </svg>
          </span>
        ) : (
          <span className={styles.chevronSpacer} />
        )}
        <span className={styles.treeIcon}>
          {TYPE_ICONS[component.type]}
        </span>
        <span className={styles.treeName}>
          {(component.displayName && component.displayName.trim()) ? component.displayName.trim() : TYPE_LABELS[component.type]}
        </span>
        {/* 标签与 … 按钮同一区块靠右，标签紧贴 … */}
        <div className={styles.treeRowRight}>
          {/* 复合组件模式标签 */}
          {isBusinessComposite && (
            <span className={`${styles.treeTag} ${styles.treeTagBusiness}`}>业务</span>
          )}
          {isNativeComposite && (
            <span className={styles.treeTag}>原生</span>
          )}
          {/* 图片布局模式标签 */}
          {isImageLayoutMode && !isBusinessComposite && !isNativeComposite && (
            <span className={styles.treeTag}>布局</span>
          )}
          {/* 树行操作：上移、下移、删除 */}
          <div className={styles.treeRowActions} ref={menuRef}>
          <button
            ref={moreBtnRef}
            type="button"
            className={styles.treeRowMoreBtn}
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((v) => {
                const next = !v;
                if (next) {
                  setMenuPosition(computeMenuPosition());
                } else {
                  setMenuPosition(null);
                }
                return next;
              });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="更多操作"
            aria-label="更多操作"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
            </svg>
          </button>
          {showMenu &&
            menuPosition &&
            createPortal(
              <div
                data-tree-row-menu
                className={`${styles.menuDropdown} ${styles[`menuDropdown${menuPosition.placement.charAt(0).toUpperCase() + menuPosition.placement.slice(1)}`]}`}
                style={{
                  position: 'fixed',
                  top: menuPosition.top,
                  left: menuPosition.left,
                  zIndex: 50,
                }}
              >
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={(e) => { e.stopPropagation(); handleMoveUp(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={!canMoveUp}
                  title={canMoveUp ? '上移' : '已是第一个'}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 12V4M5 7l3-3 3 3" />
                  </svg>
                  <span>上移</span>
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={(e) => { e.stopPropagation(); handleMoveDown(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={!canMoveDown}
                  title={canMoveDown ? '下移' : '已是最后一个'}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 4v8M11 9l-3 3-3-3" />
                  </svg>
                  <span>下移</span>
                </button>
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    setShowDeleteConfirm(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4h12M5.3 4V2.7a1 1 0 011-1h3.4a1 1 0 011 1V4M13 4v9.3a1 1 0 01-1 1H4a1 1 0 01-1-1V4" />
                  </svg>
                  <span>删除</span>
                </button>
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <Modal
        open={showDeleteConfirm}
        title="删除组件"
        onClose={() => setShowDeleteConfirm(false)}
        footer={
          <ModalFooter
            onCancel={() => setShowDeleteConfirm(false)}
            onConfirm={handleDeleteConfirm}
            confirmText="确认删除"
            danger
          />
        }
      >
        <ConfirmText>
          确定要删除该组件吗？{isContainer && '该组件及其所有子级将一并移除。'}
        </ConfirmText>
      </Modal>

      {/* 收合状态的容器：在 row 与 after 之间提供「放入子级」感应区，无需先展开 */}
      {canExpand && !isExpanded && (
        <TreeDropGap targetId={component.id} position="inside" depth={depth + 1} />
      )}

      {canExpand && isExpanded && (
        <div
          className={styles.treeChildren}
          style={{ '--connector-left': `${20 + depth * 16}px` } as React.CSSProperties}
        >
          {hasChildren &&
            component.children!.map((child, idx) => (
              <TreeNode
                key={child.id}
                component={child}
                depth={depth + 1}
                isFirst={idx === 0}
              />
            ))
          }
          {!hasChildren && (
            <>
              <div
                className={styles.treeEmpty}
                style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}
              >
                暂无子组件
              </div>
              {/* 展开状态下无子组件时，提供 inside drop gap */}
              <TreeDropGap targetId={component.id} position="inside" depth={depth + 1} />
            </>
          )}
          {/* 展开且有子组件时，在子列表末尾也提供明显的「放入子级」感应区 */}
          {hasChildren && (
            <TreeDropGap targetId={component.id} position="inside" depth={depth + 1} />
          )}
        </div>
      )}

      {/* after gap */}
      <TreeDropGap targetId={component.id} position="after" depth={depth} />
    </div>
  );
});

function TemplateTreeView() {
  const components = useEmailStore((s) => s.components);
  const selectedId = useEmailStore((s) => s.selectedId);
  const expandToNode = useEmailStore((s) => s.expandToNode);
  const treeListRef = useRef<HTMLDivElement>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const cleanupRef = useRef<number>(0);

  useEffect(() => {
    if (!selectedId || selectedId === prevSelectedRef.current) {
      prevSelectedRef.current = selectedId;
      return;
    }
    prevSelectedRef.current = selectedId;

    expandToNode(selectedId);

    const rafOuter = requestAnimationFrame(() => {
      const rafInner = requestAnimationFrame(() => {
        const container = treeListRef.current;
        if (!container) return;
        const el = container.querySelector(`[data-tree-id="${selectedId}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      cleanupRef.current = rafInner;
    });
    cleanupRef.current = rafOuter;

    return () => cancelAnimationFrame(cleanupRef.current);
  }, [selectedId, expandToNode]);

  if (components.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>暂无组件</p>
        <p className={styles.emptyHint}>从组件库拖入或点击添加</p>
      </div>
    );
  }

  return (
    <div ref={treeListRef} className={styles.treeList}>
      {components.map((comp, idx) => (
        <TreeNode key={comp.id} component={comp} depth={0} isFirst={idx === 0} />
      ))}
    </div>
  );
}

// ===== Library View (Draggable component cards) =====

function LibraryCard({ item }: { item: typeof COMPONENT_ITEMS[number] }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library-${item.type}`,
    data: { source: 'library', componentType: item.type },
  });

  const addComponent = useEmailStore((s) => s.addComponent);
  const insertComponent = useEmailStore((s) => s.insertComponent);
  const selectedId = useEmailStore((s) => s.selectedId);
  const findComponent = useEmailStore((s) => s.findComponent);

  const handleClick = useCallback(() => {
    const selected = selectedId ? findComponent(selectedId) : null;
    if (selected && isContainerComponent(selected)) {
      addComponent(item.type, selected.id);
    } else if (selected) {
      insertComponent(item.type, selected.id, 'after');
    } else {
      addComponent(item.type);
    }
  }, [addComponent, insertComponent, selectedId, findComponent, item.type]);

  const selected = selectedId ? findComponent(selectedId) : null;
  const willAddToContainer = !!(selected && isContainerComponent(selected));
  const willAddAfter = !!(selected && !isContainerComponent(selected));

  const cardTitle = willAddToContainer
    ? `点击添加到「${selected?.displayName ?? selected?.type ?? '容器'}」内部`
    : willAddAfter
    ? `点击添加到「${selected?.displayName ?? selected?.type ?? '组件'}」后方`
    : '点击添加到画布末尾';

  return (
    <div
      ref={setNodeRef}
      className={`${styles.libCard} ${isDragging ? styles.libCardDragging : ''}`}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title={cardTitle}
    >
      <span className={styles.libCardIcon}>{item.icon}</span>
      <span className={styles.libCardBody}>
        <span className={styles.libCardTitle}>{item.label}</span>
        <span className={styles.libCardDesc}>{item.desc}</span>
      </span>
    </div>
  );
}

function BasicLibraryView() {
  const selectedId = useEmailStore((s) => s.selectedId);
  const findComponent = useEmailStore((s) => s.findComponent);
  const selected = selectedId ? findComponent(selectedId) : null;
  const willAddToContainer = !!(selected && isContainerComponent(selected));
  const willAddAfter = !!(selected && !isContainerComponent(selected));

  const hint = willAddToContainer
    ? `点击将添加到已选中的容器内部，或拖拽到指定位置`
    : willAddAfter
    ? `点击将添加到已选中组件后方，或拖拽到指定位置`
    : '点击添加到画布末尾，或拖拽到指定位置';

  return (
    <div className={styles.libList}>
      {COMPONENT_ITEMS.map((item) => (
        <LibraryCard key={item.type} item={item} />
      ))}
      <p className={styles.libHint}>{hint}</p>
    </div>
  );
}

// ===== Composite Library =====

function isNotFoundPreviewError(err: unknown): boolean {
  return err instanceof Error && /\b404\b/.test(err.message);
}

const FAILED_ASSET_URLS_STORAGE_KEY = 'email-editor:failed-asset-urls';

function loadFailedAssetUrls(): Set<string> {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = window.localStorage.getItem(FAILED_ASSET_URLS_STORAGE_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length > 0));
  } catch {
    return new Set<string>();
  }
}

function persistFailedAssetUrls(failedUrls: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      FAILED_ASSET_URLS_STORAGE_KEY,
      JSON.stringify(Array.from(failedUrls))
    );
  } catch {
    // ignore quota/storage errors
  }
}

// 记录已确认不可用的资源，避免列表虚拟滚动与 StrictMode 导致重复请求
const failedAssetUrls = loadFailedAssetUrls();
const pendingAssetBlobLoads = new Map<string, Promise<Blob>>();

function useResolvedAssetUrl(
  src: string | null | undefined,
  onNotFound?: () => void
): {
  resolvedSrc: string | null;
  hasError: boolean;
} {
  const [resolvedState, setResolvedState] = useState<{ origin: string; url: string | null; hasError: boolean } | null>(null);
  const isInline = typeof src === 'string' && /^(data:|blob:)/.test(src);
  const isFailed = typeof src === 'string' && failedAssetUrls.has(src);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (!src || isInline || isFailed) return;
    const pendingLoad =
      pendingAssetBlobLoads.get(src) ??
      (() => {
        const p = fetchServerAssetBlob(src).finally(() => {
          pendingAssetBlobLoads.delete(src);
        });
        pendingAssetBlobLoads.set(src, p);
        return p;
      })();

    pendingLoad
      .then((blob) => {
        if (cancelled) {
          return;
        }
        const url = URL.createObjectURL(blob);
        objectUrl = url;
        setResolvedState({ origin: src, url, hasError: false });
      })
      .catch((err) => {
        if (cancelled) return;
        failedAssetUrls.add(src);
        persistFailedAssetUrls(failedAssetUrls);
        if (isNotFoundPreviewError(err)) {
          onNotFound?.();
        }
        setResolvedState({ origin: src, url: null, hasError: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, isInline, isFailed, onNotFound]);

  const resolvedSrc = useMemo(() => {
    if (!src) return null;
    if (isInline) return src;
    if (isFailed) return null;
    if (resolvedState?.origin === src) return resolvedState.url;
    return null;
  }, [src, isInline, isFailed, resolvedState]);

  const hasError = useMemo(() => {
    if (!src) return false;
    if (isInline) return false;
    if (isFailed) return true;
    if (resolvedState?.origin === src) return resolvedState.hasError;
    return false;
  }, [src, isInline, isFailed, resolvedState]);

  return { resolvedSrc, hasError };
}

function CompositeCard({
  composite,
  onPreviewClick,
  onEdit,
  isFirst,
  isLast,
}: {
  composite: CompositeComponent;
  onPreviewClick: () => void;
  onEdit?: (composite: CompositeComponent) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `composite-${composite.id}`,
    data: { source: 'composite-library', compositeId: composite.id },
  });

  const insertFullComponent = useEmailStore((s) => s.insertFullComponent);
  const selectedId = useEmailStore((s) => s.selectedId);
  const findComponent = useEmailStore((s) => s.findComponent);
  const [showMenu, setShowMenu] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [newName, setNewName] = useState(composite.name);
  const { resolvedSrc: resolvedPreviewUrl, hasError: previewLoadFailed } = useResolvedAssetUrl(composite.previewDataUrl);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ placement: MenuPlacement; top: number; left: number } | null>(null);

  const renameComposite = useCompositeStore((s) => s.renameComposite);
  const softDeleteComposite = useCompositeStore((s) => s.softDeleteComposite);
  const moveCompositeUp = useCompositeStore((s) => s.moveCompositeUp);
  const moveCompositeDown = useCompositeStore((s) => s.moveCompositeDown);

  const computeMenuPosition = useCallback(() => {
    if (!moreBtnRef.current) return null;
    const rect = moreBtnRef.current.getBoundingClientRect();
    return computeCompositeMenuPosition(rect);
  }, []);

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleScrollOrResize = () => {
      const next = computeMenuPosition();
      setMenuPosition(next);
    };
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [showMenu, computeMenuPosition]);

  // 点击外部关闭菜单（浮窗通过 Portal 挂到 body，需排除浮窗内点击）
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target as Node;
      if (menuRef.current?.contains(el) || moreBtnRef.current?.contains(el)) return;
      if ((el as Element).closest?.('[data-composite-menu]')) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, closeMenu]);

  const handleClick = () => {
    try {
      const selected = selectedId ? findComponent(selectedId) : null;
      if (selected && isContainerComponent(selected)) {
        insertFullComponent(composite.component, selected.id, 'inside', composite);
      } else if (selected) {
        insertFullComponent(composite.component, selected.id, 'after', composite);
      } else {
        insertFullComponent(composite.component, undefined, undefined, composite);
      }
    } catch (err) {
      console.error('添加复合组件失败', composite.name, err);
      toast('该复合组件资料异常，无法加入画布。请尝试删除该组件后重新建立，或从导入还原。', 'error');
    }
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    try {
      await renameComposite(composite.id, newName.trim());
      setShowRename(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast(`重命名复合组件失败：${msg}`, 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await softDeleteComposite(composite.id);
      setShowDelete(false);
      toast(`已删除复合组件「${composite.name}」`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast(`删除复合组件失败：${msg}`, 'error');
    }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        className={`${styles.compositeCard} ${isDragging ? styles.compositeCardDragging : ''}`}
        {...listeners}
        {...attributes}
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        {/* 类型徽章：左上角 */}
        <span
          className={styles.compositeCardTypeBadge}
          data-mode={composite.mode === 'business' ? 'business' : 'native'}
        >
          {composite.mode === 'business' ? '业务' : '原生'}
        </span>

        {/* 预览缩略图 */}
        <button
          type="button"
          className={styles.compositeCardThumbWrap}
          onClick={(e) => { e.stopPropagation(); onPreviewClick(); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="放大预览"
        >
          {resolvedPreviewUrl && !previewLoadFailed ? (
            <img
              src={resolvedPreviewUrl}
              alt=""
              className={styles.compositeCardThumb}
              loading="lazy"
            />
          ) : (
            <span className={styles.compositeCardThumbPlaceholder}>
              {composite.previewDataUrl && !previewLoadFailed ? '加载中…' : '暂无预览'}
            </span>
          )}
        </button>

        {/* 标题区域 */}
        <div className={styles.compositeCardBody}>
          <span className={styles.compositeCardTitle} title={composite.name}>{composite.name}</span>
        </div>

        {/* 操作按钮 */}
        <div className={styles.compositeActions} ref={menuRef}>
          <button
            ref={moreBtnRef}
            type="button"
            className={styles.moreBtn}
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((v) => {
                const next = !v;
                if (next) {
                  setMenuPosition(computeMenuPosition());
                } else {
                  setMenuPosition(null);
                }
                return next;
              });
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title="更多操作"
            aria-label="更多操作"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
            </svg>
          </button>
          {showMenu &&
            menuPosition &&
            createPortal(
              <div
                data-composite-menu
                className={`${styles.menuDropdown} ${styles[`menuDropdown${menuPosition.placement.charAt(0).toUpperCase() + menuPosition.placement.slice(1)}`]}`}
                style={{
                  position: 'fixed',
                  top: menuPosition.top,
                  left: menuPosition.left,
                  zIndex: 50,
                }}
              >
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    moveCompositeUp(composite.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={isFirst}
                  title={isFirst ? '已经是第一个' : '上移'}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 12V4M5 7l3-3 3 3" />
                  </svg>
                  <span>上移</span>
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    moveCompositeDown(composite.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  disabled={isLast}
                  title={isLast ? '已经是最后一个' : '下移'}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 4v8M11 9l-3 3-3-3" />
                  </svg>
                  <span>下移</span>
                </button>
                {composite.mode === 'business' && onEdit ? (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMenu();
                      onEdit(composite);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.5 1.5l3 3L5 14H2v-3z" />
                      <path d="M9.5 3.5l3 3" />
                    </svg>
                    <span>编辑</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMenu();
                      setNewName(composite.name);
                      setShowRename(true);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.5 1.5l3 3L5 14H2v-3z" />
                      <path d="M9.5 3.5l3 3" />
                    </svg>
                    <span>编辑名称</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeMenu();
                    setShowDelete(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4h12M5.3 4V2.7a1 1 0 011-1h3.4a1 1 0 011 1V4M13 4v9.3a1 1 0 01-1 1H4a1 1 0 01-1-1V4" />
                  </svg>
                  <span>删除</span>
                </button>
              </div>,
              document.body
            )}
        </div>
      </div>

      {/* 编辑名称弹窗 */}
      <Modal
        open={showRename}
        title="编辑复合组件名称"
        onClose={() => setShowRename(false)}
        footer={
          <ModalFooter
            onCancel={() => setShowRename(false)}
            onConfirm={handleRename}
            confirmText="确定"
            confirmDisabled={!newName.trim()}
          />
        }
      >
        <ModalInput
          value={newName}
          onChange={setNewName}
          placeholder="请输入新名称"
          onSubmit={handleRename}
        />
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal
        open={showDelete}
        title="删除复合组件"
        onClose={() => setShowDelete(false)}
        footer={
          <ModalFooter
            onCancel={() => setShowDelete(false)}
            onConfirm={handleDelete}
            confirmText="确认删除"
            danger
          />
        }
      >
        <ConfirmText>
          确定要删除复合组件 <ConfirmHighlight>{composite.name}</ConfirmHighlight> 吗？已添加到模板中的实例不会受影响。
        </ConfirmText>
      </Modal>
    </>
  );
}

/**
 * 复合组件快照容器，用于缩略图截图。
 * 使用 plain div 而非 Canvas 专属 CSS 类（避免 min-height/flex 等影响高度）。
 * 宽度使用画布宽度，使 fill 模式组件能正确渲染；截图时以 ComponentWrapper.scrollWidth 为准。
 */
function CompositePreviewSnapshot({ component, canvasWidth, fontFamily }: { component: EmailComponent; canvasWidth: string; fontFamily: string }) {
  return (
    <div style={{ width: canvasWidth, fontFamily, background: '#FFFFFF' }}>
      {renderEmailComponent(component, null, () => {})}
    </div>
  );
}

function CompositeLibraryView() {
  const [editingCompositeId, setEditingCompositeId] = useState<string | null>(null);
  const isLoaded = useCompositeStore((s) => s.isLoaded);
  const composites = useCompositeStore((s) => s.composites);
  const getCompositeById = useCompositeStore((s) => s.getCompositeById);
  const templateConfig = useEmailStore((s) => s.templateConfig);
  // 按 sortOrder 正序排序（数字越小越靠前）
  const activeComposites = composites
    .filter((c) => c.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const updateCompositePreview = useCompositeStore((s) => s.updateCompositePreview);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ top: 0, height: 0 });

  // 需要延迟生成预览的复合组件：
  // undefined = 保存时截图失败或旧资料，需补生成
  // '' = 导入组件，永久显示「暂无预览」，不自动生成
  const needPreview = activeComposites.filter((c) => c.previewDataUrl === undefined);
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollState({ top: el.scrollTop, height: el.clientHeight });
  }, [setScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    updateScrollState();
    return () => ro.disconnect();
  }, [updateScrollState]);

  const count = activeComposites.length;
  const totalHeight =
    COMPOSITE_LIST_PADDING_TOP + count * COMPOSITE_ITEM_HEIGHT + COMPOSITE_LIST_PADDING_BOTTOM;
  const startIndex = Math.max(
    0,
    Math.floor((scrollState.top - COMPOSITE_LIST_PADDING_TOP) / COMPOSITE_ITEM_HEIGHT) -
      COMPOSITE_LIST_OVERSCAN
  );
  const endIndex = Math.min(
    count - 1,
    Math.floor(
      (scrollState.top + scrollState.height - COMPOSITE_LIST_PADDING_TOP) / COMPOSITE_ITEM_HEIGHT
    ) + COMPOSITE_LIST_OVERSCAN
  );
  const visibleRange = useMemo(
    () => (count > 0 ? { start: startIndex, end: endIndex } : null),
    [count, startIndex, endIndex]
  );
  const needPreviewVisible = useMemo(() => {
    if (!visibleRange || needPreview.length === 0) return [];
    return needPreview.filter((c) => {
      const i = activeComposites.findIndex((x) => x.id === c.id);
      return i >= visibleRange.start && i <= visibleRange.end;
    });
  }, [visibleRange, needPreview, activeComposites]);
  const needPreviewVisibleIds = useMemo(
    () => needPreviewVisible.map((c) => c.id).join(','),
    [needPreviewVisible]
  );
  const hasNeedPreviewVisible = needPreviewVisible.length > 0;

  // 延迟渲染隐藏容器 → 截图生成预览（结构：div > ul > li.block > blockContent > Component）
  // 截图目标：li.block，经 prepareEmailHtml + 后端 Puppeteer，与画布/保存向导视觉一致。
  // 批量时序列处理并加间隔，避免同时发起大量 Puppeteer 请求。
  useEffect(() => {
    if (!hasNeedPreviewVisible) return;
    const container = hiddenContainerRef.current;
    if (!container) return;
    let cancelled = false;
    const run = async () => {
      const wrappers = Array.from(
        container.querySelectorAll<HTMLElement>('[data-composite-preview-id]')
      );
      for (const wrapper of wrappers) {
        if (cancelled) break;
        const id = wrapper.getAttribute('data-composite-preview-id');
        if (!id) continue;
        // CompositePreviewSnapshot div（plain div）→ ComponentWrapper（直接子节点）
        const snapshotDiv = wrapper.firstElementChild as HTMLElement | null;
        const target = (snapshotDiv?.firstElementChild as HTMLElement | null) ?? snapshotDiv;
        if (!target) continue;
        try {
          const dataUrl = await captureElementPreview(target, { backgroundColor: '#FFFFFF' });
          if (dataUrl) updateCompositePreview(id, dataUrl);
        } catch (err) {
          console.error('复合组件预览生成失败', id, err);
        }
        if (!cancelled) await new Promise((r) => setTimeout(r, 200));
      }
    };
    const t = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [needPreviewVisibleIds, updateCompositePreview, hasNeedPreviewVisible]);

  if (!isLoaded) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>加载中…</p>
      </div>
    );
  }

  return (
    <>
      {activeComposites.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>暂无复合组件</p>
          <p className={styles.emptyHint}>选中任意组件后，点击浮窗的堆叠图标创建复合组件</p>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className={styles.templateListScroll}
            onScroll={updateScrollState}
            role="list"
            aria-label="公共复合组件列表"
          >
            <div className={styles.templateListPhantom} style={{ height: totalHeight }} aria-hidden />
            {visibleRange &&
              (() => {
                const items: React.ReactNode[] = [];
                for (let i = visibleRange.start; i <= visibleRange.end; i++) {
                  const composite = activeComposites[i];
                  items.push(
                    <div
                      key={composite.id}
                      className={styles.templateListItem}
                      style={{
                        top: COMPOSITE_LIST_PADDING_TOP + i * COMPOSITE_ITEM_HEIGHT,
                        left: COMPOSITE_LIST_PADDING_X,
                        right: COMPOSITE_LIST_PADDING_X,
                      }}
                    >
                      <CompositeCard
                        composite={composite}
                        onPreviewClick={() => {
                          if (!composite.previewDataUrl) {
                            toast('该复合组件暂无预览图', 'info');
                            return;
                          }
                          setLightboxUrl(composite.previewDataUrl);
                        }}
                        onEdit={(c) => setEditingCompositeId(c.id)}
                        isFirst={i === 0}
                        isLast={i === activeComposites.length - 1}
                      />
                    </div>
                  );
                }
                return items;
              })()}
          </div>
          <p className={styles.libHint}>拖拽复合组件到预览区域添加</p>
        </>
      )}

      {editingCompositeId && (() => {
        const composite = getCompositeById(editingCompositeId);
        if (!composite) return null;
        return (
          <CreateCompositeWizard
            open
            onClose={() => setEditingCompositeId(null)}
            component={composite.component}
            compositeId={composite.id}
          />
        );
      })()}

      {/* 隐藏容器：为无预览的复合组件延迟生成缩略图 */}
      {needPreviewVisible.length > 0 && (
        <div ref={hiddenContainerRef} className={styles.previewHidden} aria-hidden="true">
          {needPreviewVisible.map((c) => (
            <div key={c.id} data-composite-preview-id={c.id}>
              <CompositePreviewSnapshot component={c.component} canvasWidth={templateConfig.width || '600px'} fontFamily={templateConfig.fontFamily || DEFAULT_TEXT_FONT_FAMILY} />
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && (
        <LightboxPreview
          src={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </>
  );
}

// ===== Email Templates View =====

/** 与画布一致的预览 DOM，用于 Puppeteer 截图生成缩图（无选中、无拖放） */
function TemplatePreviewSnapshot({ components, config }: { components: EmailComponent[]; config: TemplateConfig }) {
  const contentAlign = config.contentAlign;
  const canvasStyle: React.CSSProperties = {
    width: config.width,
    fontFamily: config.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
    padding: spacingConfigToCSS(config.padding),
    borderRadius: borderRadiusConfigToCSS(config.borderRadius),
    ...contentAlignToCSS(contentAlign),
    ...borderConfigToCSS(config.border),
  };
  const bgType = config.backgroundType || 'color';
  if (bgType === 'image' && config.backgroundImage) {
    canvasStyle.backgroundImage = `url(${config.backgroundImage})`;
    canvasStyle.backgroundSize = 'cover';
    canvasStyle.backgroundPosition = 'center';
    canvasStyle.backgroundRepeat = 'no-repeat';
  } else {
    (canvasStyle as React.CSSProperties & Record<string, string>)['--canvas-bg'] = config.backgroundColor;
  }

  return (
    <div className={canvasStyles.wrap} style={canvasStyle}>
      <ul className={canvasStyles.list} style={contentAlignToCSS(contentAlign)}>
        {components.map((comp) => (
          <li key={comp.id} className={canvasStyles.block}>
            <div className={canvasStyles.blockContent}>
              {renderEmailComponent(comp, null, () => {})}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MENU_GAP = 6;
const MENU_VIEWPORT_PADDING = 8;
const MENU_EST_WIDTH = 138;
const MENU_EST_HEIGHT = 128;
/** 复合组件下拉菜单预估尺寸（上移 + 下移 + 编辑名称 + 删除 四行） */
const COMPOSITE_MENU_EST_WIDTH = 130;
const COMPOSITE_MENU_EST_HEIGHT = 168;

type MenuPlacement = 'bottom' | 'top' | 'left' | 'right';

/** 依视口可视区域决策浮窗在触发按钮的上下左右哪一侧出现（通用，可传入菜单宽高） */
function computeMenuPosition(
  triggerRect: DOMRect,
  menuWidth: number,
  menuHeight: number
): { placement: MenuPlacement; top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - triggerRect.bottom - MENU_GAP;
  const spaceAbove = triggerRect.top - MENU_GAP;
  const spaceRight = vw - triggerRect.right - MENU_GAP;

  const pad = MENU_VIEWPORT_PADDING;
  const canBottom = spaceBelow >= menuHeight + pad;
  const canTop = spaceAbove >= menuHeight + pad;
  const canRight = spaceRight >= menuWidth + pad;

  const clampHorizontal = (left: number) =>
    Math.max(pad, Math.min(left, vw - menuWidth - pad));
  const clampVertical = (top: number) =>
    Math.max(pad, Math.min(top, vh - menuHeight - pad));

  if (canBottom) {
    const left = clampHorizontal(triggerRect.right - menuWidth);
    const top = Math.min(triggerRect.bottom + MENU_GAP, vh - menuHeight - pad);
    return { placement: 'bottom', top, left };
  }
  if (canTop) {
    const left = clampHorizontal(triggerRect.right - menuWidth);
    return { placement: 'top', top: clampVertical(triggerRect.top - MENU_GAP - menuHeight), left };
  }
  if (canRight) {
    const top = clampVertical(triggerRect.top + triggerRect.height / 2 - menuHeight / 2);
    const left = Math.min(vw - menuWidth - pad, triggerRect.right + MENU_GAP);
    return { placement: 'right', top, left };
  }
  const top = clampVertical(triggerRect.top + triggerRect.height / 2 - menuHeight / 2);
  const left = Math.max(pad, triggerRect.left - MENU_GAP - menuWidth);
  return { placement: 'left', top, left };
}

/** 模板卡片「…」浮窗位置 */
function computeTemplateMenuPosition(triggerRect: DOMRect): { placement: MenuPlacement; top: number; left: number } {
  return computeMenuPosition(triggerRect, MENU_EST_WIDTH, MENU_EST_HEIGHT);
}

/** 复合组件「…」浮窗位置（避免被左侧面板 overflow 裁切，与 z 轴问题） */
function computeCompositeMenuPosition(triggerRect: DOMRect): { placement: MenuPlacement; top: number; left: number } {
  return computeMenuPosition(triggerRect, COMPOSITE_MENU_EST_WIDTH, COMPOSITE_MENU_EST_HEIGHT);
}

/** 模板树行「…」浮窗尺寸（上移、下移、删除 三项） */
const TREE_ROW_MENU_EST_WIDTH = 110;
const TREE_ROW_MENU_EST_HEIGHT = 120;
function computeTreeRowMenuPosition(triggerRect: DOMRect): { placement: MenuPlacement; top: number; left: number } {
  return computeMenuPosition(triggerRect, TREE_ROW_MENU_EST_WIDTH, TREE_ROW_MENU_EST_HEIGHT);
}

function EmailTemplateCard({
  title,
  desc,
  previewUrl,
  onPreviewClick,
  savedTemplate,
  isDefault,
}: {
  title: string;
  desc: string;
  previewUrl: string | undefined;
  onPreviewClick: () => void;
  savedTemplate?: SavedEmailTemplate | null;
  isDefault?: boolean;
}) {
  const { resolvedSrc: resolvedPreviewUrl, hasError: previewLoadFailed } = useResolvedAssetUrl(previewUrl);
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showUseConfirm, setShowUseConfirm] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editDesc, setEditDesc] = useState(desc);
  const [editSetAsDefault, setEditSetAsDefault] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ placement: MenuPlacement; top: number; left: number } | null>(null);

  const updateTemplateMeta = useEmailTemplateStore((s) => s.updateTemplateMeta);
  const deleteTemplate = useEmailTemplateStore((s) => s.deleteTemplate);
  const loadTemplate = useEmailStore((s) => s.loadTemplate);
  const setDefaultTemplateId = useEmailTemplateStore((s) => s.setDefaultTemplateId);

  const computeMenuPosition = useCallback(() => {
    if (!moreBtnRef.current) return null;
    const rect = moreBtnRef.current.getBoundingClientRect();
    return computeTemplateMenuPosition(rect);
  }, []);

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleScrollOrResize = () => {
      const next = computeMenuPosition();
      setMenuPosition(next);
    };
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [showMenu, computeMenuPosition]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target as Node;
      if (menuRef.current?.contains(el) || moreBtnRef.current?.contains(el)) return;
      const portalRoot = document.querySelector('[data-template-card-menu]');
      if (portalRoot?.contains(el)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, closeMenu]);

  const handleEditConfirm = async () => {
    if (!savedTemplate || !editTitle.trim()) return;
    try {
      if (editTitle.trim() !== title || editDesc.trim() !== desc) {
        await updateTemplateMeta(savedTemplate.id, { title: editTitle.trim(), desc: editDesc.trim() });
      }
      if (editSetAsDefault && !isDefault) {
        setDefaultTemplateId(savedTemplate.id);
      }
      setShowEdit(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast(`编辑邮件模板失败：${msg}`, 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!savedTemplate) return;
    try {
      await deleteTemplate(savedTemplate.id);
      setShowDelete(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast(`删除邮件模板失败：${msg}`, 'error');
    }
  };

  const handleUseConfirm = () => {
    if (!savedTemplate) return;
    loadTemplate(savedTemplate.components, savedTemplate.config, savedTemplate.customVariables);
    setShowUseConfirm(false);
  };

  const handleCardClick = () => {
    if (savedTemplate) setShowUseConfirm(true);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (!savedTemplate) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setShowUseConfirm(true);
    }
  };

  return (
    <>
      <div
        className={styles.templateCard}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        role={savedTemplate ? 'button' : undefined}
        tabIndex={savedTemplate ? 0 : undefined}
        aria-label={savedTemplate ? `使用模板：${title}` : undefined}
      >
        {isDefault && (
          <span className={styles.templateCardDefaultTag} aria-hidden>默认</span>
        )}
        <button
          type="button"
          className={styles.templateCardThumbWrap}
          onClick={(e) => { e.stopPropagation(); onPreviewClick(); }}
          aria-label="放大预览"
        >
          {resolvedPreviewUrl && !previewLoadFailed ? (
            <img src={resolvedPreviewUrl} alt="" className={styles.templateCardThumb} loading="lazy" />
          ) : (
            <span className={styles.templateCardThumbPlaceholder}>
              {previewUrl && !previewLoadFailed ? '加载中…' : '暂无预览'}
            </span>
          )}
        </button>
        <div
          className={styles.templateCardBody}
          title={[title, desc].filter(Boolean).join('\n\n')}
        >
          <span className={styles.templateCardTitleWrap}>
            <span className={styles.templateCardTitle}>{title}</span>
          </span>
          <span className={styles.templateCardDescWrap}>
            <span className={styles.templateCardDesc}>{desc}</span>
          </span>
        </div>
        {savedTemplate && (
          <div className={styles.templateCardActions} ref={menuRef}>
            <button
              ref={moreBtnRef}
              type="button"
              className={styles.moreBtn}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((v) => {
                  const next = !v;
                  if (next) {
                    setMenuPosition(computeMenuPosition());
                  } else {
                    setMenuPosition(null);
                  }
                  return next;
                });
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="更多操作"
              aria-label="更多操作"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <circle cx="8" cy="3" r="1.3" />
                <circle cx="8" cy="8" r="1.3" />
                <circle cx="8" cy="13" r="1.3" />
              </svg>
            </button>
            {showMenu &&
              menuPosition &&
              createPortal(
                <div
                  data-template-card-menu
                  className={`${styles.menuDropdown} ${styles[`menuDropdown${menuPosition.placement.charAt(0).toUpperCase() + menuPosition.placement.slice(1)}`]}`}
                  style={{
                    position: 'fixed',
                    top: menuPosition.top,
                    left: menuPosition.left,
                    zIndex: 50,
                  }}
                >
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMenu();
                      setEditTitle(title);
                      setEditDesc(desc);
                      setEditSetAsDefault(!!isDefault);
                      setShowEdit(true);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11.5 1.5l3 3L5 14H2v-3z" />
                      <path d="M9.5 3.5l3 3" />
                    </svg>
                    <span>编辑</span>
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMenu();
                      setShowUseConfirm(true);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4h12v9a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
                      <path d="M5 8l3 3 5-5" />
                    </svg>
                    <span>使用</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.menuItem} ${styles.menuItemDanger}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMenu();
                      setShowDelete(true);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4h12M5.3 4V2.7a1 1 0 011-1h3.4a1 1 0 011 1V4M13 4v9.3a1 1 0 01-1 1H4a1 1 0 01-1-1V4" />
                    </svg>
                    <span>删除</span>
                  </button>
                </div>,
                document.body
              )}
          </div>
        )}
      </div>

      {savedTemplate && (
        <>
          <Modal
            open={showEdit}
            title="编辑邮件模板"
            onClose={() => setShowEdit(false)}
            footer={
              <ModalFooter
                onCancel={() => setShowEdit(false)}
                onConfirm={handleEditConfirm}
                confirmText="确定"
                confirmDisabled={!editTitle.trim()}
              />
            }
          >
            <div className={styles.editTemplateForm}>
              <div className={styles.editField}>
                <label className={styles.editLabel}>模板标题 <span className={styles.editRequired}>*</span></label>
                <ModalInput
                  value={editTitle}
                  onChange={setEditTitle}
                  placeholder="请输入模板标题"
                  onSubmit={handleEditConfirm}
                />
              </div>
              <div className={styles.editField}>
                <label className={styles.editLabel} htmlFor="edit-template-desc">描述（选填）</label>
                <textarea
                  id="edit-template-desc"
                  className={styles.editTextarea}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="简短描述该模板的用途"
                  rows={3}
                />
              </div>
              <label className={styles.editCheckboxWrap}>
                <input
                  type="checkbox"
                  id="edit-template-default"
                  checked={editSetAsDefault}
                  onChange={(e) => setEditSetAsDefault(e.target.checked)}
                  className={styles.editCheckbox}
                  aria-describedby="edit-template-default-desc"
                />
                <span className={styles.editCheckboxBox} aria-hidden>
                  <svg className={styles.editCheckboxBoxIcon} viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 5l3 3 7-7" />
                  </svg>
                </span>
                <span id="edit-template-default-desc">将该模板设为默认模板</span>
              </label>
            </div>
          </Modal>

          <Modal
            open={showDelete}
            title="删除邮件模板"
            onClose={() => setShowDelete(false)}
            footer={
              <ModalFooter
                onCancel={() => setShowDelete(false)}
                onConfirm={handleDeleteConfirm}
                confirmText="确认删除"
                danger
              />
            }
          >
            <ConfirmText>
              确定要删除邮件模板 <ConfirmHighlight>{savedTemplate.title}</ConfirmHighlight> 吗？
            </ConfirmText>
          </Modal>

          <Modal
            open={showUseConfirm}
            title="使用模板"
            onClose={() => setShowUseConfirm(false)}
            footer={
              <ModalFooter
                onCancel={() => setShowUseConfirm(false)}
                onConfirm={handleUseConfirm}
                confirmText="确认覆盖"
              />
            }
          >
            <ConfirmText>
              是否使用该模板覆盖当前画布上的组件列表？确认后将完全替换现有内容。
            </ConfirmText>
          </Modal>
        </>
      )}
    </>
  );
}

const LIGHTBOX_ZOOM_MIN = 0.1;
const LIGHTBOX_ZOOM_MAX = 2;
const LIGHTBOX_ZOOM_STEP = 0.05;
const LIGHTBOX_ZOOM_DEFAULT = 0.5;

function LightboxPreview({ src, onClose }: { src: string; onClose: () => void }) {
  const { resolvedSrc, hasError: loadError } = useResolvedAssetUrl(src);
  const [zoom, setZoom] = useState(LIGHTBOX_ZOOM_DEFAULT);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [copying, setCopying] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollWrapRef = useRef<HTMLDivElement>(null);
  const hasNotifiedLoadErrorRef = useRef(false);
  const prevZoomRef = useRef(LIGHTBOX_ZOOM_DEFAULT);
  const scrollBeforeZoomRef = useRef<{ scrollLeft: number; scrollTop: number; w: number; h: number } | null>(null);

  useEffect(() => {
    setImageSize(null);
    setZoom(LIGHTBOX_ZOOM_DEFAULT);
    prevZoomRef.current = LIGHTBOX_ZOOM_DEFAULT;
    scrollBeforeZoomRef.current = null;
    hasNotifiedLoadErrorRef.current = false;
  }, [src]);

  useEffect(() => {
    if (!loadError || hasNotifiedLoadErrorRef.current) return;
    hasNotifiedLoadErrorRef.current = true;
    toast('预览图加载失败，请稍后重试', 'error');
  }, [loadError]);

  const handleCopyToClipboard = useCallback(async () => {
    if (copying || !src) return;
    setCopying(true);
    try {
      const blob = await fetchServerAssetBlob(src);
      const type = blob.type.startsWith('image/') ? blob.type : 'image/png';
      await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch (err) {
      console.error('复制预览图到剪贴板失败', err);
      toast('复制预览图失败，请稍后重试', 'error');
    } finally {
      setCopying(false);
    }
  }, [src, copying]);

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!imageSize || !scrollWrapRef.current) return;
    const wrap = scrollWrapRef.current;
    const prevZoom = prevZoomRef.current;
    const snap = scrollBeforeZoomRef.current;
    scrollBeforeZoomRef.current = null;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const centerX = snap ? snap.scrollLeft + snap.w / 2 : w / 2;
    const centerY = snap ? snap.scrollTop + snap.h / 2 : h / 2;
    const imageCenterX = centerX / prevZoom;
    const imageCenterY = centerY / prevZoom;
    const newScrollLeft = imageCenterX * zoom - w / 2;
    const newScrollTop = imageCenterY * zoom - h / 2;
    wrap.scrollLeft = Math.max(0, Math.min(newScrollLeft, wrap.scrollWidth - w));
    wrap.scrollTop = Math.max(0, Math.min(newScrollTop, wrap.scrollHeight - h));
    prevZoomRef.current = zoom;
  }, [zoom, imageSize]);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (img && img.naturalWidth && img.naturalHeight) {
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      prevZoomRef.current = LIGHTBOX_ZOOM_DEFAULT;
    }
  }, []);

  const resetZoom = useCallback(() => {
    const wrap = scrollWrapRef.current;
    if (wrap) {
      scrollBeforeZoomRef.current = {
        scrollLeft: wrap.scrollLeft,
        scrollTop: wrap.scrollTop,
        w: wrap.clientWidth,
        h: wrap.clientHeight,
      };
    }
    setZoom(LIGHTBOX_ZOOM_DEFAULT);
  }, []);

  // 图片尺寸确定前隐藏，避免「先全屏 → 再缩小到 zoom」的闪烁
  const ready = !!imageSize;

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.lightboxOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="预览放大"
      tabIndex={-1}
    >
      <div
        className={styles.lightboxContent}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={scrollWrapRef} className={styles.lightboxScrollWrap}>
          <div
            className={styles.lightboxImageWrap}
            style={
              imageSize
                ? { width: imageSize.w * zoom, height: imageSize.h * zoom }
                : undefined
            }
          >
            {resolvedSrc ? (
              <img
                ref={imgRef}
                src={resolvedSrc}
                alt="预览"
                className={styles.lightboxImage}
                onLoad={handleImageLoad}
                draggable={false}
                style={{
                  ...(!ready ? { position: 'absolute', visibility: 'hidden' } : undefined),
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                }}
              >
                {loadError ? '预览加载失败' : '预览加载中…'}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={styles.lightboxToolbar} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={copyDone ? styles.lightboxCopyBtnDone : styles.lightboxCopyBtn}
          onClick={handleCopyToClipboard}
          disabled={copying || !ready || loadError}
          aria-label="复制到剪贴板"
        >
          {copyDone ? '已复制' : '复制到剪贴板'}
        </button>
        <span className={styles.lightboxZoomLabel}>缩放</span>
        <input
          type="range"
          min={LIGHTBOX_ZOOM_MIN}
          max={LIGHTBOX_ZOOM_MAX}
          step={LIGHTBOX_ZOOM_STEP}
          value={zoom}
          onChange={(e) => {
            const wrap = scrollWrapRef.current;
            if (wrap) {
              scrollBeforeZoomRef.current = {
                scrollLeft: wrap.scrollLeft,
                scrollTop: wrap.scrollTop,
                w: wrap.clientWidth,
                h: wrap.clientHeight,
              };
            }
            setZoom(Number(e.target.value));
          }}
          className={styles.lightboxZoomSlider}
          aria-label="缩放比例"
        />
        <button
          type="button"
          className={styles.lightboxZoomReset}
          onClick={resetZoom}
        >
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </div>,
    document.body
  );
}

const TEMPLATE_ITEM_HEIGHT = 78; // 卡片高度 72px + 间距 6px
const TEMPLATE_LIST_PADDING_TOP = 8;
const TEMPLATE_LIST_PADDING_BOTTOM = 12;
const TEMPLATE_LIST_PADDING_X = 10;
const TEMPLATE_LIST_OVERSCAN = 5;
const COMPOSITE_ITEM_HEIGHT = 78; // 卡片高度 72px + 间距 6px
const COMPOSITE_LIST_PADDING_TOP = 8;
const COMPOSITE_LIST_PADDING_BOTTOM = 12;
const COMPOSITE_LIST_PADDING_X = 10;
const COMPOSITE_LIST_OVERSCAN = 5;

function EmailTemplatesView() {
  const { savedTemplates, isLoaded, loadTemplates, defaultTemplateId, updateTemplatePreview } = useEmailTemplateStore();
  const activeTab = useEmailStore((s) => s.activeLeftTab);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ top: 0, height: 0 });

  useEffect(() => {
    if (activeTab === 'email-templates' && !isLoaded) loadTemplates();
  }, [activeTab, isLoaded, loadTemplates]);

  const needPreview = savedTemplates.filter((t) => !t.previewDataUrl);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollState({ top: el.scrollTop, height: el.clientHeight });
  }, [setScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    updateScrollState();
    return () => ro.disconnect();
  }, [updateScrollState]);

  const count = savedTemplates.length;
  const totalHeight = TEMPLATE_LIST_PADDING_TOP + count * TEMPLATE_ITEM_HEIGHT + TEMPLATE_LIST_PADDING_BOTTOM;
  const startIndex = Math.max(
    0,
    Math.floor((scrollState.top - TEMPLATE_LIST_PADDING_TOP) / TEMPLATE_ITEM_HEIGHT) - TEMPLATE_LIST_OVERSCAN
  );
  const endIndex = Math.min(
    count - 1,
    Math.floor((scrollState.top + scrollState.height - TEMPLATE_LIST_PADDING_TOP) / TEMPLATE_ITEM_HEIGHT) + TEMPLATE_LIST_OVERSCAN
  );
  const visibleRange = useMemo(
    () => (count > 0 ? { start: startIndex, end: endIndex } : null),
    [count, startIndex, endIndex]
  );
  const needPreviewVisible = useMemo(() => {
    if (!visibleRange || needPreview.length === 0) return [];
    return needPreview.filter((t) => {
      const i = savedTemplates.findIndex((x) => x.id === t.id);
      return i >= visibleRange.start && i <= visibleRange.end;
    });
  }, [visibleRange, needPreview, savedTemplates]);
  const needPreviewVisibleIds = useMemo(
    () => needPreviewVisible.map((t) => t.id).join(','),
    [needPreviewVisible]
  );
  const hasNeedPreviewVisible = needPreviewVisible.length > 0;

  useEffect(() => {
    if (!hasNeedPreviewVisible) return;
    const container = hiddenContainerRef.current;
    if (!container) return;
    let cancelled = false;
    const run = async () => {
      const wrappers = Array.from(container.querySelectorAll<HTMLElement>('[data-template-id]'));
      for (const wrapper of wrappers) {
        if (cancelled) break;
        const wrapEl = wrapper.firstElementChild?.firstElementChild as HTMLElement | null;
        const id = wrapper.getAttribute('data-template-id');
        if (!wrapEl || !id) continue;
        const bgColor = wrapEl.style.getPropertyValue('--canvas-bg')?.trim() || '#FFFFFF';
        try {
          const dataUrl = await captureElementPreview(wrapEl, { backgroundColor: bgColor });
          if (dataUrl) updateTemplatePreview(id, dataUrl);
        } catch (err) {
          console.error('模板预览生成失败', id, err);
        }
        if (!cancelled) await new Promise((r) => setTimeout(r, 200));
      }
    };
    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [needPreviewVisibleIds, updateTemplatePreview, hasNeedPreviewVisible]);

  return (
    <>
      <div
        ref={scrollRef}
        className={styles.templateListScroll}
        onScroll={updateScrollState}
        role="list"
        aria-label="邮件模板列表"
      >
        <div className={styles.templateListPhantom} style={{ height: totalHeight }} aria-hidden />
        {visibleRange &&
          (() => {
            const items: React.ReactNode[] = [];
            for (let i = visibleRange.start; i <= visibleRange.end; i++) {
              const t = savedTemplates[i];
              const previewUrl = t.previewDataUrl
                ? (t.previewDataUrl === DEFAULT_TEMPLATE_PREVIEW_PATH ? `${t.previewDataUrl}?v=3` : t.previewDataUrl)
                : undefined;
              items.push(
                <div
                  key={t.id}
                  className={styles.templateListItem}
                  style={{
                    top: TEMPLATE_LIST_PADDING_TOP + i * TEMPLATE_ITEM_HEIGHT,
                    left: TEMPLATE_LIST_PADDING_X,
                    right: TEMPLATE_LIST_PADDING_X,
                  }}
                >
                  <EmailTemplateCard
                    title={t.title}
                    desc={t.desc}
                    previewUrl={previewUrl}
                    onPreviewClick={() => {
                      if (!t.previewDataUrl) return;
                      const url = t.previewDataUrl === DEFAULT_TEMPLATE_PREVIEW_PATH ? `${t.previewDataUrl}?v=3` : t.previewDataUrl;
                      setLightboxUrl(url);
                    }}
                    savedTemplate={t}
                    isDefault={defaultTemplateId === t.id}
                  />
                </div>
              );
            }
            return items;
          })()}
      </div>

      {needPreviewVisible.length > 0 && (
        <div ref={hiddenContainerRef} className={styles.previewHidden} aria-hidden="true">
          {needPreviewVisible.map((t) => (
            <div key={t.id} data-template-id={t.id}>
              <div>
                <TemplatePreviewSnapshot components={t.components} config={t.config} />
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && (
        <LightboxPreview
          src={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </>
  );
}

// ===== 我的复合组件 View =====

function MyCompositesView() {
  const user = useAuthStore((s) => s.user);
  const myComposites = useCompositeStore((s) => s.myComposites);
  const isMyCompositesLoaded = useCompositeStore((s) => s.isMyCompositesLoaded);
  const loadMyComposites = useCompositeStore((s) => s.loadMyComposites);
  const updateCompositePreview = useCompositeStore((s) => s.updateCompositePreview);
  const getMyCompositeById = useCompositeStore((s) => s.getMyCompositeById);
  const templateConfig = useEmailStore((s) => s.templateConfig);
  const [editingCompositeId, setEditingCompositeId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ top: 0, height: 0 });

  useEffect(() => {
    if (user && !isMyCompositesLoaded) loadMyComposites();
  }, [user, isMyCompositesLoaded, loadMyComposites]);

  const needPreview = myComposites.filter((c) => c.previewDataUrl === undefined);
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollState({ top: el.scrollTop, height: el.clientHeight });
  }, [setScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    updateScrollState();
    return () => ro.disconnect();
  }, [updateScrollState]);

  const count = myComposites.length;
  const totalHeight =
    COMPOSITE_LIST_PADDING_TOP + count * COMPOSITE_ITEM_HEIGHT + COMPOSITE_LIST_PADDING_BOTTOM;
  const startIndex = Math.max(
    0,
    Math.floor((scrollState.top - COMPOSITE_LIST_PADDING_TOP) / COMPOSITE_ITEM_HEIGHT) -
      COMPOSITE_LIST_OVERSCAN
  );
  const endIndex = Math.min(
    count - 1,
    Math.floor(
      (scrollState.top + scrollState.height - COMPOSITE_LIST_PADDING_TOP) / COMPOSITE_ITEM_HEIGHT
    ) + COMPOSITE_LIST_OVERSCAN
  );
  const visibleRange = useMemo(
    () => (count > 0 ? { start: startIndex, end: endIndex } : null),
    [count, startIndex, endIndex]
  );
  const needPreviewVisible = useMemo(() => {
    if (!visibleRange || needPreview.length === 0) return [];
    return needPreview.filter((c) => {
      const i = myComposites.findIndex((x) => x.id === c.id);
      return i >= visibleRange.start && i <= visibleRange.end;
    });
  }, [visibleRange, needPreview, myComposites]);
  const needPreviewVisibleIds = useMemo(
    () => needPreviewVisible.map((c) => c.id).join(','),
    [needPreviewVisible]
  );
  const hasNeedPreviewVisible = needPreviewVisible.length > 0;

  // 与 CompositeLibraryView 一致：结构 div > ul > li.block，截图目标 li.block。
  // 经 prepareEmailHtml + 后端 Puppeteer，与画布/保存向导视觉一致；序列处理避免并发打爆后端。
  useEffect(() => {
    if (!hasNeedPreviewVisible) return;
    const container = hiddenContainerRef.current;
    if (!container) return;
    let cancelled = false;
    const run = async () => {
      const wrappers = Array.from(
        container.querySelectorAll<HTMLElement>('[data-composite-preview-id]')
      );
      for (const wrapper of wrappers) {
        if (cancelled) break;
        const id = wrapper.getAttribute('data-composite-preview-id');
        if (!id) continue;
        // CompositePreviewSnapshot div（plain div）→ ComponentWrapper（直接子节点）
        const snapshotDiv = wrapper.firstElementChild as HTMLElement | null;
        const target = (snapshotDiv?.firstElementChild as HTMLElement | null) ?? snapshotDiv;
        if (!target) continue;
        try {
          const dataUrl = await captureElementPreview(target, { backgroundColor: '#FFFFFF' });
          if (dataUrl) updateCompositePreview(id, dataUrl);
        } catch (err) {
          console.error('复合组件预览生成失败', id, err);
        }
        if (!cancelled) await new Promise((r) => setTimeout(r, 200));
      }
    };
    const t = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [needPreviewVisibleIds, updateCompositePreview, hasNeedPreviewVisible]);

  if (!user) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>请先登录</p>
        <p className={styles.emptyHint}>登录后可在此查看与管理自己创建的复合组件</p>
      </div>
    );
  }

  if (!isMyCompositesLoaded) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>加载中…</p>
      </div>
    );
  }

  if (myComposites.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>暂无我创建的复合组件</p>
        <p className={styles.emptyHint}>选中任意组件后，点击浮窗的堆叠图标创建复合组件</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className={styles.templateListScroll}
        onScroll={updateScrollState}
        role="list"
        aria-label="我的复合组件列表"
      >
        <div className={styles.templateListPhantom} style={{ height: totalHeight }} aria-hidden />
        {visibleRange &&
          (() => {
            const items: React.ReactNode[] = [];
            for (let i = visibleRange.start; i <= visibleRange.end; i++) {
              const composite = myComposites[i];
              items.push(
                <div
                  key={composite.id}
                  className={styles.templateListItem}
                  style={{
                    top: COMPOSITE_LIST_PADDING_TOP + i * COMPOSITE_ITEM_HEIGHT,
                    left: COMPOSITE_LIST_PADDING_X,
                    right: COMPOSITE_LIST_PADDING_X,
                  }}
                >
                  <CompositeCard
                    composite={composite}
                    onPreviewClick={() => {
                      if (!composite.previewDataUrl) {
                        toast('该复合组件暂无预览图', 'info');
                        return;
                      }
                      setLightboxUrl(composite.previewDataUrl);
                    }}
                    onEdit={(c) => setEditingCompositeId(c.id)}
                    isFirst={i === 0}
                    isLast={i === myComposites.length - 1}
                  />
                </div>
              );
            }
            return items;
          })()}
      </div>
      <p className={styles.libHint}>拖拽复合组件到预览区域添加</p>

      {editingCompositeId && (() => {
        const composite = getMyCompositeById(editingCompositeId);
        if (!composite) return null;
        return (
          <CreateCompositeWizard
            open
            onClose={() => setEditingCompositeId(null)}
            component={composite.component}
            compositeId={composite.id}
          />
        );
      })()}

      {needPreviewVisible.length > 0 && (
        <div ref={hiddenContainerRef} className={styles.previewHidden} aria-hidden="true">
          {needPreviewVisible.map((c) => (
            <div key={c.id} data-composite-preview-id={c.id}>
              <CompositePreviewSnapshot component={c.component} canvasWidth={templateConfig.width || '600px'} fontFamily={templateConfig.fontFamily || DEFAULT_TEXT_FONT_FAMILY} />
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && (
        <LightboxPreview
          src={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </>
  );
}

// ===== 我的模板 View =====

function MyTemplatesView() {
  const user = useAuthStore((s) => s.user);
  const { myTemplates, isMyTemplatesLoaded, loadMyTemplates, defaultTemplateId, updateTemplatePreview } = useEmailTemplateStore();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ top: 0, height: 0 });

  useEffect(() => {
    if (user && !isMyTemplatesLoaded) loadMyTemplates();
  }, [user, isMyTemplatesLoaded, loadMyTemplates]);

  const needPreview = myTemplates.filter((t) => !t.previewDataUrl);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollState({ top: el.scrollTop, height: el.clientHeight });
  }, [setScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    updateScrollState();
    return () => ro.disconnect();
  }, [updateScrollState]);

  const count = myTemplates.length;
  const totalHeight = TEMPLATE_LIST_PADDING_TOP + count * TEMPLATE_ITEM_HEIGHT + TEMPLATE_LIST_PADDING_BOTTOM;
  const startIndex = Math.max(
    0,
    Math.floor((scrollState.top - TEMPLATE_LIST_PADDING_TOP) / TEMPLATE_ITEM_HEIGHT) - TEMPLATE_LIST_OVERSCAN
  );
  const endIndex = Math.min(
    count - 1,
    Math.floor((scrollState.top + scrollState.height - TEMPLATE_LIST_PADDING_TOP) / TEMPLATE_ITEM_HEIGHT) + TEMPLATE_LIST_OVERSCAN
  );
  const visibleRange = useMemo(
    () => (count > 0 ? { start: startIndex, end: endIndex } : null),
    [count, startIndex, endIndex]
  );
  const needPreviewVisible = useMemo(() => {
    if (!visibleRange || needPreview.length === 0) return [];
    return needPreview.filter((t) => {
      const i = myTemplates.findIndex((x) => x.id === t.id);
      return i >= visibleRange.start && i <= visibleRange.end;
    });
  }, [visibleRange, needPreview, myTemplates]);
  const needPreviewVisibleIds = useMemo(
    () => needPreviewVisible.map((t) => t.id).join(','),
    [needPreviewVisible]
  );
  const hasNeedPreviewVisible = needPreviewVisible.length > 0;

  useEffect(() => {
    if (!hasNeedPreviewVisible) return;
    const container = hiddenContainerRef.current;
    if (!container) return;
    let cancelled = false;
    const run = async () => {
      const wrappers = Array.from(container.querySelectorAll<HTMLElement>('[data-template-id]'));
      for (const wrapper of wrappers) {
        if (cancelled) break;
        const wrapEl = wrapper.firstElementChild?.firstElementChild as HTMLElement | null;
        const id = wrapper.getAttribute('data-template-id');
        if (!wrapEl || !id) continue;
        const bgColor = wrapEl.style.getPropertyValue('--canvas-bg')?.trim() || '#FFFFFF';
        try {
          const dataUrl = await captureElementPreview(wrapEl, { backgroundColor: bgColor });
          if (dataUrl) updateTemplatePreview(id, dataUrl);
        } catch (err) {
          console.error('模板预览生成失败', id, err);
        }
        if (!cancelled) await new Promise((r) => setTimeout(r, 200));
      }
    };
    const t = setTimeout(run, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [needPreviewVisibleIds, updateTemplatePreview, hasNeedPreviewVisible]);

  if (!user) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>请先登录</p>
        <p className={styles.emptyHint}>登录后可在此查看与管理自己创建的邮件模板</p>
      </div>
    );
  }

  if (!isMyTemplatesLoaded) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>加载中…</p>
      </div>
    );
  }

  if (myTemplates.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>暂无我创建的模板</p>
        <p className={styles.emptyHint}>在「邮件模板」中另存当前画布，或从画布保存为新模板</p>
      </div>
    );
  }

  return (
    <>
      <div
        ref={scrollRef}
        className={styles.templateListScroll}
        onScroll={updateScrollState}
        role="list"
        aria-label="我的邮件模板列表"
      >
        <div className={styles.templateListPhantom} style={{ height: totalHeight }} aria-hidden />
        {visibleRange &&
          (() => {
            const items: React.ReactNode[] = [];
            for (let i = visibleRange.start; i <= visibleRange.end; i++) {
              const t = myTemplates[i];
              const previewUrl = t.previewDataUrl
                ? (t.previewDataUrl === DEFAULT_TEMPLATE_PREVIEW_PATH ? `${t.previewDataUrl}?v=3` : t.previewDataUrl)
                : undefined;
              items.push(
                <div
                  key={t.id}
                  className={styles.templateListItem}
                  style={{
                    top: TEMPLATE_LIST_PADDING_TOP + i * TEMPLATE_ITEM_HEIGHT,
                    left: TEMPLATE_LIST_PADDING_X,
                    right: TEMPLATE_LIST_PADDING_X,
                  }}
                >
                  <EmailTemplateCard
                    title={t.title}
                    desc={t.desc}
                    previewUrl={previewUrl}
                    onPreviewClick={() => {
                      if (!t.previewDataUrl) return;
                      const url = t.previewDataUrl === DEFAULT_TEMPLATE_PREVIEW_PATH ? `${t.previewDataUrl}?v=3` : t.previewDataUrl;
                      setLightboxUrl(url);
                    }}
                    savedTemplate={t}
                    isDefault={defaultTemplateId === t.id}
                  />
                </div>
              );
            }
            return items;
          })()}
      </div>

      {needPreviewVisible.length > 0 && (
        <div ref={hiddenContainerRef} className={styles.previewHidden} aria-hidden="true">
          {needPreviewVisible.map((t) => (
            <div key={t.id} data-template-id={t.id}>
              <div>
                <TemplatePreviewSnapshot components={t.components} config={t.config} />
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && (
        <LightboxPreview
          src={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </>
  );
}

// ===== Library View with Sub-tabs =====

function LibraryView() {
  const [activeSubTab, setActiveSubTab] = useState<'basic' | 'composite'>('basic');
  const loadComposites = useCompositeStore((s) => s.loadComposites);
  const isLoaded = useCompositeStore((s) => s.isLoaded);
  const subTabs = useMemo(
    () => [
      { id: 'basic' as const, label: '基础组件' },
      { id: 'composite' as const, label: '复合组件' },
    ],
    []
  );

  useEffect(() => {
    if (!isLoaded) {
      loadComposites();
    }
  }, [isLoaded, loadComposites]);

  return (
    <div className={styles.libraryContainer}>
      <LeftPanelSubTabs items={subTabs} value={activeSubTab} onChange={setActiveSubTab} />
      {activeSubTab === 'basic' ? <BasicLibraryView /> : <CompositeLibraryView />}
    </div>
  );
}

// ===== Main Panel =====

const PANEL_TITLES: Record<'template' | 'library' | 'email-templates' | 'my-composites' | 'my-templates', string> = {
  template: '模板组件',
  library: '公共组件库',
  'email-templates': '公共邮件模板',
  'my-composites': '我的复合组件',
  'my-templates': '我的模板',
};

type TemplateSubTab = 'components' | 'variables' | 'logic';

const TEMPLATE_SUB_TABS = [
  { id: 'components' as const, label: '组件' },
  { id: 'variables' as const, label: '变量' },
  { id: 'logic' as const, label: '逻辑' },
] as const;

export default function LeftContentPanel() {
  const activeTab = useEmailStore((s) => s.activeLeftTab);
  const loadTemplate = useEmailStore((s) => s.loadTemplate);
  const templateConfig = useEmailStore((s) => s.templateConfig);
  const components = useEmailStore((s) => s.components);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [templateSubTab, setTemplateSubTab] = useState<TemplateSubTab>('components');

  const handleClearConfirm = () => {
    loadTemplate([], templateConfig);
    setShowClearConfirm(false);
  };

  const templateViews: Record<TemplateSubTab, React.ReactNode> = useMemo(
    () => ({
      components: <TemplateTreeView />,
      variables: <TemplateVariableView />,
      logic: <TemplateLogicView />,
    }),
    []
  );

  const primaryViews = useMemo(
    () => ({
      template: (
        <>
          <LeftPanelSubTabs
            items={TEMPLATE_SUB_TABS}
            value={templateSubTab}
            onChange={setTemplateSubTab}
          />
          {templateViews[templateSubTab]}
        </>
      ),
      library: <LibraryView />,
      'email-templates': <EmailTemplatesView />,
      'my-composites': <MyCompositesView />,
      'my-templates': <MyTemplatesView />,
    }),
    [templateSubTab, templateViews]
  );

  return (
    <div className={styles.panel}>
      <div className={styles.panelTitleRow}>
        <h2 className={styles.panelTitle}>{PANEL_TITLES[activeTab]}</h2>
        {activeTab === 'template' && templateSubTab === 'components' && components.length > 0 && (
          <button
            type="button"
            className={styles.clearListBtn}
            onClick={() => setShowClearConfirm(true)}
            title="清空组件列表"
          >
            清空组件列表
          </button>
        )}
      </div>
      {primaryViews[activeTab]}

      <Modal
        open={showClearConfirm}
        title="清空组件列表"
        onClose={() => setShowClearConfirm(false)}
        footer={
          <ModalFooter
            onCancel={() => setShowClearConfirm(false)}
            onConfirm={handleClearConfirm}
            confirmText="确定清空"
            danger
          />
        }
      >
        <ConfirmText>
          确定要清空组件列表吗？当前画布上的所有组件将被移除。
        </ConfirmText>
      </Modal>
    </div>
  );
}
