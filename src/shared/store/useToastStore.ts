import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

const EXIT_ANIMATION_MS = 280;
const TOAST_DEDUP_WINDOW_MS = 1200;

let lastToastFingerprint = '';
let lastToastAt = 0;

interface ToastState {
  toasts: ToastItem[];
  exitingIds: string[];
  toast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
  removeToast: (id: string) => void;
}

const AUTO_DISMISS_MS = 4000;
const ERROR_DISMISS_MS = 6000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  exitingIds: [],

  toast: (message, type = 'info') => {
    const id = nanoid();
    const createdAt = Date.now();
    set((s) => ({
      toasts: [...s.toasts, { id, message, type, createdAt }],
    }));
    const ms = type === 'error' ? ERROR_DISMISS_MS : AUTO_DISMISS_MS;
    setTimeout(() => {
      get().dismissToast(id);
    }, ms);
  },

  dismissToast: (id: string) => {
    set((s) => ({
      exitingIds: s.exitingIds.includes(id) ? s.exitingIds : [...s.exitingIds, id],
    }));
    setTimeout(() => get().removeToast(id), EXIT_ANIMATION_MS);
  },

  removeToast: (id) => {
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
      exitingIds: s.exitingIds.filter((x) => x !== id),
    }));
  },
}));

/** 可在任意处调用的提示（成功 / 错误 / 一般），符合 frontdesign toast 样式 */
export function toast(message: string, type?: ToastType): void {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return;

  // 401 统一文案，避免同一事件出现 info/error 双份提示。
  const normalizedType: ToastType = normalizedMessage.includes('请重新登录')
    ? 'info'
    : (type ?? 'info');
  const fingerprint = `${normalizedMessage}@@${normalizedType}`;
  const now = Date.now();
  if (fingerprint === lastToastFingerprint && now - lastToastAt < TOAST_DEDUP_WINDOW_MS) return;

  lastToastFingerprint = fingerprint;
  lastToastAt = now;
  useToastStore.getState().toast(normalizedMessage, normalizedType);
}

export function toastLoadError(err: unknown, fallback = '加载失败'): void {
  const message = err instanceof Error ? err.message : fallback;
  toast(message || fallback, 'error');
}
