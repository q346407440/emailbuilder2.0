import type { ChatMessage } from './types';

export const CHAT_QUICK_ACTIONS = [
  '重构这块版头风格',
  '把文案改得更有转化',
  '生成一个商品卡片区块',
  '统一按钮与品牌色',
  '检查导出预览一致性',
] as const;

export const CHAT_MAX_FILES = 1;
export const CHAT_MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

/** 超过此时长未发消息后，再次打开聊天面板将自动开启新会话（毫秒，默认 5 分钟） */
export const CHAT_IDLE_NEW_SESSION_MS = 5 * 60 * 1000;

export const CHAT_WELCOME_MESSAGE =
  '你好，我是邮件编辑助手。我可以通过对话帮你编辑当前模板、生成组件，并给出可撤回的改动卡片。';

export const CHAT_INITIAL_MESSAGES: ChatMessage[] = [];
