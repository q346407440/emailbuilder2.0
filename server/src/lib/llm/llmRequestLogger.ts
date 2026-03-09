/**
 * LLM 请求专用日志：记录每次请求的完整 JSON 与回复的完整 JSON，
 * 并清晰标记「用户发送的消息」以及 ReAct 第几轮（用户消息视为第 1 轮）。
 */

import * as fs from 'fs';
import * as path from 'path';

export interface LlmLogContext {
  /** ReAct 轮次，用户发送的消息触发第 1 轮 */
  reactRound: number;
  /** 是否为「用户发送的消息」触发的本轮（即第 1 轮） */
  isUserMessage: boolean;
  /** 仅当 isUserMessage 时存在：用户输入的原始文本 */
  userMessage?: string;
  /** 是否为检查轮（需求符合性检查，不占 ReAct 次数） */
  isCheckRound?: boolean;
  /** 是否在本条请求日志里打印完整 system prompt（默认 true） */
  includeSystemPrompt?: boolean;
  /** 会话 ID（用于串联完整执行链路） */
  conversationId?: string;
  /** 当前 assistant 消息 ID（可选） */
  assistantMessageId?: string;
  /** 同一次任务链路 ID（一次 /stream 及其后续 continue 共用） */
  runId?: string;
  /** ReAct 阶段（draft/structure/style/final） */
  phase?: string;
  /** 本轮目标区域标签（可选） */
  zoneTag?: string;
}

export interface LlmLogEntry {
  context: LlmLogContext;
  /** 发给上游 LLM 的完整请求 JSON 字符串 */
  requestJson: string;
  /** 上游 LLM 的完整回复（流式结束后汇总）：reasoning_content + content */
  responseJson: string;
  /** 日志写入时间（ISO） */
  at: string;
}

export interface LlmFlowEventEntry {
  context?: LlmLogContext;
  event: string;
  detail?: Record<string, unknown>;
  at: string;
}

const LOG_DIR = process.env.LLM_REQUEST_LOG_DIR ?? path.join(process.cwd(), 'logs', 'llm');
const ENABLED = process.env.LLM_REQUEST_LOG !== '0' && process.env.LLM_REQUEST_LOG !== 'false';

const LLM_LOG_FILENAME = 'llmlog';

/** 供启动时打印：固定日志文件完整路径；若未启用返回 null */
export function getLlmLogPathInfo(): { path: string } | null {
  if (!ENABLED) return null;
  return {
    path: path.resolve(LOG_DIR, LLM_LOG_FILENAME),
  };
}

/** 启动时确保目录与日志文件存在，并清空文件内容；不删除文件。仅在启用 LLM 日志时调用。 */
export function clearLlmLogOnStartup(): void {
  if (!ENABLED) return;
  ensureLogDir();
  const file = logFilePath();
  try {
    fs.writeFileSync(file, '', 'utf8');
  } catch {
    // 忽略写入失败
  }
}

function ensureLogDir(): void {
  if (!ENABLED) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function logFilePath(): string {
  return path.join(LOG_DIR, LLM_LOG_FILENAME);
}

function formatSection(context: LlmLogContext): string {
  if (context.isCheckRound) {
    return '========== 检查轮（需求符合性检查，不占 ReAct 次数） ==========';
  }
  if (context.isUserMessage) {
    return [
      '========== 用户发送的消息（ReAct 第 1 轮触发） ==========',
      context.userMessage != null ? `用户消息内容: ${context.userMessage}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return `========== ReAct 第 ${context.reactRound} 轮（工具结果后的追加请求） ==========`;
}

function formatContextMeta(context?: LlmLogContext): string[] {
  if (!context) return [];
  const lines: string[] = [];
  if (typeof context.conversationId === 'string' && context.conversationId.length > 0) {
    lines.push(`会话ID: ${context.conversationId}`);
  }
  if (typeof context.assistantMessageId === 'string' && context.assistantMessageId.length > 0) {
    lines.push(`助手消息ID: ${context.assistantMessageId}`);
  }
  if (typeof context.runId === 'string' && context.runId.length > 0) {
    lines.push(`任务RunID: ${context.runId}`);
  }
  if (typeof context.phase === 'string' && context.phase.length > 0) {
    lines.push(`阶段: ${context.phase}`);
  }
  if (typeof context.zoneTag === 'string' && context.zoneTag.length > 0) {
    lines.push(`区域标签: ${context.zoneTag}`);
  }
  return lines;
}

/** 将 JSON 字符串整理为换行格式，并把内容里的 \n、\r 转成真实换行便于阅读
 *  同时截断 base64 图片数据，避免日志过大（只保留 MIME 头，正文替换为 ...） */
function jsonForLog(raw: string): string {
  let s = raw;
  try {
    const parsed = JSON.parse(s) as unknown;
    s = JSON.stringify(parsed, null, 2);
  } catch {
    // 非 JSON 则保持原样
  }
  // 截断 base64 正文：data:image/xxx;base64,<长串> → data:image/xxx;base64,...
  s = s.replace(/(data:[a-zA-Z0-9/+.-]+;base64,)[A-Za-z0-9+/=]{20,}/g, '$1...');
  return s.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
}

function formatEntry(entry: LlmLogEntry): string {
  const requestBlock = jsonForLog(entry.requestJson);
  const responseBlock = jsonForLog(entry.responseJson);
  const sectionLines = [
    formatSection(entry.context),
    ...(entry.context.isCheckRound ? ['【类型】检查轮'] : []),
  ];
  const lines: string[] = [
    '',
    '################################################################################',
    ...sectionLines,
    ...formatContextMeta(entry.context),
    `记录时间: ${entry.at}`,
    '--------------------------------------------------------------------------------',
    '请求完整 JSON（发往 LLM）:',
    requestBlock,
    '--------------------------------------------------------------------------------',
    '回复完整 JSON（流式汇总）:',
    responseBlock,
    '################################################################################',
    '',
  ];
  return lines.join('\n');
}

function formatFlowEventEntry(entry: LlmFlowEventEntry): string {
  const detailBlock = jsonForLog(JSON.stringify(entry.detail ?? {}, null, 2));
  const lines: string[] = [
    '',
    '********************************************************************************',
    '流程事件日志',
    ...(entry.context ? [formatSection(entry.context)] : []),
    ...formatContextMeta(entry.context),
    `记录时间: ${entry.at}`,
    `事件: ${entry.event}`,
    '--------------------------------------------------------------------------------',
    '详情:',
    detailBlock,
    '********************************************************************************',
    '',
  ];
  return lines.join('\n');
}

/**
 * 写入一条 LLM 请求/回复日志。
 * 若环境变量 LLM_REQUEST_LOG=0 或 false，则不写入。
 */
export function logLlmRequest(entry: Omit<LlmLogEntry, 'at'>): void {
  if (!ENABLED) return;
  const full: LlmLogEntry = { ...entry, at: new Date().toISOString() };
  ensureLogDir();
  const file = logFilePath();
  try {
    fs.appendFileSync(file, formatEntry(full), 'utf8');
  } catch {
    // 写入失败时静默忽略，避免影响主流程
  }
}

/**
 * 写入一条流程事件日志（与 LLM 请求日志共用 llmlog 文件）。
 * 适合记录 ReAct 轮次、工具分流、管线步骤等非请求/回复类信息。
 */
export function logLlmFlowEvent(entry: Omit<LlmFlowEventEntry, 'at'>): void {
  if (!ENABLED) return;
  const full: LlmFlowEventEntry = { ...entry, at: new Date().toISOString() };
  ensureLogDir();
  const file = logFilePath();
  try {
    fs.appendFileSync(file, formatFlowEventEntry(full), 'utf8');
  } catch {
    // 写入失败时静默忽略，避免影响主流程
  }
}
