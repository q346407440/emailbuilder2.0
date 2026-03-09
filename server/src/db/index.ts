import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;
const DEFAULT_USER_ID = 'default';

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

/** 通用查詢，供各路由使用（refresh_tokens 等不在標準導出函數中的表） */
export async function queryDb<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(sql, params ?? []);
}

/** 從請求上下文取得 user_id，若未傳則用環境變數或 default（如 seed 腳本） */
export function getUserId(requestUserId?: string | null): string {
  if (requestUserId != null && requestUserId !== '') return requestUserId;
  return process.env.USER_ID ?? DEFAULT_USER_ID;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: number;
  updated_at: number;
  last_selected_shop_id?: string | null;
  default_template_id?: string | null;
  brand_config?: Record<string, unknown> | null;
}

/** 依 email 查詢用戶 */
export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const res = await getPool().query<UserRow>(
    'SELECT id, email, password_hash, display_name, avatar_url, is_admin, created_at, updated_at, default_template_id FROM users WHERE email = $1',
    [email]
  );
  return res.rows[0] ?? null;
}

/** 依 id 查詢用戶（不含密碼可另做 DTO） */
export async function getUserById(id: string): Promise<UserRow | null> {
  const res = await getPool().query<UserRow>(
    'SELECT id, email, password_hash, display_name, avatar_url, is_admin, created_at, updated_at, default_template_id FROM users WHERE id = $1',
    [id]
  );
  return res.rows[0] ?? null;
}

/** 新增用戶 */
export async function createUser(row: UserRow): Promise<void> {
  await getPool().query(
    `INSERT INTO users (id, email, password_hash, display_name, avatar_url, is_admin, created_at, updated_at, default_template_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.id,
      row.email,
      row.password_hash,
      row.display_name ?? null,
      row.avatar_url ?? null,
      row.is_admin ?? false,
      row.created_at,
      row.updated_at,
      row.default_template_id ?? null,
    ]
  );
}

/** 更新顯示名稱與頭像 */
export async function updateUserProfile(
  id: string,
  data: { display_name?: string | null; avatar_url?: string | null }
): Promise<boolean> {
  const now = Date.now();
  const res = await getPool().query(
    `UPDATE users SET display_name = COALESCE($2, display_name), avatar_url = COALESCE($3, avatar_url), updated_at = $4 WHERE id = $1`,
    [id, data.display_name ?? null, data.avatar_url ?? null, now]
  );
  return (res.rowCount ?? 0) > 0;
}

/** 更新密碼 */
export async function updateUserPassword(id: string, passwordHash: string): Promise<boolean> {
  const now = Date.now();
  const res = await getPool().query(
    'UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1',
    [id, passwordHash, now]
  );
  return (res.rowCount ?? 0) > 0;
}

/** 查詢用戶默認模板 id */
export async function getUserDefaultTemplateId(userId: string): Promise<string | null> {
  const res = await getPool().query<{ default_template_id: string | null }>(
    'SELECT default_template_id FROM users WHERE id = $1',
    [userId]
  );
  return res.rows[0]?.default_template_id ?? null;
}

/** 更新用戶默認模板 id（僅更新此欄位） */
export async function updateUserDefaultTemplateId(userId: string, templateId: string | null): Promise<boolean> {
  const res = await getPool().query(
    'UPDATE users SET default_template_id = $2 WHERE id = $1',
    [userId, templateId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** 查詢模板列表（公共：僅 is_public = true，過濾軟刪除） */
export async function listTemplates(): Promise<TemplateRow[]> {
  const res = await getPool().query<TemplateRow>(
    `SELECT id, user_id, title, "desc", components, config, preview_url, is_public,
            created_at, updated_at, required_variable_keys, custom_variables, deleted_at
     FROM email_templates WHERE is_public = true AND deleted_at IS NULL ORDER BY updated_at DESC`
  );
  return res.rows;
}

/** 查詢當前用戶創建的模板列表（過濾軟刪除） */
export async function listTemplatesByUserId(userId: string): Promise<TemplateRow[]> {
  const res = await getPool().query<TemplateRow>(
    `SELECT id, user_id, title, "desc", components, config, preview_url, is_public,
            created_at, updated_at, required_variable_keys, custom_variables, rendering_rules, deleted_at
     FROM email_templates WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
    [userId]
  );
  return res.rows;
}

/** 查詢單一模板（按 id 查詢，不過濾 user_id） */
export async function getTemplate(id: string): Promise<TemplateRow | null> {
  const res = await getPool().query<TemplateRow>(
    `SELECT id, user_id, title, "desc", components, config, preview_url, is_public,
            created_at, updated_at, required_variable_keys, custom_variables, rendering_rules, deleted_at
     FROM email_templates WHERE id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

/** 分頁查詢模板列表（不含 components/config，輕量版）。sortBy: created_at | updated_at，order: asc | desc */
export async function listTemplatesPaginated(opts: {
  userId: string;
  tab: 'public' | 'mine';
  page: number;
  pageSize: number;
  sortBy?: 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}): Promise<{ rows: TemplateRow[]; total: number }> {
  const { userId, tab, page, pageSize, sortBy = 'updated_at', order = 'desc' } = opts;
  const offset = (page - 1) * pageSize;
  const orderCol = sortBy === 'created_at' ? 'created_at' : 'updated_at';
  const orderDir = order === 'asc' ? 'ASC' : 'DESC';

  let where = `deleted_at IS NULL`;
  const params: unknown[] = [];
  if (tab === 'public') {
    where += ` AND is_public = true`;
  } else {
    params.push(userId);
    where += ` AND user_id = $${params.length}`;
  }

  const countRes = await getPool().query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM email_templates WHERE ${where}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

  params.push(pageSize, offset);
  const dataRes = await getPool().query<TemplateRow>(
    `SELECT id, user_id, title, "desc", preview_url, is_public,
            created_at, updated_at, required_variable_keys
     FROM email_templates WHERE ${where}
     ORDER BY ${orderCol} ${orderDir}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: dataRes.rows, total };
}

/** 新增或更新模板（含 required_variable_keys、rendering_rules） */
export async function putTemplate(row: TemplateRow): Promise<void> {
  const requiredVariableKeys = row.required_variable_keys ?? [];
  const customVariables = row.custom_variables ?? [];
  const renderingRules = row.rendering_rules ?? {};
  await getPool().query(
    `INSERT INTO email_templates
       (id, user_id, title, "desc", components, config, preview_url, is_public,
        created_at, updated_at, required_variable_keys, custom_variables, rendering_rules)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       "desc" = EXCLUDED."desc",
       components = EXCLUDED.components,
       config = EXCLUDED.config,
       preview_url = EXCLUDED.preview_url,
       is_public = EXCLUDED.is_public,
       updated_at = EXCLUDED.updated_at,
       required_variable_keys = EXCLUDED.required_variable_keys,
       custom_variables = EXCLUDED.custom_variables,
       rendering_rules = EXCLUDED.rendering_rules`,
    [
      row.id,
      row.user_id,
      row.title,
      row.desc ?? '',
      JSON.stringify(row.components),
      JSON.stringify(row.config),
      row.preview_url ?? null,
      row.is_public ?? false,
      row.created_at,
      row.updated_at,
      JSON.stringify(requiredVariableKeys),
      JSON.stringify(customVariables),
      JSON.stringify(renderingRules),
    ]
  );
}

/** 軟刪除模板（僅創建者可刪除：WHERE user_id = $2） */
export async function deleteTemplate(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE email_templates SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ---------- 工程（email_projects） ----------

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  desc: string | null;
  components: unknown;
  config: unknown;
  custom_variables?: unknown;
  /** Layer 4：渲染規則（動態邏輯字段，從組件樹中獨立出來） */
  rendering_rules?: unknown;
  preview_url: string | null;
  created_at: number;
  updated_at: number;
}

/** 查詢單一工程（按 id，校驗由調用方做） */
export async function getProject(id: string): Promise<ProjectRow | null> {
  const res = await getPool().query<ProjectRow>(
    `SELECT id, user_id, title, "desc", components, config, custom_variables, rendering_rules, preview_url, created_at, updated_at
     FROM email_projects WHERE id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

/** 查詢當前用戶的工程列表（按 updated_at 倒序） */
export async function listProjectsByUserId(userId: string): Promise<ProjectRow[]> {
  const res = await getPool().query<ProjectRow>(
    `SELECT id, user_id, title, "desc", components, config, custom_variables, rendering_rules, preview_url, created_at, updated_at
     FROM email_projects WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return res.rows;
}

/** 新增或更新工程（含 rendering_rules） */
export async function putProject(row: ProjectRow): Promise<void> {
  const customVariables = row.custom_variables ?? [];
  const renderingRules = row.rendering_rules ?? {};
  await getPool().query(
    `INSERT INTO email_projects (id, user_id, title, "desc", components, config, custom_variables, rendering_rules, preview_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       "desc" = EXCLUDED."desc",
       components = EXCLUDED.components,
       config = EXCLUDED.config,
       custom_variables = EXCLUDED.custom_variables,
       rendering_rules = EXCLUDED.rendering_rules,
       preview_url = EXCLUDED.preview_url,
       updated_at = EXCLUDED.updated_at`,
    [
      row.id,
      row.user_id,
      row.title,
      row.desc ?? '',
      JSON.stringify(row.components),
      JSON.stringify(row.config),
      JSON.stringify(customVariables),
      JSON.stringify(renderingRules),
      row.preview_url ?? null,
      row.created_at,
      row.updated_at,
    ]
  );
}

/** 刪除工程（僅創建者可刪除） */
export async function deleteProject(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `DELETE FROM email_projects WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** 查詢複合組件列表（公共：僅 is_public = true 且 status = active） */
export async function listComposites(): Promise<CompositeRow[]> {
  const res = await getPool().query<CompositeRow>(
    `SELECT id, user_id, name, mode, component, business_form, preview_url, status, sort_order, is_public, created_at, updated_at
     FROM composite_components WHERE is_public = true AND status = 'active' ORDER BY sort_order ASC, updated_at DESC`
  );
  return res.rows;
}

/** 查詢當前用戶創建的複合組件列表（僅 active） */
export async function listCompositesByUserId(userId: string): Promise<CompositeRow[]> {
  const res = await getPool().query<CompositeRow>(
    `SELECT id, user_id, name, mode, component, business_form, preview_url, status, sort_order, is_public, created_at, updated_at
     FROM composite_components WHERE user_id = $1 AND status = 'active' ORDER BY sort_order ASC, updated_at DESC`,
    [userId]
  );
  return res.rows;
}

/** 查詢單一複合組件（公共：按 id 查詢，不按 user_id 過濾） */
export async function getComposite(id: string): Promise<CompositeRow | null> {
  const res = await getPool().query<CompositeRow>(
    `SELECT id, user_id, name, mode, component, business_form, preview_url, status, sort_order, is_public, created_at, updated_at
     FROM composite_components WHERE id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

/** 新增或更新複合組件 */
export async function putComposite(row: CompositeRow): Promise<void> {
  await getPool().query(
    `INSERT INTO composite_components (id, user_id, name, mode, component, business_form, preview_url, status, sort_order, is_public, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, mode = EXCLUDED.mode, component = EXCLUDED.component,
       business_form = EXCLUDED.business_form, preview_url = EXCLUDED.preview_url,
       status = EXCLUDED.status, sort_order = EXCLUDED.sort_order, is_public = EXCLUDED.is_public, updated_at = EXCLUDED.updated_at`,
    [
      row.id,
      row.user_id,
      row.name,
      row.mode,
      JSON.stringify(row.component),
      row.business_form ? JSON.stringify(row.business_form) : null,
      row.preview_url ?? null,
      row.status,
      row.sort_order,
      row.is_public ?? false,
      row.created_at,
      row.updated_at,
    ]
  );
}

/** 軟刪除複合組件（僅創建者可刪除：WHERE user_id = $3） */
export async function softDeleteComposite(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE composite_components SET status = 'deleted', updated_at = $2 WHERE id = $1 AND user_id = $3`,
    [id, Date.now(), userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export interface TemplateRow {
  id: string;
  user_id: string;
  title: string;
  desc: string | null;
  components: unknown;
  config: unknown;
  preview_url: string | null;
  is_public: boolean;
  created_at: number;
  updated_at: number;
  /** 模板綁定的變量 key 列表（Iteration 1 新增） */
  required_variable_keys?: unknown;
  /** 模板级自定义变量定义（Iteration 2 新增） */
  custom_variables?: unknown;
  /** Layer 4：渲染規則（動態邏輯字段，從組件樹中獨立出來） */
  rendering_rules?: unknown;
  /** 軟刪除時間戳（Iteration 1 新增） */
  deleted_at?: string | null;
}

export interface CompositeRow {
  id: string;
  user_id: string;
  name: string;
  mode: string;
  component: unknown;
  business_form: unknown;
  preview_url: string | null;
  status: string;
  sort_order: number;
  is_public: boolean;
  created_at: number;
  updated_at: number;
}

// ---------- 店鋪授權（Shoplazza） ----------

export interface ShopAuthorizationRow {
  id: string;
  user_id: string;
  domain: string;
  token: string;
  shop_id: string;
  shop_name: string;
  shop_url: string | null;
  created_at: number;
}

/** 列表用 DTO，不含 token */
export interface ShopAuthorizationDto {
  id: string;
  user_id: string;
  domain: string;
  shop_id: string;
  shop_name: string;
  shop_url: string | null;
  created_at: number;
}

export async function listShopAuthorizationsByUserId(userId: string): Promise<ShopAuthorizationDto[]> {
  const res = await getPool().query<ShopAuthorizationDto>(
    `SELECT id, user_id, domain, shop_id, shop_name, shop_url, created_at
     FROM shop_authorizations WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function getShopAuthorizationById(id: string, userId: string): Promise<ShopAuthorizationRow | null> {
  const res = await getPool().query<ShopAuthorizationRow>(
    `SELECT id, user_id, domain, token, shop_id, shop_name, shop_url, created_at
     FROM shop_authorizations WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function getShopAuthorizationByUserAndDomain(
  userId: string,
  domain: string
): Promise<ShopAuthorizationDto | null> {
  const res = await getPool().query<ShopAuthorizationDto>(
    `SELECT id, user_id, domain, shop_id, shop_name, shop_url, created_at
     FROM shop_authorizations WHERE user_id = $1 AND domain = $2`,
    [userId, domain]
  );
  return res.rows[0] ?? null;
}

export async function createOrUpdateShopAuthorization(row: ShopAuthorizationRow): Promise<void> {
  await getPool().query(
    `INSERT INTO shop_authorizations (id, user_id, domain, token, shop_id, shop_name, shop_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, domain) DO UPDATE SET
       token = EXCLUDED.token, shop_id = EXCLUDED.shop_id, shop_name = EXCLUDED.shop_name, shop_url = EXCLUDED.shop_url`,
    [
      row.id,
      row.user_id,
      row.domain,
      row.token,
      row.shop_id,
      row.shop_name,
      row.shop_url ?? null,
      row.created_at,
    ]
  );
}

export async function getUserLastSelectedShopId(userId: string): Promise<string | null> {
  const res = await getPool().query<{ last_selected_shop_id: string | null }>(
    'SELECT last_selected_shop_id FROM users WHERE id = $1',
    [userId]
  );
  return res.rows[0]?.last_selected_shop_id ?? null;
}

export async function updateUserLastSelectedShopId(userId: string, shopId: string | null): Promise<boolean> {
  const res = await getPool().query(
    'UPDATE users SET last_selected_shop_id = $2 WHERE id = $1',
    [userId, shopId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteShopAuthorization(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    'DELETE FROM shop_authorizations WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ---------- Gmail OAuth 授權 ----------

export interface GmailAuthorizationRow {
  id: string;
  user_id: string;
  gmail_address: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expiry: number;
  created_at: number;
  updated_at: number;
}

export interface GmailAuthorizationDto {
  id: string;
  user_id: string;
  gmail_address: string;
  created_at: number;
  updated_at: number;
}

export async function listGmailAuthorizationsByUserId(userId: string): Promise<GmailAuthorizationDto[]> {
  const res = await getPool().query<GmailAuthorizationDto>(
    `SELECT id, user_id, gmail_address, created_at, updated_at
     FROM gmail_authorizations WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function getGmailAuthorizationById(id: string, userId: string): Promise<GmailAuthorizationRow | null> {
  const res = await getPool().query<GmailAuthorizationRow>(
    `SELECT id, user_id, gmail_address, access_token_enc, refresh_token_enc, token_expiry, created_at, updated_at
     FROM gmail_authorizations WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function createOrUpdateGmailAuthorization(row: GmailAuthorizationRow): Promise<void> {
  await getPool().query(
    `INSERT INTO gmail_authorizations (id, user_id, gmail_address, access_token_enc, refresh_token_enc, token_expiry, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, gmail_address) DO UPDATE SET
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       token_expiry = EXCLUDED.token_expiry,
       updated_at = EXCLUDED.updated_at`,
    [
      row.id,
      row.user_id,
      row.gmail_address,
      row.access_token_enc,
      row.refresh_token_enc,
      row.token_expiry,
      row.created_at,
      row.updated_at,
    ]
  );
}

export async function deleteGmailAuthorization(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    'DELETE FROM gmail_authorizations WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getUserLastSelectedGmailId(userId: string): Promise<string | null> {
  const res = await getPool().query<{ last_selected_gmail_id: string | null }>(
    'SELECT last_selected_gmail_id FROM users WHERE id = $1',
    [userId]
  );
  return res.rows[0]?.last_selected_gmail_id ?? null;
}

export async function updateUserLastSelectedGmailId(userId: string, gmailId: string | null): Promise<boolean> {
  const res = await getPool().query(
    'UPDATE users SET last_selected_gmail_id = $2 WHERE id = $1',
    [userId, gmailId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ---------- Chat Conversations ----------

export interface ChatConversationRow {
  id: string;
  user_id: string;
  title: string;
  status: string;
  pipeline_completed?: boolean;
  created_at: number;
  updated_at: number;
  last_message_at: number;
}

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  business_role: string;
  source_type: string;
  react_turn: number;
  content: string;
  think_content: string | null;
  tool_calls: unknown[] | null;
  tool_name: string | null;
  tool_call_id: string | null;
  tool_status: string | null;
  created_at: number;
}

export interface ChatChangeCardRow {
  id: string;
  conversation_id: string;
  user_id: string;
  assistant_message_id: string;
  tool_call_id: string | null;
  template_id: string | null;
  summary: string;
  status: 'applied' | 'reverted';
  created_at: number;
  updated_at: number;
}

export interface ChatChangeOpRow {
  id: string;
  change_card_id: string;
  op_index: number;
  target_component_id: string | null;
  action_type: string;
  before_patch: unknown;
  after_patch: unknown;
  created_at: number;
}

export async function createChatConversation(row: ChatConversationRow): Promise<void> {
  await getPool().query(
    `INSERT INTO chat_conversations (id, user_id, title, status, created_at, updated_at, last_message_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [row.id, row.user_id, row.title, row.status, row.created_at, row.updated_at, row.last_message_at]
  );
}

export async function getChatConversationById(id: string, userId: string): Promise<ChatConversationRow | null> {
  const res = await getPool().query<ChatConversationRow>(
    `SELECT id, user_id, title, status, created_at, updated_at, last_message_at
     FROM chat_conversations WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function listChatConversations(userId: string, limit = 100): Promise<ChatConversationRow[]> {
  const res = await getPool().query<ChatConversationRow>(
    `SELECT id, user_id, title, status, created_at, updated_at, last_message_at
     FROM chat_conversations
     WHERE user_id = $1
     ORDER BY last_message_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

export async function updateChatConversationTitle(
  id: string,
  userId: string,
  title: string,
  updatedAt = Date.now()
): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE chat_conversations
     SET title = $3, updated_at = $4
     WHERE id = $1 AND user_id = $2`,
    [id, userId, title, updatedAt]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function touchChatConversation(id: string, userId: string, at: number): Promise<void> {
  await getPool().query(
    `UPDATE chat_conversations SET updated_at = $3, last_message_at = $3 WHERE id = $1 AND user_id = $2`,
    [id, userId, at]
  );
}

/** Fix-1: 标记会话 pipeline 已完成（幂等，重复调用无害） */
export async function markConversationPipelineCompleted(
  conversationId: string,
  userId: string
): Promise<void> {
  await getPool().query(
    `UPDATE chat_conversations
     SET pipeline_completed = TRUE, updated_at = $3
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId, Date.now()]
  );
}

/** Fix-1: 读取会话 pipeline 是否完成 */
export async function getConversationPipelineCompleted(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const res = await getPool().query<{ pipeline_completed: boolean }>(
    `SELECT pipeline_completed FROM chat_conversations
     WHERE id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return res.rows[0]?.pipeline_completed ?? false;
}

export async function insertChatMessage(row: ChatMessageRow): Promise<void> {
  await getPool().query(
    `INSERT INTO chat_messages (
      id, conversation_id, user_id, role, business_role, source_type, react_turn, content, think_content,
      tool_calls, tool_name, tool_call_id, tool_status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      row.id,
      row.conversation_id,
      row.user_id,
      row.role,
      row.business_role,
      row.source_type,
      row.react_turn,
      row.content,
      row.think_content,
      row.tool_calls != null ? JSON.stringify(row.tool_calls) : null,
      row.tool_name,
      row.tool_call_id,
      row.tool_status,
      row.created_at,
    ]
  );
}

/** 倒序取最近 N 条；调用方可在内存 reverse 还原为正序 */
/** 检查某个 toolCallId 是否已在该会话中入库（用于 /stream/continue 幂等去重） */
export async function chatMessageExistsByToolCallId(conversationId: string, toolCallId: string): Promise<boolean> {
  const res = await getPool().query(
    `SELECT 1 FROM chat_messages WHERE conversation_id = $1 AND tool_call_id = $2 LIMIT 1`,
    [conversationId, toolCallId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getLatestUserDirectMessage(conversationId: string, userId: string): Promise<ChatMessageRow | null> {
  const res = await getPool().query<ChatMessageRow>(
    `SELECT id, conversation_id, user_id, role, business_role, source_type, react_turn, content, think_content,
            tool_calls, tool_name, tool_call_id, tool_status, created_at
     FROM chat_messages
     WHERE conversation_id = $1 AND user_id = $2 AND source_type = 'user_direct'
     ORDER BY created_at DESC
     LIMIT 1`,
    [conversationId, userId]
  );
  return res.rows[0] ?? null;
}

/** 取最近 K 条 source_type='user_direct' 的消息，返回时间正序（最早的在前） */
export async function listRecentUserDirectMessages(
  conversationId: string,
  userId: string,
  limit: number
): Promise<ChatMessageRow[]> {
  const res = await getPool().query<ChatMessageRow>(
    `SELECT id, conversation_id, user_id, role, business_role, source_type, react_turn, content, think_content,
            tool_calls, tool_name, tool_call_id, tool_status, created_at
     FROM chat_messages
     WHERE conversation_id = $1 AND user_id = $2 AND source_type = 'user_direct'
     ORDER BY created_at DESC
     LIMIT $3`,
    [conversationId, userId, limit]
  );
  return res.rows.reverse();
}

export async function listRecentChatMessages(
  conversationId: string,
  userId: string,
  limit: number,
  options?: { skipEmptyAssistant?: boolean }
): Promise<ChatMessageRow[]> {
  const skipEmpty = options?.skipEmptyAssistant ?? false;
  const res = await getPool().query<ChatMessageRow>(
    `SELECT id, conversation_id, user_id, role, business_role, source_type, react_turn, content, think_content,
            tool_calls, tool_name, tool_call_id, tool_status, created_at
     FROM chat_messages
     WHERE conversation_id = $1 AND user_id = $2
       ${skipEmpty ? `AND NOT (role = 'assistant' AND (content IS NULL OR content = ''))` : ''}
     ORDER BY created_at DESC
     LIMIT $3`,
    [conversationId, userId, limit]
  );
  return res.rows;
}

export async function createChatChangeCard(row: ChatChangeCardRow): Promise<void> {
  await getPool().query(
    `INSERT INTO chat_change_cards (
      id, conversation_id, user_id, assistant_message_id, tool_call_id, template_id, summary, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      row.id,
      row.conversation_id,
      row.user_id,
      row.assistant_message_id,
      row.tool_call_id ?? null,
      row.template_id,
      row.summary,
      row.status,
      row.created_at,
      row.updated_at,
    ]
  );
}

export async function getChatChangeCardById(id: string, userId: string): Promise<ChatChangeCardRow | null> {
  const res = await getPool().query<ChatChangeCardRow>(
    `SELECT id, conversation_id, user_id, assistant_message_id, tool_call_id, template_id, summary, status, created_at, updated_at
     FROM chat_change_cards WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function updateChatChangeCardStatus(
  id: string,
  userId: string,
  status: ChatChangeCardRow['status'],
  updatedAt: number
): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE chat_change_cards SET status = $3, updated_at = $4
     WHERE id = $1 AND user_id = $2`,
    [id, userId, status, updatedAt]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function insertChatChangeOps(rows: ChatChangeOpRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders = rows
    .map((row, idx) => {
      const base = idx * 8;
      values.push(
        row.id,
        row.change_card_id,
        row.op_index,
        row.target_component_id,
        row.action_type,
        row.before_patch == null ? null : JSON.stringify(row.before_patch),
        row.after_patch == null ? null : JSON.stringify(row.after_patch),
        row.created_at
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
    })
    .join(', ');

  await getPool().query(
    `INSERT INTO chat_change_ops (
      id, change_card_id, op_index, target_component_id, action_type, before_patch, after_patch, created_at
    ) VALUES ${placeholders}`,
    values
  );
}

export async function listChatChangeOps(changeCardId: string): Promise<ChatChangeOpRow[]> {
  const res = await getPool().query<ChatChangeOpRow>(
    `SELECT id, change_card_id, op_index, target_component_id, action_type, before_patch, after_patch, created_at
     FROM chat_change_ops
     WHERE change_card_id = $1
     ORDER BY op_index ASC`,
    [changeCardId]
  );
  return res.rows;
}

/** 会话下所有改动卡片，并带上每张卡的第一条 op（用于历史消息里展示 changeCard） */
export interface ChatChangeCardWithOpRow extends ChatChangeCardRow {
  target_component_id: string | null;
  before_patch: unknown;
  after_patch: unknown;
}

// ---------- 图片本地库（image_library） ----------

export interface ImageLibraryRow {
  id: number;
  pexels_photo_id: number;
  url: string;
  alt: string;
  photographer: string;
  orientation: string;
  search_keywords: string[];
  status: 'pending' | 'available' | 'unavailable';
  last_verified_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * 插入或更新图片库记录。
 * 若 pexels_photo_id 已存在，则合并 search_keywords（去重）并更新 updated_at。
 */
export async function upsertImageLibraryEntry(
  photo: {
    pexels_photo_id: number;
    url: string;
    alt: string;
    photographer: string;
    orientation: string;
  },
  keywords: string[],
): Promise<number> {
  const now = Date.now();
  const res = await getPool().query<{ id: number }>(
    `INSERT INTO image_library (pexels_photo_id, url, alt, photographer, orientation, search_keywords, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $7)
     ON CONFLICT (pexels_photo_id) DO UPDATE SET
       search_keywords = ARRAY(SELECT DISTINCT unnest(image_library.search_keywords || EXCLUDED.search_keywords)),
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [
      photo.pexels_photo_id,
      photo.url,
      photo.alt,
      photo.photographer,
      photo.orientation,
      keywords,
      now,
    ],
  );
  return res.rows[0].id;
}

/**
 * 按关键词数组在本地库中搜索可用图片（status=available）。
 * 使用数组交集（&&）匹配，随机返回一张；可选按 orientation 过滤。
 */
export async function findImageInLibrary(
  keywords: string[],
  orientation?: string,
): Promise<ImageLibraryRow | null> {
  if (keywords.length === 0) return null;

  const params: unknown[] = [keywords];
  let orientationClause = '';
  if (orientation) {
    params.push(orientation);
    orientationClause = `AND orientation = $${params.length}`;
  }

  const res = await getPool().query<ImageLibraryRow>(
    `SELECT id, pexels_photo_id, url, alt, photographer, orientation, search_keywords, status, last_verified_at, created_at, updated_at
     FROM image_library
     WHERE status = 'available'
       AND search_keywords && $1
       ${orientationClause}
     ORDER BY RANDOM()
     LIMIT 1`,
    params,
  );
  return res.rows[0] ?? null;
}

/**
 * 更新图片的可用状态（available / unavailable）及验证时间戳。
 */
export async function markImageStatus(
  id: number,
  status: 'available' | 'unavailable',
): Promise<void> {
  const now = Date.now();
  await getPool().query(
    `UPDATE image_library SET status = $2, last_verified_at = $3, updated_at = $3 WHERE id = $1`,
    [id, status, now],
  );
}

/**
 * 兜底：从所有可用图片中随机取一张。
 * 优先匹配 orientation，若无则不限 orientation。
 */
export async function getRandomAvailableImage(
  orientation?: string,
): Promise<ImageLibraryRow | null> {
  // 优先按 orientation 取
  if (orientation) {
    const res = await getPool().query<ImageLibraryRow>(
      `SELECT id, pexels_photo_id, url, alt, photographer, orientation, search_keywords, status, last_verified_at, created_at, updated_at
       FROM image_library
       WHERE status = 'available' AND orientation = $1
       ORDER BY RANDOM()
       LIMIT 1`,
      [orientation],
    );
    if (res.rows.length > 0) return res.rows[0];
  }

  // 降级：不限 orientation
  const res = await getPool().query<ImageLibraryRow>(
    `SELECT id, pexels_photo_id, url, alt, photographer, orientation, search_keywords, status, last_verified_at, created_at, updated_at
     FROM image_library
     WHERE status = 'available'
     ORDER BY RANDOM()
     LIMIT 1`,
  );
  return res.rows[0] ?? null;
}

export async function listChangeCardsForConversation(
  conversationId: string,
  userId: string
): Promise<ChatChangeCardWithOpRow[]> {
  const res = await getPool().query<ChatChangeCardWithOpRow>(
    `SELECT c.id, c.conversation_id, c.user_id, c.assistant_message_id, c.tool_call_id, c.template_id, c.summary, c.status, c.created_at, c.updated_at,
            o.target_component_id, o.before_patch, o.after_patch
     FROM chat_change_cards c
     LEFT JOIN LATERAL (
       SELECT target_component_id, before_patch, after_patch
       FROM chat_change_ops
       WHERE change_card_id = c.id
       ORDER BY op_index ASC
       LIMIT 1
     ) o ON true
     WHERE c.conversation_id = $1 AND c.user_id = $2
     ORDER BY c.created_at ASC`,
    [conversationId, userId]
  );
  return res.rows;
}

// ---------- 验证管线持久化（verify_context / verification_result） ----------

/** 保存验证上下文到 chat_conversations.verify_context（幂等覆盖） */
export async function saveVerifyContext(
  conversationId: string,
  userId: string,
  ctx: unknown,
): Promise<void> {
  await getPool().query(
    `UPDATE chat_conversations SET verify_context = $1, updated_at = $2 WHERE id = $3 AND user_id = $4`,
    [JSON.stringify(ctx), Date.now(), conversationId, userId],
  );
}

/** 读取验证上下文 */
export async function getVerifyContext(
  conversationId: string,
  userId: string,
): Promise<unknown | null> {
  const res = await getPool().query<{ verify_context: unknown }>(
    `SELECT verify_context FROM chat_conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  return res.rows[0]?.verify_context ?? null;
}

/** 保存验证结果（V1-V6 或全部 V1-V7） */
export async function saveVerificationResult(
  conversationId: string,
  userId: string,
  result: unknown,
): Promise<void> {
  await getPool().query(
    `UPDATE chat_conversations SET verification_result = $1, updated_at = $2 WHERE id = $3 AND user_id = $4`,
    [JSON.stringify(result), Date.now(), conversationId, userId],
  );
}

/** 读取验证结果 */
export async function getVerificationResult(
  conversationId: string,
  userId: string,
): Promise<unknown | null> {
  const res = await getPool().query<{ verification_result: unknown }>(
    `SELECT verification_result FROM chat_conversations WHERE id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  return res.rows[0]?.verification_result ?? null;
}

// ─── Shop Integrations (Iteration 2) ─────────────────────────────────────────

export interface ShopIntegrationRow {
  id: string;
  user_id: string;
  platform: string;
  shop_domain: string;
  shop_name: string | null;
  access_token: string;  // encrypted
  webhook_secret: string | null;  // encrypted
  subscribed_topics: unknown;
  status: string;
  last_synced_at: string | null;
  connected_at: string;
}

export async function upsertShopIntegration(row: ShopIntegrationRow): Promise<void> {
  await getPool().query(
    `INSERT INTO shop_integrations
       (id, user_id, platform, shop_domain, shop_name, access_token, webhook_secret,
        subscribed_topics, status, last_synced_at, connected_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (platform, shop_domain) DO UPDATE SET
       user_id           = EXCLUDED.user_id,
       shop_name         = EXCLUDED.shop_name,
       access_token      = EXCLUDED.access_token,
       webhook_secret    = EXCLUDED.webhook_secret,
       subscribed_topics = EXCLUDED.subscribed_topics,
       status            = EXCLUDED.status,
       last_synced_at    = EXCLUDED.last_synced_at,
       connected_at      = EXCLUDED.connected_at`,
    [
      row.id, row.user_id, row.platform, row.shop_domain, row.shop_name,
      row.access_token, row.webhook_secret,
      JSON.stringify(row.subscribed_topics ?? []),
      row.status, row.last_synced_at, row.connected_at,
    ]
  );
}

export async function getShopIntegrationByUserAndDomain(
  userId: string,
  domain: string
): Promise<ShopIntegrationRow | null> {
  const res = await getPool().query<ShopIntegrationRow>(
    `SELECT * FROM shop_integrations WHERE user_id = $1 AND shop_domain = $2 AND status = 'active' LIMIT 1`,
    [userId, domain]
  );
  return res.rows[0] ?? null;
}

export async function getActiveShopIntegrationByUserId(userId: string): Promise<ShopIntegrationRow | null> {
  const res = await getPool().query<ShopIntegrationRow>(
    `SELECT * FROM shop_integrations WHERE user_id = $1 AND status = 'active' ORDER BY connected_at DESC LIMIT 1`,
    [userId]
  );
  return res.rows[0] ?? null;
}

/** 當前用戶所有已連接店鋪（多店鋪架構） */
export async function getActiveShopIntegrationsByUserId(userId: string): Promise<ShopIntegrationRow[]> {
  const res = await getPool().query<ShopIntegrationRow>(
    `SELECT * FROM shop_integrations WHERE user_id = $1 AND status = 'active' ORDER BY connected_at DESC`,
    [userId]
  );
  return res.rows ?? [];
}

export async function getShopIntegrationById(id: string): Promise<ShopIntegrationRow | null> {
  const res = await getPool().query<ShopIntegrationRow>(
    `SELECT * FROM shop_integrations WHERE id = $1 AND status = 'active' LIMIT 1`,
    [id]
  );
  return res.rows[0] ?? null;
}

/** 按 id 查詢店鋪整合（不限制 status），用於區分「已斷開」與「不存在」 */
export async function getShopIntegrationByIdAllowAnyStatus(id: string): Promise<ShopIntegrationRow | null> {
  const res = await getPool().query<ShopIntegrationRow>(
    `SELECT * FROM shop_integrations WHERE id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function getShopIntegrationByDomain(domain: string): Promise<ShopIntegrationRow | null> {
  const res = await getPool().query<ShopIntegrationRow>(
    `SELECT * FROM shop_integrations WHERE shop_domain = $1 AND status = 'active' LIMIT 1`,
    [domain]
  );
  return res.rows[0] ?? null;
}

export async function updateShopIntegrationStatus(
  id: string,
  status: string,
  clearToken = false
): Promise<void> {
  if (clearToken) {
    await getPool().query(
      `UPDATE shop_integrations SET status = $2, access_token = '', webhook_secret = NULL WHERE id = $1`,
      [id, status]
    );
  } else {
    await getPool().query(`UPDATE shop_integrations SET status = $2 WHERE id = $1`, [id, status]);
  }
}

export async function updateShopIntegrationLastSynced(id: string): Promise<void> {
  await getPool().query(`UPDATE shop_integrations SET last_synced_at = NOW() WHERE id = $1`, [id]);
}

export async function updateShopIntegrationTopics(id: string, topics: string[]): Promise<void> {
  await getPool().query(
    `UPDATE shop_integrations SET subscribed_topics = $2 WHERE id = $1`,
    [id, JSON.stringify(topics)]
  );
}

/** 将店铺整合的归属改为指定用户（用于修复「孤儿」整合：原 user_id 在 users 中不存在时） */
export async function updateShopIntegrationUserId(integrationId: string, newUserId: string): Promise<void> {
  await getPool().query(
    `UPDATE shop_integrations SET user_id = $2 WHERE id = $1`,
    [integrationId, newUserId]
  );
}

export async function countContactsByUserId(userId: string): Promise<number> {
  const res = await getPool().query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM contacts WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return parseInt(res.rows[0]?.count ?? '0', 10);
}

// ─── Webhook Events (Iteration 2) ────────────────────────────────────────────

export async function insertWebhookEvent(row: {
  id: string; topic: string; shop_domain: string; payload: unknown;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO webhook_events (id, topic, shop_domain, payload)
     VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
    [row.id, row.topic, row.shop_domain, JSON.stringify(row.payload)]
  );
}

export async function markWebhookProcessed(id: string, error?: string): Promise<void> {
  await getPool().query(
    `UPDATE webhook_events SET status = $2, error = $3, processed_at = NOW() WHERE id = $1`,
    [id, error ? 'failed' : 'processed', error ?? null]
  );
}

// ─── Contacts (Iteration 2, extended in Iter-3) ───────────────────────────────

export async function upsertContact(row: {
  user_id: string; email: string; name?: string | null;
  shoplazza_customer_id?: string | null; source?: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO contacts (user_id, email, name, shoplazza_customer_id, source, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, email) DO UPDATE SET
       name                  = COALESCE(EXCLUDED.name, contacts.name),
       shoplazza_customer_id = COALESCE(EXCLUDED.shoplazza_customer_id, contacts.shoplazza_customer_id),
       updated_at            = NOW()`,
    [
      row.user_id, row.email, row.name ?? null,
      row.shoplazza_customer_id ?? null,
      row.source ?? 'shoplazza_sync',
    ]
  );
}

// ─── Abandoned Checkouts (Iteration 2) ───────────────────────────────────────

export async function upsertAbandonedCheckout(row: {
  id: string; shop_domain: string; user_id: string;
  cart_data?: unknown; trigger_at?: Date;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO abandoned_checkouts (id, shop_domain, user_id, cart_data, trigger_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.shop_domain, row.user_id, JSON.stringify(row.cart_data ?? {}), row.trigger_at ?? null]
  );
}

export async function markCheckoutConverted(checkoutId: string): Promise<void> {
  await getPool().query(
    `UPDATE abandoned_checkouts SET status = 'converted', converted_at = NOW() WHERE id = $1`,
    [checkoutId]
  );
}

// ─── Contacts CRUD (Iteration 3) ─────────────────────────────────────────────

export interface ContactRow {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  shoplazza_customer_id: string | null;
  custom_fields: unknown;
  unsubscribe_token: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listContacts(opts: {
  userId: string;
  search?: string;
  status?: string;
  segmentId?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: ContactRow[]; total: number }> {
  const { userId, search, status, segmentId, page, pageSize } = opts;
  const params: unknown[] = [userId];
  const conditions: string[] = [`c.user_id = $1`, `c.deleted_at IS NULL`];

  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(c.email ILIKE $${params.length} OR c.name ILIKE $${params.length})`);
  }
  if (status?.trim()) {
    params.push(status.trim());
    conditions.push(`c.status = $${params.length}`);
  }

  let joinClause = '';
  if (segmentId?.trim()) {
    params.push(segmentId.trim());
    joinClause = `JOIN segment_contacts sc ON sc.contact_id = c.id AND sc.segment_id = $${params.length}`;
  }

  const where = conditions.join(' AND ');
  const countRes = await getPool().query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM contacts c ${joinClause} WHERE ${where}`,
    params
  );
  const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

  const offset = (page - 1) * pageSize;
  params.push(pageSize, offset);
  const dataRes = await getPool().query<ContactRow>(
    `SELECT c.id, c.user_id, c.email, c.name, c.status, c.source,
            c.shoplazza_customer_id, c.custom_fields, c.unsubscribe_token,
            c.deleted_at, c.created_at, c.updated_at
     FROM contacts c ${joinClause}
     WHERE ${where}
     ORDER BY c.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { rows: dataRes.rows, total };
}

export async function getContactById(id: string, userId: string): Promise<ContactRow | null> {
  const res = await getPool().query<ContactRow>(
    `SELECT * FROM contacts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function getContactByUnsubToken(token: string): Promise<ContactRow | null> {
  const res = await getPool().query<ContactRow>(
    `SELECT * FROM contacts WHERE unsubscribe_token = $1 AND deleted_at IS NULL`,
    [token]
  );
  return res.rows[0] ?? null;
}

export async function updateContact(id: string, userId: string, data: { name?: string | null; status?: string }): Promise<boolean> {
  const sets: string[] = [`updated_at = NOW()`];
  const params: unknown[] = [id, userId];
  if (data.name !== undefined) { params.push(data.name); sets.push(`name = $${params.length}`); }
  if (data.status !== undefined) { params.push(data.status); sets.push(`status = $${params.length}`); }
  const res = await getPool().query(
    `UPDATE contacts SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    params
  );
  return (res.rowCount ?? 0) > 0;
}

export async function softDeleteContact(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE contacts SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function ensureUnsubscribeToken(id: string, userId: string): Promise<string> {
  // Return existing token or generate a new one
  const { randomBytes } = await import('node:crypto');
  const token = randomBytes(24).toString('hex');
  const res = await getPool().query<{ unsubscribe_token: string }>(
    `UPDATE contacts SET unsubscribe_token = COALESCE(unsubscribe_token, $3)
     WHERE id = $1 AND user_id = $2
     RETURNING unsubscribe_token`,
    [id, userId, token]
  );
  return res.rows[0]?.unsubscribe_token ?? token;
}

export async function getContactSegments(contactId: string): Promise<{ id: string; name: string }[]> {
  const res = await getPool().query<{ id: string; name: string }>(
    `SELECT s.id, s.name FROM segments s
     JOIN segment_contacts sc ON sc.segment_id = s.id
     WHERE sc.contact_id = $1 AND s.deleted_at IS NULL`,
    [contactId]
  );
  return res.rows;
}

// ─── Segments (Iteration 3) ───────────────────────────────────────────────────

export interface SegmentRow {
  id: string;
  user_id: string;
  name: string;
  type: string;
  count_cache: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listSegments(userId: string): Promise<SegmentRow[]> {
  const res = await getPool().query<SegmentRow>(
    `SELECT id, user_id, name, type, count_cache, deleted_at, created_at, updated_at
     FROM segments WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function createSegment(userId: string, name: string): Promise<SegmentRow> {
  const res = await getPool().query<SegmentRow>(
    `INSERT INTO segments (user_id, name, type) VALUES ($1, $2, 'static') RETURNING *`,
    [userId, name.trim()]
  );
  return res.rows[0];
}

export async function updateSegment(id: string, userId: string, name: string): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE segments SET name = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId, name.trim()]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function softDeleteSegment(id: string, userId: string): Promise<boolean> {
  await getPool().query(`DELETE FROM segment_contacts WHERE segment_id = $1`, [id]);
  const res = await getPool().query(
    `UPDATE segments SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getSegmentById(id: string, userId: string): Promise<SegmentRow | null> {
  const res = await getPool().query<SegmentRow>(
    `SELECT * FROM segments WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function addContactsToSegment(segmentId: string, contactIds: string[]): Promise<void> {
  if (contactIds.length === 0) return;
  const values = contactIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await getPool().query(
    `INSERT INTO segment_contacts (segment_id, contact_id) VALUES ${values} ON CONFLICT DO NOTHING`,
    [segmentId, ...contactIds]
  );
  await refreshSegmentCount(segmentId);
}

export async function removeContactFromSegment(segmentId: string, contactId: string): Promise<void> {
  await getPool().query(
    `DELETE FROM segment_contacts WHERE segment_id = $1 AND contact_id = $2`,
    [segmentId, contactId]
  );
  await refreshSegmentCount(segmentId);
}

export async function refreshSegmentCount(segmentId: string): Promise<number> {
  const countRes = await getPool().query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM segment_contacts sc
     JOIN contacts c ON c.id = sc.contact_id
     WHERE sc.segment_id = $1 AND c.deleted_at IS NULL`,
    [segmentId]
  );
  const count = parseInt(countRes.rows[0]?.count ?? '0', 10);
  await getPool().query(`UPDATE segments SET count_cache = $2 WHERE id = $1`, [segmentId, count]);
  return count;
}

// ─── Import Jobs (Iteration 3) ────────────────────────────────────────────────

export interface ImportJobRow {
  id: string;
  user_id: string;
  status: string;
  total: number;
  processed: number;
  skipped: number;
  errors: number;
  error_details: unknown;
  segment_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function createImportJob(userId: string, total: number, segmentId?: string): Promise<string> {
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO import_jobs (user_id, total, segment_id) VALUES ($1, $2, $3) RETURNING id`,
    [userId, total, segmentId ?? null]
  );
  return res.rows[0].id;
}

export async function updateImportJob(id: string, data: {
  status?: string; processed?: number; skipped?: number;
  errors?: number; errorDetails?: unknown[];
}): Promise<void> {
  const sets: string[] = [`updated_at = NOW()`];
  const params: unknown[] = [id];
  if (data.status !== undefined) { params.push(data.status); sets.push(`status = $${params.length}`); }
  if (data.processed !== undefined) { params.push(data.processed); sets.push(`processed = $${params.length}`); }
  if (data.skipped !== undefined) { params.push(data.skipped); sets.push(`skipped = $${params.length}`); }
  if (data.errors !== undefined) { params.push(data.errors); sets.push(`errors = $${params.length}`); }
  if (data.errorDetails !== undefined) { params.push(JSON.stringify(data.errorDetails)); sets.push(`error_details = $${params.length}`); }
  await getPool().query(`UPDATE import_jobs SET ${sets.join(', ')} WHERE id = $1`, params);
}

export async function getImportJob(id: string, userId: string): Promise<ImportJobRow | null> {
  const res = await getPool().query<ImportJobRow>(
    `SELECT * FROM import_jobs WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

// ─── Broadcasts (Iteration 4) ─────────────────────────────────────────────────

export interface BroadcastRow {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  status: string;
  template_id: string | null;
  segment_id: string | null;
  rendered_html: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function createBroadcast(userId: string, data: { name: string; subject: string; previewText?: string }): Promise<BroadcastRow> {
  const res = await getPool().query<BroadcastRow>(
    `INSERT INTO broadcasts (user_id, name, subject, preview_text)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, data.name.trim(), data.subject.trim(), data.previewText?.trim() ?? null]
  );
  return res.rows[0];
}

export async function listBroadcasts(userId: string, opts: { status?: string; page: number; pageSize: number }): Promise<{ rows: BroadcastRow[]; total: number }> {
  const params: unknown[] = [userId];
  let where = `user_id = $1 AND deleted_at IS NULL`;
  if (opts.status) { params.push(opts.status); where += ` AND status = $${params.length}`; }
  const countRes = await getPool().query<{ count: string }>(`SELECT COUNT(*) as count FROM broadcasts WHERE ${where}`, params);
  const total = parseInt(countRes.rows[0]?.count ?? '0', 10);
  const offset = (opts.page - 1) * opts.pageSize;
  params.push(opts.pageSize, offset);
  const res = await getPool().query<BroadcastRow>(
    `SELECT * FROM broadcasts WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params
  );
  return { rows: res.rows, total };
}

export async function getBroadcastById(id: string, userId: string): Promise<BroadcastRow | null> {
  const res = await getPool().query<BroadcastRow>(
    `SELECT * FROM broadcasts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function updateBroadcast(id: string, userId: string, data: Partial<{
  name: string; subject: string; previewText: string | null;
  templateId: string | null; segmentId: string | null;
  renderedHtml: string | null; scheduledAt: string | null;
  status: string; sentAt: string | null;
  totalCount: number; sentCount: number; failedCount: number;
}>): Promise<boolean> {
  const sets: string[] = [`updated_at = NOW()`];
  const params: unknown[] = [id, userId];
  const add = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (data.name !== undefined) add('name', data.name);
  if (data.subject !== undefined) add('subject', data.subject);
  if (data.previewText !== undefined) add('preview_text', data.previewText);
  if (data.templateId !== undefined) add('template_id', data.templateId);
  if (data.segmentId !== undefined) add('segment_id', data.segmentId);
  if (data.renderedHtml !== undefined) add('rendered_html', data.renderedHtml);
  if (data.scheduledAt !== undefined) add('scheduled_at', data.scheduledAt);
  if (data.status !== undefined) add('status', data.status);
  if (data.sentAt !== undefined) add('sent_at', data.sentAt);
  if (data.totalCount !== undefined) add('total_count', data.totalCount);
  if (data.sentCount !== undefined) add('sent_count', data.sentCount);
  if (data.failedCount !== undefined) add('failed_count', data.failedCount);
  const res = await getPool().query(
    `UPDATE broadcasts SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    params
  );
  return (res.rowCount ?? 0) > 0;
}

export async function softDeleteBroadcast(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE broadcasts SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function incrementBroadcastCount(id: string, field: 'sent_count' | 'failed_count'): Promise<void> {
  await getPool().query(`UPDATE broadcasts SET ${field} = ${field} + 1, updated_at = NOW() WHERE id = $1`, [id]);
}

// ─── Email Sends (Iteration 4) ────────────────────────────────────────────────

export async function createEmailSend(data: {
  broadcastId: string; contactId: string; userId: string;
}): Promise<string> {
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO email_sends (broadcast_id, contact_id, user_id) VALUES ($1, $2, $3) RETURNING id`,
    [data.broadcastId, data.contactId, data.userId]
  );
  return res.rows[0].id;
}

export async function updateEmailSend(id: string, data: {
  status: string; messageId?: string; sentAt?: string;
}): Promise<void> {
  await getPool().query(
    `UPDATE email_sends SET status = $2, message_id = COALESCE($3, message_id), sent_at = COALESCE($4, sent_at) WHERE id = $1`,
    [id, data.status, data.messageId ?? null, data.sentAt ?? null]
  );
}

export async function insertEmailEvent(data: {
  sendId: string; type: string; meta?: unknown;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO email_events (send_id, type, meta) VALUES ($1, $2, $3)`,
    [data.sendId, data.type, JSON.stringify(data.meta ?? {})]
  );
}

export async function createTrackingLink(sendId: string, originalUrl: string): Promise<string> {
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO tracking_links (send_id, original_url) VALUES ($1, $2) RETURNING id`,
    [sendId, originalUrl]
  );
  return res.rows[0].id;
}

export async function getTrackingLink(id: string): Promise<{ send_id: string; original_url: string } | null> {
  const res = await getPool().query<{ send_id: string; original_url: string }>(
    `SELECT send_id, original_url FROM tracking_links WHERE id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function getEmailSendById(id: string): Promise<{ id: string; broadcast_id: string; contact_id: string; user_id: string } | null> {
  const res = await getPool().query<{ id: string; broadcast_id: string; contact_id: string; user_id: string }>(
    `SELECT id, broadcast_id, contact_id, user_id FROM email_sends WHERE id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

// ─── Automations (Iteration 5) ────────────────────────────────────────────────

export interface AutomationRow {
  id: string; user_id: string; name: string; trigger_type: string;
  trigger_config: unknown; steps: unknown; status: string;
  deleted_at: string | null; created_at: string; updated_at: string;
}

export interface AutomationEnrollmentRow {
  id: string; automation_id: string; contact_id: string; user_id: string;
  current_step: number; status: string; trigger_data: unknown;
  enrolled_at: string; next_run_at: string | null;
  completed_at: string | null; exited_at: string | null; exit_reason: string | null;
}

export async function createAutomation(userId: string, data: { name: string; triggerType: string; steps?: unknown[] }): Promise<AutomationRow> {
  const res = await getPool().query<AutomationRow>(
    `INSERT INTO automations (user_id, name, trigger_type, steps) VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, data.name.trim(), data.triggerType, JSON.stringify(data.steps ?? [])]
  );
  return res.rows[0];
}

export async function listAutomations(userId: string): Promise<AutomationRow[]> {
  const res = await getPool().query<AutomationRow>(
    `SELECT * FROM automations WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function getAutomationById(id: string, userId: string): Promise<AutomationRow | null> {
  const res = await getPool().query<AutomationRow>(
    `SELECT * FROM automations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function updateAutomation(id: string, userId: string, data: {
  name?: string; steps?: unknown[]; triggerType?: string; triggerConfig?: unknown; status?: string;
}): Promise<boolean> {
  const sets: string[] = [`updated_at = NOW()`];
  const params: unknown[] = [id, userId];
  const add = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (data.name !== undefined) add('name', data.name);
  if (data.steps !== undefined) add('steps', JSON.stringify(data.steps));
  if (data.triggerType !== undefined) add('trigger_type', data.triggerType);
  if (data.triggerConfig !== undefined) add('trigger_config', JSON.stringify(data.triggerConfig));
  if (data.status !== undefined) add('status', data.status);
  const res = await getPool().query(
    `UPDATE automations SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, params
  );
  return (res.rowCount ?? 0) > 0;
}

export async function softDeleteAutomation(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `UPDATE automations SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

/** 找到所有活躍的指定觸發類型自動化（跨用戶，用於 Webhook 處理） */
export async function listActiveAutomationsByTrigger(triggerType: string): Promise<AutomationRow[]> {
  const res = await getPool().query<AutomationRow>(
    `SELECT * FROM automations WHERE trigger_type = $1 AND status = 'active' AND deleted_at IS NULL`,
    [triggerType]
  );
  return res.rows;
}

export async function createEnrollment(data: {
  automationId: string; contactId: string; userId: string; triggerData?: unknown;
}): Promise<AutomationEnrollmentRow | null> {
  try {
    const res = await getPool().query<AutomationEnrollmentRow>(
      `INSERT INTO automation_enrollments (automation_id, contact_id, user_id, trigger_data)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.automationId, data.contactId, data.userId, JSON.stringify(data.triggerData ?? {})]
    );
    return res.rows[0] ?? null;
  } catch (err) {
    // Unique constraint violation = already enrolled
    if ((err as { code?: string }).code === '23505') return null;
    throw err;
  }
}

export async function getEnrollmentById(id: string): Promise<AutomationEnrollmentRow | null> {
  const res = await getPool().query<AutomationEnrollmentRow>(
    `SELECT * FROM automation_enrollments WHERE id = $1`,
    [id]
  );
  return res.rows[0] ?? null;
}

export async function updateEnrollmentStep(id: string, step: number, nextRunAt?: Date | null): Promise<void> {
  await getPool().query(
    `UPDATE automation_enrollments SET current_step = $2, next_run_at = $3 WHERE id = $1`,
    [id, step, nextRunAt ?? null]
  );
}

export async function completeEnrollment(id: string): Promise<void> {
  await getPool().query(
    `UPDATE automation_enrollments SET status = 'completed', completed_at = NOW(), next_run_at = NULL WHERE id = $1`,
    [id]
  );
}

export async function exitEnrollment(id: string, reason: string): Promise<void> {
  await getPool().query(
    `UPDATE automation_enrollments SET status = 'exited', exited_at = NOW(), exit_reason = $2, next_run_at = NULL WHERE id = $1`,
    [id, reason]
  );
}

/** 返回所有 next_run_at <= NOW() 的活躍 enrollment */
export async function listEnrollmentsDue(): Promise<AutomationEnrollmentRow[]> {
  const res = await getPool().query<AutomationEnrollmentRow>(
    `SELECT * FROM automation_enrollments WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= NOW()`,
    []
  );
  return res.rows;
}

export async function listRecentEnrollments(automationId: string, limit = 20): Promise<AutomationEnrollmentRow[]> {
  const res = await getPool().query<AutomationEnrollmentRow>(
    `SELECT * FROM automation_enrollments WHERE automation_id = $1 ORDER BY enrolled_at DESC LIMIT $2`,
    [automationId, limit]
  );
  return res.rows;
}

export async function getAutomationStats(automationId: string): Promise<{
  totalEnrollments: number; activeEnrollments: number; emailsSent: number;
}> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);

  const [total, active, sends] = await Promise.all([
    getPool().query<{count:string}>(`SELECT COUNT(*) as count FROM automation_enrollments WHERE automation_id=$1 AND enrolled_at >= $2`, [automationId, startOfMonth]),
    getPool().query<{count:string}>(`SELECT COUNT(*) as count FROM automation_enrollments WHERE automation_id=$1 AND status='active'`, [automationId]),
    getPool().query<{count:string}>(`SELECT COUNT(*) as count FROM email_sends WHERE automation_id=$1 AND created_at >= $2`, [automationId, startOfMonth]),
  ]);

  return {
    totalEnrollments: parseInt(total.rows[0]?.count ?? '0', 10),
    activeEnrollments: parseInt(active.rows[0]?.count ?? '0', 10),
    emailsSent: parseInt(sends.rows[0]?.count ?? '0', 10),
  };
}

/** 創建來自自動化的 email_send 記錄 */
export async function createAutomationEmailSend(data: {
  automationId: string; enrollmentId: string; contactId: string; userId: string;
}): Promise<string> {
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO email_sends (automation_id, automation_enrollment_id, contact_id, user_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [data.automationId, data.enrollmentId, data.contactId, data.userId]
  );
  return res.rows[0].id;
}

// ─── Brand Config (Iteration 7) ───────────────────────────────────────────────

export async function getBrandConfig(userId: string): Promise<Record<string, unknown>> {
  const res = await getPool().query<{ brand_config: unknown }>(
    `SELECT brand_config FROM users WHERE id = $1`,
    [userId]
  );
  const raw = res.rows[0]?.brand_config;
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? (raw as Record<string, unknown>) : {};
}

export async function updateBrandConfig(userId: string, config: Record<string, unknown>): Promise<void> {
  await getPool().query(
    `UPDATE users SET brand_config = $2 WHERE id = $1`,
    [userId, JSON.stringify(config)]
  );
}

// ─── Variable Schema (Iteration 7) ───────────────────────────────────────────

export interface VariableSchemaRow {
  key: string;
  label: string;
  content_type: string;
  group_name: string;
  description: string | null;
  shoplazza_field: string | null;
  is_custom: boolean;
  user_id: string | null;
  created_at: string;
}

export async function listVariableSchema(userId: string): Promise<VariableSchemaRow[]> {
  const res = await getPool().query<VariableSchemaRow>(
    `SELECT * FROM variable_schema
     WHERE user_id IS NULL OR user_id = $1
     ORDER BY group_name, key ASC`,
    [userId]
  );
  return res.rows;
}

export async function createCustomVariable(data: {
  key: string; label: string; content_type: string; group_name: string;
  description?: string; userId: string;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO variable_schema (key, label, content_type, group_name, description, is_custom, user_id)
     VALUES ($1, $2, $3, $4, $5, TRUE, $6)
     ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description`,
    [data.key, data.label, data.content_type, data.group_name, data.description ?? null, data.userId]
  );
}

export async function deleteCustomVariable(key: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `DELETE FROM variable_schema WHERE key = $1 AND user_id = $2 AND is_custom = TRUE`,
    [key, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ─── Template Endpoints ───────────────────────────────────────────────────────

export interface TemplateEndpointRow {
  id: string;
  template_id: string;
  user_id: string;
  name: string;
  source_schema: unknown[];
  field_mapping: Record<string, string>;
  created_at: number;
  updated_at: number;
}

export async function listEndpointsByTemplateId(templateId: string, userId: string): Promise<TemplateEndpointRow[]> {
  const res = await getPool().query<TemplateEndpointRow>(
    `SELECT id, template_id, user_id, name, source_schema, field_mapping, created_at, updated_at
     FROM template_endpoints WHERE template_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
    [templateId, userId]
  );
  return res.rows;
}

export async function getEndpoint(id: string, userId: string): Promise<TemplateEndpointRow | null> {
  const res = await getPool().query<TemplateEndpointRow>(
    `SELECT id, template_id, user_id, name, source_schema, field_mapping, created_at, updated_at
     FROM template_endpoints WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return res.rows[0] ?? null;
}

export async function createEndpoint(row: TemplateEndpointRow): Promise<void> {
  await getPool().query(
    `INSERT INTO template_endpoints (id, template_id, user_id, name, source_schema, field_mapping, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [row.id, row.template_id, row.user_id, row.name, JSON.stringify(row.source_schema), JSON.stringify(row.field_mapping), row.created_at, row.updated_at]
  );
}

export async function updateEndpoint(
  id: string,
  userId: string,
  data: { name?: string; source_schema?: unknown[]; field_mapping?: Record<string, string> }
): Promise<boolean> {
  const now = Date.now();
  const sets: string[] = ['updated_at = $3'];
  const params: unknown[] = [id, userId, now];
  if (data.name !== undefined) { params.push(data.name); sets.push(`name = $${params.length}`); }
  if (data.source_schema !== undefined) { params.push(JSON.stringify(data.source_schema)); sets.push(`source_schema = $${params.length}`); }
  if (data.field_mapping !== undefined) { params.push(JSON.stringify(data.field_mapping)); sets.push(`field_mapping = $${params.length}`); }
  const res = await getPool().query(
    `UPDATE template_endpoints SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2`,
    params
  );
  return (res.rowCount ?? 0) > 0;
}

export async function deleteEndpoint(id: string, userId: string): Promise<boolean> {
  const res = await getPool().query(
    `DELETE FROM template_endpoints WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}
