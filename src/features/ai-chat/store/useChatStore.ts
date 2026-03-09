import { create } from 'zustand';
import { CHAT_INITIAL_MESSAGES } from '../constants';
import type { ChatAttachment, ChatChangeCard, ChatConversationSummary, ChatMessage, ChatToolCall, ComponentAttachment } from '../types';

function sanitizeAssistantAnswerForDisplay(raw: string): string {
  // 先去掉完整的 <tool ...>...</tool> 区块
  const removedCompleteTools = raw.replace(/<tool\s+name="[^"]+">[\s\S]*?<\/tool>/gi, '');
  // 流式阶段若出现未闭合的 <tool ...>，隐藏从起始标签到末尾
  const lower = removedCompleteTools.toLowerCase();
  const lastToolStart = lower.lastIndexOf('<tool');
  if (lastToolStart >= 0) {
    const tail = lower.slice(lastToolStart);
    if (!tail.includes('</tool>')) {
      return removedCompleteTools.slice(0, lastToolStart);
    }
  }
  // 兼容只吐出半个 "<" 的瞬时片段
  const lastLt = removedCompleteTools.lastIndexOf('<');
  const lastGt = removedCompleteTools.lastIndexOf('>');
  if (lastLt > lastGt) {
    return removedCompleteTools.slice(0, lastLt);
  }
  return removedCompleteTools;
}

interface ChatStoreState {
  conversationId: string | null;
  currentConversationTitle: string | null;
  chatViewMode: 'chat' | 'history';
  conversations: ChatConversationSummary[];
  chatInput: string;
  pendingAttachments: File[];
  pendingComponent: ComponentAttachment | null;
  chatMessages: ChatMessage[];
  welcomeSent: boolean;
  isStreaming: boolean;
  lastUserMessageAt: number | null;
  lastAssistantMessageId: string | null;
  placeholderMessageId: string | null;
  setChatInput: (value: string) => void;
  setIsStreaming: (value: boolean) => void;
  setConversationId: (id: string | null) => void;
  setCurrentConversationTitle: (title: string | null) => void;
  setChatViewMode: (mode: 'chat' | 'history') => void;
  setConversations: (items: ChatConversationSummary[]) => void;
  upsertConversation: (item: ChatConversationSummary) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  markWelcomeSent: () => void;
  resetConversation: () => void;
  mergePendingAttachments: (files: File[], maxFiles: number) => { exceededLimit: boolean };
  removePendingAttachment: (attachmentId: string) => void;
  setPendingComponent: (c: ComponentAttachment | null) => void;
  appendMessages: (messages: ChatMessage[]) => void;
  upsertPlaceholder: (id: string) => void;
  appendAssistantAnswerDelta: (messageId: string, delta: string) => void;
  appendAssistantThinkDelta: (messageId: string, delta: string) => void;
  markAssistantCompleted: (messageId: string) => void;
  upsertToolCall: (messageId: string, tool: ChatToolCall) => void;
  /** 将 change 卡片挂到对应工具上（模板编辑类工具完成后，工具行演变为卡片 UI，不再单独插入一条卡片） */
  setToolCallChangeCard: (messageId: string, toolCallId: string, card: ChatChangeCard) => void;
  appendChangeCard: (messageId: string, card: ChatChangeCard) => void;
  updateChangeCardState: (cardId: string, status: 'applied' | 'reverted') => void;
  updateFixStepHeaderStatus: (messageId: string, status: 'running' | 'completed') => void;
  clearComposer: () => void;
}

function toAttachmentId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export const useChatStore = create<ChatStoreState>((set) => ({
  conversationId: null,
  currentConversationTitle: null,
  chatViewMode: 'chat',
  conversations: [],
  chatInput: '',
  pendingAttachments: [],
  pendingComponent: null,
  chatMessages: CHAT_INITIAL_MESSAGES,
  welcomeSent: false,
  isStreaming: false,
  lastUserMessageAt: null,
  lastAssistantMessageId: null,
  placeholderMessageId: null,

  setChatInput: (value) => set({ chatInput: value }),
  setIsStreaming: (value) => set({ isStreaming: value }),
  setConversationId: (id) => set({ conversationId: id }),
  setCurrentConversationTitle: (title) => set({ currentConversationTitle: title }),
  setChatViewMode: (mode) => set({ chatViewMode: mode }),
  setConversations: (items) => set({ conversations: items }),
  upsertConversation: (item) =>
    set((state) => {
      const idx = state.conversations.findIndex((c) => c.id === item.id);
      if (idx < 0) {
        return { conversations: [item, ...state.conversations].sort((a, b) => b.lastMessageAt - a.lastMessageAt) };
      }
      const next = [...state.conversations];
      next[idx] = item;
      next.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
      return { conversations: next };
    }),
  setChatMessages: (messages) =>
    set({
      chatMessages: messages,
      placeholderMessageId: null,
      lastAssistantMessageId: null,
      lastUserMessageAt: Date.now(),
    }),
  markWelcomeSent: () => set({ welcomeSent: true }),
  resetConversation: () =>
    set({
      conversationId: null,
      currentConversationTitle: null,
      chatViewMode: 'chat',
      chatInput: '',
      pendingAttachments: [],
      pendingComponent: null,
      chatMessages: [],
      welcomeSent: false,
      isStreaming: false,
      lastUserMessageAt: null,
      lastAssistantMessageId: null,
      placeholderMessageId: null,
    }),

  mergePendingAttachments: (files, maxFiles) => {
    let exceededLimit = false;
    set((state) => {
      const merged = [...state.pendingAttachments, ...files];
      const deduped = merged.filter(
        (file, index, arr) =>
          arr.findIndex(
            (candidate) =>
              candidate.name === file.name &&
              candidate.size === file.size &&
              candidate.lastModified === file.lastModified
          ) === index
      );
      if (deduped.length > maxFiles) exceededLimit = true;
      return { pendingAttachments: deduped.slice(0, maxFiles) };
    });
    return { exceededLimit };
  },

  removePendingAttachment: (attachmentId) =>
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((file) => toAttachmentId(file) !== attachmentId),
    })),

  setPendingComponent: (c) => set({ pendingComponent: c }),

  appendMessages: (messages) =>
    set((state) => {
      const next = [...state.chatMessages, ...messages];
      const last = next[next.length - 1];
      const lastUserMessageAt = last?.role === 'user' ? Date.now() : state.lastUserMessageAt;
      return { chatMessages: next, lastUserMessageAt };
    }),

  upsertPlaceholder: (id) =>
    set((state) => ({
      placeholderMessageId: id,
      lastAssistantMessageId: id,
      chatMessages: state.chatMessages.some((m) => m.id === id)
        ? state.chatMessages
        : [
            ...state.chatMessages,
            {
              id,
              role: 'assistant',
              content: '',
              thinkContent: '',
              typing: true,
              streaming: true,
              toolCalls: [],
              changeCards: [],
            },
          ],
    })),

  appendAssistantAnswerDelta: (messageId, delta) =>
    set((state) => ({
      lastAssistantMessageId: messageId,
      chatMessages: state.chatMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              rawAnswerBuffer: `${message.rawAnswerBuffer ?? message.content}${delta}`,
              content: sanitizeAssistantAnswerForDisplay(`${message.rawAnswerBuffer ?? message.content}${delta}`),
              typing: false,
              streaming: true,
            }
          : message
      ),
    })),

  appendAssistantThinkDelta: (messageId, delta) =>
    set((state) => ({
      lastAssistantMessageId: messageId,
      chatMessages: state.chatMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              thinkContent: `${message.thinkContent ?? ''}${delta}`,
              typing: false,
              streaming: true,
            }
          : message
      ),
    })),

  markAssistantCompleted: (messageId) =>
    set((state) => ({
      placeholderMessageId: state.placeholderMessageId === messageId ? null : state.placeholderMessageId,
      chatMessages: state.chatMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              typing: false,
              streaming: false,
            }
          : message
      ),
    })),

  upsertToolCall: (messageId, tool) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((message) => {
        if (message.id !== messageId) return message;
        const existed = message.toolCalls ?? [];
        const idx = existed.findIndex((item) => item.id === tool.id);
        if (idx < 0) {
          // 新增工具调用时取消 typing 状态，确保工具卡片分支可见
          return { ...message, typing: false, toolCalls: [...existed, tool] };
        }
        const next = [...existed];
        const prev = next[idx];
        // 保留已识别到的工具名，避免 running/completed 事件的空名称覆盖。
        const mergedName = tool.name.trim().length > 0 ? tool.name : prev.name;
        next[idx] = { ...prev, ...tool, name: mergedName };
        return { ...message, toolCalls: next };
      }),
    })),

  setToolCallChangeCard: (messageId, toolCallId, card) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((message) => {
        if (message.id !== messageId) return message;
        const toolCalls = (message.toolCalls ?? []).map((t) =>
          t.id === toolCallId ? { ...t, changeCard: card } : t
        );
        return { ...message, toolCalls };
      }),
    })),

  appendChangeCard: (messageId, card) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((message) => {
        if (message.id !== messageId) return message;
        const cards = message.changeCards ?? [];
        if (cards.some((item) => item.id === card.id)) return message;
        return { ...message, changeCards: [...cards, card] };
      }),
    })),

  updateChangeCardState: (cardId, status) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((message) => ({
        ...message,
        changeCards: (message.changeCards ?? []).map((card) =>
          card.id === cardId ? { ...card, status } : card
        ),
        toolCalls: (message.toolCalls ?? []).map((t) =>
          t.changeCard?.id === cardId ? { ...t, changeCard: { ...t.changeCard, status } } : t
        ),
      })),
    })),

  updateFixStepHeaderStatus: (messageId, status) =>
    set((state) => ({
      chatMessages: state.chatMessages.map((msg) =>
        msg.id === messageId && msg.kind === 'fix-step-header'
          ? { ...msg, fixStepStatus: status }
          : msg
      ),
    })),

  clearComposer: () => set({ chatInput: '', pendingAttachments: [], pendingComponent: null }),
}));

export function fileToChatAttachment(file: File): ChatAttachment {
  return {
    id: toAttachmentId(file),
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
  };
}
