/**
 * 供 serverApi 读取当前 token，由 useAuthStore 在登录/登出/恢复时写入，避免 api 与 store 循环依赖。
 * 401 时会清空 token 并呼叫 onUnauthorized（由 store 注册）。
 */
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
let unauthorizedNotified = false;

export function getAuthToken(): string | null {
  return token;
}

export function setAuthToken(value: string | null): void {
  token = value;
  if (value) unauthorizedNotified = false;
}

export function setOnUnauthorized(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

export function clearTokenAndNotify(): void {
  token = null;
  if (unauthorizedNotified) return;
  unauthorizedNotified = true;
  onUnauthorized?.();
}
