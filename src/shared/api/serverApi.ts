/**
 * 后端 API 客户端
 * 模板与复合组件库唯一资料来源，与上线部署一致。
 * 需登录的请求自动带 Authorization，401 时清空 token 并触发 onUnauthorized。
 */

import { getAuthToken, clearTokenAndNotify } from './authToken';
import type { SavedEmailTemplate, SavedEmailProject } from '../types/emailTemplate';
import type { CompositeComponent } from '../types/composite';
import type { RenderingRules } from '../types/email';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** 仅管理员可保存到公共；未返回时视为 false */
  isAdmin?: boolean;
  /** 当前用户默认邮件模板 id，按用户存后端，跨设备/端口一致 */
  defaultTemplateId?: string | null;
}

function getBaseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return '';
}

/** 将相对预览路径转为完整 URL，供 img 与 store 使用 */
export function buildPreviewDataUrl(previewUrl: string | null): string {
  if (!previewUrl) return '';
  const base = getBaseUrl();
  return previewUrl.startsWith('http') ? previewUrl : `${base}${previewUrl}`;
}

function normalizePreviewDataUrlForSave(previewDataUrl: string): string {
  if (!previewDataUrl) return '';
  if (/^(data:|blob:)/.test(previewDataUrl)) return previewDataUrl;
  const base = getBaseUrl();
  if (previewDataUrl.startsWith(base)) return previewDataUrl.slice(base.length) || '';
  return previewDataUrl;
}

function toAbsoluteAssetUrl(assetUrl: string): string {
  if (/^(data:|blob:|https?:)/.test(assetUrl)) return assetUrl;
  const base = getBaseUrl();
  return assetUrl.startsWith('/') ? `${base}${assetUrl}` : `${base}/${assetUrl}`;
}

function buildHeaders(options?: RequestInit, withAuth = true): Record<string, string> {
  const hasBody = options?.body != null && options.body !== '';
  const headers: Record<string, string> = hasBody
    ? { 'Content-Type': 'application/json; charset=utf-8', ...(options?.headers as Record<string, string>) }
    : { ...(options?.headers as Record<string, string>) };
  if (withAuth) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** 携带 HTTP 状态码的 API 错误，便于调用方按状态码（如 404）分支处理 */
export class ApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function fetchJson<T>(path: string, options?: RequestInit, withAuth = true): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: buildHeaders(options, withAuth),
  });
  if (res.status === 401) {
    clearTokenAndNotify();
    const data = await res.json().catch(() => ({}));
    const msg = typeof (data as { error?: string }).error === 'string' ? (data as { error: string }).error : '请重新登录';
    throw new ApiError(401, msg);
  }
  if (!res.ok) {
    const text = await res.text();
    let msg = `Server API ${path} ${res.status}: ${text}`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (typeof data?.error === 'string') msg = data.error;
    } catch {
      // 非 JSON 响应，使用通用错误
    }
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

// ---------- Auth ----------

export async function serverLogin(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  return fetchJson<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, false);
}

export async function serverRegister(
  email: string,
  password: string,
  displayName?: string
): Promise<{ token: string; user: AuthUser }> {
  return fetchJson<{ token: string; user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  }, false);
}

export async function serverGetMe(): Promise<AuthUser | null> {
  const data = await fetchJson<{ user: AuthUser }>('/api/auth/me');
  return data?.user ?? null;
}

export async function serverUpdateProfile(data: {
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<AuthUser> {
  const res = await fetchJson<{ user: AuthUser }>('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.user;
}

export async function serverChangePassword(currentPassword: string, newPassword: string): Promise<void> {
  await fetchJson('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/** 设置当前用户默认邮件模板 id（null 表示取消默认），返回更新后的 user */
export async function serverSetDefaultTemplateId(defaultTemplateId: string | null): Promise<AuthUser> {
  const res = await fetchJson<{ user: AuthUser }>('/api/auth/preferences', {
    method: 'PUT',
    body: JSON.stringify({ defaultTemplateId }),
  });
  return res.user;
}

// ---------- 店铺授权（Shoplazza） ----------

export interface AuthorizedShop {
  id: string;
  shopId: string;
  shopName: string;
  shopUrl: string;
  domain: string;
}

export interface ShopProductSummary {
  id: string;
  title: string;
  handle: string;
  imageUrl: string;
  price: string;
  compareAtPrice: string;
  url: string;
}

export async function serverListShops(): Promise<{ shops: AuthorizedShop[]; lastSelectedId: string | null }> {
  const data = await fetchJson<{ shops: AuthorizedShop[]; lastSelectedId: string | null }>('/api/shops');
  return data;
}

export async function serverAuthorizeShop(domain: string, token: string): Promise<AuthorizedShop> {
  const data = await fetchJson<AuthorizedShop>('/api/shops/authorize', {
    method: 'POST',
    body: JSON.stringify({ domain, token }),
  });
  return data;
}

export async function serverSetLastShop(shopId: string): Promise<void> {
  await fetchJson('/api/shops/last', {
    method: 'PUT',
    body: JSON.stringify({ shopId }),
  });
}

export async function serverDisconnectShop(id: string): Promise<void> {
  await fetchJson(`/api/shops/${id}`, { method: 'DELETE' });
}

export async function serverListShopProducts(
  shopId: string,
  options?: { search?: string; cursor?: string; limit?: number }
): Promise<{ products: ShopProductSummary[]; cursor: string | null; preCursor: string | null }> {
  const query = new URLSearchParams();
  if (options?.search?.trim()) query.set('search', options.search.trim());
  if (options?.cursor?.trim()) query.set('cursor', options.cursor.trim());
  if (options?.limit != null) query.set('limit', String(options.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return fetchJson<{ products: ShopProductSummary[]; cursor: string | null; preCursor: string | null }>(
    `/api/shops/${shopId}/products${suffix}`
  );
}

// ---------- Templates ----------

export async function serverListTemplates(): Promise<SavedEmailTemplate[]> {
  const list = await fetchJson<{ id: string; title: string; desc: string | null; previewUrl: string | null; createdAt: number; updatedAt: number }[]>('/api/templates');
  const full = await Promise.all(list.map((t) => serverGetTemplate(t.id)));
  return full.filter((t): t is SavedEmailTemplate => t != null);
}

export async function serverListMyTemplates(): Promise<SavedEmailTemplate[]> {
  const list = await fetchJson<{ id: string; title: string; desc: string | null; previewUrl: string | null; createdAt: number; updatedAt: number }[]>('/api/templates/mine');
  const full = await Promise.all(list.map((t) => serverGetTemplate(t.id)));
  return full.filter((t): t is SavedEmailTemplate => t != null);
}

export async function serverGetTemplate(id: string): Promise<SavedEmailTemplate | null> {
  try {
    const row = await fetchJson<{
      id: string;
      title: string;
      desc: string | null;
      components: unknown;
      config: unknown;
      previewDataUrl: string | null;
      createdAt: number;
      updatedAt: number;
      customVariables?: unknown[];
      renderingRules?: unknown;
    }>(`/api/templates/${id}`);
    return {
      id: row.id,
      title: row.title,
      desc: row.desc ?? '',
      components: row.components as SavedEmailTemplate['components'],
      config: row.config as SavedEmailTemplate['config'],
      previewDataUrl: buildPreviewDataUrl(row.previewDataUrl),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      customVariables: Array.isArray(row.customVariables) && row.customVariables.length > 0
        ? row.customVariables as SavedEmailTemplate['customVariables']
        : undefined,
      renderingRules: (row.renderingRules != null && typeof row.renderingRules === 'object' && Object.keys(row.renderingRules as object).length > 0)
        ? row.renderingRules as RenderingRules
        : undefined,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function serverAddTemplate(
  template: SavedEmailTemplate,
  previewDataUrl?: string,
  isPublic?: boolean
): Promise<void> {
  const preview = normalizePreviewDataUrlForSave(previewDataUrl ?? template.previewDataUrl ?? '');
  await fetchJson('/api/templates', {
    method: 'POST',
    body: JSON.stringify({
      id: template.id,
      title: template.title,
      desc: template.desc,
      components: template.components,
      config: template.config,
      previewDataUrl: preview,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      isPublic: isPublic === true,
      customVariables: template.customVariables ?? [],
      renderingRules: template.renderingRules ?? {},
    }),
  });
}

export async function serverPutTemplate(
  template: SavedEmailTemplate,
  previewDataUrl?: string,
  isPublic?: boolean,
  requiredVariableKeys?: string[]
): Promise<void> {
  const preview = normalizePreviewDataUrlForSave(previewDataUrl ?? template.previewDataUrl ?? '');
  await fetchJson(`/api/templates/${template.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: template.id,
      title: template.title,
      desc: template.desc,
      components: template.components,
      config: template.config,
      previewDataUrl: preview,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      isPublic: isPublic,
      requiredVariableKeys: requiredVariableKeys ?? [],
      customVariables: template.customVariables ?? [],
      renderingRules: template.renderingRules ?? {},
    }),
  });
}

export async function serverDeleteTemplate(id: string): Promise<void> {
  await fetchJson(`/api/templates/${id}`, { method: 'DELETE' });
}

// ── Template management (Iteration 1) ───────────────────────────────────────

/** 新建空白模板（只需名稱），返回 { id, name } */
export async function serverCreateEmptyTemplate(name: string): Promise<{ id: string; name: string }> {
  return fetchJson<{ id: string; name: string }>('/api/templates', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/** 复制模板，返回 { id, title } */
export async function serverDuplicateTemplate(id: string): Promise<{ id: string; title: string }> {
  return fetchJson<{ id: string; title: string }>(`/api/templates/${id}/duplicate`, {
    method: 'POST',
  });
}

/** 仅更新模板预览图（不修改内容），用于进入编辑页时自动补齐预览；返回 { previewUrl } */
export async function serverUpdateTemplatePreview(
  id: string,
  previewDataUrl: string
): Promise<{ previewUrl: string }> {
  return fetchJson<{ ok: boolean; previewUrl: string }>(`/api/templates/${id}/preview`, {
    method: 'PUT',
    body: JSON.stringify({ previewDataUrl }),
  }).then((r) => ({ previewUrl: r.previewUrl }));
}

// ---------- Projects（工程） ----------

export interface ProjectListItem {
  id: string;
  title: string;
  desc: string | null;
  previewUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function serverListMyProjects(): Promise<ProjectListItem[]> {
  const list = await fetchJson<ProjectListItem[]>('/api/projects/mine');
  return list;
}

export async function serverGetProject(id: string): Promise<SavedEmailProject | null> {
  const row = await fetchJson<{
    id: string;
    title: string;
    desc: string | null;
    components: unknown;
    config: unknown;
    customVariables: unknown[];
    renderingRules?: unknown;
    previewDataUrl: string | null;
    createdAt: number;
    updatedAt: number;
  }>(`/api/projects/${id}`);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    desc: row.desc ?? '',
    components: row.components as SavedEmailProject['components'],
    config: row.config as SavedEmailProject['config'],
    previewDataUrl: buildPreviewDataUrl(row.previewDataUrl),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customVariables: Array.isArray(row.customVariables) ? (row.customVariables as SavedEmailProject['customVariables']) : undefined,
    renderingRules: (row.renderingRules != null && typeof row.renderingRules === 'object' && Object.keys(row.renderingRules as object).length > 0)
      ? row.renderingRules as RenderingRules
      : undefined,
  };
}

/** 创建空白工程，返回 { id, title } */
export async function serverCreateEmptyProject(title?: string): Promise<{ id: string; title: string }> {
  return fetchJson<{ id: string; title: string }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(title != null ? { title } : {}),
  });
}

export async function serverPutProject(project: {
  id: string;
  title: string;
  desc?: string;
  components: unknown[];
  config: unknown;
  customVariables?: unknown[];
  renderingRules?: RenderingRules;
  updatedAt: number;
}): Promise<{ ok: boolean; previewUrl?: string }> {
  return fetchJson(`/api/projects/${project.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title: project.title,
      desc: project.desc,
      components: project.components,
      config: project.config,
      customVariables: project.customVariables ?? [],
      renderingRules: project.renderingRules ?? {},
      updatedAt: project.updatedAt,
    }),
  });
}

export async function serverUpdateProjectPreview(id: string, previewDataUrl: string): Promise<{ previewUrl: string }> {
  return fetchJson<{ ok: boolean; previewUrl: string }>(`/api/projects/${id}/preview`, {
    method: 'PUT',
    body: JSON.stringify({ previewDataUrl }),
  }).then((r) => ({ previewUrl: r.previewUrl }));
}

export async function serverDeleteProject(id: string): Promise<void> {
  await fetchJson(`/api/projects/${id}`, { method: 'DELETE' });
}

export type SaveTemplatePayload =
  | { mode: 'new'; title: string; desc: string; setAsDefault?: boolean; isPublic?: boolean }
  | { mode: 'overwrite'; selectedId: string; setAsDefault?: boolean };

export async function serverPublishProjectToTemplate(
  projectId: string,
  payload: SaveTemplatePayload,
  deleteProjectAfter?: boolean
): Promise<{ templateId: string; setAsDefault?: boolean }> {
  const body: Record<string, unknown> =
    payload.mode === 'new'
      ? {
          mode: 'new',
          title: payload.title,
          desc: payload.desc,
          setAsDefault: payload.setAsDefault,
          isPublic: payload.isPublic,
        }
      : { mode: 'overwrite', selectedTemplateId: payload.selectedId, setAsDefault: payload.setAsDefault };
  if (deleteProjectAfter === true) body.deleteProjectAfter = true;
  const res = await fetchJson<{ templateId: string; setAsDefault?: boolean }>(
    `/api/projects/${projectId}/publish`,
    { method: 'POST', body: JSON.stringify(body) }
  );
  return res;
}

export interface TemplateCatalogItem {
  id: string;
  title: string;
  desc: string | null;
  previewUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  requiredVariableKeys: string[];
}

/** 分页获取模板列表（仅元数据，无 components/config）。默认按更新时间倒序 */
export async function serverListTemplatesCatalog(opts: {
  tab: 'public' | 'mine';
  page: number;
  pageSize: number;
  sortBy?: 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}): Promise<{ data: TemplateCatalogItem[]; total: number; page: number; pageSize: number }> {
  const { tab, page, pageSize, sortBy = 'updated_at', order = 'desc' } = opts;
  const endpoint = tab === 'mine' ? '/api/templates/mine' : '/api/templates';
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, order });
  return fetchJson(`${endpoint}?${q.toString()}`);
}

// ---------- Composites ----------

export async function serverListComposites(): Promise<CompositeComponent[]> {
  const list = await fetchJson<{ id: string; name: string; mode: string; previewUrl: string | null; status: string; sortOrder: number; createdAt: number; updatedAt: number }[]>('/api/composites');
  const full = await Promise.all(list.map((c) => serverGetComposite(c.id)));
  return full.filter((c): c is CompositeComponent => c != null);
}

export async function serverListMyComposites(): Promise<CompositeComponent[]> {
  const list = await fetchJson<{ id: string; name: string; mode: string; previewUrl: string | null; status: string; sortOrder: number; createdAt: number; updatedAt: number }[]>('/api/composites/mine');
  const full = await Promise.all(list.map((c) => serverGetComposite(c.id)));
  return full.filter((c): c is CompositeComponent => c != null);
}

export async function serverGetComposite(id: string): Promise<CompositeComponent | null> {
  try {
    const row = await fetchJson<{
      id: string;
      name: string;
      mode: string;
      component: unknown;
      businessForm: unknown;
      previewDataUrl: string | null;
      status: string;
      sortOrder: number;
      createdAt: number;
      updatedAt: number;
    }>(`/api/composites/${id}`);
    return {
      id: row.id,
      name: row.name,
      mode: row.mode as CompositeComponent['mode'],
      component: row.component as CompositeComponent['component'],
      businessForm: row.businessForm as CompositeComponent['businessForm'],
      previewDataUrl: buildPreviewDataUrl(row.previewDataUrl),
      status: row.status as CompositeComponent['status'],
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function serverAddComposite(
  composite: CompositeComponent,
  previewDataUrl?: string,
  isPublic?: boolean
): Promise<void> {
  const preview = normalizePreviewDataUrlForSave(previewDataUrl ?? composite.previewDataUrl ?? '');
  await fetchJson('/api/composites', {
    method: 'POST',
    body: JSON.stringify({
      id: composite.id,
      name: composite.name,
      mode: composite.mode,
      component: composite.component,
      businessForm: composite.businessForm,
      previewDataUrl: preview,
      status: composite.status,
      sortOrder: composite.sortOrder,
      createdAt: composite.createdAt,
      updatedAt: composite.updatedAt,
      isPublic: isPublic === true,
    }),
  });
}

export async function serverUpdateComposite(
  id: string,
  composite: CompositeComponent,
  previewDataUrl?: string,
  isPublic?: boolean
): Promise<void> {
  const preview = normalizePreviewDataUrlForSave(previewDataUrl ?? composite.previewDataUrl ?? '');
  await fetchJson(`/api/composites/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      id: composite.id,
      name: composite.name,
      mode: composite.mode,
      component: composite.component,
      businessForm: composite.businessForm,
      previewDataUrl: preview,
      status: composite.status,
      sortOrder: composite.sortOrder,
      createdAt: composite.createdAt,
      updatedAt: composite.updatedAt,
      isPublic: isPublic,
    }),
  });
}

export async function serverSoftDeleteComposite(id: string): Promise<void> {
  await fetchJson(`/api/composites/${id}`, { method: 'DELETE' });
}

// ---------- Gmail OAuth ----------

export interface GmailAccount {
  id: string;
  gmailAddress: string;
  createdAt: number;
  updatedAt: number;
}

export async function serverListGmailAccounts(): Promise<{ accounts: GmailAccount[]; lastSelectedGmailId: string | null }> {
  return fetchJson<{ accounts: GmailAccount[]; lastSelectedGmailId: string | null }>('/api/gmail/accounts');
}

/** 回传 Gmail OAuth 连接 URL（带 JWT token 作为 query param，因为 OAuth 重定向不带 header） */
export function getGmailConnectUrl(): string {
  const base = getBaseUrl();
  const token = getAuthToken();
  return `${base}/api/gmail/connect${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

/** 轮询授权结果（主页开弹窗后轮询，弹窗关闭则停止） */
export async function serverGetGmailOAuthPending(): Promise<{
  status: 'pending' | 'completed' | 'error';
  email?: string;
  errorCode?: string;
}> {
  return fetchJson('/api/gmail/oauth-pending');
}

export async function serverDisconnectGmailAccount(id: string): Promise<void> {
  await fetchJson(`/api/gmail/accounts/${id}`, { method: 'DELETE' });
}

export async function serverSetLastGmailAccount(gmailId: string | null): Promise<void> {
  await fetchJson('/api/gmail/accounts/last', {
    method: 'PUT',
    body: JSON.stringify({ gmailId }),
  });
}

export async function serverSendEmail(payload: {
  gmailAccountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  htmlBody: string;
}): Promise<void> {
  await fetchJson('/api/gmail/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ---------- Chat ----------

export type ChatStreamEvent =
  | { type: 'conversation.started'; conversationId: string; schemaVersion: 1 }
  | { type: 'conversation.title.updated'; conversationId: string; title: string; schemaVersion: 1 }
  | { type: 'assistant.placeholder'; messageId: string; schemaVersion: 1 }
  | { type: 'assistant.think.delta'; messageId: string; delta: string; schemaVersion: 1 }
  | { type: 'assistant.answer.delta'; messageId: string; delta: string; schemaVersion: 1 }
  | { type: 'tool.call.detected'; toolCallId: string; name: string; args: Record<string, unknown>; schemaVersion: 1 }
  | { type: 'tool.call.running'; toolCallId: string; schemaVersion: 1 }
  | { type: 'tool.call.client_ready'; toolCallId: string; name: string; args: Record<string, unknown>; silent?: boolean; schemaVersion: 1 }
  | { type: 'tool.call.completed'; toolCallId: string; result: Record<string, unknown>; schemaVersion: 1 }
  | { type: 'tool.call.failed'; toolCallId: string; error: string; schemaVersion: 1 }
  | {
      type: 'change.card.created';
      card: {
        id: string;
        summary: string;
        status: 'applied' | 'reverted';
        toolCallId: string;
        targetComponentId?: string;
        beforePatch?: Record<string, unknown>;
        afterPatch?: Record<string, unknown>;
      };
      schemaVersion: 1;
    }
  | { type: 'change.card.state_changed'; cardId: string; status: 'applied' | 'reverted'; schemaVersion: 1 }
  | {
      type: 'conversation.awaiting_tool_results';
      conversationId: string;
      assistantMessageId: string;
      pendingToolCalls: Array<{ toolCallId: string; name: string; args: Record<string, unknown>; silent?: boolean }>;
      reactTurn: number;
      fromCheckRound: boolean;
      planState?: Array<{ index: number; description: string; status: string }>;
      runId?: string;
      /** 当前阶段（如 verification_v7），用于续流路由 */
      phase?: string;
      /** 验证管线工具调用 ID */
      verifyToolCallId?: string;
      schemaVersion: 1;
    }
  | { type: 'assistant.completed'; messageId: string; schemaVersion: 1 }
  | { type: 'error'; message: string; schemaVersion: 1 }
  | { type: 'pipeline.step.started'; step: string; label?: string; schemaVersion: 1 }
  | { type: 'pipeline.step.completed'; step: string; label?: string; schemaVersion: 1 }
  | { type: 'pipeline.step.result'; step: string; output: string; schemaVersion: 1 }
  | { type: 'pipeline.completed'; componentCount: number; schemaVersion: 1 }
  | { type: 'verify.step.started'; step: string; schemaVersion: 1 }
  | { type: 'verify.step.completed'; step: string; schemaVersion: 1 }
  | { type: 'verify.step.result'; step: string; output: string; schemaVersion: 1 }
  | { type: 'verify.completed'; issues: unknown[]; schemaVersion: 1 }
  | { type: 'fix.step.started'; stepIndex: number; totalSteps: number; description: string; componentId?: string; schemaVersion: 1 }
  | { type: 'fix.step.completed'; stepIndex: number; schemaVersion: 1 };

export async function serverCreateConversation(title?: string): Promise<{ id: string }> {
  return fetchJson<{ id: string }>('/api/chat/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
}

export async function serverListConversations(): Promise<{ conversations: ChatConversationSummary[] }> {
  return fetchJson<{ conversations: ChatConversationSummary[] }>('/api/chat/conversations');
}

export async function serverUpdateConversationTitle(conversationId: string, title: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(`/api/chat/conversations/${conversationId}/title`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  });
}

export async function serverListConversationMessages(conversationId: string): Promise<{ messages: unknown[] }> {
  return fetchJson<{ messages: unknown[] }>(`/api/chat/conversations/${conversationId}/messages`);
}

/** 仅当前会话支持撤回；conversationId 为当前会话 ID，与卡片所属会话一致时才允许 */
export async function serverUndoChangeCard(cardId: string, conversationId: string): Promise<{ ok: boolean; status: 'applied' | 'reverted'; ops: unknown[] }> {
  return fetchJson<{ ok: boolean; status: 'applied' | 'reverted'; ops: unknown[] }>(`/api/chat/change-cards/${cardId}/undo`, {
    method: 'POST',
    body: JSON.stringify({ conversationId }),
  });
}

/** 仅当前会话支持恢复；同上 */
export async function serverRedoChangeCard(cardId: string, conversationId: string): Promise<{ ok: boolean; status: 'applied' | 'reverted'; ops: unknown[] }> {
  return fetchJson<{ ok: boolean; status: 'applied' | 'reverted'; ops: unknown[] }>(`/api/chat/change-cards/${cardId}/redo`, {
    method: 'POST',
    body: JSON.stringify({ conversationId }),
  });
}

export interface ChatTemplateComponent {
  id: string;
  type: string;
  label?: string;
  text?: string;
  props?: Record<string, unknown>;
  wrapperSummary?: Record<string, unknown>;
  children?: ChatTemplateComponent[];
}

export interface ChatImageAttachmentPayload {
  name: string;
  mimeType: string;
  dataUrl: string;
}

/** 读取 NDJSON 流响应并逐行分发事件 */
async function parseNdjsonResponse(
  res: Response,
  onEvent: (event: ChatStreamEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!res.body) throw new Error('响应体为空');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  if (signal) {
    signal.addEventListener('abort', () => reader.cancel(), { once: true });
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as ChatStreamEvent;
          const maybePromise = onEvent(event);
          if (maybePromise instanceof Promise) {
            await maybePromise;
          }
        } catch {
          // ignore malformed line or callback error
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return;
    throw err;
  }
}

export async function serverChatStream(
  payload: {
    conversationId?: string;
    message: string;
    templateContext?: { components: ChatTemplateComponent[] };
    attachments?: ChatImageAttachmentPayload[];
    /** 当前会话的执行计划状态，发第二条及后续消息时携带以便后端继续按计划执行 */
    planState?: Array<{ index: number; description: string; status: string }>;
  },
  onEvent: (event: ChatStreamEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/chat/stream`, {
    method: 'POST',
    headers: buildHeaders({ body: JSON.stringify(payload) }),
    body: JSON.stringify(payload),
    signal,
  });
  if (res.status === 401) {
    clearTokenAndNotify();
    throw new Error('请重新登录');
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`聊天请求失败（${res.status}）${text ? `: ${text}` : ''}`);
  }
  await parseNdjsonResponse(res, onEvent, signal);
}

export interface ChatContinueToolResult {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export async function serverContinueChatStream(
  payload: {
    conversationId: string;
    assistantMessageId: string;
    toolResults: ChatContinueToolResult[];
    /** 原始消息中的图片附件，续流时回传以保持 VL 模型与图片上下文 */
    imageAttachments?: ChatImageAttachmentPayload[];
    /** 上次暂停时的 reactTurn，跨 continue 累计轮次 */
    reactTurn?: number;
    /** 上次暂停是否来自检查轮，防止连续触发检查轮 */
    fromCheckRound?: boolean;
    /** 跨 continue 透传的计划状态 */
    planState?: Array<{ index: number; description: string; status: string }>;
    /** 同一次任务链路 ID（由 awaiting_tool_results 下发） */
    runId?: string;
    /** 当前阶段标识（如 verification_v7 / fix_step），用于后端路由 */
    phase?: string;
    /** 验证管线工具调用 ID，供后端在 verification_v7 阶段关联 */
    verifyToolCallId?: string;
    /** fix_step 阶段：当前步骤下标（从原始 allIssues 计）*/
    fixStepIndex?: number;
  },
  onEvent: (event: ChatStreamEvent) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/chat/stream/continue`, {
    method: 'POST',
    headers: buildHeaders({ body: JSON.stringify(payload) }),
    body: JSON.stringify(payload),
    signal,
  });
  if (res.status === 401) {
    clearTokenAndNotify();
    throw new Error('请重新登录');
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`续流请求失败（${res.status}）${text ? `: ${text}` : ''}`);
  }
  await parseNdjsonResponse(res, onEvent, signal);
}

/**
 * 拉取静态资源（如预览图），若为后端 API 地址则自动带鉴权头。
 * 主要用于 <img src> 无法携带 Bearer Token 的场景。
 */
export async function fetchServerAssetBlob(assetUrl: string): Promise<Blob> {
  const url = toAbsoluteAssetUrl(assetUrl);
  const headers: Record<string, string> = {};
  const base = getBaseUrl();
  if (url.startsWith(base)) {
    const token = getAuthToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    headers,
  });
  if (res.status === 401) {
    clearTokenAndNotify();
    throw new Error('请重新登录');
  }
  if (!res.ok) {
    throw new Error(`资源加载失败（${res.status}）`);
  }
  return res.blob();
}

export async function fetchServerAssetObjectUrl(assetUrl: string): Promise<string> {
  const blob = await fetchServerAssetBlob(assetUrl);
  return URL.createObjectURL(blob);
}

// ─── Template Endpoints API ───────────────────────────────────────────────────

export interface TemplateEndpoint {
  id: string;
  templateId: string;
  name: string;
  sourceSchema: import('../utils/parseJsonSchema').SchemaField[];
  fieldMapping: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export async function serverListEndpoints(templateId: string): Promise<TemplateEndpoint[]> {
  return fetchJson<TemplateEndpoint[]>(`/api/templates/${templateId}/endpoints`);
}

export async function serverCreateEndpoint(
  templateId: string,
  data: { name: string; sourceSchema?: unknown[]; fieldMapping?: Record<string, string> }
): Promise<TemplateEndpoint> {
  return fetchJson<TemplateEndpoint>(`/api/templates/${templateId}/endpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function serverUpdateEndpoint(
  templateId: string,
  endpointId: string,
  data: { name?: string; sourceSchema?: unknown[]; fieldMapping?: Record<string, string> }
): Promise<TemplateEndpoint> {
  return fetchJson<TemplateEndpoint>(`/api/templates/${templateId}/endpoints/${endpointId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function serverDeleteEndpoint(templateId: string, endpointId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(`/api/templates/${templateId}/endpoints/${endpointId}`, {
    method: 'DELETE',
  });
}

// ── Phase 3：模板测试发送 ─────────────────────────────────────────────────────

export interface SendTestParams {
  to: string;
  subject: string;
  gmailAccountId: string;
  sampleData?: Record<string, string>;
  arrayData?: Record<string, Record<string, string>[]>;
  shopIntegrationId?: string;
}

export async function serverSendTestEmail(templateId: string, params: SendTestParams): Promise<void> {
  await fetchJson<{ ok: boolean }>(`/api/templates/${templateId}/send-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
}

// ── Phase 4：接入点触发发送 ───────────────────────────────────────────────────

export interface EndpointSendParams {
  to: string;
  subject: string;
  gmailAccountId: string;
  data?: Record<string, unknown>;
  shopIntegrationId?: string;
}

export async function serverEndpointSend(
  templateId: string,
  endpointId: string,
  params: EndpointSendParams
): Promise<void> {
  await fetchJson<{ ok: boolean }>(
    `/api/templates/${templateId}/endpoints/${endpointId}/send`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }
  );
}

// ── Phase 2：接入点渲染（含 Shoplazza 注入） ──────────────────────────────────

export interface EndpointRenderResult {
  html: string;
  mappedData: Record<string, unknown>;
  templateId: string;
  endpointId: string;
}

export async function serverEndpointRender(
  templateId: string,
  endpointId: string,
  params: { data?: Record<string, unknown>; shopIntegrationId?: string }
): Promise<EndpointRenderResult> {
  return fetchJson<EndpointRenderResult>(
    `/api/templates/${templateId}/endpoints/${endpointId}/render`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }
  );
}

// ── Shoplazza 集成状态（用于 TestSendDrawer 店铺选择） ────────────────────────

export interface ShoplazzaIntegrationStatus {
  id: string;
  shopName?: string;
  shopDomain: string;
}

export async function serverGetShoplazzaIntegrations(): Promise<{ shops: ShoplazzaIntegrationStatus[] }> {
  return fetchJson<{ shops: ShoplazzaIntegrationStatus[] }>('/api/integrations/shoplazza/status');
}
