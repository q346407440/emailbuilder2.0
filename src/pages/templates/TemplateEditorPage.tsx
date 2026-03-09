import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams, useNavigate, useBlocker, useLocation } from 'react-router-dom';
import Modal from '@shared/ui/Modal';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { useCompositeStore } from '@features/composite-library/store/useCompositeStore';
import { DEFAULT_TEMPLATE_PREVIEW_PATH, useEmailTemplateStore } from '@features/template-management/store/useEmailTemplateStore';
import { toast } from '@shared/store/useToastStore';
import type { EmailComponentType } from '@shared/types/email';
import { TYPE_LABELS } from '@shared/constants/componentLibrary';
import LeftTabBar from '@features/email-editor/components/LeftTabBar/LeftTabBar';
import Canvas from '@features/email-editor/components/Canvas/Canvas';
import DragGhost from '@features/email-editor/components/DragGhost/DragGhost';
import ComponentDragGhost from '@features/email-editor/components/ComponentDragGhost/ComponentDragGhost';
import { ToastContainer } from '@shared/ui/Toast';
import TopNav from '@features/email-editor/components/TopNav/TopNav';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { fetchServerAssetBlob, serverGetTemplate, serverGetProject } from '@shared/api/serverApi';
import { collectVariableKeys } from '@shared/utils/collectVariableKeys';
import { putTemplate as storagePutTemplate } from '@shared/storage/templateStorage';
import { useProjectStore } from '@features/project-management/store/useProjectStore';
import { useCanvasToolbarStore } from '@shared/store/useCanvasToolbarStore';
import styles from './TemplateEditorPage.module.css';

const snapCenterToCursor: Modifier = ({ transform, activatorEvent, activeNodeRect, overlayNodeRect }) => {
  if (!activatorEvent || !activeNodeRect || !overlayNodeRect) return transform;
  const event = activatorEvent as PointerEvent;
  const grabOffsetX = event.clientX - activeNodeRect.left;
  const grabOffsetY = event.clientY - activeNodeRect.top;
  return {
    ...transform,
    x: transform.x + grabOffsetX - overlayNodeRect.width / 2,
    y: transform.y + grabOffsetY - overlayNodeRect.height / 2,
  };
};
const dragOverlayModifiers = [snapCenterToCursor];

interface ActiveDrag {
  source: 'library' | 'tree' | 'composite-library' | 'canvas-selected';
  componentType: EmailComponentType;
  componentId?: string;
  compositeId?: string;
  compositeName?: string;
  displayName?: string;
}

const AIChatContainer = lazy(() => import('@features/ai-chat/components/AIChatContainer'));
const LeftContentPanel = lazy(() => import('@features/email-editor/components/LeftContentPanel/LeftContentPanel'));
const ConfigPanel = lazy(() => import('@features/email-editor/components/RightPanel/RightPanel'));

export default function TemplateEditorPage() {
  const { id: templateId } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const navigate = useNavigate();

  const isProjectEditor = location.pathname.startsWith('/projects/');

  // State for "save and return" button
  const [savingReturn, setSavingReturn] = useState(false);
  // Track if we've loaded the specific template/project by id（切換工程/模板時須重載）
  const loadedTemplateIdRef = useRef<string | null>(null);
  const loadedKindRef = useRef<'template' | 'project' | null>(null);

  const {
    insertComponent,
    insertFullComponent,
    reorderComponent,
    expandToNode,
    setDragOverInfo,
    setTreeDragOverInfo,
    setIsDragging,
    selectComponent,
    findComponent,
    templateConfig,
  } = useEmailStore(
    useShallow((s) => ({
      insertComponent: s.insertComponent,
      insertFullComponent: s.insertFullComponent,
      reorderComponent: s.reorderComponent,
      expandToNode: s.expandToNode,
      setDragOverInfo: s.setDragOverInfo,
      setTreeDragOverInfo: s.setTreeDragOverInfo,
      setIsDragging: s.setIsDragging,
      selectComponent: s.selectComponent,
      findComponent: s.findComponent,
      templateConfig: s.templateConfig,
    }))
  );

  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);

  // 当前模板记录（用于显示名称、支持改名）；工程模式下为 undefined
  const templateRecord = useEmailTemplateStore(
    useShallow((s) =>
      !isProjectEditor && templateId && templateId !== 'new'
        ? (s.myTemplates.find((t) => t.id === templateId) ?? s.savedTemplates.find((t) => t.id === templateId))
        : undefined
    )
  );

  // 当前工程记录（工程模式下用于显示名称、预览）
  const projectRecord = useProjectStore((s) =>
    isProjectEditor && templateId ? s.getProjectById(templateId) : undefined
  );

  const setSavedStatus = useCanvasToolbarStore((s) => s.setSavedStatus);
  const savedStatus = useCanvasToolbarStore((s) => s.savedStatus);
  const toolbarActions = useCanvasToolbarStore((s) => s.actions);

  // 脏状态追踪：模板/工程加载完成后，任何 components/config 变动都标记为 unsaved
  const trackDirtyRef = useRef(false);
  useEffect(() => {
    if (isProjectEditor) {
      if (!templateId) return;
      const timer = window.setTimeout(() => { trackDirtyRef.current = true; }, 800);
      return () => window.clearTimeout(timer);
    }
    if (!templateRecord && templateId !== 'new') return;
    const timer = window.setTimeout(() => { trackDirtyRef.current = true; }, 800);
    return () => window.clearTimeout(timer);
  }, [templateRecord, templateId, isProjectEditor]);

  useEffect(() => {
    const unsub = useEmailStore.subscribe((state, prev) => {
      if (!trackDirtyRef.current) return;
      if (state.components !== prev.components || state.templateConfig !== prev.templateConfig) {
        setSavedStatus('unsaved');
      }
    });
    return unsub;
  }, [setSavedStatus]);

  // 浏览器关闭/刷新时，若有未保存修改，弹出原生确认对话框
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (savedStatus === 'unsaved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [savedStatus]);

  // 在应用内导航时，若有未保存修改，拦截并弹出自定义确认弹窗
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      savedStatus === 'unsaved' && currentLocation.pathname !== nextLocation.pathname
  );

  const handleLeaveCancel = useCallback(() => {
    blocker.reset?.();
  }, [blocker]);

  const handleLeaveDiscard = useCallback(() => {
    blocker.proceed?.();
  }, [blocker]);

  const handleLeaveSave = useCallback(() => {
    blocker.reset?.();
    toolbarActions?.onSaveTemplate();
  }, [blocker, toolbarActions]);

  const previewCleanupUserIdRef = useRef<string | null>(null);
  const checkedTemplatePreviewUrlByIdRef = useRef(new Map<string, string>());
  const checkedCompositePreviewUrlByIdRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (authLoading || !user) return;
    const loadTemplate = useEmailStore.getState().loadTemplate;
    const templateStore = useEmailTemplateStore.getState();
    const projectStore = useProjectStore.getState();

    if (isProjectEditor && templateId) {
      if (loadedKindRef.current === 'project' && loadedTemplateIdRef.current === templateId) return;
      loadedTemplateIdRef.current = templateId;
      loadedKindRef.current = 'project';
      void (async () => {
        try {
          await projectStore.loadMyProjects();
          useCompositeStore.getState().loadComposites();
          const project = await serverGetProject(templateId);
          if (project) {
            loadTemplate(project.components, project.config, project.customVariables, project.renderingRules);
          }
        } catch (err) {
          console.error('Failed to load project', templateId, err);
          toast('工程加载失败', 'error');
        }
      })();
      return;
    }

    if (templateId && templateId !== 'new') {
      if (loadedKindRef.current === 'template' && loadedTemplateIdRef.current === templateId) return;
      loadedTemplateIdRef.current = templateId;
      loadedKindRef.current = 'template';
      void (async () => {
        try {
          await templateStore.loadMyTemplates();
          useCompositeStore.getState().loadComposites();
          const storeTemplate =
            useEmailTemplateStore.getState().getMyTemplateById(templateId) ??
            useEmailTemplateStore.getState().savedTemplates.find((t) => t.id === templateId);
          if (storeTemplate) {
            loadTemplate(storeTemplate.components, storeTemplate.config, storeTemplate.customVariables, storeTemplate.renderingRules);
          } else {
            const serverTemplate = await serverGetTemplate(templateId);
            if (serverTemplate) {
              loadTemplate(serverTemplate.components, serverTemplate.config, serverTemplate.customVariables, serverTemplate.renderingRules);
            }
          }
        } catch (err) {
          console.error('Failed to load template', templateId, err);
          toast('模板加载失败', 'error');
        }
      })();
    } else {
      templateStore
        .loadTemplates()
        .then(async () => {
          await templateStore.loadMyTemplates();
          const { getTemplateById, seedBuiltinTemplatesIfNeeded, getDefaultTemplateId } =
            useEmailTemplateStore.getState();
          await seedBuiltinTemplatesIfNeeded();
          const defaultId = getDefaultTemplateId();
          if (defaultId) {
            const t = getTemplateById(defaultId);
            const currentComponents = useEmailStore.getState().components;
            if (t && currentComponents.length === 0) {
              loadTemplate(t.components, t.config, t.customVariables, t.renderingRules);
            }
          }
        });
      useCompositeStore.getState().loadComposites();
    }
  }, [user, authLoading, templateId, isProjectEditor]);

  // "Save and return" handler – used when ?returnTo param is present
  const handleSaveAndReturn = useCallback(async () => {
    if (!templateId || savingReturn) return;
    setSavingReturn(true);
    useCanvasToolbarStore.getState().setSaveAndReturnLoading(true);
    useCanvasToolbarStore.getState().setSavedStatus('saving');
    try {
      const emailStore = useEmailStore.getState();
      const components = emailStore.components;
      const config = emailStore.templateConfig;
      const customVariables = emailStore.customVariables ?? [];
      const renderingRules = emailStore.renderingRules;

      if (isProjectEditor) {
        const projectStore = useProjectStore.getState();
        const proj = projectStore.getProjectById(templateId);
        if (!proj) {
          toast('找不到工程记录', 'error');
          return;
        }
        await projectStore.putProject({
          id: templateId,
          title: proj.title,
          desc: proj.desc ?? '',
          components,
          config,
          customVariables,
          updatedAt: Date.now(),
        });
        useCanvasToolbarStore.getState().setSavedStatus('saved');
        toast('草稿已保存', 'success');
        if (returnTo) {
          navigate(decodeURIComponent(returnTo));
        } else {
          navigate('/templates');
        }
        return;
      }

      const templateStore = useEmailTemplateStore.getState();
      const target =
        templateStore.getMyTemplateById(templateId) ??
        templateStore.savedTemplates.find((t) => t.id === templateId);
      if (!target) {
        toast('找不到模板记录，请先通过「保存至邮件模板」保存', 'error');
        return;
      }
      const requiredVariableKeys = collectVariableKeys(components, renderingRules);
      const updated = {
        ...target,
        components,
        config,
        updatedAt: Date.now(),
      };
      await storagePutTemplate(updated, target.previewDataUrl, undefined, requiredVariableKeys);
      useCanvasToolbarStore.getState().setSavedStatus('saved');
      toast('已保存', 'success');
      if (returnTo) {
        navigate(decodeURIComponent(returnTo));
      } else {
        navigate(`/templates/detail/${templateId}`);
      }
    } catch (err) {
      useCanvasToolbarStore.getState().setSavedStatus('unsaved');
      toast(`保存失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    } finally {
      setSavingReturn(false);
      useCanvasToolbarStore.getState().setSaveAndReturnLoading(false);
    }
  }, [templateId, savingReturn, returnTo, navigate, isProjectEditor]);

  // 改名 handler（模板）
  const handleRenameTemplate = useCallback(async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || !templateRecord) return;
    if (trimmed === templateRecord.title) return;
    try {
      await useEmailTemplateStore.getState().updateTemplateMeta(templateRecord.id, {
        title: trimmed,
        desc: templateRecord.desc ?? '',
      });
      toast('已重命名', 'success');
    } catch (err) {
      toast(`重命名失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
  }, [templateRecord]);

  // 改名 handler（工程）
  const handleRenameProject = useCallback(
    async (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || !templateId || !projectRecord) return;
      if (trimmed === projectRecord.title) return;
      try {
        const emailStore = useEmailStore.getState();
        await useProjectStore.getState().putProject({
          id: templateId,
          title: trimmed,
          desc: projectRecord.desc ?? '',
          components: emailStore.components,
          config: emailStore.templateConfig,
          customVariables: emailStore.customVariables ?? [],
          updatedAt: Date.now(),
        });
        toast('已重命名', 'success');
      } catch (err) {
        toast(`重命名失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
      }
    },
    [templateId, projectRecord]
  );

  const setEditorActions = useCanvasToolbarStore((s) => s.setEditorActions);
  const clearEditorActions = useCanvasToolbarStore((s) => s.clearEditorActions);

  useEffect(() => {
    setEditorActions({
      onBack: () => {
        if (returnTo) navigate(decodeURIComponent(returnTo));
        else navigate('/templates');
      },
      onSaveAndReturn: returnTo ? handleSaveAndReturn : null,
      hasReturnTo: !!returnTo,
      templateName: isProjectEditor ? projectRecord?.title : templateRecord?.title,
      onRenameTemplate: isProjectEditor
        ? (projectRecord ? handleRenameProject : undefined)
        : (templateRecord ? handleRenameTemplate : undefined),
    });
  }, [
    returnTo,
    navigate,
    setEditorActions,
    handleSaveAndReturn,
    templateRecord,
    projectRecord,
    isProjectEditor,
    handleRenameTemplate,
    handleRenameProject,
  ]);

  useEffect(() => {
    return () => {
      clearEditorActions();
      setSavedStatus('saved');
    };
  }, [clearEditorActions, setSavedStatus]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (previewCleanupUserIdRef.current === user.id) return;
    previewCleanupUserIdRef.current = user.id;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const templateStore = useEmailTemplateStore.getState();
          const compositeStore = useCompositeStore.getState();

          if (!templateStore.isMyTemplatesLoaded) {
            await templateStore.loadMyTemplates();
          }
          if (!compositeStore.isMyCompositesLoaded) {
            await compositeStore.loadMyComposites();
          }

          const templates = useEmailTemplateStore.getState().myTemplates;
          for (const template of templates) {
            const rawUrl = template.previewDataUrl?.trim();
            if (!rawUrl) continue;
            if (rawUrl === DEFAULT_TEMPLATE_PREVIEW_PATH) continue;
            if (/^(data:|blob:)/.test(rawUrl)) continue;
            const checkedUrl = checkedTemplatePreviewUrlByIdRef.current.get(template.id);
            if (checkedUrl === rawUrl) continue;
            checkedTemplatePreviewUrlByIdRef.current.set(template.id, rawUrl);
            try {
              await fetchServerAssetBlob(rawUrl);
            } catch (err) {
              if (!(err instanceof Error) || !/\b404\b/.test(err.message)) continue;
              await useEmailTemplateStore.getState().updateTemplatePreview(template.id, '');
            }
          }

          const composites = useCompositeStore.getState().myComposites;
          for (const composite of composites) {
            const rawUrl = composite.previewDataUrl?.trim();
            if (!rawUrl) continue;
            if (/^(data:|blob:)/.test(rawUrl)) continue;
            const checkedUrl = checkedCompositePreviewUrlByIdRef.current.get(composite.id);
            if (checkedUrl === rawUrl) continue;
            checkedCompositePreviewUrlByIdRef.current.set(composite.id, rawUrl);
            try {
              await fetchServerAssetBlob(rawUrl);
            } catch (err) {
              if (!(err instanceof Error) || !/\b404\b/.test(err.message)) continue;
              await useCompositeStore.getState().updateCompositePreview(composite.id, '');
            }
          }
        } catch (err) {
          console.warn('登录后预览自修复任务执行失败', err);
        }
      })();
    }, 600);

    return () => window.clearTimeout(timer);
  }, [authLoading, user]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // 優先使用 pointerWithin（指針精確命中），無命中時回退到 rectIntersection（面積重疊）。
  // 這樣在巢狀容器場景下，滑鼠指針所在的最小 droppable（如容器內的插入區）
  // 會優先於外層容器的 inside/after DropZone 被命中，解決深層插入難以瞄準的問題。
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return rectIntersection(args);
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as
        | { source: 'library'; componentType: EmailComponentType }
        | { source: 'tree'; componentId: string; componentType: EmailComponentType }
        | { source: 'composite-library'; compositeId: string }
        | { source: 'canvas-selected'; componentId: string; componentType: EmailComponentType }
        | undefined;

      if (data?.source === 'library') {
        setActiveDrag({ source: 'library', componentType: data.componentType });
      } else if (data?.source === 'tree') {
        setActiveDrag({ source: 'tree', componentType: data.componentType, componentId: data.componentId });
      } else if (data?.source === 'composite-library') {
        const composite = useCompositeStore.getState().getCompositeById(data.compositeId);
        setActiveDrag({
          source: 'composite-library',
          componentType: (composite?.component.type ?? 'layout') as EmailComponentType,
          compositeId: data.compositeId,
          compositeName: composite?.name,
        });
      } else if (data?.source === 'canvas-selected') {
        const comp = findComponent(data.componentId);
        const displayName = comp?.displayName?.trim() || TYPE_LABELS[data.componentType];
        setActiveDrag({ source: 'canvas-selected', componentType: data.componentType, componentId: data.componentId, displayName });
      }

      setIsDragging(true);
    },
    [findComponent, setIsDragging]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over } = event;
      if (!over) { setDragOverInfo(null); setTreeDragOverInfo(null); return; }

      const overData = over.data.current as
        | { type: 'canvas-component'; componentId: string; position: 'before' | 'after' | 'inside' }
        | { type: 'tree-drop'; targetId: string; position: 'before' | 'after' | 'inside' }
        | { type: 'canvas-empty' }
        | undefined;

      if (overData?.type === 'canvas-component') {
        setDragOverInfo({ targetId: overData.componentId, position: overData.position });
        setTreeDragOverInfo(null);
      } else if (overData?.type === 'tree-drop') {
        setTreeDragOverInfo({ targetId: overData.targetId, position: overData.position });
        setDragOverInfo(null);
      } else {
        setDragOverInfo(null);
        setTreeDragOverInfo(null);
      }
    },
    [setDragOverInfo, setTreeDragOverInfo]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setDragOverInfo(null);
      setTreeDragOverInfo(null);
      setActiveDrag(null);
      setIsDragging(false);

      if (!over) return;

      const activeData = active.data.current as
        | { source: 'library'; componentType: EmailComponentType }
        | { source: 'tree'; componentId: string; componentType: EmailComponentType }
        | { source: 'composite-library'; compositeId: string }
        | { source: 'canvas-selected'; componentId: string; componentType: EmailComponentType }
        | undefined;

      const overData = over.data.current as
        | { type: 'canvas-component'; componentId: string; position: 'before' | 'after' | 'inside' }
        | { type: 'canvas-empty' }
        | { type: 'tree-drop'; targetId: string; position: 'before' | 'after' | 'inside' }
        | undefined;

      if (!activeData) return;

      if (activeData.source === 'library') {
        if (overData?.type === 'canvas-component') {
          insertComponent(activeData.componentType, overData.componentId, overData.position);
        } else if (overData?.type === 'canvas-empty') {
          useEmailStore.getState().addComponent(activeData.componentType);
        }
      }

      if (activeData.source === 'composite-library') {
        const composite = useCompositeStore.getState().getCompositeById(activeData.compositeId);
        if (!composite) return;
        try {
          if (overData?.type === 'canvas-component') {
            insertFullComponent(composite.component, overData.componentId, overData.position, composite);
          } else if (overData?.type === 'canvas-empty') {
            insertFullComponent(composite.component, undefined, undefined, composite);
          }
        } catch (err) {
          console.error('拖放复合组件失败', composite.name, err);
          toast('该复合组件资料异常，无法加入画布。请尝试删除该组件后重新建立，或从导入还原。', 'error');
        }
      }

      if (activeData.source === 'tree') {
        const sourceId = activeData.componentId;
        if (overData?.type === 'tree-drop') {
          const { targetId, position } = overData;
          if (sourceId !== targetId) {
            reorderComponent(sourceId, targetId, position);
            if (position === 'inside') expandToNode(sourceId);
            selectComponent(sourceId);
          }
        } else if (overData?.type === 'canvas-component') {
          const { componentId: targetId, position } = overData;
          if (sourceId !== targetId) {
            reorderComponent(sourceId, targetId, position);
            if (position === 'inside') expandToNode(sourceId);
            selectComponent(sourceId);
          }
        }
      }

      if (activeData.source === 'canvas-selected') {
        const sourceId = activeData.componentId;
        if (overData?.type === 'tree-drop') {
          const { targetId, position } = overData;
          if (sourceId !== targetId) {
            reorderComponent(sourceId, targetId, position);
            if (position === 'inside') expandToNode(sourceId);
            selectComponent(sourceId);
          }
        } else if (overData?.type === 'canvas-component') {
          const { componentId: targetId, position } = overData;
          if (sourceId !== targetId) {
            reorderComponent(sourceId, targetId, position);
            if (position === 'inside') expandToNode(sourceId);
            selectComponent(sourceId);
          }
        }
      }
    },
    [insertComponent, insertFullComponent, reorderComponent, expandToNode, selectComponent, setDragOverInfo, setTreeDragOverInfo, setIsDragging]
  );

  const handleDragCancel = useCallback(() => {
    setDragOverInfo(null);
    setTreeDragOverInfo(null);
    setActiveDrag(null);
    setIsDragging(false);
  }, [setDragOverInfo, setTreeDragOverInfo, setIsDragging]);

  const handleCanvasAreaClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-component-id]')) return;
      selectComponent(null);
    },
    [selectComponent]
  );

  const canvasAreaStyle = {
    '--canvas-area-bg': templateConfig.outerBackgroundColor,
  } as CSSProperties & Record<string, string>;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={styles.wrapper}>
        <ToastContainer />
        <TopNav />

        {/* 离开确认弹窗：有未保存修改时拦截应用内导航 */}
        <Modal
          open={blocker.state === 'blocked'}
          title="有未保存的修改"
          onClose={handleLeaveCancel}
          footer={
            <div className={styles.leaveModalFooter}>
              <button type="button" className={styles.leaveBtnSecondary} onClick={handleLeaveCancel}>
                继续编辑
              </button>
              <div className={styles.leaveModalFooterRight}>
                <button type="button" className={styles.leaveBtnDanger} onClick={handleLeaveDiscard}>
                  放弃修改
                </button>
                <button type="button" className={styles.leaveBtnPrimary} onClick={handleLeaveSave}>
                  保存模板
                </button>
              </div>
            </div>
          }
        >
          <p className={styles.leaveModalDesc}>
            当前模板有未保存的修改，离开后修改将会丢失。
          </p>
        </Modal>
        <div className={styles.app}>
          <nav className={`${styles.tabBar}${leftCollapsed ? ` ${styles.tabBarCollapsed}` : ''}`}>
            <div className={styles.tabBarInner}>
              <LeftTabBar />
            </div>
          </nav>
          <aside className={`${styles.leftContent}${leftCollapsed ? ` ${styles.leftContentCollapsed}` : ''}`}>
            <div className={styles.leftContentInner}>
              <Suspense fallback={null}>
                <LeftContentPanel />
              </Suspense>
            </div>
          </aside>
          <main data-canvas-viewport className={styles.canvasArea} style={canvasAreaStyle}>
            <button
              type="button"
              className={styles.leftEdgeTrigger}
              onClick={(e) => { e.stopPropagation(); setLeftCollapsed(!leftCollapsed); }}
              title={leftCollapsed ? '展开左侧面板' : '收起左侧面板'}
              aria-label={leftCollapsed ? '展开左侧面板' : '收起左侧面板'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {leftCollapsed ? <path d="M6 4l4 4-4 4" /> : <path d="M10 4L6 8l4 4" />}
              </svg>
            </button>
            <button
              type="button"
              className={styles.rightEdgeTrigger}
              onClick={(e) => { e.stopPropagation(); setRightCollapsed(!rightCollapsed); }}
              title={rightCollapsed ? '展开右侧面板' : '收起右侧面板'}
              aria-label={rightCollapsed ? '展开右侧面板' : '收起右侧面板'}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {rightCollapsed ? <path d="M10 4l-4 4 4 4" /> : <path d="M6 4l4 4-4 4" />}
              </svg>
            </button>
            <div className={styles.canvasScroll} onClick={handleCanvasAreaClick}>
              <Canvas
                currentTemplateId={
                  !isProjectEditor && templateId && templateId !== 'new' ? templateId : undefined
                }
                currentProjectId={isProjectEditor && templateId ? templateId : undefined}
                returnTo={returnTo ? decodeURIComponent(returnTo) : undefined}
                templateHasNoPreview={
                  !!templateRecord &&
                  !(templateRecord.previewDataUrl && templateRecord.previewDataUrl.trim() !== '') &&
                  templateRecord.previewDataUrl !== DEFAULT_TEMPLATE_PREVIEW_PATH
                }
                projectHasNoPreview={
                  !!projectRecord &&
                  !(projectRecord.previewUrl && projectRecord.previewUrl.trim() !== '')
                }
              />
            </div>
          </main>
          <aside className={`${styles.configPanel}${rightCollapsed ? ` ${styles.configPanelCollapsed}` : ''}`}>
            <div className={styles.configPanelInner}>
              <Suspense fallback={null}>
                <ConfigPanel />
              </Suspense>
            </div>
          </aside>
        </div>
        <Suspense fallback={null}>
          <AIChatContainer />
        </Suspense>
      </div>
      <DragOverlay dropAnimation={null} modifiers={dragOverlayModifiers}>
        {activeDrag &&
          (activeDrag.source === 'canvas-selected' && activeDrag.componentId
            ? (() => {
                const component = findComponent(activeDrag.componentId);
                return component ? (
                  <ComponentDragGhost component={component} templateConfig={templateConfig} />
                ) : (
                  <DragGhost type={activeDrag.componentType} customLabel={activeDrag.displayName} />
                );
              })()
            : (
              <DragGhost
                type={activeDrag.componentType}
                compositeName={activeDrag.source === 'composite-library' ? activeDrag.compositeName : undefined}
                customLabel={activeDrag.source === 'canvas-selected' ? activeDrag.displayName : undefined}
              />
            ))}
      </DragOverlay>
    </DndContext>
  );
}
