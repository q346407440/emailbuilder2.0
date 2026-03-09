import { useRef, useEffect, useCallback, useMemo, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDroppable } from '@dnd-kit/core';
import { captureElementPreview } from '@shared/utils/capturePreview';
import { useShallow } from 'zustand/react/shallow';
import { useEmailStore, isContainerComponent } from '@features/email-editor/store/useEmailStore';
import { useEmailTemplateStore } from '@features/template-management/store/useEmailTemplateStore';
import {
  serverUpdateTemplatePreview,
  serverUpdateProjectPreview,
  buildPreviewDataUrl,
  serverPublishProjectToTemplate,
} from '@shared/api/serverApi';
import { useProjectStore } from '@features/project-management/store/useProjectStore';
import { toast } from '@shared/store/useToastStore';
import { renderEmailComponent } from '@email-components/renderEmailComponent';
import { spacingConfigToCSS, borderConfigToCSS, borderRadiusConfigToCSS, contentAlignToCSS } from '@shared/utils/styleHelpers';
import InsertionIndicator from './InsertionIndicator';
import FloatingActions from '../FloatingActions/FloatingActions';
import SaveTemplateModal from '@features/template-management/components/SaveTemplateModal/SaveTemplateModal';
import type { SaveTemplatePayload } from '@features/template-management/components/SaveTemplateModal/SaveTemplateModal';
import type { ComponentRules, EmailComponent } from '@shared/types/email';
import SendEmailModal from './SendEmailModal';
import { prepareEmailHtmlAsync } from '@shared/utils/prepareEmailHtml';
import { useCanvasToolbarStore } from '@shared/store/useCanvasToolbarStore';
import { getTemplateDistributionFallback } from '@shared/constants/emailDefaults';
import { DEFAULT_TEXT_FONT_FAMILY } from '@shared/constants/fontOptions';
import { resolveVariableValues } from '@shared/utils/resolveVariableValues';
import { resolveConditionalBranches } from '@shared/utils/resolveComponentBranch';
import { expandLoopBlocksForPreview, flattenArrayPreviewData } from '@shared/utils/expandLoopBlocks';
import { mergeRulesIntoComponents } from '@shared/utils/mergeRulesIntoComponents';
import styles from './Canvas.module.css';

type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

function DropZone({
  componentId,
  position,
  children,
}: {
  componentId: string;
  position: 'before' | 'after' | 'inside';
  children?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${componentId}-${position}`,
    data: {
      type: 'canvas-component',
      componentId,
      position,
    },
  });

  return (
    <div ref={setNodeRef} className={styles.dropZone} data-over={isOver}>
      {children}
    </div>
  );
}

type CanvasBlockProps = {
  comp: ReturnType<typeof useEmailStore.getState>['components'][number];
  selectedId: string | null;
  onSelectId: (id: string) => void;
};

/** 容器类型：需要将 selectedId 传递给子组件，选中任何后代时都需重渲染 */
const CONTAINER_TYPES = new Set(['layout', 'grid', 'image']);

const CanvasBlock = memo(function CanvasBlock({
  comp,
  selectedId,
  onSelectId,
}: CanvasBlockProps) {
  const updateComponentRules = useEmailStore((s) => s.updateComponentRules);
  const compWithRules = comp as EmailComponentWithRules;
  const { isTargeted, dragPosition } = useEmailStore(
    useShallow(
      useCallback((s) => {
        const info = s.dragOverInfo;
        if (!info || info.targetId !== comp.id) {
          return { isTargeted: false, dragPosition: null as 'before' | 'after' | 'inside' | null };
        }
        return { isTargeted: true, dragPosition: info.position };
      }, [comp.id])
    )
  );
  const showBefore = isTargeted && dragPosition === 'before';
  const showAfter = isTargeted && dragPosition === 'after';
  const showInside = isTargeted && dragPosition === 'inside';

  const { widthMode } = comp.wrapperStyle;
  const shouldStretch = widthMode === 'fill';
  const renderedComponent = useMemo(
    () => renderEmailComponent(comp, selectedId, onSelectId),
    [comp, selectedId, onSelectId]
  );

  const hasVisibilityCondition = !!compWithRules.visibilityCondition;
  const visibilityConditionAttr = hasVisibilityCondition
    ? JSON.stringify(compWithRules.visibilityCondition)
    : undefined;
  const branchCount = compWithRules.conditionalBranches?.length ?? 0;
  const loopBinding = compWithRules.loopBinding;

  /* 细粒度订阅：只取本组件循环绑定对应的数组数据，避免 arrayPreviewData 任意变化时全量重渲 */
  const loopVariableKey = loopBinding?.variableKey ?? null;
  const loopItems = useEmailStore(
    useCallback(
      (s) => (loopVariableKey ? s.arrayPreviewData[loopVariableKey] : null),
      [loopVariableKey]
    )
  );

  const handleLoopPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!loopBinding || !loopItems || loopItems.length === 0) return;
    const cur = loopBinding.previewIndex ?? 0;
    const next = (cur - 1 + loopItems.length) % loopItems.length;
    updateComponentRules(comp.id, { loopBinding: { ...loopBinding, previewIndex: next } });
  }, [loopBinding, loopItems, comp.id, updateComponentRules]);

  const handleLoopNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!loopBinding || !loopItems || loopItems.length === 0) return;
    const cur = loopBinding.previewIndex ?? 0;
    const next = (cur + 1) % loopItems.length;
    updateComponentRules(comp.id, { loopBinding: { ...loopBinding, previewIndex: next } });
  }, [loopBinding, loopItems, comp.id, updateComponentRules]);

  return (
    <li
      className={`${styles.block} ${showInside ? styles.insideTarget : ''}`}
      data-component-id={comp.id}
      data-drag-hover={isTargeted || undefined}
      data-visibility-condition={visibilityConditionAttr}
      style={{ position: 'relative', ...(shouldStretch ? { alignSelf: 'stretch' } : {}) }}
    >
      <DropZone componentId={comp.id} position="before">
        {showBefore && <InsertionIndicator position="before" />}
      </DropZone>

      <div className={styles.blockContent} style={{ position: 'relative' }}>
        {renderedComponent}
        {/* 循环区块角标 + 预览切换 */}
        {loopBinding && (() => {
          const items = loopItems;
          const curIndex = loopBinding.previewIndex ?? 0;
          const total = items?.length ?? 0;
          const hasData = total > 0;
          const badgeRight = ((hasVisibilityCondition ? 1 : 0) + (branchCount > 0 ? 1 : 0)) * 70 + 4;
          return (
            <div
              className={styles.loopBadge}
              title={`循环区块，绑定 ${loopBinding.variableKey}`}
              style={{ right: `${badgeRight}px` }}
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6a4 4 0 014-4 4 4 0 013.46 2" />
                <path d="M10 6a4 4 0 01-4 4 4 4 0 01-3.46-2" />
                <path d="M9 2l1.46 2L12 2" />
                <path d="M3 10L1.54 8 0 10" />
              </svg>
              循环 · {loopBinding.variableKey}
              {hasData && (
                <>
                  <button
                    className={styles.loopNavBtn}
                    onClick={handleLoopPrev}
                    title="预览上一项"
                    disabled={total <= 1}
                  >‹</button>
                  <span className={styles.loopIndexLabel}>{curIndex + 1}/{total}</span>
                  <button
                    className={styles.loopNavBtn}
                    onClick={handleLoopNext}
                    title="预览下一项"
                    disabled={total <= 1}
                  >›</button>
                </>
              )}
            </div>
          );
        })()}
        {/* 显示条件角标 */}
        {hasVisibilityCondition && (
          <div
            className={styles.visibilityBadge}
            title={`显示条件：${compWithRules.visibilityCondition!.variableKey || '（未配置）'} ${compWithRules.visibilityCondition!.operator}${compWithRules.visibilityCondition!.value ? ` "${compWithRules.visibilityCondition!.value}"` : ''}`}
            style={{ right: (branchCount > 0 ? 70 : 0) + 4 + 'px' }}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="4.5" />
              <path d="M4 6h4M6 4v4" />
            </svg>
            条件显示
          </div>
        )}
        {/* 条件分支角标 */}
        {branchCount > 0 && (
          <div
            className={styles.branchBadge}
            title={`此组件有 ${branchCount} 个条件分支`}
            style={{ right: '4px' }}
          >
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2v4M3 9a3 3 0 016 0" />
              <circle cx="6" cy="2" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="3" cy="9" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            {branchCount} 个分支
          </div>
        )}
      </div>

      <DropZone componentId={comp.id} position="after">
        {showAfter && <InsertionIndicator position="after" />}
      </DropZone>

      {isContainerComponent(comp) && (
        <DropZone componentId={comp.id} position="inside" />
      )}
    </li>
  );
}, (prevProps: CanvasBlockProps, nextProps: CanvasBlockProps) => {
  /* 自定义比较器：仅在必要时重渲染
   * - comp 变化（内容/样式更新）→ 重渲染
   * - onSelectId 变化（引用变化）→ 重渲染
   * - selectedId 变化时：
   *   - 容器类型（layout/grid/image）：后代可能被选中，需要重渲染
   *   - 叶子类型：仅当「本组件是否被选中」状态变化时才重渲染
   */
  if (prevProps.comp !== nextProps.comp) return false;
  if (prevProps.onSelectId !== nextProps.onSelectId) return false;
  if (prevProps.selectedId === nextProps.selectedId) return true;
  if (CONTAINER_TYPES.has(nextProps.comp.type)) {
    // 容器组件：selectedId 任何变化都可能影响子组件高亮，必须重渲染
    return false;
  }
  // 叶子组件：只在「是否选中」布尔值改变时重渲染
  const prevIsSelected = prevProps.selectedId === prevProps.comp.id;
  const nextIsSelected = nextProps.selectedId === nextProps.comp.id;
  return prevIsSelected === nextIsSelected;
});

function EmptyCanvasDropZone() {
  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas-empty',
    data: { type: 'canvas-empty' },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.empty} ${isOver ? styles.emptyOver : ''}`}
    >
      从左侧拖入或点击添加组件到邮件模板
    </div>
  );
}

interface CanvasProps {
  /** 当前编辑的模板 ID（有值时保存弹窗默认覆盖该模板） */
  currentTemplateId?: string | null;
  /** 当前工程 ID（工程模式下有值） */
  currentProjectId?: string | null;
  /** 从工程发布为模板后跳转的 URL（若存在则追加 selectedTemplateId 后跳转，用于向导等场景） */
  returnTo?: string | null;
  /** 当前模板尚无预览图时为 true，用于进入编辑页后自动生成并上传预览 */
  templateHasNoPreview?: boolean;
  /** 当前工程尚无预览图时为 true */
  projectHasNoPreview?: boolean;
}

const AUTO_PREVIEW_DELAY_MS = 2200;

export default function Canvas({
  currentTemplateId,
  currentProjectId,
  returnTo,
  templateHasNoPreview,
  projectHasNoPreview,
}: CanvasProps = {}) {
  const navigate = useNavigate();
  const components = useEmailStore((s) => s.components);
  const previewData = useEmailStore((s) => s.previewData);
  const customVariables = useEmailStore((s) => s.customVariables);
  const arrayPreviewData = useEmailStore((s) => s.arrayPreviewData);
  const canvasPreviewMode = useEmailStore((s) => s.canvasPreviewMode);
  const renderingRules = useEmailStore((s) => s.renderingRules);
  const resolvedComponents = useMemo(() => {
    // Layer 4：先将渲染规则合併回组件树，再进行后续解析
    const merged = mergeRulesIntoComponents(components, renderingRules);

    // 变量标签模式：不注入预览数据，{{key}} 和 {{item.*}} 均保留为 chip 标签
    // 传入空 {} 而非 arrayPreviewData，使循环区块不展开数据，保留子组件的 {{item.fieldKey}} 占位符，
    // TextBlock 从而能将其渲染为蓝色 chip（而非注入真实数据后的文本）
    if (canvasPreviewMode === 'variable') {
      const expanded = expandLoopBlocksForPreview(merged, {});
      const withBranches = resolveConditionalBranches(expanded, {});
      return resolveVariableValues(withBranches, {});
    }
    // 预览数据模式（默认）
    // Step 1: 展开循环区块（画布预览模式，每个 loop 区块只展示 previewIndex 项）
    const expanded = expandLoopBlocksForPreview(merged, arrayPreviewData);
    // Step 2: 将数组预览数据扁平化为 products[0].title 形式，合并到标量 previewData
    const flatData = { ...previewData, ...flattenArrayPreviewData(arrayPreviewData) };
    // Step 3: 解析条件分支 + 变量替换
    const withBranches = resolveConditionalBranches(expanded, flatData);
    return resolveVariableValues(withBranches, flatData);
  }, [components, renderingRules, previewData, arrayPreviewData, canvasPreviewMode]);
  const selectedId = useEmailStore((s) => s.selectedId);
  const selectComponent = useEmailStore((s) => s.selectComponent);
  const templateConfig = useEmailStore((s) => s.templateConfig);
  const addTemplate = useEmailTemplateStore((s) => s.addTemplate);
  const updateTemplate = useEmailTemplateStore((s) => s.updateTemplate);
  const setDefaultTemplateId = useEmailTemplateStore((s) => s.setDefaultTemplateId);
  const setTemplatePreviewUrl = useEmailTemplateStore((s) => s.setTemplatePreviewUrl);
  const setProjectPreviewUrl = useProjectStore((s) => s.setProjectPreviewUrl);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const autoPreviewDoneRef = useRef(false);
  const autoProjectPreviewDoneRef = useRef(false);

  const handleSelectId = useCallback(
    (id: string) => {
      // 横向循环预览展开时，列克隆 ID 格式为 '${origId}-hpreview-col-N'，不在 store 中。
      // 将其映射回原始循环组件 ID，确保右侧面板可以正常找到并展示编辑器。
      const colMatch = id.match(/^(.*)-hpreview-col-\d+$/);
      selectComponent(colMatch ? colMatch[1] : id);
    },
    [selectComponent]
  );

  const componentsToRender = resolvedComponents;

  // Scroll to selected component
  // 使用 requestAnimationFrame 延迟到浏览器完成布局后再执行，
  // 避免新增复合组件时 DOM 尚未完成布局导致第一次滚动失效
  useEffect(() => {
    if (!selectedId || !wrapRef.current) return;
    const wrap = wrapRef.current;
    const rafId = requestAnimationFrame(() => {
      const el = wrap.querySelector(`[data-component-id="${selectedId}"]`);
      if (!el) return;

      const scrollContainer = wrap.closest('[data-canvas-viewport]') as HTMLElement | null;
      const viewportRect = scrollContainer
        ? scrollContainer.getBoundingClientRect()
        : wrap.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();

      const isVisible =
        elRect.top >= viewportRect.top &&
        elRect.bottom <= viewportRect.bottom;

      if (!isVisible) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedId]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // Only deselect if clicking directly on the canvas wrapper, not on a child component
      if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-component-id]') === null) {
        selectComponent(null);
      }
    },
    [selectComponent]
  );

  const backgroundType = templateConfig.backgroundType || 'color';
  const contentAlign = templateConfig.contentAlign;
  const { contentDistribution, contentGap } = getTemplateDistributionFallback(templateConfig);
  const alignCSS = contentAlignToCSS(contentAlign);
  const canvasStyle: React.CSSProperties = {
    width: templateConfig.width,
    fontFamily: templateConfig.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
    padding: spacingConfigToCSS(templateConfig.padding),
    borderRadius: borderRadiusConfigToCSS(templateConfig.borderRadius),
    ...alignCSS,
    ...borderConfigToCSS(templateConfig.border),
  };

  // 根据背景类型设置背景样式
  if (backgroundType === 'image' && templateConfig.backgroundImage) {
    canvasStyle.backgroundImage = `url(${templateConfig.backgroundImage})`;
    canvasStyle.backgroundSize = 'cover';
    canvasStyle.backgroundPosition = 'center';
    canvasStyle.backgroundRepeat = 'no-repeat';
  } else {
    // 使用 CSS 变量方式设置颜色背景，保留棋盘格效果
    (canvasStyle as React.CSSProperties & Record<string, string>)['--canvas-bg'] = templateConfig.backgroundColor;
  }

  /* ── 复制预览图片 ── */
  const [copying, setCopying] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  /** 用真实 Chrome 渲染画布并返回 PNG data URL（复制 & 保存缩图 & LLM 截图共用）。视口宽度与画布内容宽度一致，截图无左右留白。 */
  const getPreviewDataUrl = useCallback(async (): Promise<string | null> => {
    const el = wrapRef.current;
    if (!el) return null;
    const w = templateConfig.width;
    const contentWidthPx =
      typeof w === 'number' ? w : parseInt(String(w ?? '').replace(/px$/i, ''), 10) || 600;
    return captureElementPreview(el, {
      width: contentWidthPx,
      backgroundColor: templateConfig.backgroundColor || '#FFFFFF',
      clearSelectionFn: () => selectComponent(null),
    });
  }, [selectComponent, templateConfig.backgroundColor, templateConfig.width]);

  // 进入编辑页且该模板无预览图时，延迟一次自动截图并上传，列表页即可显示缩略图
  useEffect(() => {
    if (!currentTemplateId || !templateHasNoPreview) return;
    autoPreviewDoneRef.current = false;
    return () => { autoPreviewDoneRef.current = false; };
  }, [currentTemplateId, templateHasNoPreview]);

  useEffect(() => {
    if (!currentProjectId || !projectHasNoPreview) return;
    autoProjectPreviewDoneRef.current = false;
    return () => { autoProjectPreviewDoneRef.current = false; };
  }, [currentProjectId, projectHasNoPreview]);

  useEffect(() => {
    if (!currentTemplateId || !templateHasNoPreview || autoPreviewDoneRef.current) return;
    const timer = window.setTimeout(() => {
      if (autoPreviewDoneRef.current) return;
      const el = wrapRef.current;
      if (!el) return;
      void (async () => {
        try {
          const dataUrl = await getPreviewDataUrl();
          if (!dataUrl || autoPreviewDoneRef.current) return;
          const { previewUrl } = await serverUpdateTemplatePreview(currentTemplateId, dataUrl);
          autoPreviewDoneRef.current = true;
          setTemplatePreviewUrl(currentTemplateId, previewUrl);
        } catch (err) {
          console.warn('自动生成模板预览失败', currentTemplateId, err);
        }
      })();
    }, AUTO_PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [currentTemplateId, templateHasNoPreview, getPreviewDataUrl, setTemplatePreviewUrl]);

  // 工程模式：进入编辑页且该工程无预览图时，延迟一次自动截图并上传
  useEffect(() => {
    if (!currentProjectId || !projectHasNoPreview || autoProjectPreviewDoneRef.current) return;
    const timer = window.setTimeout(() => {
      if (autoProjectPreviewDoneRef.current) return;
      const el = wrapRef.current;
      if (!el) return;
      void (async () => {
        try {
          const dataUrl = await getPreviewDataUrl();
          if (!dataUrl || autoProjectPreviewDoneRef.current) return;
          const { previewUrl } = await serverUpdateProjectPreview(currentProjectId, dataUrl);
          autoProjectPreviewDoneRef.current = true;
          setProjectPreviewUrl(currentProjectId, buildPreviewDataUrl(previewUrl));
        } catch (err) {
          console.warn('自动生成工程预览失败', currentProjectId, err);
        }
      })();
    }, AUTO_PREVIEW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [currentProjectId, projectHasNoPreview, getPreviewDataUrl, setProjectPreviewUrl]);

  const handleCopyAsImage = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const dataUrl = await getPreviewDataUrl();
      if (!dataUrl) {
        toast('复制预览图片失败：截图为空', 'error');
        return;
      }
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch (err) {
      console.error('复制预览图片失败', err);
      toast('复制预览图片失败，请稍后重试', 'error');
    } finally {
      setCopying(false);
    }
  }, [copying, getPreviewDataUrl]);

  const handleSaveDraft = useCallback(async () => {
    if (!currentProjectId) return;
    const projectStore = useProjectStore.getState();
    const proj = projectStore.getProjectById(currentProjectId);
    if (!proj) {
      toast('找不到工程记录', 'error');
      return;
    }
    const currentRenderingRules = useEmailStore.getState().renderingRules;
    try {
      await projectStore.putProject({
        id: currentProjectId,
        title: proj.title,
        desc: proj.desc ?? '',
        components,
        config: templateConfig,
        customVariables: customVariables ?? [],
        renderingRules: Object.keys(currentRenderingRules).length > 0 ? currentRenderingRules : undefined,
        updatedAt: Date.now(),
      });
      useCanvasToolbarStore.getState().setSavedStatus('saved');
      toast('草稿已保存', 'success');
    } catch (err) {
      toast(`保存草稿失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  }, [currentProjectId, components, templateConfig, customVariables]);

  const setCanvasToolbarActions = useCanvasToolbarStore((s) => s.setActions);
  const clearCanvasToolbarActions = useCanvasToolbarStore((s) => s.clearActions);

  useEffect(() => {
    setCanvasToolbarActions({
      onCopyImage: handleCopyAsImage,
      onSaveTemplate: () => setSaveModalOpen(true),
      onSaveDraft: currentProjectId ? handleSaveDraft : undefined,
      onSendEmail: () => setSendEmailOpen(true),
      getPreviewDataUrl,
      copying: copying,
      copyDone: copyDone,
    });
    return () => clearCanvasToolbarActions();
  }, [
    setCanvasToolbarActions,
    clearCanvasToolbarActions,
    handleCopyAsImage,
    handleSaveDraft,
    getPreviewDataUrl,
    copying,
    copyDone,
    currentProjectId,
  ]);

  const handleSaveTemplateConfirm = useCallback(
    async (payload: SaveTemplatePayload) => {
      try {
        if (currentProjectId) {
          const { templateId: newTemplateId, setAsDefault } = await serverPublishProjectToTemplate(
            currentProjectId,
            payload
          );
          if (setAsDefault) useEmailTemplateStore.getState().setDefaultTemplateId(newTemplateId);
          toast('已发布为模板', 'success');
          setSaveModalOpen(false);
          if (returnTo && returnTo.trim()) {
            const sep = returnTo.includes('?') ? '&' : '?';
            navigate(`${returnTo}${sep}selectedTemplateId=${newTemplateId}`);
          } else {
            navigate(`/templates/edit/${newTemplateId}`);
          }
          return;
        }
        const dataUrl = await getPreviewDataUrl();
        if (!dataUrl) return;
        const currentRenderingRules = useEmailStore.getState().renderingRules;
        const renderingRulesToSave = Object.keys(currentRenderingRules).length > 0 ? currentRenderingRules : undefined;
        if (payload.mode === 'new') {
          const t = await addTemplate({
            title: payload.title,
            desc: payload.desc,
            components,
            config: templateConfig,
            previewDataUrl: dataUrl,
            isPublic: payload.isPublic,
            customVariables: customVariables.length > 0 ? customVariables : undefined,
            renderingRules: renderingRulesToSave,
          });
          if (payload.setAsDefault) setDefaultTemplateId(t.id);
          toast('模板已保存', 'success');
          navigate(`/templates/edit/${t.id}`);
        } else {
          await updateTemplate(payload.selectedId, {
            components,
            config: templateConfig,
            previewDataUrl: dataUrl,
            customVariables: customVariables.length > 0 ? customVariables : undefined,
            renderingRules: renderingRulesToSave,
          });
          if (payload.setAsDefault) setDefaultTemplateId(payload.selectedId);
          toast('模板已覆盖更新', 'success');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '未知错误';
        toast(`保存模板失败：${msg}`, 'error');
      }
    },
    [
      currentProjectId,
      returnTo,
      getPreviewDataUrl,
      addTemplate,
      updateTemplate,
      setDefaultTemplateId,
      components,
      templateConfig,
      customVariables,
      navigate,
    ]
  );

  return (
    <div className={styles.canvasOuter}>
      <SaveTemplateModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onConfirm={handleSaveTemplateConfirm}
        currentTemplateId={currentTemplateId}
        currentProjectId={currentProjectId}
      />

      <SendEmailModal
        open={sendEmailOpen}
        onClose={() => setSendEmailOpen(false)}
        getHtml={() => {
          const el = wrapRef.current;
          if (!el) return Promise.resolve('');
          return prepareEmailHtmlAsync(el, {
            outerBackgroundColor: templateConfig.outerBackgroundColor,
            sampleData: previewData ?? {},
          });
        }}
      />

      <div ref={wrapRef} className={styles.wrap} style={canvasStyle} onClick={handleCanvasClick}>
        {componentsToRender.length === 0 ? (
          <EmptyCanvasDropZone />
        ) : (
          <>
          {/* 画布根列表：结构固定为 ul > li > div.blockContent > ComponentWrapper。
              导出（prepareEmailHtml）时必须从 ComponentWrapper 读取宽度/对齐，不可误用 blockContent。
              contentDistribution=spaceBetween 时为「首尾贴边、中间均分」，故 gap=0、justifyContent=space-between；
              导出逻辑需同样识别并还原此语义，勿用固定 gap 覆盖。 */}
          <ul
            className={styles.list}
            style={{
              ...alignCSS,
              width: '100%',
              flex: '1 1 auto',
              minHeight: 0,
              gap: contentDistribution === 'spaceBetween' ? '0px' : contentGap,
              justifyContent: contentDistribution === 'spaceBetween' ? 'space-between' : alignCSS.justifyContent,
              margin: 0,
              padding: 0,
              listStyle: 'none',
            }}
          >
            {componentsToRender.map((comp) => (
              <CanvasBlock
                key={comp.id}
                comp={comp}
                selectedId={selectedId}
                onSelectId={handleSelectId}
              />
            ))}
          </ul>
          </>
        )}
      </div>
      <FloatingActions />
    </div>
  );
}
