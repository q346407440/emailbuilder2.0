-- Email Editor Server: 模板與複合組件庫
-- 執行: psql $DATABASE_URL -f src/db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(128),
  avatar_url VARCHAR(512),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS email_templates (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL DEFAULT 'default',
  title VARCHAR(512) NOT NULL,
  "desc" TEXT,
  components JSONB NOT NULL,
  config JSONB NOT NULL,
  preview_url VARCHAR(512),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS composite_components (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL DEFAULT 'default',
  name VARCHAR(512) NOT NULL,
  mode VARCHAR(32) NOT NULL,
  component JSONB NOT NULL,
  business_form JSONB,
  preview_url VARCHAR(512),
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  sort_order BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_composite_components_user_id ON composite_components(user_id);
CREATE INDEX IF NOT EXISTS idx_composite_components_status ON composite_components(status);

-- 工程表（方案 B）：編輯中的工作項，僅創建者可見；發布後寫入 email_templates
CREATE TABLE IF NOT EXISTS email_projects (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(512) NOT NULL DEFAULT '',
  "desc" TEXT,
  components JSONB NOT NULL,
  config JSONB NOT NULL,
  custom_variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview_url VARCHAR(512),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_projects_user_id ON email_projects(user_id);

-- users.is_admin：僅 admin 可保存到公共、上傳到公共組件庫
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- email_templates.custom_variables：模板级自定义变量定义（JSONB 数组）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'email_templates' AND column_name = 'custom_variables'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN custom_variables JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- email_templates.is_public：true = 出現在公共郵件模板列表
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'email_templates' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- composite_components.is_public：true = 出現在公共組件庫列表
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'composite_components' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE composite_components ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_templates_is_public ON email_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_composite_components_is_public ON composite_components(is_public);

-- 店鋪授權（Shoplazza）：僅登入用戶可見，每用戶可多店、記住上次選擇
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'last_selected_shop_id'
  ) THEN
    ALTER TABLE users ADD COLUMN last_selected_shop_id VARCHAR(64);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shop_authorizations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  token TEXT NOT NULL,
  shop_id VARCHAR(64) NOT NULL,
  shop_name VARCHAR(512) NOT NULL,
  shop_url VARCHAR(512),
  created_at BIGINT NOT NULL,
  UNIQUE(user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_shop_authorizations_user_id ON shop_authorizations(user_id);

-- Gmail OAuth 授權：每用戶可綁定多個 Gmail 帳號
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'last_selected_gmail_id'
  ) THEN
    ALTER TABLE users ADD COLUMN last_selected_gmail_id VARCHAR(64);
  END IF;
END $$;

-- 默認郵件模板：每用戶一個，登入後自動加載
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'default_template_id'
  ) THEN
    ALTER TABLE users ADD COLUMN default_template_id VARCHAR(64);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gmail_authorizations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  gmail_address VARCHAR(255) NOT NULL,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  token_expiry BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, gmail_address)
);

CREATE INDEX IF NOT EXISTS idx_gmail_authorizations_user_id ON gmail_authorizations(user_id);

-- 聊天会话
CREATE TABLE IF NOT EXISTS chat_conversations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  pipeline_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  last_message_at BIGINT NOT NULL
);

-- Fix-1: 若旧库已存在，幂等加列
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'pipeline_completed'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN pipeline_completed BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message_at ON chat_conversations(last_message_at DESC);

-- 聊天消息（API 层 role 可保持 user/assistant，业务语义由 business_role/source_type 区分）
CREATE TABLE IF NOT EXISTS chat_messages (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(16) NOT NULL,
  business_role VARCHAR(64) NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  react_turn INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL DEFAULT '',
  think_content TEXT,
  tool_name VARCHAR(128),
  tool_call_id VARCHAR(128),
  tool_status VARCHAR(32),
  created_at BIGINT NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'chat_messages' AND column_name = 'tool_calls'
  ) THEN
    ALTER TABLE chat_messages ADD COLUMN tool_calls JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id_created_at
  ON chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

-- AI 改动卡片（可撤回/恢复）
CREATE TABLE IF NOT EXISTS chat_change_cards (
  id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  assistant_message_id VARCHAR(64) NOT NULL,
  tool_call_id VARCHAR(128),
  template_id VARCHAR(64),
  summary TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'applied',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'chat_change_cards' AND column_name = 'tool_call_id'
  ) THEN
    ALTER TABLE chat_change_cards ADD COLUMN tool_call_id VARCHAR(128);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_change_cards_conversation_id
  ON chat_change_cards(conversation_id, created_at DESC);

-- 改动卡片下的具体操作（before/after patch 可逆重放）
CREATE TABLE IF NOT EXISTS chat_change_ops (
  id VARCHAR(64) PRIMARY KEY,
  change_card_id VARCHAR(64) NOT NULL,
  op_index INT NOT NULL,
  target_component_id VARCHAR(64),
  action_type VARCHAR(64) NOT NULL,
  before_patch JSONB,
  after_patch JSONB,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_change_ops_change_card_id
  ON chat_change_ops(change_card_id, op_index ASC);

-- 图片本地库：缓存 Pexels 搜索结果，支持本地优先搜索与兜底
CREATE TABLE IF NOT EXISTS image_library (
  id SERIAL PRIMARY KEY,
  pexels_photo_id INTEGER NOT NULL UNIQUE,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  photographer TEXT NOT NULL DEFAULT '',
  orientation TEXT NOT NULL DEFAULT 'landscape',   -- landscape | portrait | square
  search_keywords TEXT[] NOT NULL DEFAULT '{}',    -- 历史累积的所有搜索关键词
  status TEXT NOT NULL DEFAULT 'pending',          -- pending | available | unavailable
  last_verified_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_image_library_status ON image_library(status);
CREATE INDEX IF NOT EXISTS idx_image_library_keywords ON image_library USING GIN(search_keywords);
CREATE INDEX IF NOT EXISTS idx_image_library_orientation ON image_library(orientation, status);

-- 模板接入点：每个模板可配置多个接入点，每个接入点描述外部数据源与模板变量的映射关系
CREATE TABLE IF NOT EXISTS template_endpoints (
  id            VARCHAR(64) PRIMARY KEY,
  template_id   VARCHAR(64) NOT NULL,
  user_id       VARCHAR(64) NOT NULL,
  name          VARCHAR(256) NOT NULL,
  source_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_template_endpoints_template_id ON template_endpoints(template_id);
CREATE INDEX IF NOT EXISTS idx_template_endpoints_user_id ON template_endpoints(user_id);

-- Layer 4：email_templates.rendering_rules — 渲染規則（動態邏輯字段，從組件樹中獨立出來）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'email_templates' AND column_name = 'rendering_rules'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN rendering_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Layer 4：email_projects.rendering_rules — 渲染規則（動態邏輯字段，從組件樹中獨立出來）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'email_projects' AND column_name = 'rendering_rules'
  ) THEN
    ALTER TABLE email_projects ADD COLUMN rendering_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 验证管线上下文与结果（createTemplateFromImage 完成后自动触发验证）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'verify_context'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN verify_context JSONB;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_conversations' AND column_name = 'verification_result'
  ) THEN
    ALTER TABLE chat_conversations ADD COLUMN verification_result JSONB;
  END IF;
END $$;
