import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@shared/store/useToastStore';
import { validatePropsPatch, validateWrapperStylePatch } from '../validatePatch';
import {
  CHAT_IDLE_NEW_SESSION_MS,
  CHAT_MAX_FILES,
  CHAT_MAX_FILE_SIZE_BYTES,
  CHAT_QUICK_ACTIONS,
  CHAT_WELCOME_MESSAGE,
} from '../constants';
import { fileToChatAttachment, useChatStore } from '../store/useChatStore';
import type { ChatAttachment, ChatChangeCard, ChatMessage } from '../types';
import {
  serverChatStream,
  serverContinueChatStream,
  serverCreateConversation,
  serverListConversationMessages,
  serverListConversations,
  serverRedoChangeCard,
  serverUndoChangeCard,
  type ChatContinueToolResult,
  type ChatConversationSummary as ServerChatConversationSummary,
  type ChatImageAttachmentPayload,
  type ChatStreamEvent,
  type ChatTemplateComponent,
} from '@shared/api/serverApi';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { useCanvasToolbarStore } from '@shared/store/useCanvasToolbarStore';
import type { EmailComponent, EmailComponentType, WrapperStyle } from '@shared/types/email';
import { captureElementPreview } from '@shared/utils/capturePreview';
import type { ChatConversationSummary } from '../types';

interface ChangeOp {
  target_component_id?: string | null;
  before_patch?: unknown;
  after_patch?: unknown;
}

interface PendingAwaitingTools {
  conversationId: string;
  assistantMessageId: string;
  pendingToolCalls: Array<{ toolCallId: string; name: string; args: Record<string, unknown>; silent?: boolean }>;
  reactTurn: number;
  fromCheckRound: boolean;
  planState?: Array<{ index: number; description: string; status: string }>;
  runId?: string;
  phase?: string;
  verifyToolCallId?: string;
  fixStepIndex?: number;
}

interface ServerConversationMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  think_content?: string | null;
  tool_calls?: Array<{
    id: string;
    name: string;
    args?: Record<string, unknown>;
    result?: Record<string, unknown>;
    changeCard?: {
      id: string;
      summary: string;
      status: 'applied' | 'reverted';
      toolCallId: string;
      targetComponentId?: string;
      beforePatch?: Record<string, unknown>;
      afterPatch?: Record<string, unknown>;
    };
  }>;
}

function toUnixMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return Date.now();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function summarizeProps(comp: EmailComponent): Record<string, unknown> | undefined {
  const p = comp.props as unknown as Record<string, unknown>;
  if (!p) return undefined;
  const summary: Record<string, unknown> = {};
  switch (comp.type) {
    case 'text':
      if (typeof p.content === 'string') summary.content = p.content.slice(0, 120);
      if (p.fontMode) summary.fontMode = p.fontMode;
      break;
    case 'image':
      if (typeof p.src === 'string') summary.src = p.src.slice(0, 80);
      if (typeof p.alt === 'string') summary.alt = p.alt;
      if (p.sizeConfig) summary.sizeConfig = p.sizeConfig;
      break;
    case 'button':
      if (typeof p.text === 'string') summary.text = p.text;
      if (p.backgroundColor) summary.backgroundColor = p.backgroundColor;
      if (p.textColor) summary.textColor = p.textColor;
      break;
    case 'icon':
      if (p.iconType) summary.iconType = p.iconType;
      if (p.size) summary.size = p.size;
      if (p.color) summary.color = p.color;
      break;
    case 'layout':
      if (p.direction) summary.direction = p.direction;
      if (p.gap) summary.gap = p.gap;
      break;
    case 'grid':
      if (p.columnsPerRow) summary.columnsPerRow = p.columnsPerRow;
      if (p.slots) summary.slots = p.slots;
      if (p.gap) summary.gap = p.gap;
      break;
    case 'divider':
      if (p.dividerStyle) summary.dividerStyle = p.dividerStyle;
      if (p.color) summary.color = p.color;
      break;
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function summarizeWrapper(comp: EmailComponent): Record<string, unknown> | undefined {
  const w = comp.wrapperStyle;
  if (!w) return undefined;
  const summary: Record<string, unknown> = {};
  if (w.widthMode !== 'fill') summary.widthMode = w.widthMode;
  if (w.heightMode !== 'fitContent') summary.heightMode = w.heightMode;
  if (w.fixedWidth) summary.fixedWidth = w.fixedWidth;
  if (w.fixedHeight) summary.fixedHeight = w.fixedHeight;
  if (w.contentAlign) summary.contentAlign = w.contentAlign;
  if (w.backgroundColor && w.backgroundColor !== 'transparent') summary.backgroundColor = w.backgroundColor;
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function buildTemplateContext(components: EmailComponent[]): ChatTemplateComponent[] {
  return components.map((comp) => {
    const item: ChatTemplateComponent = { id: comp.id, type: comp.type };
    const propsSummary = summarizeProps(comp);
    if (propsSummary) item.props = propsSummary;
    const wrapperSummary = summarizeWrapper(comp);
    if (wrapperSummary) item.wrapperSummary = wrapperSummary;
    if (comp.children && comp.children.length > 0) {
      item.children = buildTemplateContext(comp.children);
    }
    return item;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('图片读取失败'));
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

/** 与后端 CLIENT_TOOL_NAMES 保持一致：这些工具在前端执行 */
const CLIENT_TOOL_NAMES_SET = new Set<string>([
  'getTemplateState',
  'getComponentState',
  'getComponentPreview',
  'addComponentToTemplate',
  'updateTemplateComponent',
  'clearTemplateOrSubtree',
  'removeComponent',
  'updateCanvasConfig',
  'captureCanvasPreview',
  'createTemplateFromImage',
  'createCompositeChildFromImage',
]);

export function useChatController(aiOpen: boolean) {
  const conversationId = useChatStore((state) => state.conversationId);
  const currentConversationTitle = useChatStore((state) => state.currentConversationTitle);
  const chatViewMode = useChatStore((state) => state.chatViewMode);
  const conversations = useChatStore((state) => state.conversations);
  const chatInput = useChatStore((state) => state.chatInput);
  const pendingAttachments = useChatStore((state) => state.pendingAttachments);
  const pendingComponent = useChatStore((state) => state.pendingComponent);
  const setPendingComponent = useChatStore((state) => state.setPendingComponent);
  const chatMessages = useChatStore((state) => state.chatMessages);
  const welcomeSent = useChatStore((state) => state.welcomeSent);
  const setChatInput = useChatStore((state) => state.setChatInput);
  const setConversationId = useChatStore((state) => state.setConversationId);
  const setCurrentConversationTitle = useChatStore((state) => state.setCurrentConversationTitle);
  const setChatViewMode = useChatStore((state) => state.setChatViewMode);
  const setConversations = useChatStore((state) => state.setConversations);
  const upsertConversation = useChatStore((state) => state.upsertConversation);
  const setChatMessages = useChatStore((state) => state.setChatMessages);
  const markWelcomeSent = useChatStore((state) => state.markWelcomeSent);
  const resetConversation = useChatStore((state) => state.resetConversation);
  const mergePendingAttachments = useChatStore((state) => state.mergePendingAttachments);
  const removePendingAttachment = useChatStore((state) => state.removePendingAttachment);
  const appendMessages = useChatStore((state) => state.appendMessages);
  const upsertPlaceholder = useChatStore((state) => state.upsertPlaceholder);
  const appendAssistantAnswerDelta = useChatStore((state) => state.appendAssistantAnswerDelta);
  const appendAssistantThinkDelta = useChatStore((state) => state.appendAssistantThinkDelta);
  const markAssistantCompleted = useChatStore((state) => state.markAssistantCompleted);
  const upsertToolCall = useChatStore((state) => state.upsertToolCall);
  const setToolCallChangeCard = useChatStore((state) => state.setToolCallChangeCard);
  const updateChangeCardState = useChatStore((state) => state.updateChangeCardState);
  const updateFixStepHeaderStatus = useChatStore((state) => state.updateFixStepHeaderStatus);
  const clearComposer = useChatStore((state) => state.clearComposer);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const setIsStreaming = useChatStore((state) => state.setIsStreaming);
  const findComponent = useEmailStore((state) => state.findComponent);
  const selectComponent = useEmailStore((state) => state.selectComponent);
  const addComponent = useEmailStore((state) => state.addComponent);
  const updateComponent = useEmailStore((state) => state.updateComponent);
  const loadTemplate = useEmailStore((state) => state.loadTemplate);
  const templateConfig = useEmailStore((state) => state.templateConfig);
  const updateComponentProps = useEmailStore((state) => state.updateComponentProps);
  const updateComponentWrapperStyle = useEmailStore((state) => state.updateComponentWrapperStyle);
  const removeComponent = useEmailStore((state) => state.removeComponent);
  const updateTemplateConfig = useEmailStore((state) => state.updateTemplateConfig);

  const aiInputRef = useRef<HTMLTextAreaElement | null>(null);
  const aiFileInputRef = useRef<HTMLInputElement | null>(null);
  const aiMessageViewportRef = useRef<HTMLDivElement | null>(null);
  /** 用户是否在底部：为 true 时 stream 更新会跟随滚动到底部；用户手动上滚后为 false，滚回底部后恢复 true */
  const userAtBottomRef = useRef(true);
  /** 上一帧的 scrollHeight，用于区分「新内容追加」与「用户主动上滚」 */
  const prevScrollHeightRef = useRef(0);
  const SCROLL_AT_BOTTOM_THRESHOLD = 80;
  const NEW_CONTENT_SCROLL_HEIGHT_DELTA = 50;
  const welcomeTimerRef = useRef<number | null>(null);
  const toolCallMessageMapRef = useRef<Record<string, string>>({});
  /** 当前正在执行的 createTemplateFromImage 的 toolCallId 和 messageId，供管线步骤事件使用 */
  const pipelineToolCallRef = useRef<{ toolCallId: string; messageId: string } | null>(null);
  /** 当前正在执行的 runVerificationPipeline 的 toolCallId 和 messageId，供验证步骤事件使用 */
  const verifyToolCallRef = useRef<{ toolCallId: string; messageId: string } | null>(null);
  /** stream 因客户端工具暂停时，此 ref 保存待执行的工具信息；sendMessage 的 while 循环在 stream 结束后检查并续流 */
  const pendingAwaitingToolsRef = useRef<PendingAwaitingTools | null>(null);
  const [activePlan, setActivePlan] = useState<Array<{ index: number; description: string; status: string }> | null>(null);
  /** 记录 planTemplate 工具调用的 messageId + toolCallId，供 updatePlanSnapshot 更新历史快照 */
  const planTemplateToolRef = useRef<{ messageId: string; toolCallId: string } | null>(null);
  /** 记录 fix.step.started 事件中 stepIndex → 对应 fix-step-header 消息 id 的映射 */
  const fixStepHeaderMsgMapRef = useRef<Record<number, string>>({});
  /**
   * 记录被标记为 silent=true 的 toolCallId（如 V7 截图 captureCanvasPreview）。
   * 这些工具不应在前端渲染独立卡片，也不应在 tool.call.completed 时回退到 lastAssistantMessageId 创建幽灵卡片。
   */
  const silentToolCallIdsRef = useRef<Set<string>>(new Set());
  /**
   * 记录本会话内已由前端执行的客户端工具 toolCallId，
   * 避免 /stream/continue 下发 completed 或 change.card.created 时重复应用画布变更。
   */
  const clientExecutedToolCallIdsRef = useRef<Set<string>>(new Set());
  /**
   * 存储当前消息的图片附件，供 /stream/continue 回传给后端，
   * 以保证续流轮次使用 VL 模型并能看到原始图片。
   */
  const currentMessageImagesRef = useRef<ChatImageAttachmentPayload[]>([]);
  /** 流式阶段提前执行的客户端工具结果缓存，供 awaiting_tool_results 续流时直接使用 */
  const earlyExecutedToolResultsRef = useRef<Map<string, { name: string; args: Record<string, unknown>; result: Record<string, unknown> }>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const answerDeltaBuffer = useRef(new Map<string, string>());
  const thinkDeltaBuffer = useRef(new Map<string, string>());
  const deltaFlushRaf = useRef<number | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);

  const adjustAiInputHeight = useCallback(() => {
    const textarea = aiInputRef.current;
    if (!textarea || typeof window === 'undefined') return;

    const computedStyle = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 18;
    const minHeight = lineHeight;
    const maxHeight = lineHeight * 2.5;

    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  const flushDeltas = useCallback(() => {
    if (deltaFlushRaf.current != null) {
      cancelAnimationFrame(deltaFlushRaf.current);
      deltaFlushRaf.current = null;
    }
    const ab = answerDeltaBuffer.current;
    const tb = thinkDeltaBuffer.current;
    if (ab.size > 0) {
      for (const [id, d] of ab) appendAssistantAnswerDelta(id, d);
      ab.clear();
    }
    if (tb.size > 0) {
      for (const [id, d] of tb) appendAssistantThinkDelta(id, d);
      tb.clear();
    }
  }, [appendAssistantAnswerDelta, appendAssistantThinkDelta]);

  const scheduleFlush = useCallback(() => {
    if (deltaFlushRaf.current == null) {
      deltaFlushRaf.current = requestAnimationFrame(flushDeltas);
    }
  }, [flushDeltas]);

  const runQuickAction = useCallback((prompt: string) => {
    setChatInput(prompt);
    window.setTimeout(() => aiInputRef.current?.focus(), 0);
  }, [setChatInput]);

  const applyPatchToComponent = useCallback((
    componentId: string,
    patch: unknown,
    useBefore: boolean
  ) => {
    const patchObj = asRecord(patch);
    if (!patchObj) return;
    const root = useBefore ? asRecord(patchObj.beforePatch) ?? patchObj : asRecord(patchObj.afterPatch) ?? patchObj;
    if (!root) return;

    const propsPatch = asRecord(root.props);
    const wrapperStylePatch = asRecord(root.wrapperStyle);
    if (propsPatch) updateComponentProps(componentId, propsPatch);
    if (wrapperStylePatch) updateComponentWrapperStyle(componentId, wrapperStylePatch);
  }, [updateComponentProps, updateComponentWrapperStyle]);

  const applyOpsFromServer = useCallback((ops: unknown[], mode: 'undo' | 'redo') => {
    for (const op of ops) {
      const row = op as ChangeOp;
      const componentId = typeof row.target_component_id === 'string' ? row.target_component_id : null;
      if (!componentId) continue;
      if (!findComponent(componentId)) continue;
      const patch = mode === 'undo' ? row.before_patch : row.after_patch;
      if (!patch) continue;
      applyPatchToComponent(componentId, patch, false);
    }
  }, [applyPatchToComponent, findComponent]);

  const applyToolResultToCanvas = useCallback((result: Record<string, unknown>) => {
    const toolName = typeof result.toolName === 'string' ? result.toolName : '';
    if (!toolName) return;

    if (toolName === 'clearTemplateOrSubtree') {
      const targetComponentId = typeof result.targetComponentId === 'string' ? result.targetComponentId : '';
      if (!targetComponentId) {
        loadTemplate([], templateConfig);
      }
      return;
    }

    if (toolName === 'removeComponent') {
      const targetId =
        typeof result.componentId === 'string' ? result.componentId
          : typeof result.targetComponentId === 'string' ? result.targetComponentId
            : '';
      if (targetId && findComponent(targetId)) {
        removeComponent(targetId);
      }
      return;
    }

    if (toolName === 'updateCanvasConfig') {
      const applied = asRecord(result.applied);
      if (applied && Object.keys(applied).length > 0) {
        updateTemplateConfig(applied as Parameters<typeof updateTemplateConfig>[0]);
      }
      return;
    }

    const afterPatchEnvelope = asRecord(result.afterPatch);
    const patchContainer = (afterPatchEnvelope && asRecord(afterPatchEnvelope.patch)) || afterPatchEnvelope;
    const propsPatch = patchContainer ? asRecord(patchContainer.props) : null;
    const wrapperStylePatch = patchContainer ? asRecord(patchContainer.wrapperStyle) : null;

    if (toolName === 'addComponentToTemplate') {
      const rawType = typeof result.type === 'string' ? result.type : 'text';
      const allowed: EmailComponentType[] = ['text', 'image', 'button', 'divider', 'layout', 'icon', 'grid'];
      const type: EmailComponentType = allowed.includes(rawType as EmailComponentType) ? (rawType as EmailComponentType) : 'text';
      const preferredId = typeof result.newComponentId === 'string' ? result.newComponentId : undefined;
      const parentId = typeof result.parentId === 'string' ? result.parentId : undefined;
      addComponent(type, parentId, preferredId);
      const newId = useEmailStore.getState().selectedId;
      if (!newId) return;
      if (propsPatch) updateComponentProps(newId, propsPatch);
      if (wrapperStylePatch) updateComponentWrapperStyle(newId, wrapperStylePatch);
      return;
    }

    if (toolName === 'updateTemplateComponent') {
      const targetComponentId = typeof result.targetComponentId === 'string' ? result.targetComponentId : '';
      if (!targetComponentId || !findComponent(targetComponentId)) return;
      if (propsPatch) updateComponentProps(targetComponentId, propsPatch);
      if (wrapperStylePatch) updateComponentWrapperStyle(targetComponentId, wrapperStylePatch);
    }
  }, [
    addComponent,
    findComponent,
    loadTemplate,
    removeComponent,
    templateConfig,
    updateComponentProps,
    updateComponentWrapperStyle,
    updateTemplateConfig,
  ]);

  /**
   * 在前端本地执行画布相关工具，直接操作 useEmailStore。
   * 对应后端 CLIENT_TOOL_NAMES 集合。
   */
  const executeClientTool = useCallback(async (
    name: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    if (!CLIENT_TOOL_NAMES_SET.has(name)) {
      return { ok: false, toolName: name, error: `未知前端工具: ${name}` };
    }

    if (name === 'getTemplateState') {
      const state = useEmailStore.getState();
      const cfg = state.templateConfig;
      return {
        ok: true,
        toolName: 'getTemplateState',
        components: buildTemplateContext(state.components),
        canvasConfig: {
          backgroundColor: cfg.backgroundColor,
          outerBackgroundColor: cfg.outerBackgroundColor,
          width: cfg.width,
          contentAlign: cfg.contentAlign,
          fontFamily: cfg.fontFamily,
        },
      };
    }

    if (name === 'getComponentState') {
      const cid = typeof args.componentId === 'string' ? args.componentId : '';
      if (!cid) return { ok: false, toolName: 'getComponentState', error: '缺少 componentId' };
      const comp = useEmailStore.getState().findComponent(cid);
      if (!comp) return { ok: false, toolName: 'getComponentState', error: '组件不存在', componentId: cid };
      return {
        ok: true,
        toolName: 'getComponentState',
        componentId: cid,
        type: comp.type,
        props: comp.props,
        wrapperStyle: comp.wrapperStyle,
        childrenIds: (comp.children ?? []).map((c: { id: string }) => c.id),
      };
    }

    if (name === 'getComponentPreview') {
      const cid = typeof args.componentId === 'string' ? args.componentId : '';
      if (!cid) return { ok: false, toolName: 'getComponentPreview', error: '缺少 componentId' };
      const domEl = document.querySelector<HTMLElement>(`[data-component-id="${cid}"]`);
      if (!domEl) return { ok: false, toolName: 'getComponentPreview', error: '组件 DOM 不存在', componentId: cid };
      try {
        const dataUrl = await captureElementPreview(domEl, { backgroundColor: '#FFFFFF' });
        if (!dataUrl) return { ok: false, toolName: 'getComponentPreview', error: '截图失败', componentId: cid };
        return { ok: true, toolName: 'getComponentPreview', componentId: cid, imageDataUrl: dataUrl };
      } catch (err) {
        return { ok: false, toolName: 'getComponentPreview', error: String(err), componentId: cid };
      }
    }

    if (name === 'clearTemplateOrSubtree') {
      const targetId =
        typeof args.componentId === 'string' ? args.componentId
          : typeof args.targetComponentId === 'string' ? args.targetComponentId
            : '';
      if (!targetId) {
        loadTemplate([], templateConfig);
      } else {
        const comp = useEmailStore.getState().findComponent(targetId);
        if (comp && (comp.children?.length ?? 0) > 0) {
          updateComponent(targetId, { children: [] });
        }
      }
      return { ok: true, toolName: 'clearTemplateOrSubtree', ...args };
    }

    if (name === 'addComponentToTemplate') {
      const rawType = typeof args.type === 'string' ? args.type : 'text';
      const allowed: EmailComponentType[] = ['text', 'image', 'button', 'divider', 'layout', 'icon', 'grid'];
      const type: EmailComponentType = allowed.includes(rawType as EmailComponentType) ? (rawType as EmailComponentType) : 'text';

      // Fix-7: text/button 类型重复组件检测（内容唯一性检查）
      const afterPatchEnvelopeForCheck = asRecord(args.afterPatch);
      const patchContainerForCheck = (afterPatchEnvelopeForCheck && asRecord(afterPatchEnvelopeForCheck.patch)) || afterPatchEnvelopeForCheck;
      const propsForCheck = patchContainerForCheck ? asRecord(patchContainerForCheck.props) : null;
      if (type === 'text' || type === 'button') {
        const contentKey = type === 'text' ? 'content' : 'text';
        const newContent = propsForCheck?.[contentKey];
        if (newContent && typeof newContent === 'string') {
          const allComponents = useEmailStore.getState().components;
          const hasDuplicate = (function checkDup(comps: typeof allComponents): boolean {
            for (const c of comps) {
              const propsRecord = asRecord(c.props);
              if (c.type === type && propsRecord?.[contentKey] === newContent) return true;
              if (c.children && checkDup(c.children)) return true;
            }
            return false;
          })(allComponents);
          if (hasDuplicate) {
            return {
              ok: false,
              toolName: 'addComponentToTemplate',
              warning: `检测到重复组件：画布中已有相同内容的 ${type} 组件（"${newContent.slice(0, 30)}"）。请使用 updateTemplateComponent 修改现有组件，而非添加新的。`,
              duplicateDetected: true,
            };
          }
        }
      }

      const newId = crypto.randomUUID();
      const parentId = typeof args.parentId === 'string' ? args.parentId : undefined;
      addComponent(type, parentId, newId);

      // 向 image 组件添加 child 时，自动开启 layoutMode（LLM 无需显式写 layoutMode: true）
      if (parentId) {
        const parentComp = useEmailStore.getState().findComponent(parentId);
        if (parentComp?.type === 'image') {
          const parentProps = asRecord(parentComp.props) ?? {};
          if (!parentProps.layoutMode) {
            updateComponentProps(parentId, {
              layoutMode: true,
              ...(!parentProps.layoutContentAlign ? { layoutContentAlign: 'center' } : {}),
              ...(!parentProps.layoutPadding ? { layoutPadding: '24px' } : {}),
            });
          }
        }
      }

      // 应用 afterPatch 的 props/wrapperStyle（先校验再应用）
      const afterPatchEnvelope = asRecord(args.afterPatch);
      const patchContainer = (afterPatchEnvelope && asRecord(afterPatchEnvelope.patch)) || afterPatchEnvelope;
      const rawAddPropsPatch = patchContainer ? asRecord(patchContainer.props) : null;
      const rawAddWrapperStylePatch = patchContainer ? asRecord(patchContainer.wrapperStyle) : null;

      const addStripped: string[] = [];
      let addPropsPatch = rawAddPropsPatch;
      let addWrapperStylePatch = rawAddWrapperStylePatch;

      if (rawAddPropsPatch) {
        const r = validatePropsPatch(type, rawAddPropsPatch);
        if (r.strippedFields.length > 0) addStripped.push(...r.strippedFields.map(f => `props.${f}`));
        // addComponent 校验失败时仍应用清理后的 patch（不回滚已创建的组件）
        addPropsPatch = r.cleanedPatch;
      }
      if (rawAddWrapperStylePatch) {
        const r = validateWrapperStylePatch(rawAddWrapperStylePatch);
        if (r.strippedFields.length > 0) addStripped.push(...r.strippedFields.map(f => `wrapperStyle.${f}`));
        addWrapperStylePatch = r.cleanedPatch;
      }

      // 兼容 LLM 传字符串：image.layoutContentAlign = "left"|"center"|"right"
      // 组件运行时使用 {horizontal, vertical}，这里统一归一化，避免“工具成功但视觉未生效”。
      if (type === 'image' && addPropsPatch && typeof addPropsPatch.layoutContentAlign === 'string') {
        const h = addPropsPatch.layoutContentAlign;
        if (h === 'left' || h === 'center' || h === 'right') {
          addPropsPatch = {
            ...addPropsPatch,
            layoutContentAlign: { horizontal: h, vertical: 'top' },
          };
        }
      }

      if (addPropsPatch) updateComponentProps(newId, addPropsPatch);
      if (addWrapperStylePatch) updateComponentWrapperStyle(newId, addWrapperStylePatch as Partial<WrapperStyle>);
      const addResult: Record<string, unknown> = { ok: true, toolName: 'addComponentToTemplate', newComponentId: newId, ...args };
      if (addStripped.length > 0) {
        addResult.strippedFields = addStripped;
        addResult.note = `已自动移除不支持的字段：${addStripped.join(', ')}`;
      }
      return addResult;
    }

    if (name === 'updateTemplateComponent') {
      // componentId 为规范参数名，兼容旧版 targetComponentId
      const targetId =
        (typeof args.componentId === 'string' && args.componentId) ||
        (typeof args.targetComponentId === 'string' && args.targetComponentId) ||
        '';
      if (!targetId) {
        return { ok: false, toolName: 'updateTemplateComponent', error: '缺少 componentId 参数。请先调用 getTemplateState 获取组件 ID。' };
      }
      const currentComp = useEmailStore.getState().findComponent(targetId);
      if (!currentComp) {
        return {
          ok: false,
          toolName: 'updateTemplateComponent',
          error: `组件 ID "${targetId}" 不存在于当前画布。请先调用 getTemplateState 获取最新组件树和真实 ID。`,
        };
      }

      // 应用更改前捕获当前状态，供后端存入 change card 的 before_patch，支持撤回
      const capturedBeforePatch = {
        props: { ...(asRecord(currentComp.props) ?? {}) },
        wrapperStyle: { ...(currentComp.wrapperStyle) },
      };

      const afterPatchEnvelope = asRecord(args.afterPatch);
      const patchContainer = (afterPatchEnvelope && asRecord(afterPatchEnvelope.patch)) || afterPatchEnvelope;
      // 格式C兜底：LLM 直接把 props/wrapperStyle 放在 args 顶层（不经过 afterPatch 包装）
      const rawPropsPatch = patchContainer ? asRecord(patchContainer.props) : asRecord(args.props);
      const rawWrapperStylePatch = patchContainer ? asRecord(patchContainer.wrapperStyle) : asRecord(args.wrapperStyle);

      // 校验层：在应用 patch 之前验证字段合法性
      const allErrors: string[] = [];
      const allStripped: string[] = [];

      let propsPatch = rawPropsPatch;
      let wrapperStylePatch = rawWrapperStylePatch;

      if (rawPropsPatch) {
        const r = validatePropsPatch(currentComp.type, rawPropsPatch);
        if (!r.valid) allErrors.push(...r.errors);
        if (r.strippedFields.length > 0) allStripped.push(...r.strippedFields.map(f => `props.${f}`));
        propsPatch = r.valid ? r.cleanedPatch : null;
      }
      if (rawWrapperStylePatch) {
        const r = validateWrapperStylePatch(rawWrapperStylePatch);
        if (!r.valid) allErrors.push(...r.errors);
        if (r.strippedFields.length > 0) allStripped.push(...r.strippedFields.map(f => `wrapperStyle.${f}`));
        // wrapperStyle 即使有 strippedFields 也继续应用已清理的部分
        wrapperStylePatch = r.cleanedPatch;
      }

      if (allErrors.length > 0) {
        return {
          ok: false,
          toolName: 'updateTemplateComponent',
          error: `配置校验失败（${allErrors.length} 项错误）：${allErrors.join('；')}`,
          validationErrors: allErrors,
          ...(allStripped.length > 0 ? { strippedFields: allStripped } : {}),
        };
      }

      // 兼容 LLM 传字符串：image.layoutContentAlign = "left"|"center"|"right"
      // 组件运行时使用 {horizontal, vertical}，这里统一归一化，避免“工具成功但视觉未生效”。
      if (currentComp.type === 'image' && propsPatch && typeof propsPatch.layoutContentAlign === 'string') {
        const h = propsPatch.layoutContentAlign;
        if (h === 'left' || h === 'center' || h === 'right') {
          const existingAlign = asRecord((asRecord(currentComp.props) ?? {}).layoutContentAlign);
          const vertical =
            existingAlign && typeof existingAlign.vertical === 'string'
              ? existingAlign.vertical
              : 'top';
          propsPatch = {
            ...propsPatch,
            layoutContentAlign: { horizontal: h, vertical },
          };
        }
      }

      if (propsPatch) updateComponentProps(targetId, propsPatch);
      if (wrapperStylePatch) updateComponentWrapperStyle(targetId, wrapperStylePatch as Partial<WrapperStyle>);

      // 应用后捕获新状态作为 afterPatch，支持「恢复更改」反复可用
      const updatedComp = useEmailStore.getState().findComponent(targetId);
      const capturedAfterPatch = updatedComp
        ? { props: { ...(asRecord(updatedComp.props) ?? {}) }, wrapperStyle: { ...(updatedComp.wrapperStyle) } }
        : undefined;

      const successResult: Record<string, unknown> = {
        ok: true,
        toolName: 'updateTemplateComponent',
        ...args,
        beforePatch: capturedBeforePatch,
        afterPatch: capturedAfterPatch,
      };
      if (allStripped.length > 0) {
        successResult.strippedFields = allStripped;
        successResult.note = `已自动移除不支持的字段：${allStripped.join(', ')}`;
      }
      return successResult;
    }

    if (name === 'removeComponent') {
      const targetId =
        typeof args.componentId === 'string' ? args.componentId
          : typeof args.targetComponentId === 'string' ? args.targetComponentId
            : '';
      if (targetId && useEmailStore.getState().findComponent(targetId)) {
        removeComponent(targetId);
        return { ok: true, toolName: 'removeComponent', componentId: targetId };
      }
      return { ok: false, toolName: 'removeComponent', error: '组件不存在' };
    }

    if (name === 'updateCanvasConfig') {
      const patch = asRecord(args.config) || asRecord(args) || {};
      const allowed = ['backgroundColor', 'outerBackgroundColor', 'width', 'contentAlign', 'padding', 'margin', 'fontFamily', 'backgroundType', 'backgroundImage', 'border', 'borderRadius'];
      const filtered: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in patch && key !== 'toolName') filtered[key] = patch[key];
      }
      if (Object.keys(filtered).length > 0) {
        updateTemplateConfig(filtered as Parameters<typeof updateTemplateConfig>[0]);
      }
      return { ok: true, toolName: 'updateCanvasConfig', applied: filtered };
    }

    if (name === 'captureCanvasPreview') {
      const actions = useCanvasToolbarStore.getState().actions;
      if (!actions?.getPreviewDataUrl) {
        return { ok: false, toolName: 'captureCanvasPreview', error: '截图失败：画布截图器未就绪' };
      }
      let lastErr = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const dataUrl = await actions.getPreviewDataUrl();
          if (dataUrl) {
            return { ok: true, toolName: 'captureCanvasPreview', imageDataUrl: dataUrl };
          }
          lastErr = '返回空结果';
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
        }
        await new Promise((r) => setTimeout(r, 120 * attempt));
      }
      return {
        ok: false,
        toolName: 'captureCanvasPreview',
        error: `截图失败${lastErr ? `：${lastErr}` : ''}`,
      };
    }

    if (name === 'createTemplateFromImage') {
      const components = args.components as unknown[];
      const canvasConfig = args.canvasConfig as Record<string, unknown> | undefined;
      if (Array.isArray(components) && components.length > 0) {
        const mergedConfig = canvasConfig
          ? { ...templateConfig, ...canvasConfig }
          : templateConfig;
        loadTemplate(
          components as Parameters<typeof loadTemplate>[0],
          mergedConfig as Parameters<typeof loadTemplate>[1],
        );
        return { ok: true, toolName: name, componentCount: components.length };
      }
      return { ok: false, toolName: name, error: '管线未返回有效组件树' };
    }

    // createCompositeChildFromImage：暂时返回 ok，后续按需扩展
    return { ok: true, toolName: name, ...args };
  }, [
    addComponent,
    loadTemplate,
    templateConfig,
    updateComponent,
    updateComponentProps,
    updateComponentWrapperStyle,
    removeComponent,
    updateTemplateConfig,
  ]);

  const handleStreamEvent = useCallback(async (event: ChatStreamEvent) => {
    if (event.type !== 'assistant.answer.delta' && event.type !== 'assistant.think.delta') {
      flushDeltas();
    }
    switch (event.type) {
      case 'conversation.started':
        setConversationId(event.conversationId);
        return;
      case 'conversation.title.updated':
        setCurrentConversationTitle(event.title);
        upsertConversation({
          id: event.conversationId,
          title: event.title,
          updatedAt: Date.now(),
          lastMessageAt: Date.now(),
        });
        return;
      case 'assistant.placeholder':
        upsertPlaceholder(event.messageId);
        return;
      case 'assistant.answer.delta':
        {
          const buf = answerDeltaBuffer.current;
          buf.set(event.messageId, (buf.get(event.messageId) ?? '') + event.delta);
          scheduleFlush();
        }
        return;
      case 'assistant.think.delta':
        {
          const buf = thinkDeltaBuffer.current;
          buf.set(event.messageId, (buf.get(event.messageId) ?? '') + event.delta);
          scheduleFlush();
        }
        return;
      case 'tool.call.detected':
        {
          const activeMessageId = useChatStore.getState().lastAssistantMessageId;
          if (!activeMessageId) return;
          toolCallMessageMapRef.current[event.toolCallId] = activeMessageId;
          upsertToolCall(activeMessageId, {
            id: event.toolCallId,
            name: event.name,
            state: 'detected',
            args: event.args,
          });
          if (event.name === 'createTemplateFromImage') {
            pipelineToolCallRef.current = { toolCallId: event.toolCallId, messageId: activeMessageId };
          }
          if (event.name === 'runVerificationPipeline') {
            verifyToolCallRef.current = { toolCallId: event.toolCallId, messageId: activeMessageId };
          }
        }
        return;
      case 'tool.call.running':
        {
          const activeMessageId = toolCallMessageMapRef.current[event.toolCallId] ?? useChatStore.getState().lastAssistantMessageId;
          if (!activeMessageId) return;
          upsertToolCall(activeMessageId, {
          id: event.toolCallId,
          name: '',
          state: 'running',
          });
        }
        return;
      case 'tool.call.client_ready':
        {
          let result: Record<string, unknown>;
          try {
            result = await executeClientTool(event.name, event.args);
          } catch {
            result = { ok: false, toolName: event.name, error: '前端工具执行失败' };
          }
          clientExecutedToolCallIdsRef.current.add(event.toolCallId);
          earlyExecutedToolResultsRef.current.set(event.toolCallId, {
            name: event.name,
            args: event.args,
            result,
          });
          // silent=true 时（如 V7 截图）不渲染工具卡片，保持 UI 干净
          if (!event.silent) {
            const msgId = toolCallMessageMapRef.current[event.toolCallId] ?? useChatStore.getState().lastAssistantMessageId;
            if (msgId) {
              upsertToolCall(msgId, {
                id: event.toolCallId,
                name: event.name,
                state: result.ok === true ? 'completed' : 'failed',
                result,
              });
            }
          }
        }
        return;
      case 'tool.call.completed':
        {
          // 客户端工具已由前端直接执行，跳过重复的画布应用
          if (!clientExecutedToolCallIdsRef.current.has(event.toolCallId)) {
            try {
              applyToolResultToCanvas(event.result);
            } catch {
              // canvas 应用失败不阻塞工具状态更新
            }
          }
          const trackedMsgId = toolCallMessageMapRef.current[event.toolCallId];
          // silent 工具（如 V7 截图的 captureCanvasPreview）：若没有追踪到对应消息，
          // 跳过 upsertToolCall，避免在 lastAssistantMessageId 上创建空名"工具"幽灵卡片
          if (!trackedMsgId && silentToolCallIdsRef.current.has(event.toolCallId)) return;
          const activeMessageId = trackedMsgId ?? useChatStore.getState().lastAssistantMessageId;
          if (!activeMessageId) return;
          // 续流时服务端回传的 result 不含 imageDataUrl（已通过 imageAttachments 传图），保留本地已有的 imageDataUrl 以便气泡内展示预览与点击放大
          const existingTool = useChatStore.getState().chatMessages.find((m) => m.id === activeMessageId)?.toolCalls?.find((t) => t.id === event.toolCallId);
          const existingImg = existingTool?.result && typeof (existingTool.result as Record<string, unknown>).imageDataUrl === 'string';
          const resultToWrite =
            existingImg && event.result && !('imageDataUrl' in event.result)
              ? { ...event.result, imageDataUrl: (existingTool!.result as Record<string, unknown>).imageDataUrl }
              : event.result;
          upsertToolCall(activeMessageId, {
            id: event.toolCallId,
            name: (existingTool?.name?.trim().length ? existingTool.name : '') || '',
            state: 'completed',
            result: resultToWrite,
          });

          // planTemplate 完成：初始化 activePlan + 记录位置供 updatePlanSnapshot
          if (event.result.ok && Array.isArray(event.result.plan)) {
            const steps = (event.result.plan as Array<{ index?: number; description?: string }>).map((s, i) => ({
              index: typeof s.index === 'number' ? s.index : i,
              description: typeof s.description === 'string' ? s.description : `步骤 ${i + 1}`,
              status: 'pending' as const,
            }));
            setActivePlan(steps);
            planTemplateToolRef.current = { messageId: activeMessageId, toolCallId: event.toolCallId };
          }
          // markPlanStepDone 完成：更新对应步骤 + 同步 planTemplate tool result 中的 plan snapshot
          if (event.result.ok && typeof event.result.stepIndex === 'number') {
            const doneIndex = event.result.stepIndex as number;
            setActivePlan(prev => {
              if (!prev) return prev;
              const updated = prev.map(s => s.index === doneIndex ? { ...s, status: 'completed' } : s);
              if (planTemplateToolRef.current) {
                upsertToolCall(planTemplateToolRef.current.messageId, {
                  id: planTemplateToolRef.current.toolCallId,
                  name: 'planTemplate',
                  state: 'completed',
                  result: { ok: true, plan: updated },
                });
              }
              return updated;
            });
          }
        }
        return;
      case 'tool.call.failed':
        {
          const activeMessageId = toolCallMessageMapRef.current[event.toolCallId] ?? useChatStore.getState().lastAssistantMessageId;
          if (!activeMessageId) return;
          upsertToolCall(activeMessageId, {
            id: event.toolCallId,
            name: '',
            state: 'failed',
            result: { error: event.error },
          });
        }
        return;
      case 'change.card.created': {
        const messageId = toolCallMessageMapRef.current[event.card.toolCallId] ?? useChatStore.getState().lastAssistantMessageId;
        if (!messageId) return;
        const card: ChatChangeCard = {
          id: event.card.id,
          summary: event.card.summary,
          status: event.card.status,
          toolCallId: event.card.toolCallId,
          targetComponentId: event.card.targetComponentId,
          beforePatch: event.card.beforePatch,
          afterPatch: event.card.afterPatch,
        };
        setToolCallChangeCard(messageId, event.card.toolCallId, card);
        // 客户端工具已由前端直接执行，跳过从 change card 重复应用画布
        if (card.status === 'applied' && card.targetComponentId && card.afterPatch
          && !clientExecutedToolCallIdsRef.current.has(event.card.toolCallId)) {
          applyPatchToComponent(card.targetComponentId, card.afterPatch, false);
        }
        return;
      }
      case 'change.card.state_changed':
        updateChangeCardState(event.cardId, event.status);
        return;
      case 'conversation.awaiting_tool_results':
        // 记录 silent 工具的 toolCallId，防止后续 tool.call.completed 创建幽灵卡片
        for (const tc of event.pendingToolCalls) {
          if (tc.silent) silentToolCallIdsRef.current.add(tc.toolCallId);
        }
        pendingAwaitingToolsRef.current = {
          conversationId: event.conversationId,
          assistantMessageId: event.assistantMessageId,
          pendingToolCalls: event.pendingToolCalls,
          reactTurn: event.reactTurn,
          fromCheckRound: event.fromCheckRound,
          planState: event.planState,
          runId: event.runId,
          phase: event.phase,
          verifyToolCallId: event.verifyToolCallId,
          fixStepIndex: (event as { fixStepIndex?: number }).fixStepIndex,
        };
        if (event.planState) setActivePlan(event.planState);
        return;
      case 'assistant.completed':
        markAssistantCompleted(event.messageId);
        return;
      case 'pipeline.step.started': {
        const ref = pipelineToolCallRef.current;
        if (!ref) return;
        const { toolCallId, messageId } = ref;
        const msgs = useChatStore.getState().chatMessages;
        const msg = msgs.find((m) => m.id === messageId);
        const prevSteps = msg?.toolCalls?.find((t) => t.id === toolCallId)?.pipelineSteps ?? [];
        upsertToolCall(messageId, {
          id: toolCallId,
          name: '',
          state: 'running',
          pipelineSteps: [...prevSteps, { step: event.step, state: 'running', ...(event.label ? { label: event.label } : {}) }],
        });
        return;
      }
      case 'pipeline.step.completed': {
        const ref = pipelineToolCallRef.current;
        if (!ref) return;
        const { toolCallId, messageId } = ref;
        const msgs = useChatStore.getState().chatMessages;
        const msg = msgs.find((m) => m.id === messageId);
        const prevSteps = msg?.toolCalls?.find((t) => t.id === toolCallId)?.pipelineSteps ?? [];
        upsertToolCall(messageId, {
          id: toolCallId,
          name: '',
          state: 'running',
          pipelineSteps: prevSteps.map((s) =>
            s.step === event.step ? { ...s, state: 'completed' as const } : s
          ),
        });
        return;
      }
      case 'pipeline.step.result': {
        const ref = pipelineToolCallRef.current;
        if (!ref) return;
        const { toolCallId, messageId } = ref;
        const msgs = useChatStore.getState().chatMessages;
        const msg = msgs.find((m) => m.id === messageId);
        const prevSteps = msg?.toolCalls?.find((t) => t.id === toolCallId)?.pipelineSteps ?? [];
        upsertToolCall(messageId, {
          id: toolCallId,
          name: '',
          state: 'running',
          pipelineSteps: prevSteps.map((s) =>
            s.step === event.step ? { ...s, output: event.output } : s
          ),
        });
        return;
      }
      case 'pipeline.completed': {
        pipelineToolCallRef.current = null;
        return;
      }
      case 'verify.step.started': {
        const ref = verifyToolCallRef.current;
        if (!ref) return;
        const { toolCallId, messageId } = ref;
        const msgs = useChatStore.getState().chatMessages;
        const msg = msgs.find((m) => m.id === messageId);
        const prevSteps = msg?.toolCalls?.find((t) => t.id === toolCallId)?.verifySteps ?? [];
        upsertToolCall(messageId, {
          id: toolCallId,
          name: '',
          state: 'running',
          verifySteps: [...prevSteps, { step: event.step, state: 'running' }],
        });
        return;
      }
      case 'verify.step.completed': {
        const ref = verifyToolCallRef.current;
        if (!ref) return;
        const { toolCallId, messageId } = ref;
        const msgs = useChatStore.getState().chatMessages;
        const msg = msgs.find((m) => m.id === messageId);
        const prevSteps = msg?.toolCalls?.find((t) => t.id === toolCallId)?.verifySteps ?? [];
        upsertToolCall(messageId, {
          id: toolCallId,
          name: '',
          state: 'running',
          verifySteps: prevSteps.map((s) =>
            s.step === event.step ? { ...s, state: 'completed' as const } : s
          ),
        });
        return;
      }
      case 'verify.step.result': {
        const ref = verifyToolCallRef.current;
        if (!ref) return;
        const { toolCallId, messageId } = ref;
        const msgs = useChatStore.getState().chatMessages;
        const msg = msgs.find((m) => m.id === messageId);
        const prevSteps = msg?.toolCalls?.find((t) => t.id === toolCallId)?.verifySteps ?? [];
        upsertToolCall(messageId, {
          id: toolCallId,
          name: '',
          state: 'running',
          verifySteps: prevSteps.map((s) =>
            s.step === event.step ? { ...s, output: event.output } : s
          ),
        });
        return;
      }
      case 'verify.completed': {
        verifyToolCallRef.current = null;
        return;
      }
      case 'fix.step.started': {
        // 每个 stepIndex 只插入一次 header（续流 resume 时会再次触发，直接跳过）
        if (fixStepHeaderMsgMapRef.current[event.stepIndex]) return;
        const msgId = crypto.randomUUID();
        fixStepHeaderMsgMapRef.current[event.stepIndex] = msgId;
        appendMessages([{
          id: msgId,
          role: 'assistant',
          content: '',
          kind: 'fix-step-header',
          fixStepIndex: event.stepIndex,
          fixTotalSteps: event.totalSteps,
          fixStepDescription: event.description,
          fixStepStatus: 'running',
          ...(event.componentId ? { fixStepComponentId: event.componentId } : {}),
        }]);
        return;
      }
      case 'fix.step.completed': {
        const msgId = fixStepHeaderMsgMapRef.current[event.stepIndex];
        if (msgId) updateFixStepHeaderStatus(msgId, 'completed');
        return;
      }
      case 'error':
        toast(event.message, 'error');
        return;
      default:
        return;
    }
  }, [
    flushDeltas,
    scheduleFlush,
    applyPatchToComponent,
    applyToolResultToCanvas,
    executeClientTool,
    markAssistantCompleted,
    setConversationId,
    setCurrentConversationTitle,
    upsertConversation,
    setToolCallChangeCard,
    updateChangeCardState,
    upsertPlaceholder,
    upsertToolCall,
    appendMessages,
    updateFixStepHeaderStatus,
  ]);

  const addPendingAttachmentFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const oversized = files.filter((file) => file.size > CHAT_MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      toast(`有 ${oversized.length} 个文件超过 15MB，已跳过。`, 'info');
    }
    const validFiles = files.filter((file) => file.size <= CHAT_MAX_FILE_SIZE_BYTES);
    if (validFiles.length === 0) return;
    const { exceededLimit } = mergePendingAttachments(validFiles, CHAT_MAX_FILES);
    if (exceededLimit) {
      toast(`最多可附加 ${CHAT_MAX_FILES} 个文件，多余文件已忽略。`, 'info');
    }
  }, [mergePendingAttachments]);

  const handleAttachmentChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    addPendingAttachmentFiles(picked);
    event.target.value = '';
  }, [addPendingAttachmentFiles]);

  const handlePasteAttachments = useCallback((files: File[]) => {
    addPendingAttachmentFiles(files);
  }, [addPendingAttachmentFiles]);

  const sendMessage = useCallback(async () => {
    const liveInput = aiInputRef.current?.value ?? '';
    const text = (chatInput.trim() || liveInput.trim());
    const componentData = pendingComponent;
    if (!text && pendingAttachments.length === 0 && !componentData) return;
    if (liveInput !== chatInput) {
      setChatInput(liveInput);
    }

    // 先捕获附件并转 base64，再清空输入，避免 clearComposer 后闭包导致附件丢失
    const filesToSend = [...pendingAttachments];
    const attachmentsPayload: ChatImageAttachmentPayload[] = await Promise.all(
      filesToSend.map(async (file) => ({
        name: file.name,
        mimeType: file.type || 'image/png',
        dataUrl: await fileToDataUrl(file),
      }))
    );

    // 若携带了组件，将其截图追加到图片附件中（LLM 可视）
    if (componentData?.snapshot) {
      attachmentsPayload.push({
        name: `component-${componentData.id}.png`,
        mimeType: 'image/png',
        dataUrl: componentData.snapshot,
      });
    }

    // 无新附件且会话已存在时，回传上一条用户消息的图片，供后端注入到「最近用户请求」片段
    if (filesToSend.length === 0 && !componentData && conversationId) {
      const msgs = useChatStore.getState().chatMessages;
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.role === 'user' && m.attachments && m.attachments.length > 0) {
          const prevImages = m.attachments
            .filter(a => !!a.dataUrl && a.mimeType.startsWith('image/'))
            .map(a => ({ name: a.name, mimeType: a.mimeType, dataUrl: a.dataUrl! }));
          if (prevImages.length > 0) {
            attachmentsPayload.push(...prevImages);
          }
          break;
        }
      }
    }

    // 若携带了组件，在消息文本末尾追加明确的指定编辑指令（方案 A：精准组件 ID 指定）
    const componentDirective = componentData
      ? `\n\n---\n[指定编辑目标]\n组件 ID: ${componentData.id}\n组件类型: ${componentData.type}\n\n⚠️ 请直接使用上述组件 ID 调用 updateTemplateComponent 执行修改，不要先调用 getTemplateState，也不要修改其他组件。\n\n组件当前 JSON（供参考）:\n\`\`\`json\n${JSON.stringify(componentData.componentJson, null, 2)}\n\`\`\``
      : '';
    const finalMessageText = text
      ? `${text}${componentDirective}`
      : componentData
        ? `（已携带组件）${componentDirective}`
        : '（已发送附件）';

    const now = Date.now();
    const attachments: ChatAttachment[] = filesToSend.map((file, i) => ({
      ...fileToChatAttachment(file),
      dataUrl: attachmentsPayload[i]?.dataUrl,
    }));
    const userMessage: ChatMessage = {
      id: `u-${now}`,
      role: 'user',
      content: text || (componentData ? '（已携带组件）' : '（已发送附件）'),
      attachments,
      componentAttachment: componentData ?? undefined,
    };
    appendMessages([userMessage]);
    clearComposer();

    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;
    setIsStreaming(true);

    try {
      const convId = conversationId ?? (await serverCreateConversation()).id;
      if (!conversationId) {
        setConversationId(convId);
        setCurrentConversationTitle(null);
        upsertConversation({
          id: convId,
          title: '新会话',
          updatedAt: Date.now(),
          lastMessageAt: Date.now(),
        });
      }
      const components = useEmailStore.getState().components;
      const templateContext = { components: buildTemplateContext(components) };
      pendingAwaitingToolsRef.current = null;
      clientExecutedToolCallIdsRef.current = new Set();
      earlyExecutedToolResultsRef.current = new Map();
      currentMessageImagesRef.current = attachmentsPayload.filter((a) => a.mimeType.startsWith('image/'));
      await serverChatStream(
        {
          conversationId: convId,
          message: finalMessageText,
          templateContext,
          attachments: attachmentsPayload,
          planState: activePlan ?? undefined,
        },
        handleStreamEvent,
        ac.signal
      );

      // 若 stream 因客户端工具暂停，则循环执行工具并续流
      while (!ac.signal.aborted) {
        const pendingCurrent = pendingAwaitingToolsRef.current as PendingAwaitingTools | null;
        if (!pendingCurrent) break;
        const pending: PendingAwaitingTools = pendingCurrent;
        pendingAwaitingToolsRef.current = null;

        const toolResults: ChatContinueToolResult[] = await Promise.all(
          pending.pendingToolCalls.map(async ({ toolCallId, name, args, silent }) => {
            const earlyResult = earlyExecutedToolResultsRef.current.get(toolCallId);
            if (earlyResult) {
              return { toolCallId, name, args, result: earlyResult.result };
            }
            let result: Record<string, unknown>;
            try {
              result = await executeClientTool(name, args);
            } catch {
              result = { ok: false, toolName: name, error: '前端工具执行失败' };
            }
            clientExecutedToolCallIdsRef.current.add(toolCallId);
            // silent=true 时（如 V7 截图）不渲染工具卡片
            if (!silent) {
              const messageId = toolCallMessageMapRef.current[toolCallId];
              if (messageId) {
                upsertToolCall(messageId, {
                  id: toolCallId,
                  name,
                  state: result.ok === true ? 'completed' : 'failed',
                  result,
                });
              }
            }
            return { toolCallId, name, args, result };
          })
        );

        if (ac.signal.aborted) break;

        const continueImages = [...currentMessageImagesRef.current];
        // 組裝發往後端的 payload：複製 result 並在複本上移除大圖，避免突變 store 中的 result（否則卡片內無法保留 imageDataUrl 展示截圖與點擊放大）
        const payloadToolResults: ChatContinueToolResult[] = toolResults.map((tr) => {
          const resultCopy = { ...tr.result };
          if (tr.name === 'captureCanvasPreview' && typeof resultCopy.imageDataUrl === 'string') {
            continueImages.push({ mimeType: 'image/jpeg', dataUrl: resultCopy.imageDataUrl, name: 'canvas-preview.jpg' });
            delete resultCopy.imageDataUrl;
            resultCopy.note = '截图已附加到上下文';
          }
          if (tr.name === 'getComponentPreview' && typeof resultCopy.imageDataUrl === 'string') {
            const cid = typeof resultCopy.componentId === 'string' ? resultCopy.componentId : 'component';
            continueImages.push({ mimeType: 'image/jpeg', dataUrl: resultCopy.imageDataUrl, name: `component-${cid}-preview.jpg` });
            delete resultCopy.imageDataUrl;
            resultCopy.note = '组件截图已附加到上下文';
          }
          return { toolCallId: tr.toolCallId, name: tr.name, args: tr.args, result: resultCopy };
        });

        await serverContinueChatStream(
          {
            conversationId: pending.conversationId,
            assistantMessageId: pending.assistantMessageId,
            toolResults: payloadToolResults,
            imageAttachments: continueImages.length > 0 ? continueImages : undefined,
            reactTurn: pending.reactTurn,
            fromCheckRound: pending.fromCheckRound,
            planState: pending.planState,
            runId: pending.runId,
            phase: pending.phase,
            verifyToolCallId: pending.verifyToolCallId,
            fixStepIndex: pending.fixStepIndex,
          },
          handleStreamEvent,
          ac.signal
        );
      }
    } catch (err) {
      if (ac.signal.aborted) {
        // user-initiated stop: silently ignore
      } else {
        const message = err instanceof Error ? err.message : '发送失败';
        toast(message, 'error');
      }
    } finally {
      flushDeltas();
      setIsStreaming(false);
      abortControllerRef.current = null;
      const lastMsgId = useChatStore.getState().lastAssistantMessageId;
      if (lastMsgId) markAssistantCompleted(lastMsgId);
    }
  }, [
    activePlan,
    aiInputRef,
    appendMessages,
    chatInput,
    clearComposer,
    conversationId,
    executeClientTool,
    flushDeltas,
    handleStreamEvent,
    markAssistantCompleted,
    pendingAttachments,
    pendingComponent,
    setChatInput,
    setConversationId,
    setCurrentConversationTitle,
    setIsStreaming,
    upsertConversation,
    upsertToolCall,
  ]);

  const stopGeneration = useCallback(() => {
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
    pendingAwaitingToolsRef.current = null;
    setIsStreaming(false);
    const lastMsgId = useChatStore.getState().lastAssistantMessageId;
    if (lastMsgId) markAssistantCompleted(lastMsgId);
  }, [markAssistantCompleted, setIsStreaming]);

  const handleNewConversation = useCallback(() => {
    stopGeneration();
    if (welcomeTimerRef.current != null) {
      window.clearInterval(welcomeTimerRef.current);
      welcomeTimerRef.current = null;
    }
    if (deltaFlushRaf.current != null) {
      cancelAnimationFrame(deltaFlushRaf.current);
      deltaFlushRaf.current = null;
    }
    answerDeltaBuffer.current.clear();
    thinkDeltaBuffer.current.clear();
    pendingAwaitingToolsRef.current = null;
    clientExecutedToolCallIdsRef.current = new Set();
    earlyExecutedToolResultsRef.current = new Map();
    currentMessageImagesRef.current = [];
    setActivePlan(null);
    planTemplateToolRef.current = null;
    resetConversation();
  }, [resetConversation, stopGeneration]);

  const markAllPlanDone = useCallback(() => {
    setActivePlan(prev => {
      if (!prev) return prev;
      const updated = prev.map(s => ({ ...s, status: 'completed' }));
      if (planTemplateToolRef.current) {
        upsertToolCall(planTemplateToolRef.current.messageId, {
          id: planTemplateToolRef.current.toolCallId,
          name: 'planTemplate',
          state: 'completed',
          result: { ok: true, plan: updated },
        });
      }
      return updated;
    });
  }, [upsertToolCall]);

  const openHistoryList = useCallback(async () => {
    try {
      setLoadingConversations(true);
      const data = await serverListConversations();
      const mapped: ChatConversationSummary[] = data.conversations.map((item: ServerChatConversationSummary) => ({
        id: item.id,
        title: item.title,
        updatedAt: toUnixMs(item.updatedAt),
        lastMessageAt: toUnixMs(item.lastMessageAt),
      }));
      setConversations(mapped);
      setChatViewMode('history');
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载历史会话失败';
      toast(message, 'error');
    } finally {
      setLoadingConversations(false);
    }
  }, [setChatViewMode, setConversations]);

  const backToChatView = useCallback(() => {
    setChatViewMode('chat');
  }, [setChatViewMode]);

  const selectConversation = useCallback(async (id: string) => {
    try {
      const data = await serverListConversationMessages(id);
      const rows = Array.isArray(data.messages) ? (data.messages as ServerConversationMessageRow[]) : [];
      const nextMessages: ChatMessage[] = rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content ?? '',
        thinkContent: typeof row.think_content === 'string' && row.think_content.trim().length > 0 ? row.think_content : undefined,
        typing: false,
        streaming: false,
        toolCalls: Array.isArray(row.tool_calls)
          ? row.tool_calls.map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: tc.args,
              state: 'completed' as const,
              result: tc.result,
              changeCard: tc.changeCard,
            }))
          : [],
      }));
      let restoredPlan: Array<{ index: number; description: string; status: string }> | null = null;
      for (const msg of nextMessages) {
        if (msg.role !== 'assistant' || !msg.toolCalls) continue;
        for (const tc of msg.toolCalls) {
          if (tc.name === 'planTemplate' && tc.result && Array.isArray((tc.result as { plan?: unknown }).plan)) {
            const raw = (tc.result as { plan: Array<{ index?: number; description?: string; status?: string }> }).plan;
            restoredPlan = raw.map((s, i) => ({
              index: typeof s.index === 'number' ? s.index : i,
              description: typeof s.description === 'string' ? s.description : '',
              status: typeof s.status === 'string' ? s.status : 'pending',
            }));
          }
        }
      }
      pendingAwaitingToolsRef.current = null;
      clientExecutedToolCallIdsRef.current = new Set();
      currentMessageImagesRef.current = [];
      toolCallMessageMapRef.current = {};
      setActivePlan(restoredPlan);
      planTemplateToolRef.current = null;
      setConversationId(id);
      const title = conversations.find((item) => item.id === id)?.title ?? null;
      setCurrentConversationTitle(title);
      setChatMessages(nextMessages);
      markWelcomeSent();
      setChatViewMode('chat');
    } catch (err) {
      const message = err instanceof Error ? err.message : '加载会话消息失败';
      toast(message, 'error');
    }
  }, [
    conversations,
    markWelcomeSent,
    setChatMessages,
    setChatViewMode,
    setConversationId,
    setCurrentConversationTitle,
  ]);

  const handleLocateChange = useCallback((componentId?: string) => {
    if (!componentId) return;
    if (!findComponent(componentId)) {
      toast('目标组件已不存在，无法定位', 'info');
      return;
    }
    selectComponent(componentId);
  }, [findComponent, selectComponent]);

  const handleUndoChange = useCallback(async (card: ChatChangeCard) => {
    if (!conversationId) {
      toast('仅当前会话支持撤回', 'info');
      return;
    }
    try {
      const data = await serverUndoChangeCard(card.id, conversationId);
      if (Array.isArray(data.ops) && data.ops.length > 0) {
        applyOpsFromServer(data.ops, 'undo');
      } else if (card.targetComponentId && card.beforePatch) {
        applyPatchToComponent(card.targetComponentId, card.beforePatch, false);
      }
      updateChangeCardState(card.id, 'reverted');
    } catch (err) {
      const message = err instanceof Error ? err.message : '撤回失败';
      toast(message, 'error');
    }
  }, [conversationId, applyOpsFromServer, applyPatchToComponent, updateChangeCardState]);

  const handleRedoChange = useCallback(async (card: ChatChangeCard) => {
    if (!conversationId) {
      toast('仅当前会话支持恢复', 'info');
      return;
    }
    try {
      const data = await serverRedoChangeCard(card.id, conversationId);
      if (Array.isArray(data.ops) && data.ops.length > 0) {
        applyOpsFromServer(data.ops, 'redo');
      } else if (card.targetComponentId && card.afterPatch) {
        applyPatchToComponent(card.targetComponentId, card.afterPatch, false);
      }
      updateChangeCardState(card.id, 'applied');
    } catch (err) {
      const message = err instanceof Error ? err.message : '恢复失败';
      toast(message, 'error');
    }
  }, [conversationId, applyOpsFromServer, applyPatchToComponent, updateChangeCardState]);

  useEffect(() => {
    return () => {
      if (deltaFlushRaf.current != null) cancelAnimationFrame(deltaFlushRaf.current);
    };
  }, []);

  useEffect(() => {
    if (!aiOpen) return;
    const lastAt = useChatStore.getState().lastUserMessageAt;
    if (lastAt != null && Date.now() - lastAt > CHAT_IDLE_NEW_SESSION_MS) {
      resetConversation();
    }
  }, [aiOpen, resetConversation]);

  useEffect(() => {
    if (!aiOpen) return;
    const timer = window.setTimeout(() => {
      aiInputRef.current?.focus();
      adjustAiInputHeight();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [aiOpen, adjustAiInputHeight]);

  useEffect(() => {
    adjustAiInputHeight();
  }, [chatInput, adjustAiInputHeight]);

  useEffect(() => {
    if (!aiOpen) return;
    const viewport = aiMessageViewportRef.current;
    if (!viewport) return;
    const checkAtBottom = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      userAtBottomRef.current = distanceFromBottom <= SCROLL_AT_BOTTOM_THRESHOLD;
    };
    viewport.addEventListener('scroll', checkAtBottom, { passive: true });
    checkAtBottom();
    return () => viewport.removeEventListener('scroll', checkAtBottom);
  }, [aiOpen]);

  useEffect(() => {
    if (!aiOpen) return;
    const viewport = aiMessageViewportRef.current;
    if (!viewport) return;
    const rafId = requestAnimationFrame(() => {
      if (!viewport) return;
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const scrollHeightGrew = scrollHeight - prevScrollHeightRef.current > NEW_CONTENT_SCROLL_HEIGHT_DELTA;
      prevScrollHeightRef.current = scrollHeight;
      // 明显有新内容追加：若用户之前在底部则跟到底部；否则不强制（避免输出状态下无法上滚）
      if (scrollHeightGrew) {
        if (!userAtBottomRef.current) return;
        viewport.scrollTop = viewport.scrollHeight;
        return;
      }
      // 无显著新内容：仅当当前已在底部附近时滚底并标记，否则视为用户上滚
      if (distanceFromBottom > SCROLL_AT_BOTTOM_THRESHOLD) {
        userAtBottomRef.current = false;
        return;
      }
      userAtBottomRef.current = true;
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(rafId);
  }, [chatMessages, aiOpen]);

  // 监听 pipeline 步骤展开等引起的 DOM 高度变化（不触发 chatMessages 变更）
  // 若用户当前在底部，高度增加时自动跟到底部
  useEffect(() => {
    if (!aiOpen) return;
    const viewport = aiMessageViewportRef.current;
    if (!viewport) return;

    const scrollToBottomIfNeeded = () => {
      if (userAtBottomRef.current) {
        requestAnimationFrame(() => {
          if (viewport) viewport.scrollTop = viewport.scrollHeight;
        });
      }
    };

    const ro = new ResizeObserver(scrollToBottomIfNeeded);

    // 用 MutationObserver 动态跟踪子节点变化，确保新加入的消息节点也被监听
    const updateObservers = () => {
      ro.disconnect();
      Array.from(viewport.children).forEach((child) => ro.observe(child));
    };
    const mo = new MutationObserver((mutations) => {
      let hasAdded = false;
      mutations.forEach((m) => {
        if (m.addedNodes.length > 0) hasAdded = true;
      });
      if (hasAdded) updateObservers();
    });
    mo.observe(viewport, { childList: true });
    updateObservers();

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [aiOpen]);

  useEffect(() => {
    if (!aiOpen || welcomeSent) return;
    const id = `welcome-${Date.now()}`;
    const full = CHAT_WELCOME_MESSAGE;
    let idx = 0;
    appendMessages([
      {
        id,
        role: 'assistant',
        content: '',
        typing: false,
        streaming: true,
      },
    ]);
    welcomeTimerRef.current = window.setInterval(() => {
      idx += 1;
      appendAssistantAnswerDelta(id, full.slice(idx - 1, idx));
      if (idx >= full.length) {
        if (welcomeTimerRef.current != null) {
          window.clearInterval(welcomeTimerRef.current);
          welcomeTimerRef.current = null;
        }
        markAssistantCompleted(id);
        markWelcomeSent();
      }
    }, 24);
    return () => {
      if (welcomeTimerRef.current != null) {
        window.clearInterval(welcomeTimerRef.current);
        welcomeTimerRef.current = null;
      }
    };
  }, [
    aiOpen,
    appendAssistantAnswerDelta,
    appendMessages,
    markAssistantCompleted,
    markWelcomeSent,
    welcomeSent,
  ]);

  return {
    conversationId,
    currentConversationTitle,
    chatViewMode,
    conversations,
    loadingConversations,
    chatInput,
    pendingAttachments,
    pendingComponent,
    chatMessages,
    isStreaming,
    activePlan,
    quickActions: [...CHAT_QUICK_ACTIONS],
    aiInputRef,
    aiFileInputRef,
    aiMessageViewportRef,
    setChatInput,
    runQuickAction,
    handleAttachmentChange,
    handlePasteAttachments,
    removePendingAttachment,
    removePendingComponent: () => setPendingComponent(null),
    sendMessage,
    stopGeneration,
    handleNewConversation,
    openHistoryList,
    backToChatView,
    selectConversation,
    handleLocateChange,
    handleUndoChange,
    handleRedoChange,
    markAllPlanDone,
  };
}
