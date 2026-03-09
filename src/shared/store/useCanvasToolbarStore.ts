import { create } from 'zustand';

/**
 * 画布工具列按钮（复制预览图、保存至邮件模板、发送邮件）由 Canvas 注册，
 * TopNav 中央读取并渲染，使按钮位于顶栏正中。
 */
export interface CanvasToolbarActions {
  onCopyImage: () => void;
  onSaveTemplate: () => void;
  /** 工程模式下「保存草稿」；有值时 TopNav 显示「保存草稿」+「保存为模板」 */
  onSaveDraft?: () => void;
  onSendEmail: () => void;
  getPreviewDataUrl: () => Promise<string | null>;
  copying: boolean;
  copyDone: boolean;
}

/**
 * 编辑页（如模板编辑器）注册的「返回」相关行为，
 * 用于 TopNav 显示返回按钮及「保存并返回」、离开确认等。
 */
export interface EditorToolbarActions {
  onBack: () => void;
  onSaveAndReturn: (() => void) | null;
  hasReturnTo: boolean;
  /** 当前编辑的模板名称，供 TopNav 显示 */
  templateName?: string;
  /** 改名回调；未提供时表示当前状态不支持改名（如未保存的新模板） */
  onRenameTemplate?: (newName: string) => Promise<void>;
}

export type SavedStatus = 'saved' | 'saving' | 'unsaved';

interface CanvasToolbarState {
  actions: CanvasToolbarActions | null;
  setActions: (actions: CanvasToolbarActions | null) => void;
  clearActions: () => void;
  editorActions: EditorToolbarActions | null;
  setEditorActions: (actions: EditorToolbarActions | null) => void;
  clearEditorActions: () => void;
  /** 仅用于 TopNav 显示「保存并返回」按钮的 loading 状态 */
  saveAndReturnLoading: boolean;
  setSaveAndReturnLoading: (v: boolean) => void;
  /** 当前文档保存状态，供 TopNav 展示 */
  savedStatus: SavedStatus;
  setSavedStatus: (s: SavedStatus) => void;
}

export const useCanvasToolbarStore = create<CanvasToolbarState>((set) => ({
  actions: null,
  setActions: (actions) => set({ actions }),
  clearActions: () => set({ actions: null }),
  editorActions: null,
  setEditorActions: (editorActions) => set({ editorActions }),
  clearEditorActions: () => set({ editorActions: null }),
  saveAndReturnLoading: false,
  setSaveAndReturnLoading: (v) => set({ saveAndReturnLoading: v }),
  savedStatus: 'saved',
  setSavedStatus: (savedStatus) => set({ savedStatus }),
}));
