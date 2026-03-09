/**
 * 統一 API 客戶端（新版）
 * - 自動帶 Authorization: Bearer
 * - 收到 401 時先嘗試 refresh token（httpOnly cookie）
 * - refresh 成功則用新 token 重試原請求
 * - refresh 失敗則清空 auth 狀態並跳轉 /login
 * 新代碼優先使用此模塊；現有 serverApi.ts 逐步遷移
 */

import { getAuthToken, setAuthToken, clearTokenAndNotify } from './authToken';
import { ApiError } from './serverApi';

const DEFAULT_API_TIMEOUT_MS = Number((import.meta.env as Record<string, string>).VITE_API_TIMEOUT_MS ?? 20000);

function getBaseUrl(): string {
  const url = (import.meta.env as Record<string, string>).VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return '';
}

// Singleton refresh promise to prevent concurrent refresh races
let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // sends the httpOnly refresh token cookie
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (!data?.token) return null;

      // Update token in memory + localStorage
      const STORAGE_KEY = 'email_editor_token';
      setAuthToken(data.token);
      try { localStorage.setItem(STORAGE_KEY, data.token); } catch { /* noop */ }
      return data.token;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function buildHeaders(options?: RequestInit): Record<string, string> {
  const hasBody = options?.body != null && options.body !== '';
  const headers: Record<string, string> = hasBody
    ? { 'Content-Type': 'application/json; charset=utf-8', ...(options?.headers as Record<string, string>) }
    : { ...(options?.headers as Record<string, string>) };

  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

type ApiFetchOptions = RequestInit & { timeoutMs?: number };

async function fetchWithTimeout(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const { signal, ...requestOptions } = options;
  delete (requestOptions as ApiFetchOptions).timeoutMs;
  const mergedSignal = signal ?? controller.signal;
  try {
    return await fetch(url, { ...requestOptions, signal: mergedSignal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(408, `请求超时，请稍后重试（>${timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  let res = await fetchWithTimeout(url, { ...options, headers: buildHeaders(options) });

  // Attempt transparent token refresh on 401
  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      res = await fetchWithTimeout(url, { ...options, headers: buildHeaders(options) });
    } else {
      // Refresh failed → full logout
      clearTokenAndNotify();
      const data = await res.json().catch(() => ({}));
      const msg = typeof (data as { error?: string }).error === 'string'
        ? (data as { error: string }).error
        : '请重新登录';
      throw new ApiError(401, msg);
    }
  }

  // Handle non-401 errors
  if (res.status === 401) {
    clearTokenAndNotify();
    const data = await res.json().catch(() => ({}));
    throw new ApiError(401, typeof (data as { error?: string }).error === 'string' ? (data as { error: string }).error : '请重新登录');
  }

  if (!res.ok) {
    const text = await res.text();
    let msg = `API ${path} ${res.status}: ${text}`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (typeof data?.error === 'string') msg = data.error;
    } catch { /* noop */ }
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

/** GET helper */
export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

/** POST helper */
export function apiPost<T>(path: string, body?: unknown, options?: ApiFetchOptions): Promise<T> {
  return apiFetch<T>(path, {
    ...options,
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** PUT helper */
export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** PATCH helper */
export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** DELETE helper */
export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

export { ApiError };
