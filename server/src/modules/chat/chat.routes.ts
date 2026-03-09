import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { nanoid } from 'nanoid';
import {
  chatMessageExistsByToolCallId,
  createChatConversation,
  createChatChangeCard,
  getChatChangeCardById,
  getChatConversationById,
  getTemplate,
  listChatConversations,
  insertChatChangeOps,
  insertChatMessage,
  listChangeCardsForConversation,
  listChatChangeOps,
  listRecentChatMessages,
  listRecentUserDirectMessages,
  putTemplate,
  touchChatConversation,
  updateChatConversationTitle,
  updateChatChangeCardStatus,
  markConversationPipelineCompleted,
  getConversationPipelineCompleted,
  saveVerifyContext,
  getVerifyContext,
  type ChatChangeOpRow,
  type ChatMessageRow,
} from '../../db/index.js';
import {
  buildCheckRoundSystemPrompt,
  buildSummarySystemPrompt,
  generateConversationTitle,
  generateTemplatePlan,
  streamLlmResponse,
  type PlanStep,
  type LlmMessage,
  type LlmMessageContent,
} from '../../lib/llm/llmClient.js';
import { runVisualVerify, buildFixStepSystemPrompt, issueToTaskDescription } from '../../lib/pipeline/runVerifyPipeline.js';
import type { VerifyContext, VerificationIssue } from '../../lib/pipeline/types.js';
import { extractToolCalls, extractToolStarts, removeToolTags, type ParsedToolCall } from '../../lib/chat/toolXmlParser.js';
import { applyPatchAtPath, type TreeNode } from '../../utils/applyPatchAtPath.js';
import { runImageToTemplatePipeline } from '../../lib/pipeline/runPipeline.js';
import { searchWithCache } from '../../lib/pipeline/pexelsClient.js';
import { logLlmFlowEvent } from '../../lib/llm/llmRequestLogger.js';

type AuthRequest = FastifyRequest & { userId: string };

interface StreamBody {
  conversationId?: string;
  message: string;
  /** 前端当前画布快照（仅供日志/调试），不参与 ReAct 逻辑；画布状态由前端 useEmailStore 唯一维护 */
  templateContext?: { components: unknown[] };
  attachments?: Array<{
    name?: string;
    mimeType?: string;
    dataUrl?: string;
  }>;
  /** 当前会话的执行计划状态，发第二条及后续消息时携带以便本轮 ReAct 继续按计划执行 */
  planState?: PlanStep[];
}

interface NewConversationBody {
  title?: string;
}

type ChatEvent =
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
      reactTurn?: number;
      fromCheckRound?: boolean;
      planState?: PlanStep[];
      runId?: string;
      /** 验证管线阶段标记：'verification_v7'=等待截图, 'fix_step'=执行修复步骤, 'pipeline_done'=仅持久化不走ReAct */
      phase?: 'verification_v7' | 'fix_step' | 'pipeline_done';
      /** 验证管线工具调用 ID（V7 阶段继续更新同一卡片） */
      verifyToolCallId?: string;
      /** fix_step 阶段：当前步骤下标 */
      fixStepIndex?: number;
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

function sendNdjson(reply: FastifyReply, event: ChatEvent): void {
  reply.raw.write(`${JSON.stringify(event)}\n`);
}

function parseRoleForModel(m: ChatMessageRow): LlmMessage {
  if (m.role === 'assistant') {
    const trimmed = m.content.trim();
    if (trimmed.length > 0) return { role: 'assistant', content: trimmed };
    const toolCalls = Array.isArray(m.tool_calls) ? m.tool_calls : [];
    const toolNames = toolCalls
      .map((tc) => {
        if (!tc || typeof tc !== 'object') return '';
        const n = (tc as Record<string, unknown>).name;
        return typeof n === 'string' ? n : '';
      })
      .filter(Boolean);
    if (toolNames.length > 0) {
      return { role: 'assistant', content: `[助手工具调用] ${toolNames.join('、')}` };
    }
    return { role: 'assistant', content: '' };
  }
  return { role: 'user', content: m.content };
}

function normalizeImageAttachments(
  value: StreamBody['attachments']
): Array<{ mimeType: string; dataUrl: string }> {
  if (!Array.isArray(value)) return [];
  const output: Array<{ mimeType: string; dataUrl: string }> = [];
  for (const item of value) {
    if (!item || typeof item.dataUrl !== 'string') continue;
    const match = item.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
    if (!match) continue;
    output.push({
      mimeType: typeof item.mimeType === 'string' && item.mimeType.startsWith('image/')
        ? item.mimeType
        : match[1],
      dataUrl: item.dataUrl,
    });
    if (output.length >= 3) break;
  }
  return output;
}

function buildUserMultimodalContent(text: string, images: Array<{ dataUrl: string }>): LlmMessageContent {
  return [
    { type: 'text', text },
    ...images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: img.dataUrl },
    })),
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

// 枚举值 → 中文映射
const ENUM_ZH: Record<string, string> = {
  // 水平对齐
  left: '左对齐', center: '居中', right: '右对齐',
  // 垂直对齐
  top: '顶部', middle: '居中', bottom: '底部',
  // 排列方向
  horizontal: '水平', vertical: '垂直',
  // 尺寸模式
  fill: '撑满', fitContent: '自适应', fixed: '固定', original: '原始尺寸', auto: '自动',
  // 按钮样式
  solid: '实心', outlined: '描边', text: '文字',
  // 分割线样式
  line: '线条', dashed: '虚线', dotted: '点线',
  // 背景类型
  color: '纯色', image: '图片',
  // 字体模式
  inherit: '继承', custom: '自定义',
  // 布尔
  true: '是', false: '否',
};

function translateEnum(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  return ENUM_ZH[val] ?? null;
}

/**
 * 将单个字段值转为简短的展示字符串。
 * - 颜色 (#xxx)：原样展示
 * - 枚举值：翻译为中文
 * - URL / data: 开头的长字符串：缩写为 [已更新]
 * - 对象（padding、sizeConfig、contentAlign 等）：展开关键子字段并翻译
 */
function formatPatchValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.startsWith('http') || value.startsWith('data:')) return '[已更新]';
    const zh = translateEnum(value);
    if (zh) return zh;
    if (value.length > 30) return `"${value.slice(0, 28)}…"`;
    return `"${value}"`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // contentAlign: { horizontal, vertical }
    if ('horizontal' in obj || 'vertical' in obj) {
      const parts: string[] = [];
      if (obj.horizontal) parts.push(translateEnum(obj.horizontal) ?? String(obj.horizontal));
      if (obj.vertical) parts.push(translateEnum(obj.vertical) ?? String(obj.vertical));
      return parts.join(' + ') || null;
    }
    // SpacingConfig: { mode, unified, top, right, bottom, left }
    if ('mode' in obj) {
      if (obj.mode === 'unified' && obj.unified) return String(obj.unified);
      if (obj.mode === 'separate') {
        const { top = 0, right = 0, bottom = 0, left = 0 } = obj as Record<string, unknown>;
        return `上${top} 右${right} 下${bottom} 左${left}`;
      }
    }
    // sizeConfig: { mode }
    if ('mode' in obj) {
      const modeZh = translateEnum(obj.mode);
      return modeZh ?? String(obj.mode);
    }
    return null;
  }
  return null;
}

/** 根据工具名称和参数（主要是 patch 字段）生成具体的中文修改描述。 */
function describeToolPatch(name: string, args: Record<string, unknown>): string {
  if (name === 'updateTemplateComponent') {
    // args 结构分三种形式：
    // 格式 A（含 patch 包装）：{ afterPatch: { patch: { props, wrapperStyle } } }
    // 格式 B（无 patch 包装）：{ afterPatch: { props, wrapperStyle } }
    // 格式 C（LLM 直接传参）：{ targetComponentId, props, wrapperStyle }
    const afterPatchEnvelope = asRecord(args.afterPatch);
    const patch =
      asRecord(afterPatchEnvelope?.patch)
      ?? asRecord(args.patch)
      ?? afterPatchEnvelope
      // 格式 C：LLM 直接把 props/wrapperStyle 放在 args 顶层
      ?? (args.props || args.wrapperStyle
        ? { props: asRecord(args.props), wrapperStyle: asRecord(args.wrapperStyle) }
        : null);
    if (!patch) return '已更新组件';

    const props = asRecord(patch.props);
    const wrapper = asRecord(patch.wrapperStyle);
    const changedParts: string[] = [];

    const PROP_LABELS: Record<string, string> = {
      text: '文本内容', content: '文本内容',
      src: '图片地址', alt: '图片说明',
      iconType: '图标', customSrc: '图标',
      backgroundColor: '背景颜色', textColor: '文字颜色',
      borderColor: '边框颜色', color: '颜色',
      fontSize: '字号', fontWeight: '字重', fontFamily: '字体',
      fontMode: '字体模式', lineHeight: '行高',
      borderRadius: '圆角', padding: '内边距',
      widthMode: '宽度模式', fixedWidth: '宽度',
      buttonStyle: '按钮样式', link: '链接',
      size: '尺寸', sizeConfig: '图片尺寸',
      dividerStyle: '分割线样式', height: '高度',
      gap: '间距', direction: '排列方向', columnsPerRow: '列数',
    };
    const WRAPPER_LABELS: Record<string, string> = {
      backgroundColor: '容器背景色', padding: '容器内边距',
      contentAlign: '内容对齐', widthMode: '容器宽度',
      borderRadius: '容器圆角', border: '边框',
      backgroundType: '背景类型', backgroundImage: '背景图',
    };

    const seenLabels = new Set<string>();
    const addPart = (label: string, value: unknown) => {
      if (seenLabels.has(label)) return;
      seenLabels.add(label);
      const displayVal = formatPatchValue(value);
      changedParts.push(displayVal ? `${label} → ${displayVal}` : label);
    };

    if (props) {
      for (const [key, value] of Object.entries(props)) {
        const label = PROP_LABELS[key];
        if (label) addPart(label, value);
      }
    }
    if (wrapper) {
      for (const [key, value] of Object.entries(wrapper)) {
        const label = WRAPPER_LABELS[key];
        if (label) addPart(label, value);
      }
    }

    if (changedParts.length === 0) return '已更新组件属性';
    return changedParts.join('\n');
  }

  if (name === 'addComponentToTemplate') {
    const TYPE_NAMES: Record<string, string> = {
      text: '文本', image: '图片', button: '按钮', icon: '图标',
      layout: '布局容器', grid: '网格', divider: '分割线',
    };
    const type = typeof args.type === 'string' ? args.type : '';
    return `已添加${TYPE_NAMES[type] ?? type}组件`;
  }

  if (name === 'removeComponent') return '已删除组件';
  if (name === 'clearTemplateOrSubtree') {
    const hasTarget = typeof args.componentId === 'string' || typeof args.targetComponentId === 'string';
    return hasTarget ? '已清空子树' : '已清空画布';
  }
  if (name === 'updateCanvasConfig') return '已更新画布配置';
  if (name === 'getComponentState') {
    const cid = typeof args.componentId === 'string' ? args.componentId : '';
    return cid ? `已查询组件 ${cid} 的状态` : '已查询组件状态';
  }
  if (name === 'getComponentPreview') {
    const cid = typeof args.componentId === 'string' ? args.componentId : '';
    return cid ? `已截取组件 ${cid} 的预览图` : '已截取组件预览图';
  }

  return `已执行 ${name}`;
}

function normalizePatchEnvelope(value: unknown): { path: number[]; patch: { props?: Record<string, unknown>; wrapperStyle?: Record<string, unknown> } } | null {
  const obj = asRecord(value);
  if (!obj) return null;
  const pathRaw = obj.path;
  const patchRaw = asRecord(obj.patch);
  if (!Array.isArray(pathRaw) || !patchRaw) return null;
  const path = pathRaw.filter((item): item is number => typeof item === 'number' && Number.isInteger(item));
  if (path.length !== pathRaw.length) return null;
  const props = asRecord(patchRaw.props) ?? undefined;
  const wrapperStyle = asRecord(patchRaw.wrapperStyle) ?? undefined;
  if (!props && !wrapperStyle) return null;
  return { path, patch: { props, wrapperStyle } };
}

async function applyCardOpsOnTemplate(
  templateId: string,
  userId: string,
  ops: ChatChangeOpRow[],
  mode: 'undo' | 'redo'
): Promise<void> {
  const row = await getTemplate(templateId);
  if (!row) return;
  if (row.user_id !== userId) return;
  let components = row.components as TreeNode[];
  let changed = false;
  for (const op of ops) {
    const source = mode === 'undo' ? op.before_patch : op.after_patch;
    const envelope = normalizePatchEnvelope(source);
    if (!envelope) continue;
    components = applyPatchAtPath(components, envelope.path, envelope.patch);
    changed = true;
  }
  if (!changed) return;
  await putTemplate({
    ...row,
    components,
    updated_at: Date.now(),
  });
}

async function ensureConversation(userId: string, preferredId?: string): Promise<string> {
  const now = Date.now();
  if (preferredId) {
    const existing = await getChatConversationById(preferredId, userId);
    if (existing) {
      await touchChatConversation(preferredId, userId, now);
      return preferredId;
    }
  }
  const id = nanoid();
  await createChatConversation({
    id,
    user_id: userId,
    title: '新会话',
    status: 'active',
    created_at: now,
    updated_at: now,
    last_message_at: now,
  });
  return id;
}

/** Fix-6a: 所有合法工具名白名单，用于拦截 LLM 产生的无效工具名 */
const REGISTERED_TOOLS = new Set([
  'getTemplateState',
  'getComponentState',
  'getComponentPreview',
  'addComponentToTemplate',
  'updateTemplateComponent',
  'clearTemplateOrSubtree',
  'removeComponent',
  'updateCanvasConfig',
  'captureCanvasPreview',
  'createTemplateFromImage',
  'createCompositeChildFromImage',
  'planTemplate',
  'markPlanStepDone',
  'searchPexelsImage',
]);

/** 需要在前端执行的画布工具集合（读/写 useEmailStore，不依赖后端能力） */
const CLIENT_TOOL_NAMES = new Set([
  'getTemplateState',
  'getComponentState',
  'getComponentPreview',
  'addComponentToTemplate',
  'updateTemplateComponent',
  'clearTemplateOrSubtree',
  'removeComponent',
  'updateCanvasConfig',
  'captureCanvasPreview',
  'createTemplateFromImage',
  'createCompositeChildFromImage',
]);

function isClientTool(name: string): boolean {
  return CLIENT_TOOL_NAMES.has(name);
}

const PIPELINE_INTERCEPTED_TOOLS = new Set(['createTemplateFromImage']);

function isTemplateMutatingTool(name: string): boolean {
  // 注意：createTemplateFromImage / createCompositeChildFromImage 是整批替换操作，
  // 没有逐组件的 before/after patch，不适合 change card 系统，因此排除。
  // change card 仅用于可精确撤回的逐组件操作。
  return (
    name === 'updateTemplateComponent' ||
    name === 'addComponentToTemplate' ||
    name === 'clearTemplateOrSubtree' ||
    name === 'removeComponent' ||
    name === 'updateCanvasConfig'
  );
}


/**
 * 检查 updateTemplateComponent 调用中的图片 src 是否来自合法上下文。
 * 合法来源：src 出现在任意 temporaryMessages 的 content 中（包括 searchPexelsImage 工具结果、用户消息等）。
 * 若 src 为空则视为合法（由其他逻辑处理）。
 */
function isUngroundedImageUpdate(call: ParsedToolCall, temporaryMessages: LlmMessage[]): boolean {
  if (call.name !== 'updateTemplateComponent') return false;
  const props = (call.args?.props) as Record<string, unknown> | undefined;
  const src = typeof props?.src === 'string' ? props.src.trim() : '';
  if (!src) return false;
  return !temporaryMessages.some((msg) => {
    const content = typeof msg.content === 'string' ? msg.content : '';
    return content.includes(src);
  });
}

/**
 * 执行一批服务端工具（CLIENT_TOOL_NAMES 中的工具不会被传入此函数）。
 * 无依赖的工具并行执行，有 dependsOn 的工具按轮次推进。
 */
async function executeTools(
  calls: ParsedToolCall[]
): Promise<Array<{ call: ParsedToolCall; result: Record<string, unknown> }>> {
  const byId = new Map(calls.map((c) => [c.toolCallId, c]));
  const completed = new Set<string>();
  const output: Array<{ call: ParsedToolCall; result: Record<string, unknown> }> = [];

  while (completed.size < calls.length) {
    const runnable = calls.filter((c) => !completed.has(c.toolCallId) && c.dependsOn.every((dep) => completed.has(dep) || !byId.has(dep)));
    if (runnable.length === 0) {
      const next = calls.find((c) => !completed.has(c.toolCallId));
      if (!next) break;
      runnable.push(next);
    }

    const batch = await Promise.all(
      runnable.map(async (call) => {
        let result: Record<string, unknown>;

        if (call.name === 'searchPexelsImage') {
          const query = typeof call.args.query === 'string' ? call.args.query : '';
          const targetWidth = typeof call.args.width === 'number' ? call.args.width : 600;
          const orientation = (call.args.orientation as 'landscape' | 'portrait' | 'square') ?? undefined;
          if (!query) {
            result = { ok: false, toolName: call.name, error: '缺少 query 参数' };
          } else {
            const found = await searchWithCache(query, targetWidth, orientation);
            if (found) {
              result = {
                ok: true,
                toolName: call.name,
                bestUrl: found.url,
                fromCache: found.fromCache ?? false,
                results: [{ url: found.url, alt: found.alt, photographer: found.photographer ?? '' }],
              };
            } else {
              result = { ok: false, toolName: call.name, error: `未找到与 "${query}" 匹配的图片，请尝试更简单的英文关键词` };
            }
          }
        } else {
          result = {
            ok: true,
            toolName: call.name,
            summary: `工具 ${call.name} 已执行`,
            ...call.args,
          };
        }

        return { call, result };
      })
    );
    for (const item of batch) {
      completed.add(item.call.toolCallId);
      output.push(item);
    }
  }
  return output;
}

interface ContinueBody {
  conversationId: string;
  assistantMessageId: string;
  toolResults: Array<{
    toolCallId: string;
    name: string;
    args: Record<string, unknown>;
    result: Record<string, unknown>;
  }>;
  /**
   * 原始用户消息中携带的图片附件（由前端回传）。
   * 用于在 /stream/continue 续流时还原 VL 模型选择并保持图片上下文。
   */
  imageAttachments?: Array<{ mimeType: string; dataUrl: string; name?: string }>;
  /** 上次暂停时的 reactTurn，用于跨 continue 累计轮次 */
  reactTurn?: number;
  /** 上次暂停是否来自检查轮，true 时本次 runReactLoop 首轮禁用检查轮 */
  fromCheckRound?: boolean;
  /** 跨 continue 透传的计划状态 */
  planState?: PlanStep[];
  /** 同一次任务链路 ID（由 /stream 下发，/continue 回传） */
  runId?: string;
  /** 验证管线阶段（由 conversation.awaiting_tool_results 透传） */
  phase?: 'verification_v7' | 'fix_step' | 'pipeline_done';
  /** 验证管线工具调用 ID */
  verifyToolCallId?: string;
  /** fix_step 阶段：当前步骤下标 */
  fixStepIndex?: number;
}

/** 将服务端工具的执行结果写入 DB、创建 change card、向客户端推送事件 */
async function emitAndPersistServerToolResults(
  items: Array<{ call: ParsedToolCall; result: Record<string, unknown> }>,
  ctx: {
    reply: FastifyReply;
    conversationId: string;
    userId: string;
    assistantMessageId: string;
    reactTurn: number;
    preDetectedToolIds: Set<string>;
    temporaryMessages: LlmMessage[];
  }
): Promise<void> {
  for (const item of items) {
    const { call, result } = item;
    if (!ctx.preDetectedToolIds.has(call.toolCallId)) {
      sendNdjson(ctx.reply, { type: 'tool.call.detected', toolCallId: call.toolCallId, name: call.name, args: call.args, schemaVersion: 1 });
      sendNdjson(ctx.reply, { type: 'tool.call.running', toolCallId: call.toolCallId, schemaVersion: 1 });
    }

    const success = result.ok === true;
    if (success) {
      sendNdjson(ctx.reply, { type: 'tool.call.completed', toolCallId: call.toolCallId, result, schemaVersion: 1 });
    } else {
      sendNdjson(ctx.reply, { type: 'tool.call.failed', toolCallId: call.toolCallId, error: typeof result.error === 'string' ? result.error : '工具执行失败', schemaVersion: 1 });
    }

    const toolUserMessage = success
      ? `[工具结果] ${call.name}：\n${JSON.stringify(result)}`
      : `[工具失败] ${call.name}：${typeof result.error === 'string' ? result.error : JSON.stringify(result)}。请检查参数后重试。`;
    await insertChatMessage({
      id: nanoid(),
      conversation_id: ctx.conversationId,
      user_id: ctx.userId,
      role: 'user',
      business_role: 'tool_result_injected_user',
      source_type: 'tool_result_injected_user',
      react_turn: ctx.reactTurn + 1,
      content: toolUserMessage,
      think_content: null,
      tool_calls: null,
      tool_name: call.name,
      tool_call_id: call.toolCallId,
      tool_status: success ? 'completed' : 'failed',
      created_at: Date.now(),
    });
    ctx.temporaryMessages.push({ role: 'user', content: toolUserMessage });

    if (success && isTemplateMutatingTool(call.name)) {
      const cardId = nanoid();
      const ts = Date.now();
      const targetComponentId =
        typeof call.args.componentId === 'string' ? call.args.componentId
          : typeof call.args.targetComponentId === 'string' ? call.args.targetComponentId
            : undefined;
      const beforePatch = call.args.beforePatch;
      const afterPatch = call.args.afterPatch;
      const summary = describeToolPatch(call.name, call.args);
      await createChatChangeCard({
        id: cardId,
        conversation_id: ctx.conversationId,
        user_id: ctx.userId,
        assistant_message_id: ctx.assistantMessageId,
        tool_call_id: call.toolCallId,
        template_id: null,
        summary,
        status: 'applied',
        created_at: ts,
        updated_at: ts,
      });
      await insertChatChangeOps([{
        id: nanoid(),
        change_card_id: cardId,
        op_index: 0,
        target_component_id: targetComponentId ?? null,
        action_type: call.name,
        before_patch: beforePatch,
        after_patch: afterPatch,
        created_at: ts,
      }]);
      sendNdjson(ctx.reply, {
        type: 'change.card.created',
        card: {
          id: cardId,
          summary,
          status: 'applied',
          toolCallId: call.toolCallId,
          targetComponentId,
          beforePatch: typeof beforePatch === 'object' ? (beforePatch as Record<string, unknown>) : undefined,
          afterPatch: typeof afterPatch === 'object' ? (afterPatch as Record<string, unknown>) : undefined,
        },
        schemaVersion: 1,
      });
    }
  }
}

/** 将前端回传的客户端工具结果写入 DB、创建 change card、向客户端推送事件（幂等：已入库的 toolCallId 跳过写入）。返回已处理的 toolCallId 集合，供调用方去重。 */
async function emitAndPersistClientToolResults(
  toolResults: ContinueBody['toolResults'],
  ctx: {
    reply: FastifyReply;
    conversationId: string;
    userId: string;
    assistantMessageId: string;
    reactTurn: number;
    temporaryMessages: LlmMessage[];
  }
): Promise<Set<string>> {
  const processedToolCallIds = new Set<string>();
  for (const item of toolResults) {
    const { toolCallId, name, args, result } = item;

    // 幂等检查：若该 toolCallId 已入库则只推送事件，不重复写 DB
    const alreadyPersisted = await chatMessageExistsByToolCallId(ctx.conversationId, toolCallId);
    const success = result.ok === true;

    if (success) {
      sendNdjson(ctx.reply, { type: 'tool.call.completed', toolCallId, result, schemaVersion: 1 });
    } else {
      sendNdjson(ctx.reply, { type: 'tool.call.failed', toolCallId, error: typeof result.error === 'string' ? result.error : '工具执行失败', schemaVersion: 1 });
    }

    const toolUserMessage = success
      ? `[工具结果] ${name}：\n${JSON.stringify(result)}`
      : `[工具失败] ${name}：${typeof result.error === 'string' ? result.error : JSON.stringify(result)}。请检查参数后重试。`;

    if (!alreadyPersisted) {
      await insertChatMessage({
        id: nanoid(),
        conversation_id: ctx.conversationId,
        user_id: ctx.userId,
        role: 'user',
        business_role: 'tool_result_injected_user',
        source_type: 'tool_result_injected_user',
        react_turn: ctx.reactTurn + 1,
        content: toolUserMessage,
        think_content: null,
        tool_calls: null,
        tool_name: name,
        tool_call_id: toolCallId,
        tool_status: success ? 'completed' : 'failed',
        created_at: Date.now(),
      });

      if (success && isTemplateMutatingTool(name)) {
        const cardId = nanoid();
        const ts = Date.now();
        const targetComponentId =
          typeof args.targetComponentId === 'string' ? args.targetComponentId
            : typeof args.componentId === 'string' ? args.componentId
              : undefined;
        // beforePatch 优先取 result（前端执行前捕获的真实改前状态），其次取 LLM args 中传入的值
        const beforePatch = (typeof result.beforePatch === 'object' && result.beforePatch !== null)
          ? result.beforePatch
          : args.beforePatch;
        // afterPatch 优先取 result（前端应用后捕获的完整新状态），支持反复撤回/恢复
        const afterPatch = (typeof result.afterPatch === 'object' && result.afterPatch !== null)
          ? result.afterPatch
          : args.afterPatch;
        const summary = describeToolPatch(name, args);
        await createChatChangeCard({
          id: cardId,
          conversation_id: ctx.conversationId,
          user_id: ctx.userId,
          assistant_message_id: ctx.assistantMessageId,
          tool_call_id: toolCallId,
          template_id: null,
          summary,
          status: 'applied',
          created_at: ts,
          updated_at: ts,
        });
        await insertChatChangeOps([{
          id: nanoid(),
          change_card_id: cardId,
          op_index: 0,
          target_component_id: targetComponentId ?? null,
          action_type: name,
          before_patch: beforePatch,
          after_patch: afterPatch,
          created_at: ts,
        }]);
        sendNdjson(ctx.reply, {
          type: 'change.card.created',
          card: {
            id: cardId,
            summary,
            status: 'applied',
            toolCallId,
            targetComponentId,
            beforePatch: typeof beforePatch === 'object' ? (beforePatch as Record<string, unknown>) : undefined,
            afterPatch: typeof afterPatch === 'object' ? (afterPatch as Record<string, unknown>) : undefined,
          },
          schemaVersion: 1,
        });
      }
    }

    processedToolCallIds.add(toolCallId);
    ctx.temporaryMessages.push({ role: 'user', content: toolUserMessage });
  }
  return processedToolCallIds;
}

function setNdjsonHeaders(reply: FastifyReply, origin?: string): void {
  reply.raw.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  if (typeof origin === 'string' && origin.length > 0) {
    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Vary', 'Origin');
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

/**
 * 上下文压缩：
 * 1. 超过 keepRecent 条的旧工具结果 → 摘要化为一行
 * 2. getTemplateState 的巨型 JSON → 只保留组件层级结构（id+type+childCount）
 */
function compactToolResults(messages: LlmMessage[], keepRecent: number = 3): LlmMessage[] {
  const toolResultIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const content = messages[i].content;
    if (typeof content === 'string' && (content.startsWith('[工具结果]') || content.startsWith('[工具失败]'))) {
      toolResultIndices.push(i);
    }
  }
  if (toolResultIndices.length === 0) return messages;

  const oldIndices = toolResultIndices.length > keepRecent
    ? new Set(toolResultIndices.slice(0, -keepRecent))
    : new Set<number>();
  const recentIndices = new Set(toolResultIndices.slice(-keepRecent));

  const result: LlmMessage[] = [];
  const toolNames: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    if (oldIndices.has(i)) {
      const content = messages[i].content as string;
      const match = content.match(/^\[工具(?:结果|失败)\]\s*(\S+?)：/);
      if (match) toolNames.push(match[1]);
      continue;
    }
    if (recentIndices.has(i)) {
      result.push(compactGetTemplateState(messages[i]));
    } else {
      result.push(messages[i]);
    }
  }

  if (toolNames.length > 0) {
    result.unshift({ role: 'user' as const, content: `[上下文摘要] 已完成 ${toolNames.length} 次工具调用：${toolNames.join('、')}` });
  }
  return result;
}

/** 对 getTemplateState 结果做摘要：将完整 props 压缩为 {id, type, childCount} */
function compactGetTemplateState(msg: LlmMessage): LlmMessage {
  const content = msg.content;
  if (typeof content !== 'string' || !content.startsWith('[工具结果] getTemplateState')) return msg;

  try {
    const jsonStart = content.indexOf('{');
    if (jsonStart < 0) return msg;
    const parsed = JSON.parse(content.slice(jsonStart)) as {
      ok?: boolean;
      toolName?: string;
      components?: unknown[];
      canvasConfig?: unknown;
    };
    if (!parsed.ok || !Array.isArray(parsed.components)) return msg;

    const summarizeTree = (nodes: unknown[]): unknown[] =>
      (nodes as Array<Record<string, unknown>>).map(n => {
        const summary: Record<string, unknown> = { id: n.id, type: n.type };
        if (Array.isArray(n.children) && n.children.length > 0) {
          summary.children = summarizeTree(n.children);
        }
        return summary;
      });

    const compact = {
      ok: true,
      toolName: 'getTemplateState',
      componentsSummary: summarizeTree(parsed.components),
      totalComponents: countNodes(parsed.components as Array<Record<string, unknown>>),
      canvasConfig: parsed.canvasConfig,
    };
    return { role: msg.role, content: `[工具结果] getTemplateState（摘要）：\n${JSON.stringify(compact)}` };
  } catch {
    return msg;
  }
}

function countNodes(nodes: Array<Record<string, unknown>>): number {
  let count = 0;
  for (const n of nodes) {
    count += 1;
    if (Array.isArray(n.children)) count += countNodes(n.children as Array<Record<string, unknown>>);
  }
  return count;
}

function formatPlanProgress(plan: PlanStep[]): string {
  const done = plan.filter(s => s.status === 'completed').length;
  const nextPending = plan.find(s => s.status !== 'completed');
  const lines: string[] = [`当前执行计划进度: ${done}/${plan.length} 已完成`];
  if (nextPending) {
    lines.push(`下一步 [${nextPending.index}]: ${nextPending.description}`);
    const remaining = plan.filter(s => s.status !== 'completed').slice(1);
    if (remaining.length > 0) {
      lines.push(`后续还有 ${remaining.length} 个步骤待完成`);
    }
  }
  return lines.join('\n');
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return undefined;
}

function parsePositiveIntEnv(value: string | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function resolveReactLoopMaxTurns(): number {
  return parsePositiveIntEnv(process.env.LLM_MAX_TURNS) ?? 30;
}

function resolveMaxToolsPerTurn(): number {
  return parsePositiveIntEnv(process.env.LLM_MAX_TOOLS_PER_TURN) ?? 6;
}

function resolveMaxStateCalls(): number {
  return parsePositiveIntEnv(process.env.LLM_MAX_STATE_CALLS) ?? 3;
}

function resolveMaxPreviewCalls(): number {
  return parsePositiveIntEnv(process.env.LLM_MAX_PREVIEW_CALLS) ?? 2;
}

function resolveMaxCheckRounds(): number {
  return parsePositiveIntEnv(process.env.LLM_MAX_CHECK_ROUNDS) ?? 1;
}

function resolveEnableCheckRound(hasImage: boolean): boolean {
  const scoped = parseBooleanEnv(process.env.LLM_ENABLE_CHECK_ROUND);
  if (typeof scoped === 'boolean') return scoped;
  // 视觉还原默认开启一次检查轮，普通对话默认关闭。
  return hasImage;
}

async function interceptPlanTools(
  toolCalls: ParsedToolCall[],
  activePlan: PlanStep[] | null,
  ctx: {
    reply: FastifyReply;
    conversationId: string;
    userId: string;
    assistantMessageId: string;
    reactTurn: number;
    temporaryMessages: LlmMessage[];
    preDetectedToolIds: Set<string>;
    originalUserMessages: LlmMessage[];
    preferVision: boolean;
  }
): Promise<{ activePlan: PlanStep[] | null; remaining: ParsedToolCall[] }> {
  const remaining: ParsedToolCall[] = [];
  let updatedPlan = activePlan;

  for (const call of toolCalls) {
    if (call.name !== 'planTemplate' && call.name !== 'markPlanStepDone') {
      remaining.push(call);
      continue;
    }

    if (!ctx.preDetectedToolIds.has(call.toolCallId)) {
      sendNdjson(ctx.reply, { type: 'tool.call.detected', toolCallId: call.toolCallId, name: call.name, args: call.args, schemaVersion: 1 });
      sendNdjson(ctx.reply, { type: 'tool.call.running', toolCallId: call.toolCallId, schemaVersion: 1 });
      ctx.preDetectedToolIds.add(call.toolCallId);
    }

    if (call.name === 'planTemplate') {
      // 已有计划时拦截重复规划，直接返回现有计划
      if (updatedPlan && updatedPlan.length > 0) {
        const msg = `[工具结果] planTemplate：已存在执行计划（${updatedPlan.length} 步），无需重新规划。请继续执行未完成的步骤。`;
        sendNdjson(ctx.reply, {
          type: 'tool.call.completed', toolCallId: call.toolCallId,
          result: { ok: true, plan: updatedPlan, note: '已有计划，跳过重复规划' },
          schemaVersion: 1,
        });
        ctx.temporaryMessages.push({ role: 'user', content: msg });
        await insertChatMessage({
          id: nanoid(), conversation_id: ctx.conversationId, user_id: ctx.userId,
          role: 'user', business_role: 'tool_result_injected_user', source_type: 'tool_result_injected_user',
          react_turn: ctx.reactTurn + 1, content: msg, think_content: null,
          tool_calls: null, tool_name: call.name, tool_call_id: call.toolCallId, tool_status: 'completed',
          created_at: Date.now(),
        });
        continue;
      }

      const planResult = await generateTemplatePlan(ctx.originalUserMessages, ctx.preferVision);
      if (planResult.ok) {
        updatedPlan = planResult.plan;
        sendNdjson(ctx.reply, {
          type: 'tool.call.completed', toolCallId: call.toolCallId,
          result: { ok: true, plan: updatedPlan },
          schemaVersion: 1,
        });
        ctx.temporaryMessages.push({
          role: 'user',
          content: `[工具结果] planTemplate：\n${JSON.stringify(updatedPlan)}`,
        });
      } else {
        sendNdjson(ctx.reply, {
          type: 'tool.call.completed', toolCallId: call.toolCallId,
          result: { ok: false, error: planResult.error ?? '规划失败' },
          schemaVersion: 1,
        });
        ctx.temporaryMessages.push({
          role: 'user',
          content: `[工具失败] planTemplate：${planResult.error}。请直接执行任务。`,
        });
      }
      await insertChatMessage({
        id: nanoid(),
        conversation_id: ctx.conversationId,
        user_id: ctx.userId,
        role: 'user',
        business_role: 'tool_result_injected_user',
        source_type: 'tool_result_injected_user',
        react_turn: ctx.reactTurn + 1,
        content: ctx.temporaryMessages[ctx.temporaryMessages.length - 1].content as string,
        think_content: null,
        tool_calls: null,
        tool_name: call.name,
        tool_call_id: call.toolCallId,
        tool_status: planResult.ok ? 'completed' : 'failed',
        created_at: Date.now(),
      });
    }

    if (call.name === 'markPlanStepDone') {
      const stepIndex = typeof call.args.stepIndex === 'number' ? call.args.stepIndex : -1;
      if (updatedPlan && stepIndex >= 0 && stepIndex < updatedPlan.length) {
        updatedPlan = updatedPlan.map(s =>
          s.index === stepIndex ? { ...s, status: 'completed' as const } : s
        );
        const msg = `[工具结果] markPlanStepDone：步骤 ${stepIndex} 已完成`;
        sendNdjson(ctx.reply, {
          type: 'tool.call.completed', toolCallId: call.toolCallId,
          result: { ok: true, stepIndex },
          schemaVersion: 1,
        });
        sendNdjson(ctx.reply, { type: 'fix.step.completed', stepIndex, schemaVersion: 1 });
        ctx.temporaryMessages.push({ role: 'user', content: msg });
        await insertChatMessage({
          id: nanoid(),
          conversation_id: ctx.conversationId,
          user_id: ctx.userId,
          role: 'user',
          business_role: 'tool_result_injected_user',
          source_type: 'tool_result_injected_user',
          react_turn: ctx.reactTurn + 1,
          content: msg,
          think_content: null,
          tool_calls: null,
          tool_name: call.name,
          tool_call_id: call.toolCallId,
          tool_status: 'completed',
          created_at: Date.now(),
        });
      } else {
        const softMsg = !updatedPlan
          ? '[工具提示] 当前无活跃计划，无需标记步骤完成。请直接使用工具进行操作。'
          : `[工具提示] stepIndex ${stepIndex} 超出计划范围（共 ${updatedPlan.length} 步）。请忽略此操作，继续执行任务。`;
        sendNdjson(ctx.reply, {
          type: 'tool.call.completed', toolCallId: call.toolCallId,
          result: { ok: true, ignored: true, reason: softMsg },
          schemaVersion: 1,
        });
        ctx.temporaryMessages.push({ role: 'user', content: softMsg });
        await insertChatMessage({
          id: nanoid(),
          conversation_id: ctx.conversationId,
          user_id: ctx.userId,
          role: 'user',
          business_role: 'tool_result_injected_user',
          source_type: 'tool_result_injected_user',
          react_turn: ctx.reactTurn + 1,
          content: softMsg,
          think_content: null,
          tool_calls: null,
          tool_name: call.name,
          tool_call_id: call.toolCallId,
          tool_status: 'completed',
          created_at: Date.now(),
        });
      }
    }
  }

  return { activePlan: updatedPlan, remaining };
}

// ── 管线拦截：createTemplateFromImage → 后端管线执行 ──────────────────

function extractImageDataUrlsFromMessages(messages: LlmMessage[]): string[] {
  const urls: string[] = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') continue;
    if (!Array.isArray(msg.content)) continue;
    for (const part of msg.content) {
      if (
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'image_url' &&
        'image_url' in part
      ) {
        const imageUrl = (part as { type: string; image_url: { url: string } }).image_url;
        if (imageUrl?.url) urls.push(imageUrl.url);
      }
    }
  }
  return urls;
}

async function interceptPipelineTool(
  toolCalls: ParsedToolCall[],
  ctx: {
    reply: FastifyReply;
    conversationId: string;
    userId: string;
    assistantMessageId: string;
    reactTurn: number;
    runId: string;
    temporaryMessages: LlmMessage[];
    preDetectedToolIds: Set<string>;
    originalUserMessages: LlmMessage[];
    signal?: AbortSignal;
  }
): Promise<{ remaining: ParsedToolCall[]; pipelineHandled: boolean; summaryData?: { createResultSummary: string; originalUserMsgs: LlmMessage[] } }> {
  const remaining: ParsedToolCall[] = [];
  let pipelineHandled = false;
  let summaryData: { createResultSummary: string; originalUserMsgs: LlmMessage[] } | undefined;

  for (const call of toolCalls) {
    if (call.name !== 'createTemplateFromImage') {
      remaining.push(call);
      continue;
    }

    pipelineHandled = true;
    logLlmFlowEvent({
      event: 'pipeline.tool.intercepted',
      context: {
        reactRound: ctx.reactTurn,
        isUserMessage: false,
        conversationId: ctx.conversationId,
        assistantMessageId: ctx.assistantMessageId,
        runId: ctx.runId,
      },
      detail: {
        toolCallId: call.toolCallId,
        toolName: call.name,
      },
    });

    if (!ctx.preDetectedToolIds.has(call.toolCallId)) {
      sendNdjson(ctx.reply, { type: 'tool.call.detected', toolCallId: call.toolCallId, name: call.name, args: call.args, schemaVersion: 1 });
      sendNdjson(ctx.reply, { type: 'tool.call.running', toolCallId: call.toolCallId, schemaVersion: 1 });
      ctx.preDetectedToolIds.add(call.toolCallId);
    }

    const imageDataUrls = extractImageDataUrlsFromMessages(ctx.originalUserMessages);
    if (imageDataUrls.length === 0) {
      const errMsg = '未在消息中找到设计图';
      logLlmFlowEvent({
        event: 'pipeline.input.missing_image',
        context: {
          reactRound: ctx.reactTurn,
          isUserMessage: false,
          conversationId: ctx.conversationId,
          assistantMessageId: ctx.assistantMessageId,
          runId: ctx.runId,
        },
        detail: { toolCallId: call.toolCallId },
      });
      sendNdjson(ctx.reply, { type: 'tool.call.failed', toolCallId: call.toolCallId, error: errMsg, schemaVersion: 1 });
      ctx.temporaryMessages.push({ role: 'user', content: `[工具失败] createTemplateFromImage：${errMsg}` });
      await insertChatMessage({
        id: nanoid(), conversation_id: ctx.conversationId, user_id: ctx.userId,
        role: 'user', business_role: 'tool_result_injected_user', source_type: 'tool_result_injected_user',
        react_turn: ctx.reactTurn + 1, content: `[工具失败] createTemplateFromImage：${errMsg}`,
        think_content: null, tool_calls: null, tool_name: call.name,
        tool_call_id: call.toolCallId, tool_status: 'failed', created_at: Date.now(),
      });
      continue;
    }

    console.log(`[pipeline] starting pipeline for ${imageDataUrls.length} image(s)`);

    const result = await runImageToTemplatePipeline(
      imageDataUrls,
      {
        onStepStart: (step, label) => {
          sendNdjson(ctx.reply, { type: 'pipeline.step.started', step, ...(label ? { label } : {}), schemaVersion: 1 });
        },
        onStepComplete: (step, label) => {
          sendNdjson(ctx.reply, { type: 'pipeline.step.completed', step, ...(label ? { label } : {}), schemaVersion: 1 });
        },
        onStepResult: (step, output) => {
          sendNdjson(ctx.reply, { type: 'pipeline.step.result', step, output, schemaVersion: 1 });
        },
      },
      {
        conversationId: ctx.conversationId,
        assistantMessageId: ctx.assistantMessageId,
        runId: ctx.runId,
        reactTurn: ctx.reactTurn,
      },
      ctx.signal,
    );

    if (result.ok) {
      logLlmFlowEvent({
        event: 'pipeline.completed',
        context: {
          reactRound: ctx.reactTurn,
          isUserMessage: false,
          conversationId: ctx.conversationId,
          assistantMessageId: ctx.assistantMessageId,
          runId: ctx.runId,
        },
        detail: {
          toolCallId: call.toolCallId,
          componentCount: result.components.length,
        },
      });
      const pipelineArgs = {
        components: result.components,
        canvasConfig: result.canvasConfig,
        componentCount: result.components.length,
      };
      sendNdjson(ctx.reply, {
        type: 'pipeline.completed',
        componentCount: result.components.length,
        schemaVersion: 1,
      });
      // Fix-1: pipeline 完成时写入 DB，后续 /stream/continue 可跨轮次读取
      await markConversationPipelineCompleted(ctx.conversationId, ctx.userId).catch((e) => {
        console.error('[chat] markConversationPipelineCompleted failed:', e);
      });
      sendNdjson(ctx.reply, {
        type: 'tool.call.client_ready',
        toolCallId: call.toolCallId,
        name: 'createTemplateFromImage',
        args: pipelineArgs as Record<string, unknown>,
        schemaVersion: 1,
      });

      // 生成完成后直接构建总结上下文，不走验证管线
      const _regionNames = result.sections.map((s) => s.region).join('、') || '完整邮件';
      const _textSnippets = result.extractedTexts.flatMap((t) => t.texts).slice(0, 5).filter(Boolean).join('、');
      const _imageHint = result.searchedImages.length > 0
        ? `；为 ${result.searchedImages.length} 个区域匹配了图片（${result.searchedImages.map((i) => i.query).join('、')}）`
        : '';
      const _createResultSummary = `生成了 ${result.components.length} 个顶层组件，覆盖区域：${_regionNames}${_imageHint}${_textSnippets ? `；关键文案：${_textSnippets}` : ''}`;
      summaryData = { createResultSummary: _createResultSummary, originalUserMsgs: ctx.originalUserMessages };
    } else {
      logLlmFlowEvent({
        event: 'pipeline.failed',
        context: {
          reactRound: ctx.reactTurn,
          isUserMessage: false,
          conversationId: ctx.conversationId,
          assistantMessageId: ctx.assistantMessageId,
          runId: ctx.runId,
        },
        detail: {
          toolCallId: call.toolCallId,
          error: result.error,
        },
      });
      sendNdjson(ctx.reply, {
        type: 'tool.call.failed',
        toolCallId: call.toolCallId,
        error: result.error,
        schemaVersion: 1,
      });
      ctx.temporaryMessages.push({
        role: 'user',
        content: `[工具失败] createTemplateFromImage：${result.error}。请改用 addComponentToTemplate 逐步还原。`,
      });
      await insertChatMessage({
        id: nanoid(), conversation_id: ctx.conversationId, user_id: ctx.userId,
        role: 'user', business_role: 'tool_result_injected_user', source_type: 'tool_result_injected_user',
        react_turn: ctx.reactTurn + 1, content: `[工具失败] createTemplateFromImage：${result.error}`,
        think_content: null, tool_calls: null, tool_name: call.name,
        tool_call_id: call.toolCallId, tool_status: 'failed', created_at: Date.now(),
      });
    }
  }

  return { remaining, pipelineHandled, summaryData };
}

interface ReactLoopConfig {
  reply: FastifyReply;
  conversationId: string;
  userId: string;
  /** 固定基础上下文（公共历史 or 已加载的会话历史），每轮不变 */
  baseMessages: LlmMessage[];
  /** 随轮次累积的临时消息，由本函数原地追加 */
  temporaryMessages: LlmMessage[];
  preferVision: boolean;
  maxTurns: number;
  /** 工具 ID 前缀标识：'turn'（/stream）或 'cont'（/stream/continue） */
  toolIdPrefixBase: string;
  /** 第一轮是否标记为用户消息（仅 /stream 为 true，用于日志） */
  firstTurnIsUserMessage?: boolean;
  /** 第一轮日志附带的用户消息文本 */
  firstTurnUserMessage?: string;
  /** 主轮次无工具时，是否启动检查轮（由配置决定） */
  enableCheckRound?: boolean;
  /** 构造检查轮所用消息（enableCheckRound=true 时必须提供） */
  getCheckRoundMessages?: () => LlmMessage[];
  /** 起始 reactTurn（跨 continue 累计用），默认 1 */
  startReactTurn?: number;
  /** 第一轮是否跳过检查轮（防止检查轮→continue→再检查轮的连续触发），默认 false */
  skipFirstCheckRound?: boolean;
  /** 原始用户消息（含图片），供 planTemplate Sub-Agent 使用 */
  originalUserMessages?: LlmMessage[];
  /** 从 /continue 恢复的计划状态 */
  initialPlanState?: PlanStep[];
  /** 外部中止信号（客户端断开连接时触发） */
  signal?: AbortSignal;
  /** 同一次任务链路 ID（一次 /stream + 多次 /continue） */
  runId: string;
  /** 单轮最大工具调用数，超出将截断 */
  maxToolsPerTurn?: number;
  /** 单次会话内 getTemplateState 最大调用数 */
  maxStateCalls?: number;
  /** 单次会话内 captureCanvasPreview 最大调用数 */
  maxPreviewCalls?: number;
  /** 单次会话内检查轮最大次数 */
  maxCheckRounds?: number;
  /** pipeline 已完成：进入后卫模式，硬拦截 clearTemplateOrSubtree/planTemplate，初始 phase 为 structure */
  pipelineCompleted?: boolean;
  /** 覆盖默认 system prompt（用于 fix step 等特殊场景） */
  systemPromptOverride?: string;
  /** fix step 阶段注入：在 conversation.awaiting_tool_results 中透传 phase/fixStepIndex */
  fixPhaseOverride?: { fixStepIndex: number };
}

type ReactPhase = 'draft' | 'structure' | 'style' | 'final';

function inferZoneTagFromTools(tools: ParsedToolCall[], phase: ReactPhase): string {
  if (tools.some((t) => t.name === 'createTemplateFromImage')) return 'pipeline';
  if (tools.some((t) => t.name === 'captureCanvasPreview')) return 'preview-check';
  if (tools.some((t) => t.name === 'addComponentToTemplate')) return 'structure-build';
  if (tools.some((t) => t.name === 'updateTemplateComponent')) return 'style-refine';
  if (tools.some((t) => t.name === 'getTemplateState')) return 'state-review';
  return `${phase}-general`;
}

/**
 * 通用 ReAct 循环：/stream 与 /stream/continue 共用。
 * 调用方负责设置 NDJSON headers、持久化用户消息、try/catch/finally。
 */
class AbortedError extends Error {
  constructor() { super('aborted'); this.name = 'AbortedError'; }
}

// ── 管线完成后的轻量总结（模块级，供 runReactLoop 内部调用） ────────────
async function runPipelineSummaryTurn(ctx: {
  reply: FastifyReply;
  conversationId: string;
  userId: string;
  runId: string;
  originalUserMsgs: LlmMessage[];
  createResultSummary: string;
  preferVision: boolean;
  signal?: AbortSignal;
}): Promise<void> {
  const summaryContextMsg: LlmMessage = {
    role: 'user',
    content: `[创建结果] ${ctx.createResultSummary}

请根据以上信息，向用户做简洁总结（不超过 5 句话）。`,
  };
  const summaryMsgId = nanoid();
  sendNdjson(ctx.reply, { type: 'assistant.placeholder', messageId: summaryMsgId, schemaVersion: 1 });
  logLlmFlowEvent({
    event: 'verify.summary_turn.started',
    context: { reactRound: 0, isUserMessage: false, conversationId: ctx.conversationId, assistantMessageId: summaryMsgId, runId: ctx.runId },
    detail: { issueCount: 0, fixResultCount: 0, hasImage: ctx.preferVision, inputMsgCount: ctx.originalUserMsgs.length + 1 },
  });
  let accAnswer = '';
  try {
    await streamLlmResponse(
      'chat',
      {
        messages: [...ctx.originalUserMsgs, summaryContextMsg],
        enableTools: false,
        preferVision: ctx.preferVision,
        systemPromptOverride: buildSummarySystemPrompt(),
        logContext: { reactRound: 0, isUserMessage: false, includeSystemPrompt: true, conversationId: ctx.conversationId, assistantMessageId: summaryMsgId, runId: ctx.runId, phase: 'final', zoneTag: 'pipeline-summary' },
      },
      {
        onThinkDelta: () => {},
        onAnswerDelta: (delta) => {
          accAnswer += delta;
          sendNdjson(ctx.reply, { type: 'assistant.answer.delta', messageId: summaryMsgId, delta, schemaVersion: 1 });
        },
      },
      ctx.signal,
    );
  } catch (e) {
    console.error('[chat] runPipelineSummaryTurn failed:', e);
  }
  await insertChatMessage({
    id: summaryMsgId, conversation_id: ctx.conversationId, user_id: ctx.userId,
    role: 'assistant', business_role: 'assistant', source_type: 'llm_summary',
    react_turn: 1, content: accAnswer,
    think_content: null, tool_calls: null, tool_name: null, tool_call_id: null,
    tool_status: null, created_at: Date.now(),
  }).catch(() => {});
  sendNdjson(ctx.reply, { type: 'assistant.completed', messageId: summaryMsgId, schemaVersion: 1 });
}

async function runReactLoop(cfg: ReactLoopConfig): Promise<string> {
  const {
    reply, conversationId, userId,
    baseMessages, temporaryMessages,
    preferVision, maxTurns, toolIdPrefixBase,
    firstTurnIsUserMessage, firstTurnUserMessage,
    enableCheckRound, getCheckRoundMessages,
    startReactTurn, skipFirstCheckRound,
    originalUserMessages, initialPlanState,
    signal, runId,
    maxToolsPerTurn = 6,
    maxStateCalls = 3,
    maxPreviewCalls = 2,
    maxCheckRounds = 1,
    pipelineCompleted = false,
    systemPromptOverride,
    fixPhaseOverride,
  } = cfg;

  let activePlan: PlanStep[] | null = initialPlanState ?? null;
  let reactTurn = startReactTurn ?? 1;
  let forceFinalRound = false;
  let stopReason = 'completed';
  let skipCheckThisTurn = skipFirstCheckRound ?? false;
  let noToolRetryCount = 0;
  let usedStateCalls = 0;
  let usedPreviewCalls = 0;
  let usedCheckRounds = 0;
  let phase: ReactPhase = pipelineCompleted ? 'structure' : (preferVision ? 'draft' : 'structure');
  let zoneTag = `${phase}-general`;
  const MAX_NO_TOOL_RETRIES = 4;

  logLlmFlowEvent({
    event: 'react.loop.started',
    context: {
      reactRound: startReactTurn ?? 1,
      isUserMessage: false,
      conversationId,
      runId,
    },
    detail: {
      maxTurns,
        maxToolsPerTurn,
        maxStateCalls,
        maxPreviewCalls,
        maxCheckRounds,
        phase,
      preferVision,
      toolIdPrefixBase,
      baseMessageCount: baseMessages.length,
      temporaryMessageCount: temporaryMessages.length,
      hasInitialPlan: Array.isArray(initialPlanState) && initialPlanState.length > 0,
    },
  });

  while (reactTurn <= maxTurns || forceFinalRound) {
    if (signal?.aborted) throw new AbortedError();

    // 软状态推进：进入样式收敛后，完成至少一次截图校验则进入最终阶段（phase 可能为 style，此处保留比较以兼容日后恢复阶段切换）
    const prevPhaseAtTurnStart: ReactPhase = phase;
    if ((phase as ReactPhase) === 'style' && usedPreviewCalls >= 1) {
      phase = 'final';
    }
    if (phase !== prevPhaseAtTurnStart) {
      logLlmFlowEvent({
        event: 'react.phase.changed',
        context: {
          reactRound: reactTurn,
          isUserMessage: false,
          conversationId,
          runId,
        },
        detail: { from: prevPhaseAtTurnStart, to: phase, reason: 'preview_completed' },
      });
    }

    const assistantMessageId = nanoid();
    const toolIdPrefix = `${toolIdPrefixBase}-${reactTurn}-${assistantMessageId}`;
    logLlmFlowEvent({
      event: 'react.turn.started',
      context: {
        reactRound: reactTurn,
        isUserMessage: (firstTurnIsUserMessage && reactTurn === 1) ?? false,
        conversationId,
        assistantMessageId,
        runId,
        phase,
        zoneTag,
      },
      detail: {
        forceFinalRound,
        skipCheckThisTurn,
        activePlanPendingSteps: activePlan?.filter((s) => s.status !== 'completed').length ?? 0,
      },
    });
    sendNdjson(reply, { type: 'assistant.placeholder', messageId: assistantMessageId, schemaVersion: 1 });

    const contextReminders: string[] = [];
    if (preferVision && reactTurn > 1) contextReminders.push('提醒：用户原始消息包含参考图片。');
    // Fix-5: pipeline 后卫模式下收敛催促消息，避免 LLM panic 做破坏性操作
    if (!pipelineCompleted && reactTurn > 5) {
      contextReminders.push(`提醒：已执行 ${reactTurn - 1} 轮，请尽快完成剩余任务。`);
    }
    if (pipelineCompleted && reactTurn > 15) {
      contextReminders.push('提醒：已对模板做了较多调整，若整体效果满意可直接告知用户结论。');
    }
    if (skipFirstCheckRound && reactTurn === (startReactTurn ?? 1)) {
      contextReminders.push('提醒：上轮检查发现遗漏，请补充。');
    }
    if (activePlan) {
      contextReminders.push(formatPlanProgress(activePlan));
      const hasPending = activePlan.some(s => s.status !== 'completed');
      if (hasPending) {
        contextReminders.push('提醒：仍有未完成的计划步骤，请继续执行工具调用完成剩余任务，不要仅用文字总结。');
      }
    }
    const hasActiveTask = activePlan !== null || reactTurn > 1;
    // Fix-5: pipeline 后卫模式下不强催（LLM 的自主判断权被尊重）
    if (!forceFinalRound && hasActiveTask && !pipelineCompleted) {
      contextReminders.push('⚡ 现在立即输出 <tool> 调用执行下一步，不要只回复文字。');
    }
    const reminderMessages: LlmMessage[] = contextReminders.length > 0
      ? [{ role: 'user' as const, content: contextReminders.join('\n') }]
      : [];

    const modelMessages = [...baseMessages, ...compactToolResults(temporaryMessages), ...reminderMessages];
    let thinkBuffer = '';
    let answerBuffer = '';
    const preDetectedToolIds = new Set<string>();
    let emittedToolStartCount = 0;
    let emittedToolCompleteCount = 0;
    // 本轮被拦截的图片 src 非法工具调用 ID（在 onAnswerDelta 中判定，在 streaming 后过滤）
    const urlBlockedToolCallIds = new Set<string>();

    const isFirstTurn = reactTurn === 1;
    await streamLlmResponse(
      'chat',
      {
        messages: modelMessages,
        enableTools: !forceFinalRound,
        preferVision,
        pipelineCompleted,
        ...(systemPromptOverride ? { systemPromptOverride } : {}),
        logContext: {
          reactRound: reactTurn,
          isUserMessage: (firstTurnIsUserMessage && isFirstTurn) ?? false,
          includeSystemPrompt: (firstTurnIsUserMessage && isFirstTurn) ?? false,
          conversationId,
          assistantMessageId,
          runId,
          phase,
          zoneTag,
          ...((firstTurnIsUserMessage && isFirstTurn && firstTurnUserMessage)
            ? { userMessage: firstTurnUserMessage }
            : {}),
        },
      },
      {
        onThinkDelta: (delta) => {
          thinkBuffer += delta;
          sendNdjson(reply, { type: 'assistant.think.delta', messageId: assistantMessageId, delta, schemaVersion: 1 });
        },
        onAnswerDelta: (delta) => {
          answerBuffer += delta;
          sendNdjson(reply, { type: 'assistant.answer.delta', messageId: assistantMessageId, delta, schemaVersion: 1 });
          const starts = extractToolStarts(answerBuffer);
          while (emittedToolStartCount < starts.length) {
            const start = starts[emittedToolStartCount];
            const toolCallId = `${toolIdPrefix}-${start.index}`;
            preDetectedToolIds.add(toolCallId);
            sendNdjson(reply, { type: 'tool.call.detected', toolCallId, name: start.name, args: {}, schemaVersion: 1 });
            sendNdjson(reply, { type: 'tool.call.running', toolCallId, schemaVersion: 1 });
            emittedToolStartCount += 1;
          }
          const completeCalls = extractToolCalls(answerBuffer, toolIdPrefix);
          while (emittedToolCompleteCount < completeCalls.length) {
            const call = completeCalls[emittedToolCompleteCount];
            if (isClientTool(call.name) && !PIPELINE_INTERCEPTED_TOOLS.has(call.name)) {
              if (isUngroundedImageUpdate(call, temporaryMessages)) {
                // 图片 src 未出现在对话上下文中（非 searchPexelsImage 结果，非用户提供），拦截
                sendNdjson(reply, {
                  type: 'tool.call.failed',
                  toolCallId: call.toolCallId,
                  error: '图片地址未通过合法渠道获取，已拦截',
                  schemaVersion: 1,
                });
                urlBlockedToolCallIds.add(call.toolCallId);
              } else {
                sendNdjson(reply, { type: 'tool.call.client_ready', toolCallId: call.toolCallId, name: call.name, args: call.args, schemaVersion: 1 });
              }
            }
            emittedToolCompleteCount += 1;
          }
        },
      },
      signal
    );

    const rawToolCalls = extractToolCalls(answerBuffer, toolIdPrefix);

    // Fix-6a: 工具名白名单过滤，对无效工具名立即返回明确错误，不让 LLM 误以为成功
    const validatedToolCalls: ParsedToolCall[] = [];
    for (const call of rawToolCalls) {
      if (!REGISTERED_TOOLS.has(call.name)) {
        sendNdjson(reply, {
          type: 'tool.call.completed',
          toolCallId: call.toolCallId,
          result: {
            ok: false,
            error: `工具 "${call.name}" 不存在。可用工具：${[...REGISTERED_TOOLS].join(', ')}`,
          },
          schemaVersion: 1,
        });
        temporaryMessages.push({
          role: 'user',
          content: `[工具错误] 工具 "${call.name}" 不存在，此调用已被忽略。请使用合法工具名。`,
        });
      } else {
        validatedToolCalls.push(call);
      }
    }

    // 单轮去重：避免同轮重复 getTemplateState / captureCanvasPreview 调用
    let dedupedToolCalls: ParsedToolCall[] = [];
    const readToolSigs = new Set<string>();
    let dedupedReadCalls = 0;
    for (const call of validatedToolCalls) {
      if (call.name === 'getTemplateState' || call.name === 'captureCanvasPreview'
          || call.name === 'getComponentState' || call.name === 'getComponentPreview') {
        const sig = `${call.name}:${JSON.stringify(call.args)}`;
        if (readToolSigs.has(sig)) {
          dedupedReadCalls += 1;
          continue;
        }
        readToolSigs.add(sig);
      }
      dedupedToolCalls.push(call);
    }

    // Pipeline 后卫模式：硬拦截破坏性工具，返回软拒绝（不触发 LLM panic）
    if (pipelineCompleted) {
      const blockedInPipelineMode = new Set(['clearTemplateOrSubtree', 'planTemplate']);
      for (const call of dedupedToolCalls) {
        if (blockedInPipelineMode.has(call.name)) {
          const refusalMsg = call.name === 'clearTemplateOrSubtree'
            ? '[工具提示] 模板已通过管线生成，不允许清空画布。请使用 updateTemplateComponent 进行局部修正。'
            : '[工具提示] 模板已通过管线生成，不需要重新规划。请直接使用工具进行局部修正。';
          sendNdjson(reply, {
            type: 'tool.call.completed', toolCallId: call.toolCallId,
            result: { ok: false, blocked: true, reason: refusalMsg },
            schemaVersion: 1,
          });
          temporaryMessages.push({ role: 'user', content: refusalMsg });
        }
      }
      dedupedToolCalls = dedupedToolCalls.filter((call) => !blockedInPipelineMode.has(call.name));
    }

    // 阶段白名单：暂关闭 phase 过滤，LLM 输出的合法工具一律保留；原 draft/phase 状态机逻辑保留在下方注释，日后可能恢复。
    // const phaseAllowed = getAllowedToolsForPhase(phase, pipelineCompleted, activePlan);
    // const phaseFilteredDedupedCalls = dedupedToolCalls.filter((call) => phaseAllowed.has(call.name));
    // const droppedByPhase = dedupedToolCalls.length - phaseFilteredDedupedCalls.length;
    const phaseFilteredDedupedCalls = dedupedToolCalls;
    const droppedByPhase = 0;

    // 会话预算：限制 getTemplateState / captureCanvasPreview 总调用次数（只对通过相位过滤的工具计数）
    const budgetedToolCalls: ParsedToolCall[] = [];
    let droppedStateCalls = 0;
    let droppedPreviewCalls = 0;
    for (const call of phaseFilteredDedupedCalls) {
      if (call.name === 'getTemplateState') {
        if (usedStateCalls >= maxStateCalls) {
          droppedStateCalls += 1;
          continue;
        }
        usedStateCalls += 1;
      }
      if (call.name === 'captureCanvasPreview') {
        if (usedPreviewCalls >= maxPreviewCalls) {
          droppedPreviewCalls += 1;
          continue;
        }
        usedPreviewCalls += 1;
      }
      budgetedToolCalls.push(call);
    }

    const phaseFilteredToolCalls = budgetedToolCalls;

    // 单轮预算：超出时截断，降低单轮大批量输出导致的长耗时
    const toolCallsBeforeUrlBlock = phaseFilteredToolCalls.slice(0, maxToolsPerTurn);
    const urlBlockedInToolCalls = urlBlockedToolCallIds.size > 0
      ? toolCallsBeforeUrlBlock.filter((c) => urlBlockedToolCallIds.has(c.toolCallId))
      : [];
    const toolCalls = urlBlockedToolCallIds.size > 0
      ? toolCallsBeforeUrlBlock.filter((c) => !urlBlockedToolCallIds.has(c.toolCallId))
      : toolCallsBeforeUrlBlock;
    const droppedByTurnBudget = phaseFilteredToolCalls.length - toolCallsBeforeUrlBlock.length;
    const droppedTotal = dedupedReadCalls + droppedStateCalls + droppedPreviewCalls + droppedByPhase + droppedByTurnBudget;
    if (droppedTotal > 0) {
      // Fix-3c: 简化预算提示为单行，减少上下文噪音
      const budgetReminder = `[系统提示] 本轮限流：phase不匹配=${droppedByPhase}，超状态配额=${droppedStateCalls}，超截图配额=${droppedPreviewCalls}，去重=${dedupedReadCalls}，超单轮预算=${droppedByTurnBudget}。`;
      temporaryMessages.push({ role: 'user', content: budgetReminder });
      logLlmFlowEvent({
        event: 'react.turn.tool_budget_applied',
        context: {
          reactRound: reactTurn,
          isUserMessage: false,
          conversationId,
          assistantMessageId,
          runId,
        },
        detail: {
          rawToolCallCount: rawToolCalls.length,
          keptToolCallCount: toolCalls.length,
          dedupedReadCalls,
          droppedStateCalls,
          droppedPreviewCalls,
          droppedByPhase,
          droppedByTurnBudget,
          phase,
          usedStateCalls,
          usedPreviewCalls,
        },
      });
    }
    // 图片来源拦截：向 LLM 注入修正消息，引导其调用 searchPexelsImage 重试
    if (urlBlockedInToolCalls.length > 0) {
      for (const call of urlBlockedInToolCalls) {
        const src = ((call.args?.props) as Record<string, unknown> | undefined)?.src;
        const correctionMsg = `[工具拦截] updateTemplateComponent 中的图片 src "${typeof src === 'string' ? src : ''}" 未出现在对话上下文中，属于无效来源，此次调用已被阻止。\n请先调用 searchPexelsImage（传入 2-4 个描述图片主题的英文关键词），获取 bestUrl 后再调用 updateTemplateComponent 更新 src。`;
        temporaryMessages.push({ role: 'user', content: correctionMsg });
      }
      logLlmFlowEvent({
        event: 'react.turn.image_url_blocked',
        context: { reactRound: reactTurn, isUserMessage: false, conversationId, assistantMessageId, runId },
        detail: { blockedCount: urlBlockedInToolCalls.length, blockedSrcs: urlBlockedInToolCalls.map((c) => ((c.args?.props) as Record<string, unknown> | undefined)?.src) },
      });
    }

    zoneTag = inferZoneTagFromTools(toolCalls, phase);
    const cleanedAnswer = removeToolTags(answerBuffer);
    logLlmFlowEvent({
      event: 'react.turn.llm.completed',
      context: {
        reactRound: reactTurn,
        isUserMessage: (firstTurnIsUserMessage && isFirstTurn) ?? false,
        conversationId,
        assistantMessageId,
        runId,
        phase,
        zoneTag,
      },
      detail: {
        toolCallCount: toolCalls.length,
        thinkChars: thinkBuffer.length,
        answerChars: cleanedAnswer.length,
      },
    });

    // Fix-3a: 仅在有实质内容时持久化 assistant 消息，避免空消息污染上下文
    const hasSubstance = cleanedAnswer.trim().length > 0 || toolCalls.length > 0;
    if (hasSubstance) {
      await insertChatMessage({
        id: assistantMessageId,
        conversation_id: conversationId,
        user_id: userId,
        role: 'assistant',
        business_role: 'assistant_answer',
        source_type: 'assistant',
        react_turn: reactTurn,
        content: cleanedAnswer,
        think_content: thinkBuffer || null,
        tool_calls: toolCalls.length > 0 ? toolCalls.map((c) => ({ id: c.toolCallId, name: c.name, args: c.args })) : null,
        tool_name: null,
        tool_call_id: null,
        tool_status: null,
        created_at: Date.now(),
      });
    }
    temporaryMessages.push({ role: 'assistant', content: cleanedAnswer.trim() });
    sendNdjson(reply, { type: 'assistant.completed', messageId: assistantMessageId, schemaVersion: 1 });

    if (forceFinalRound) break;

    if (toolCalls.length === 0) {
      // 只要本轮 LLM 有输出过 tool（即便被预算/URL 限流掉），就简单追加一轮请求，不依赖 draft 状态机
      if (rawToolCalls.length > 0 && reactTurn < maxTurns) {
        reactTurn += 1;
        continue;
      }

      // Fix-2: pipeline 后卫模式下禁止 phase 空转晋升，直接中断当前循环
      if (pipelineCompleted) {
        stopReason = 'no_tools';
        break;
      }

      // ---------- 以下为 draft/phase 状态机（未产生工具时自动切阶段并注入提示），暂关闭，日后可能恢复 ----------
      // if ((phase === 'draft' || phase === 'structure') && reactTurn < maxTurns) {
      //   const oldPhase = phase;
      //   const nextPhase: ReactPhase = phase === 'draft' ? 'structure' : 'style';
      //   const phaseHint = phase === 'draft'
      //     ? '[系统阶段提示] 初稿阶段未产生工具，切换到结构补齐阶段，请优先补齐缺失组件。'
      //     : '[系统阶段提示] 结构阶段未产生工具，切换到样式收敛阶段，请优先做间距/颜色/字号修正。';
      //   phase = nextPhase;
      //   if (!pipelineCompleted) {
      //     temporaryMessages.push({ role: 'user', content: phaseHint });
      //   }
      //   logLlmFlowEvent({
      //     event: 'react.phase.changed',
      //     context: {
      //       reactRound: reactTurn,
      //       isUserMessage: false,
      //       conversationId,
      //       assistantMessageId,
      //       runId,
      //     },
      //     detail: { from: oldPhase, to: nextPhase, reason: 'no_tools_in_phase' },
      //   });
      //   reactTurn += 1;
      //   continue;
      // }

      // 有未完成的计划步骤时，注入重试提示继续循环而非直接终止
      const pendingPlanSteps = activePlan?.filter(s => s.status !== 'completed') ?? [];
      if (pendingPlanSteps.length > 0 && noToolRetryCount < MAX_NO_TOOL_RETRIES && reactTurn < maxTurns) {
        noToolRetryCount += 1;
        const nextStep = pendingPlanSteps[0];
        const retryMsg = noToolRetryCount <= 2
          ? `⚠️ 你刚才只输出了文字，没有生成工具调用。计划中还有 ${pendingPlanSteps.length} 步未完成（下一步 [${nextStep.index}]: ${nextStep.description}）。请立即输出 <tool> 调用来执行这一步。不要解释，直接输出工具调用。`
          : `⚠️ 严重警告：你已连续 ${noToolRetryCount} 次未输出工具调用！还有 ${pendingPlanSteps.length} 步未完成。下一步 [${nextStep.index}]: ${nextStep.description}。请直接输出如下格式的工具调用（不要输出任何其他文字）：\n<tool name="addComponentToTemplate">{"type":"需要的组件类型","parentId":"父容器ID（如有）"}</tool>`;
        const retryId = nanoid();
        await insertChatMessage({
          id: retryId, conversation_id: conversationId, user_id: userId,
          role: 'user', business_role: 'tool_result_injected_user', source_type: 'tool_result_injected_user',
          react_turn: reactTurn, content: retryMsg, think_content: null,
          tool_calls: null, tool_name: null, tool_call_id: null, tool_status: null,
          created_at: Date.now(),
        });
        temporaryMessages.push({ role: 'user', content: retryMsg });
        console.log(`[chat/react] no-tool retry ${noToolRetryCount}/${MAX_NO_TOOL_RETRIES} conversationId=${conversationId} pendingSteps=${pendingPlanSteps.length}`);
        logLlmFlowEvent({
          event: 'react.turn.no_tool_retry',
          context: {
            reactRound: reactTurn,
            isUserMessage: false,
            conversationId,
            assistantMessageId,
            runId,
          },
          detail: {
            retry: noToolRetryCount,
            maxRetry: MAX_NO_TOOL_RETRIES,
            pendingPlanSteps: pendingPlanSteps.length,
            nextStepIndex: nextStep.index,
          },
        });
        reactTurn += 1;
        continue;
      }

      if (enableCheckRound && usedCheckRounds < maxCheckRounds && !skipCheckThisTurn && getCheckRoundMessages && reactTurn <= maxTurns) {
        usedCheckRounds += 1;
        // 检查轮：以专用 system prompt 重新判断是否还有工具需要调用
        const checkMessages = getCheckRoundMessages();
        const assistantMessageIdCheck = nanoid();
        const toolIdPrefixCheck = `check-${assistantMessageIdCheck}`;
        sendNdjson(reply, { type: 'assistant.placeholder', messageId: assistantMessageIdCheck, schemaVersion: 1 });

        let thinkBufferCheck = '';
        let answerBufferCheck = '';
        const preDetectedToolIdsCheck = new Set<string>();
        let emittedToolStartCountCheck = 0;
        let emittedToolCompleteCountCheck = 0;

        await streamLlmResponse(
          'check',
          {
            messages: checkMessages,
            enableTools: true,
            preferVision,
            systemPromptOverride: buildCheckRoundSystemPrompt(),
            logContext: {
              reactRound: 0,
              isUserMessage: false,
              isCheckRound: true,
              includeSystemPrompt: false,
              conversationId,
              assistantMessageId: assistantMessageIdCheck,
              runId,
            },
          },
          {
            onThinkDelta: (delta) => {
              thinkBufferCheck += delta;
              sendNdjson(reply, { type: 'assistant.think.delta', messageId: assistantMessageIdCheck, delta, schemaVersion: 1 });
            },
            onAnswerDelta: (delta) => {
              answerBufferCheck += delta;
              sendNdjson(reply, { type: 'assistant.answer.delta', messageId: assistantMessageIdCheck, delta, schemaVersion: 1 });
              const starts = extractToolStarts(answerBufferCheck);
              while (emittedToolStartCountCheck < starts.length) {
                const start = starts[emittedToolStartCountCheck];
                const toolCallId = `${toolIdPrefixCheck}-${start.index}`;
                preDetectedToolIdsCheck.add(toolCallId);
                sendNdjson(reply, { type: 'tool.call.detected', toolCallId, name: start.name, args: {}, schemaVersion: 1 });
                sendNdjson(reply, { type: 'tool.call.running', toolCallId, schemaVersion: 1 });
                emittedToolStartCountCheck += 1;
              }
              const completeCallsCheck = extractToolCalls(answerBufferCheck, toolIdPrefixCheck);
              while (emittedToolCompleteCountCheck < completeCallsCheck.length) {
                const call = completeCallsCheck[emittedToolCompleteCountCheck];
                if (isClientTool(call.name) && !PIPELINE_INTERCEPTED_TOOLS.has(call.name)) {
                  sendNdjson(reply, { type: 'tool.call.client_ready', toolCallId: call.toolCallId, name: call.name, args: call.args, schemaVersion: 1 });
                }
                emittedToolCompleteCountCheck += 1;
              }
            },
          },
          signal
        );

        const toolCallsCheck = extractToolCalls(answerBufferCheck, toolIdPrefixCheck);
        const cleanedAnswerCheck = removeToolTags(answerBufferCheck);

        // Fix-3a: check round 也仅在有实质内容时持久化
        const hasSubstanceCheck = cleanedAnswerCheck.trim().length > 0 || toolCallsCheck.length > 0;
        if (hasSubstanceCheck) {
          await insertChatMessage({
            id: assistantMessageIdCheck,
            conversation_id: conversationId,
            user_id: userId,
            role: 'assistant',
            business_role: 'assistant_answer',
            source_type: 'assistant',
            react_turn: reactTurn,
            content: cleanedAnswerCheck,
            think_content: thinkBufferCheck || null,
            tool_calls: toolCallsCheck.length > 0 ? toolCallsCheck.map((c) => ({ id: c.toolCallId, name: c.name, args: c.args })) : null,
            tool_name: null,
            tool_call_id: null,
            tool_status: null,
            created_at: Date.now(),
          });
        }
        temporaryMessages.push({ role: 'assistant', content: cleanedAnswerCheck.trim() });
        sendNdjson(reply, { type: 'assistant.completed', messageId: assistantMessageIdCheck, schemaVersion: 1 });

        if (toolCallsCheck.length === 0) {
          stopReason = 'check_round_no_tools';
          break;
        }

        const interceptResultCheck = await interceptPlanTools(toolCallsCheck, activePlan, {
          reply, conversationId, userId,
          assistantMessageId: assistantMessageIdCheck,
          reactTurn, temporaryMessages,
          preDetectedToolIds: preDetectedToolIdsCheck,
          originalUserMessages: originalUserMessages ?? [],
          preferVision,
        });
        activePlan = interceptResultCheck.activePlan;
        const remainingChecks = interceptResultCheck.remaining;

        const serverToolCallsCheck = remainingChecks.filter((c) => !isClientTool(c.name));
        const clientToolCallsCheck = remainingChecks.filter((c) => isClientTool(c.name));

        if (serverToolCallsCheck.length > 0) {
          const toolExecResultCheck = await executeTools(serverToolCallsCheck);
          await emitAndPersistServerToolResults(toolExecResultCheck, {
            reply, conversationId, userId,
            assistantMessageId: assistantMessageIdCheck,
            reactTurn, preDetectedToolIds: preDetectedToolIdsCheck, temporaryMessages,
          });
        }

        if (clientToolCallsCheck.length > 0) {
          console.log(`[chat/stream] awaiting_client_tools conversationId=${conversationId} reactTurn=${reactTurn} fromCheckRound=true tools=[${clientToolCallsCheck.map((c) => c.name).join(',')}]`);
          logLlmFlowEvent({
            event: 'react.turn.awaiting_client_tools',
            context: {
              reactRound: reactTurn,
              isUserMessage: false,
              isCheckRound: true,
              conversationId,
              assistantMessageId: assistantMessageIdCheck,
              runId,
            },
            detail: {
              toolNames: clientToolCallsCheck.map((c) => c.name),
              toolCallIds: clientToolCallsCheck.map((c) => c.toolCallId),
              fromCheckRound: true,
            },
          });
          sendNdjson(reply, {
            type: 'conversation.awaiting_tool_results',
            conversationId,
            assistantMessageId: assistantMessageIdCheck,
            pendingToolCalls: clientToolCallsCheck.map((c) => ({ toolCallId: c.toolCallId, name: c.name, args: c.args })),
            reactTurn,
            fromCheckRound: true,
            planState: activePlan ?? undefined,
            runId,
            schemaVersion: 1,
          });
          stopReason = 'awaiting_client_tools';
          break;
        }

        skipCheckThisTurn = false;
        reactTurn += 1;
        continue;
      }
      // skipFirstCheckRound 只影响第一轮，此后允许检查轮
      skipCheckThisTurn = false;
      // /stream/continue：无工具则直接结束
      stopReason = 'no_tools';
      break;
    }

    noToolRetryCount = 0;

    // 先拦截 plan 工具，再按前端/后端分流
    const interceptResult = await interceptPlanTools(toolCalls, activePlan, {
      reply, conversationId, userId, assistantMessageId,
      reactTurn, temporaryMessages, preDetectedToolIds,
      originalUserMessages: originalUserMessages ?? [],
      preferVision,
    });
    activePlan = interceptResult.activePlan;

    // 拦截 createTemplateFromImage → 后端管线执行
    const pipelineResult = await interceptPipelineTool(interceptResult.remaining, {
      reply, conversationId, userId, assistantMessageId,
      reactTurn, runId, temporaryMessages, preDetectedToolIds,
      originalUserMessages: originalUserMessages ?? [],
      signal,
    });
    const remainingTools = pipelineResult.remaining;

    // 管线处理了 createTemplateFromImage → 作为客户端工具等待前端回传结果
    if (pipelineResult.pipelineHandled) {
      if (phase !== 'structure') {
        const oldPhase = phase;
        phase = 'structure';
        logLlmFlowEvent({
          event: 'react.phase.changed',
          context: {
            reactRound: reactTurn,
            isUserMessage: false,
            conversationId,
            assistantMessageId,
            runId,
          },
          detail: { from: oldPhase, to: phase, reason: 'pipeline_completed' },
        });
      }
      const otherClientTools = remainingTools.filter((c) => isClientTool(c.name));
      const serverTools = remainingTools.filter((c) => !isClientTool(c.name));
      if (serverTools.length > 0) {
        const toolExecResult = await executeTools(serverTools);
        await emitAndPersistServerToolResults(toolExecResult, {
          reply, conversationId, userId, assistantMessageId,
          reactTurn, preDetectedToolIds, temporaryMessages,
        });
      }
      // 管线工具作为客户端工具等待 /stream/continue
      const pendingToolCalls: Array<{ toolCallId: string; name: string; args: Record<string, unknown>; silent?: boolean }> = [
        ...toolCalls.filter((c) => c.name === 'createTemplateFromImage').map((c) => ({
          toolCallId: c.toolCallId, name: c.name, args: c.args,
        })),
        ...otherClientTools.map((c) => ({
          toolCallId: c.toolCallId, name: c.name, args: c.args,
        })),
      ];
      // 管线完成后直接做 LLM 总结（无验证管线、无 ReAct），再让前端应用组件
      if (pipelineResult.summaryData) {
        await runPipelineSummaryTurn({
          reply, conversationId, userId, runId,
          originalUserMsgs: pipelineResult.summaryData.originalUserMsgs,
          createResultSummary: pipelineResult.summaryData.createResultSummary,
          preferVision,
          signal,
        });
      }
      if (pendingToolCalls.length > 0) {
        sendNdjson(reply, {
          type: 'conversation.awaiting_tool_results',
          conversationId, assistantMessageId,
          pendingToolCalls,
          reactTurn,
          fromCheckRound: false,
          planState: activePlan ?? undefined,
          runId,
          phase: 'pipeline_done' as const,
          schemaVersion: 1,
        });
        stopReason = 'awaiting_client_tools';
        break;
      }
      reactTurn += 1;
      continue;
    }

    const serverToolCalls = remainingTools.filter((c) => !isClientTool(c.name));
    const clientToolCalls = remainingTools.filter((c) => isClientTool(c.name));

    if (serverToolCalls.length > 0) {
      const toolExecResult = await executeTools(serverToolCalls);
      await emitAndPersistServerToolResults(toolExecResult, {
        reply, conversationId, userId, assistantMessageId,
        reactTurn, preDetectedToolIds, temporaryMessages,
      });
    }

    if (clientToolCalls.length > 0) {
      console.log(`[chat/stream] awaiting_client_tools conversationId=${conversationId} reactTurn=${reactTurn} tools=[${clientToolCalls.map((c) => c.name).join(',')}]`);
      logLlmFlowEvent({
        event: 'react.turn.awaiting_client_tools',
        context: {
          reactRound: reactTurn,
          isUserMessage: false,
          conversationId,
          assistantMessageId,
          runId,
          phase,
          zoneTag,
        },
        detail: {
          toolNames: clientToolCalls.map((c) => c.name),
          toolCallIds: clientToolCalls.map((c) => c.toolCallId),
          fromCheckRound: false,
        },
      });
      sendNdjson(reply, {
        type: 'conversation.awaiting_tool_results',
        conversationId,
        assistantMessageId,
        pendingToolCalls: clientToolCalls.map((c) => ({ toolCallId: c.toolCallId, name: c.name, args: c.args })),
        reactTurn,
        fromCheckRound: false,
        planState: activePlan ?? undefined,
        runId,
        ...(fixPhaseOverride
          ? { phase: 'fix_step' as const, fixStepIndex: fixPhaseOverride.fixStepIndex }
          : {}),
        schemaVersion: 1,
      });
      stopReason = 'awaiting_client_tools';
      break;
    }

    if (reactTurn >= maxTurns) {
      const forced = '请根据以上的内容，做一个最终给用户的回复';
      const forcedId = nanoid();
      await insertChatMessage({
        id: forcedId,
        conversation_id: conversationId,
        user_id: userId,
        role: 'user',
        business_role: 'tool_result_injected_user',
        source_type: 'tool_result_injected_user',
        react_turn: reactTurn + 1,
        content: forced,
        think_content: null,
        tool_calls: null,
        tool_name: null,
        tool_call_id: null,
        tool_status: null,
        created_at: Date.now(),
      });
      temporaryMessages.push({ role: 'user', content: forced });
      reactTurn += 1;
      forceFinalRound = true;
      stopReason = 'forced_final_round';
      continue;
    }

    skipCheckThisTurn = false;
    reactTurn += 1;
  }

  logLlmFlowEvent({
    event: 'react.loop.finished',
    context: {
      reactRound: reactTurn,
      isUserMessage: false,
      conversationId,
      runId,
      phase,
      zoneTag,
    },
    detail: {
      endedByForceFinalRound: forceFinalRound,
      lastTurn: reactTurn,
      stopReason,
      usedStateCalls,
      usedPreviewCalls,
      usedCheckRounds,
    },
  });
  return stopReason;
}

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: NewConversationBody }>('/api/chat/conversations', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const now = Date.now();
    const id = nanoid();
    await createChatConversation({
      id,
      user_id: userId,
      title: req.body?.title?.trim() || '新会话',
      status: 'active',
      created_at: now,
      updated_at: now,
      last_message_at: now,
    });
    return reply.send({ id });
  });

  app.get<{ Params: { id: string } }>('/api/chat/conversations/:id/messages', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const id = req.params.id;
    const conv = await getChatConversationById(id, userId);
    if (!conv) return reply.status(404).send({ error: '会话不存在' });
    const rows = await listRecentChatMessages(id, userId, 200);
    const changeCards = await listChangeCardsForConversation(id, userId);
    const cardByMessageAndTool = new Map<string, (typeof changeCards)[0]>();
    for (const card of changeCards) {
      const key = `${card.assistant_message_id}\0${card.tool_call_id ?? ''}`;
      cardByMessageAndTool.set(key, card);
    }
    // 从 tool_result 消息中提取 planTemplate 的 plan 数据，按 tool_call_id 索引
    const planResultByToolCallId = new Map<string, unknown>();
    for (const row of rows) {
      if (row.source_type === 'tool_result_injected_user' && row.tool_name === 'planTemplate' && row.tool_call_id) {
        const content = typeof row.content === 'string' ? row.content : '';
        const jsonStart = content.indexOf('[');
        if (jsonStart >= 0) {
          try {
            const parsed = JSON.parse(content.slice(jsonStart));
            if (Array.isArray(parsed)) planResultByToolCallId.set(row.tool_call_id, parsed);
          } catch { /* ignore parse errors */ }
        }
      }
    }

    // 历史对话仅返回可展示消息：user_direct、assistant；assistant 带上 tool_calls 与 changeCard
    const visible = rows
      .reverse()
      .filter((row) => row.source_type === 'user_direct' || row.source_type === 'assistant')
      .map((row) => {
        const base = {
          id: row.id,
          role: row.role,
          content: row.content,
          think_content: row.think_content,
          created_at: row.created_at,
        };
        if (row.role === 'assistant' && Array.isArray(row.tool_calls) && row.tool_calls.length > 0) {
          const toolCalls = (row.tool_calls as Array<{ id?: string; name?: string; args?: Record<string, unknown> }>).map((tc) => {
            const tid = typeof tc.id === 'string' ? tc.id : '';
            const card = cardByMessageAndTool.get(`${row.id}\0${tid}`);
            const changeCard = card
              ? {
                  id: card.id,
                  summary: card.summary,
                  status: card.status,
                  toolCallId: tid,
                  targetComponentId: card.target_component_id ?? undefined,
                  beforePatch: card.before_patch as Record<string, unknown> | undefined,
                  afterPatch: card.after_patch as Record<string, unknown> | undefined,
                }
              : undefined;
            const result = (typeof tc.name === 'string' && tc.name === 'planTemplate' && planResultByToolCallId.has(tid))
              ? { ok: true, plan: planResultByToolCallId.get(tid) }
              : undefined;
            return {
              id: tid,
              name: typeof tc.name === 'string' ? tc.name : 'tool',
              args: tc.args ?? {},
              changeCard,
              result,
            };
          });
          return { ...base, tool_calls: toolCalls };
        }
        return base;
      });
    return reply.send({ messages: visible });
  });

  app.get('/api/chat/conversations', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const rows = await listChatConversations(userId);
    return reply.send({
      conversations: rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
      })),
    });
  });

  app.put<{ Params: { id: string }; Body: { title?: string } }>('/api/chat/conversations/:id/title', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const id = req.params.id;
    const title = (req.body?.title ?? '').trim();
    if (!title) return reply.status(400).send({ error: 'title 不能为空' });
    const limited = Array.from(title).slice(0, 10).join('');
    const ok = await updateChatConversationTitle(id, userId, limited);
    if (!ok) return reply.status(404).send({ error: '会话不存在' });
    return reply.send({ ok: true });
  });

  /** 仅当前会话支持撤回：body.conversationId 必须与该卡片所属会话一致，历史会话不可撤回 */
  app.post<{ Params: { id: string }; Body: { conversationId: string } }>('/api/chat/change-cards/:id/undo', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const id = req.params.id;
    const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
    const card = await getChatChangeCardById(id, userId);
    if (!card) return reply.status(404).send({ error: '改动卡片不存在' });
    if (card.conversation_id !== conversationId) {
      return reply.status(403).send({ error: '仅当前会话支持撤回，历史会话中的改动不可撤回' });
    }
    if (card.status === 'reverted') return reply.send({ ok: true, status: 'reverted', ops: [] });
    const ok = await updateChatChangeCardStatus(id, userId, 'reverted', Date.now());
    const ops = await listChatChangeOps(id);
    if (card.template_id) {
      await applyCardOpsOnTemplate(card.template_id, userId, ops, 'undo');
    }
    return reply.send({ ok, status: 'reverted', ops });
  });

  /** 仅当前会话支持恢复：同上 */
  app.post<{ Params: { id: string }; Body: { conversationId: string } }>('/api/chat/change-cards/:id/redo', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const id = req.params.id;
    const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
    const card = await getChatChangeCardById(id, userId);
    if (!card) return reply.status(404).send({ error: '改动卡片不存在' });
    if (card.conversation_id !== conversationId) {
      return reply.status(403).send({ error: '仅当前会话支持恢复，历史会话中的改动不可恢复' });
    }
    if (card.status === 'applied') return reply.send({ ok: true, status: 'applied', ops: [] });
    const ok = await updateChatChangeCardStatus(id, userId, 'applied', Date.now());
    const ops = await listChatChangeOps(id);
    if (card.template_id) {
      await applyCardOpsOnTemplate(card.template_id, userId, ops, 'redo');
    }
    return reply.send({ ok, status: 'applied', ops });
  });

  app.post<{ Body: StreamBody }>('/api/chat/stream', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const body = req.body ?? ({} as StreamBody);
    const input = (body.message ?? '').trim();
    if (!input) return reply.status(400).send({ error: 'message 不能为空' });
    const imageAttachments = normalizeImageAttachments(body.attachments);

    const conversationId = await ensureConversation(userId, body.conversationId);
    const runId = `run-${Date.now()}-${nanoid(8)}`;
    const recentBeforeInsert = await listRecentChatMessages(conversationId, userId, 1);
    const isFirstUserMessage = recentBeforeInsert.length === 0;

    // 先插入当前用户消息，后续查询可感知到它（用于去重）
    const now = Date.now();
    const userMessageId = nanoid();
    await insertChatMessage({
      id: userMessageId,
      conversation_id: conversationId,
      user_id: userId,
      role: 'user',
      business_role: 'user_direct',
      source_type: 'user_direct',
      react_turn: 1,
      content: input,
      think_content: null,
      tool_calls: null,
      tool_name: null,
      tool_call_id: null,
      tool_status: null,
      created_at: now,
    });
    await touchChatConversation(conversationId, userId, now);

    setNdjsonHeaders(reply, typeof req.headers.origin === 'string' ? req.headers.origin : undefined);

    sendNdjson(reply, { type: 'conversation.started', conversationId, schemaVersion: 1 });
    logLlmFlowEvent({
      event: 'stream.started',
      context: {
        reactRound: 1,
        isUserMessage: true,
        userMessage: input,
        conversationId,
        runId,
      },
      detail: {
        isFirstUserMessage,
        hasImageInRequest: imageAttachments.length > 0,
        hasPlanState: Array.isArray(body.planState) && body.planState.length > 0,
      },
    });

    if (isFirstUserMessage) {
      void (async () => {
        const title = await generateConversationTitle(input);
        const limited = Array.from(title.trim()).slice(0, 10).join('');
        if (!limited) return;
        const ok = await updateChatConversationTitle(conversationId, userId, limited);
        if (!ok) return;
        if (reply.raw.writableEnded) return;
        sendNdjson(reply, {
          type: 'conversation.title.updated',
          conversationId,
          title: limited,
          schemaVersion: 1,
        });
      })();
    }

    const ac = new AbortController();
    req.raw.on('close', () => ac.abort());

    try {
      const hasImageInContext = imageAttachments.length > 0;
      const maxTurns = resolveReactLoopMaxTurns();
      const maxToolsPerTurn = resolveMaxToolsPerTurn();
      const maxStateCalls = resolveMaxStateCalls();
      const maxPreviewCalls = resolveMaxPreviewCalls();
      const maxCheckRounds = resolveMaxCheckRounds();
      const enableCheckRound = resolveEnableCheckRound(hasImageInContext);

      // 构建 baseMessages：首条消息无先前上下文；非首条则拼「最近用户请求」片段 + 去重的最近 N 条
      let baseMessages: LlmMessage[];

      if (isFirstUserMessage) {
        baseMessages = [];
      } else {
        // 取最近 N 条（insert 之后查询），排除当前条（当前条在 temporaryMessages 中），严格按时间正序（越靠下越近）
        const recentRows = await listRecentChatMessages(conversationId, userId, 10);
        const dedupedRows = recentRows.filter(r => r.id !== userMessageId).reverse();
        baseMessages = dedupedRows.map(parseRoleForModel);
      }

      // 临时上下文：本轮 ReAct 内产生的用户消息、助手回复、工具结果，逐轮累加
      const temporaryMessages: LlmMessage[] = [
        hasImageInContext
          ? { role: 'user', content: buildUserMultimodalContent(input, imageAttachments) }
          : { role: 'user', content: input },
      ];

      const originalUserMsgs: LlmMessage[] = [
        hasImageInContext
          ? { role: 'user', content: buildUserMultimodalContent(input, imageAttachments) }
          : { role: 'user', content: input },
      ];

      const initialPlanState = Array.isArray(body.planState) ? (body.planState as PlanStep[]) : undefined;

      await runReactLoop({
        reply, conversationId, userId,
        baseMessages,
        temporaryMessages,
        preferVision: hasImageInContext,
        maxTurns,
        toolIdPrefixBase: 'turn',
        firstTurnIsUserMessage: true,
        firstTurnUserMessage: input,
        enableCheckRound,
        originalUserMessages: originalUserMsgs,
        initialPlanState,
        signal: ac.signal,
        runId,
        maxToolsPerTurn,
        maxStateCalls,
        maxPreviewCalls,
        maxCheckRounds,
      });

      await touchChatConversation(conversationId, userId, Date.now());
    } catch (err) {
      if (err instanceof AbortedError || (err instanceof Error && err.name === 'AbortError')) {
        console.log(`[chat/stream] aborted conversationId=${conversationId}`);
        logLlmFlowEvent({
          event: 'stream.aborted',
          context: {
            reactRound: 0,
            isUserMessage: false,
            conversationId,
            runId,
          },
        });
      } else {
        const message = err instanceof Error ? err.message : '聊天执行失败';
        logLlmFlowEvent({
          event: 'stream.error',
          context: {
            reactRound: 0,
            isUserMessage: false,
            conversationId,
            runId,
          },
          detail: { message },
        });
        if (!reply.raw.writableEnded) sendNdjson(reply, { type: 'error', message, schemaVersion: 1 });
      }
    } finally {
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  });

  // ── 总结轮：无工具、精简上下文 ───────────────────────────────────────
  async function runSummaryTurn(ctx: {
    reply: FastifyReply;
    conversationId: string;
    userId: string;
    runId: string;
    originalUserMsgs: LlmMessage[];
    createResultSummary: string;
    verifyIssues: VerificationIssue[];
    fixResults: Array<{ stepDescription: string; outcome: string }>;
    hasImage: boolean;
    signal?: AbortSignal;
  }): Promise<void> {
    const issuesSummary =
      ctx.verifyIssues.length === 0
        ? '验证通过，未发现需要修正的问题。'
        : `共发现 ${ctx.verifyIssues.length} 处问题：\n` +
          ctx.verifyIssues.map((i) => `  - ${i.detail ?? i.code}`).join('\n');
    const fixSummary =
      ctx.fixResults.length === 0
        ? ''
        : `\n\n已修复步骤：\n` +
          ctx.fixResults.map((r, i) => `  ${i + 1}. ${r.stepDescription}：${r.outcome}`).join('\n');

    const summaryContextMsg: LlmMessage = {
      role: 'user',
      content: `[创建结果] ${ctx.createResultSummary}\n\n[验证结果] ${issuesSummary}${fixSummary}\n\n请根据以上信息，向用户做简洁总结。`,
    };

    const summaryMsgId = nanoid();
    sendNdjson(ctx.reply, { type: 'assistant.placeholder', messageId: summaryMsgId, schemaVersion: 1 });

    logLlmFlowEvent({
      event: 'verify.summary_turn.started',
      context: {
        reactRound: 0,
        isUserMessage: false,
        conversationId: ctx.conversationId,
        assistantMessageId: summaryMsgId,
        runId: ctx.runId,
      },
      detail: {
        issueCount: ctx.verifyIssues.length,
        fixResultCount: ctx.fixResults.length,
        hasImage: ctx.hasImage,
        inputMsgCount: ctx.originalUserMsgs.length + 1,
      },
    });

    let accAnswer = '';
    try {
      await streamLlmResponse(
        'chat',
        {
          messages: [...ctx.originalUserMsgs, summaryContextMsg],
          enableTools: false,
          preferVision: ctx.hasImage,
          systemPromptOverride: buildSummarySystemPrompt(),
          logContext: {
            reactRound: 0,
            isUserMessage: false,
            includeSystemPrompt: true,
            conversationId: ctx.conversationId,
            assistantMessageId: summaryMsgId,
            runId: ctx.runId,
            phase: 'final',
            zoneTag: 'verify-summary',
          },
        },
        {
          onThinkDelta: () => {},
          onAnswerDelta: (delta) => {
            accAnswer += delta;
            sendNdjson(ctx.reply, { type: 'assistant.answer.delta', messageId: summaryMsgId, delta, schemaVersion: 1 });
          },
        },
        ctx.signal,
      );
    } catch (e) {
      console.error('[chat] runSummaryTurn failed:', e);
    }

    await insertChatMessage({
      id: summaryMsgId, conversation_id: ctx.conversationId, user_id: ctx.userId,
      role: 'assistant', business_role: 'assistant', source_type: 'llm_summary',
      react_turn: 1, content: accAnswer,
      think_content: null, tool_calls: null, tool_name: null, tool_call_id: null,
      tool_status: null, created_at: Date.now(),
    }).catch(() => {});
    sendNdjson(ctx.reply, { type: 'assistant.completed', messageId: summaryMsgId, schemaVersion: 1 });
  }

  // ── 验证修复 Plan：逐步串行，每步独立上下文 ──────────────────────────
  async function runVerifyFixPlan(ctx: {
    reply: FastifyReply;
    conversationId: string;
    userId: string;
    assistantMessageId: string;
    originalUserMsgs: LlmMessage[];
    verifyCtx: VerifyContext;
    issues: VerificationIssue[];
    hasImage: boolean;
    runId: string;
    signal?: AbortSignal;
    /** fix_step 续流时：从第几个 issue 开始（相对于原始 allIssues） */
    startFromIndex?: number;
    /** fix_step 续流时：之前步骤已有的结果 */
    priorFixResults?: Array<{ stepDescription: string; outcome: string }>;
  }): Promise<void> {
    const { issues, originalUserMsgs, verifyCtx } = ctx;
    const startFrom = ctx.startFromIndex ?? 0;

    // 续流时跳过 Plan Card（已经发送过），初次进入时发送
    if (startFrom === 0) {
      const planSteps: PlanStep[] = issues.map((issue, i) => ({
        index: i,
        description: `修复：${issue.detail ?? issue.code}`,
        status: 'pending' as const,
      }));
      const planMsgId = nanoid();
      sendNdjson(ctx.reply, { type: 'assistant.placeholder', messageId: planMsgId, schemaVersion: 1 });
      const planToolCallId = `fix-plan-${nanoid(8)}`;
      sendNdjson(ctx.reply, { type: 'tool.call.detected', toolCallId: planToolCallId, name: 'planTemplate', args: {}, schemaVersion: 1 });
      sendNdjson(ctx.reply, { type: 'tool.call.running', toolCallId: planToolCallId, schemaVersion: 1 });
      sendNdjson(ctx.reply, {
        type: 'tool.call.completed',
        toolCallId: planToolCallId,
        result: { ok: true, plan: planSteps },
        schemaVersion: 1,
      });
      sendNdjson(ctx.reply, { type: 'assistant.completed', messageId: planMsgId, schemaVersion: 1 });
    }

    const fixResults: Array<{ stepDescription: string; outcome: string }> = ctx.priorFixResults ? [...ctx.priorFixResults] : [];

    // 逐步串行执行（续流时从 startFrom 开始，issues 已被调用方裁剪为剩余部分）
    const allIssues = verifyCtx.allIssues ?? issues;
    const totalIssues = allIssues.length;
    for (let i = 0; i < issues.length; i++) {
      if (ctx.signal?.aborted) break;
      const issue = issues[i];
      const globalStepIndex = startFrom + i; // 在原始 allIssues 中的真实下标
      const stepDesc = `修复：${issue.detail ?? issue.code}`;

      // 通知前端：当前子任务开始
      sendNdjson(ctx.reply, {
        type: 'fix.step.started',
        stepIndex: globalStepIndex,
        totalSteps: totalIssues,
        description: stepDesc,
        ...(issue.componentId ? { componentId: issue.componentId } : {}),
        schemaVersion: 1,
      });

      // 为每步创建独立上下文
      const stepTaskMsg: LlmMessage = {
        role: 'user',
        content: `当前任务（第 ${globalStepIndex + 1}/${totalIssues} 步）：${issueToTaskDescription(issue)}\n\n完成后调用 markPlanStepDone({ "stepIndex": ${globalStepIndex} })。`,
      };
      const isolatedBase: LlmMessage[] = [...originalUserMsgs, stepTaskMsg];
      const stepTempMessages: LlmMessage[] = [];
      const stepSystemPrompt = buildFixStepSystemPrompt(issue, globalStepIndex, totalIssues);

      // 构造当前步骤的 fix plan 状态（已完成步骤标记 completed，当前及后续标记 pending）
      const fixPlanForStep: PlanStep[] = allIssues.map((iss, idx) => ({
        index: idx,
        description: `修复：${iss.detail ?? iss.code}`,
        status: idx < globalStepIndex ? 'completed' as const : 'pending' as const,
      }));

      // 运行修复 ReAct（最多 4 轮，独立上下文）
      let stepOutcome = '已尝试修复';
      let stepPaused = false;
      try {
        const stepStopReason = await runReactLoop({
          reply: ctx.reply,
          conversationId: ctx.conversationId,
          userId: ctx.userId,
          baseMessages: isolatedBase,
          temporaryMessages: stepTempMessages,
          preferVision: ctx.hasImage,
          maxTurns: 4,
          toolIdPrefixBase: `fix-${i}`,
          firstTurnIsUserMessage: false,
          enableCheckRound: false,
          startReactTurn: 1,
          skipFirstCheckRound: true,
          originalUserMessages: originalUserMsgs,
          signal: ctx.signal,
          runId: ctx.runId,
          maxToolsPerTurn: 6,
          maxStateCalls: 2,
          maxPreviewCalls: 0,
          maxCheckRounds: 0,
          pipelineCompleted: true,
          systemPromptOverride: stepSystemPrompt,
          fixPhaseOverride: { fixStepIndex: globalStepIndex },
          initialPlanState: fixPlanForStep,
        });
        if (stepStopReason === 'awaiting_client_tools') {
          // 步骤因客户端工具暂停，必须等续流完成后再进行下一步
          // 续流的 /stream/continue 会用 fixStepIndex 恢复并继续后续步骤
          stepPaused = true;
        } else {
          stepOutcome = '已完成';
        }
      } catch (e) {
        console.warn(`[verify fix] step ${i} failed:`, e);
        stepOutcome = '执行失败';
      }

      fixResults.push({ stepDescription: stepDesc, outcome: stepOutcome });

      if (stepPaused) {
        // 步骤因等待客户端工具而暂停，退出循环。
        // 保存本步骤已累积的临时消息（隔离上下文续流关键），供 /stream/continue 重建该步骤的独立上下文。
        const updatedCtx: VerifyContext = {
          ...verifyCtx,
          currentFixStepIndex: globalStepIndex, // 仍在该步骤，未完成
          fixResults,
          pausedStepTempMessages: [...stepTempMessages] as VerifyContext['pausedStepTempMessages'],
        };
        await saveVerifyContext(ctx.conversationId, ctx.userId, updatedCtx).catch(() => {});
        // 续流（/stream/continue?phase=fix_step&fixStepIndex=N）会负责恢复并继续后续步骤。
        return;
      }

      // 步骤正常完成：保存进度，清空暂停状态
      const updatedCtx: VerifyContext = {
        ...verifyCtx,
        currentFixStepIndex: globalStepIndex + 1,
        fixResults,
        pausedStepTempMessages: undefined,
      };
      await saveVerifyContext(ctx.conversationId, ctx.userId, updatedCtx).catch(() => {});
    }

    // 所有步骤完成后运行总结
    await runSummaryTurn({
      reply: ctx.reply,
      conversationId: ctx.conversationId,
      userId: ctx.userId,
      runId: ctx.runId,
      originalUserMsgs: ctx.originalUserMsgs,
      createResultSummary: `生成了 ${verifyCtx.components.length} 个顶层组件，${verifyCtx.sections.length} 个区域`,
      verifyIssues: issues,
      fixResults,
      hasImage: ctx.hasImage,
      signal: ctx.signal,
    });
  }

  // ---- /api/chat/stream/continue ----
  // 前端执行完画布工具后，将结果回传，后端持久化并继续 ReAct 循环
  app.post<{ Body: ContinueBody }>('/api/chat/stream/continue', async (req, reply) => {
    const userId = (req as AuthRequest).userId;
    const body = req.body ?? ({} as ContinueBody);
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    const assistantMessageId = typeof body.assistantMessageId === 'string' ? body.assistantMessageId.trim() : '';
    if (!conversationId) return reply.status(400).send({ error: 'conversationId 不能为空' });
    if (!assistantMessageId) return reply.status(400).send({ error: 'assistantMessageId 不能为空' });

    const conv = await getChatConversationById(conversationId, userId);
    if (!conv) return reply.status(404).send({ error: '会话不存在' });

    const toolResults = Array.isArray(body.toolResults) ? body.toolResults : [];
    const incomingReactTurn = typeof body.reactTurn === 'number' && body.reactTurn >= 1 ? body.reactTurn : 1;
    const fromCheckRound = body.fromCheckRound === true;
    const incomingPlanState = Array.isArray(body.planState) ? body.planState as PlanStep[] : undefined;
    const incomingPhase = typeof body.phase === 'string' ? body.phase as 'verification_v7' | 'fix_step' | 'pipeline_done' : undefined;
    const incomingVerifyToolCallId = typeof body.verifyToolCallId === 'string' ? body.verifyToolCallId : undefined;
    const incomingFixStepIndex = typeof body.fixStepIndex === 'number' ? body.fixStepIndex : undefined;
    const runId = typeof body.runId === 'string' && body.runId.trim().length > 0
      ? body.runId.trim()
      : `run-${Date.now()}-${nanoid(8)}`;
    // 图片附件：前端回传的图片集合（既可能包含用户原图，也可能包含工具生成截图）
    // 保留 name 字段，供 verification_v7 阶段区分设计稿与画布截图（canvas-preview.jpg）
    const imageAttachments = Array.isArray(body.imageAttachments)
      ? (body.imageAttachments as Array<{ mimeType: string; dataUrl: string; name?: string }>)
          .filter((a) => typeof a.dataUrl === 'string' && typeof a.mimeType === 'string')
      : [];
    // 仅“用户原图”注入到 user message；工具截图（canvas/component preview）不挂在用户消息下方
    const userImageAttachments = imageAttachments.filter((a) => {
      const n = typeof a.name === 'string' ? a.name : '';
      if (n === 'canvas-preview.jpg') return false;
      if (/^component-.*-preview\.jpg$/i.test(n)) return false;
      return true;
    });
    const hasImage = imageAttachments.length > 0;
    const hasUserImage = userImageAttachments.length > 0;
      const maxTurns = resolveReactLoopMaxTurns();
      const maxToolsPerTurn = resolveMaxToolsPerTurn();
      const maxStateCalls = resolveMaxStateCalls();
      const maxPreviewCalls = resolveMaxPreviewCalls();
      const maxCheckRounds = resolveMaxCheckRounds();
      const enableCheckRound = resolveEnableCheckRound(hasImage);

    setNdjsonHeaders(reply, typeof req.headers.origin === 'string' ? req.headers.origin : undefined);

    const ac = new AbortController();
    req.raw.on('close', () => ac.abort());

    console.log(`[chat/stream/continue] conversationId=${conversationId} toolCount=${toolResults.length} hasImage=${hasImage} reactTurn=${incomingReactTurn} fromCheckRound=${fromCheckRound} toolCallIds=[${toolResults.map((r) => r.toolCallId).join(',')}]`);
    logLlmFlowEvent({
      event: 'stream.continue.started',
      context: {
        reactRound: incomingReactTurn,
        isUserMessage: false,
        conversationId,
        assistantMessageId,
        runId,
      },
      detail: {
        toolCount: toolResults.length,
        hasImage,
        fromCheckRound,
        toolCallIds: toolResults.map((r) => r.toolCallId),
      },
    });

    try {
      // 1. 持久化前端回传的客户端工具结果（幂等：toolCallId 已入库的跳过）
      const continueTempMessages: LlmMessage[] = [];
      const processedToolCallIds = await emitAndPersistClientToolResults(toolResults, {
        reply, conversationId, userId, assistantMessageId,
        reactTurn: 1, temporaryMessages: continueTempMessages,
      });

      // 2. 加载最近 N 条严格按时间正序（越靠下越近），仅排除本次刚写入的工具结果（已在 continueTempMessages 中）
      // 这里不要跳过空 assistant：首轮仅输出 <tool> 时 content 为空，但其时序位置必须保留
      const recentRows = await listRecentChatMessages(conversationId, userId, 12);
      const dedupedRows = recentRows.filter(r => {
        if (r.tool_call_id && processedToolCallIds.has(r.tool_call_id)) return false;
        return true;
      }).reverse();
      const contextMessages = dedupedRows.map((row, i) => {
        const msg = parseRoleForModel(row);
        if (hasUserImage && msg.role === 'user') {
          const laterHasUser = dedupedRows.slice(i + 1).some((r) => r.role === 'user');
          if (!laterHasUser) return { ...msg, content: buildUserMultimodalContent(row.content, userImageAttachments) };
        }
        return msg;
      });
      const baseMessages: LlmMessage[] = contextMessages;

      // 原始用户消息（供 planTemplate Sub-Agent 使用）
      const recentUserDirectRows = await listRecentUserDirectMessages(conversationId, userId, 1);
      const latestUserDirect = recentUserDirectRows.length > 0 ? recentUserDirectRows[0] : null;
      const originalUserText = latestUserDirect?.content ?? '';
      const originalUserMsgs: LlmMessage[] = [
        hasUserImage
          ? { role: 'user', content: buildUserMultimodalContent(originalUserText, userImageAttachments) }
          : { role: 'user', content: originalUserText },
      ];

      // Fix-1: 读取历史 pipelineCompleted 标志（跨 continue 持久化）
      const hadPipelineHistorically = await getConversationPipelineCompleted(conversationId, userId);
      const pipelineCompleted = hadPipelineHistorically;

      // ── 管线应用完成：仅持久化工具结果，不走 ReAct ─────────────────────
      if (incomingPhase === 'pipeline_done') {
        await touchChatConversation(conversationId, userId, Date.now());
        return;
      }

      // ── 验证管线阶段：V7 视觉对比 ────────────────────────────────────
      if (incomingPhase === 'verification_v7') {
        // 读取 V1-V6 结果和验证上下文
        const rawCtx = await getVerifyContext(conversationId, userId);
        const verifyCtx = rawCtx as VerifyContext | null;
        if (!verifyCtx) {
          sendNdjson(reply, { type: 'error', message: '验证上下文丢失，跳过视觉对比', schemaVersion: 1 });
        } else {
          const verifyCallId = incomingVerifyToolCallId ?? verifyCtx.verifyToolCallId;
          const v1to6Issues: VerificationIssue[] = Array.isArray(verifyCtx.v1to6Issues) ? verifyCtx.v1to6Issues : [];

          // 前端将截图放入 imageAttachments（name: 'canvas-preview.jpg'），而非 result 中
          const canvasPreviewAttachment = imageAttachments.find((a) => a.name === 'canvas-preview.jpg');
          const screenshotBase64 = canvasPreviewAttachment
            ? canvasPreviewAttachment.dataUrl.replace(/^data:image\/[a-z]+;base64,/, '')
            // 兼容旧格式（直接在 result 中返回）
            : typeof toolResults.find((r) => r.name === 'captureCanvasPreview')?.result?.base64 === 'string'
              ? toolResults.find((r) => r.name === 'captureCanvasPreview')!.result.base64 as string
              : typeof toolResults.find((r) => r.name === 'captureCanvasPreview')?.result?.screenshotDataUrl === 'string'
                ? (toolResults.find((r) => r.name === 'captureCanvasPreview')!.result.screenshotDataUrl as string).replace(/^data:image\/[a-z]+;base64,/, '')
                : null;

          // 设计稿图片（排除画布截图，取第一张用户上传的参考图）
          const designImageAttachment = imageAttachments.find((a) => a.name !== 'canvas-preview.jpg') ?? imageAttachments[0];

          let v7Issues: VerificationIssue[] = [];
          if (screenshotBase64 && designImageAttachment) {
            // V7 verify.step.started 由 runVisualVerify 内部回调统一发射，此处不重复发射
            v7Issues = await runVisualVerify(
              designImageAttachment.dataUrl,
              screenshotBase64,
              {
                onStepStart: (step) => {
                  sendNdjson(reply, { type: 'verify.step.started', step, schemaVersion: 1 });
                },
                onStepComplete: (step) => {
                  sendNdjson(reply, { type: 'verify.step.completed', step, schemaVersion: 1 });
                },
                onStepResult: (step, output) => {
                  sendNdjson(reply, { type: 'verify.step.result', step, output, schemaVersion: 1 });
                },
              },
              ac.signal,
            ).catch((e) => {
              console.warn('[chat] V7 visual verify failed:', e);
              sendNdjson(reply, { type: 'verify.step.completed', step: 'verify_visual', schemaVersion: 1 });
              return [];
            });
          }

          const allIssues = [...v1to6Issues, ...v7Issues];

          // 完成 runVerificationPipeline 工具调用
          sendNdjson(reply, {
            type: 'tool.call.completed',
            toolCallId: verifyCallId,
            result: {
              ok: true,
              issueCount: allIssues.length,
              issues: allIssues,
            },
            schemaVersion: 1,
          });
          sendNdjson(reply, { type: 'verify.completed', issues: allIssues, schemaVersion: 1 });

          // 保存完整验证结果
          const updatedCtx: VerifyContext = { ...verifyCtx, allIssues };
          await saveVerifyContext(conversationId, userId, updatedCtx).catch(() => {});

          // 过渡文字：告知用户验证结果，给 plan/summary 一个自然的衔接
          {
            const transitionMsgId = nanoid();
            const transitionText = allIssues.length === 0
              ? '质量验证全部通过，模板各项指标均符合要求。'
              : `质量验证完成，共发现 ${allIssues.length} 处需要优化的问题，正在制定修复计划…`;
            sendNdjson(reply, { type: 'assistant.placeholder', messageId: transitionMsgId, schemaVersion: 1 });
            sendNdjson(reply, { type: 'assistant.answer.delta', messageId: transitionMsgId, delta: transitionText, schemaVersion: 1 });
            sendNdjson(reply, { type: 'assistant.completed', messageId: transitionMsgId, schemaVersion: 1 });
            await insertChatMessage({
              id: transitionMsgId, conversation_id: conversationId, user_id: userId,
              role: 'assistant', business_role: 'assistant', source_type: 'llm_answer',
              react_turn: 1, content: transitionText,
              think_content: null, tool_calls: null, tool_name: null,
              tool_call_id: null, tool_status: null, created_at: Date.now(),
            }).catch(() => {});
          }

          // 分支：issues 为空 → 总结；否则 → 修复 Plan
          if (allIssues.length === 0) {
            await runSummaryTurn({
              reply,
              conversationId,
              userId,
              runId,
              originalUserMsgs,
              createResultSummary: `生成了 ${verifyCtx.components.length} 个顶层组件，${verifyCtx.sections.length} 个区域`,
              verifyIssues: [],
              fixResults: [],
              hasImage,
              signal: ac.signal,
            });
          } else {
            await runVerifyFixPlan({
              reply,
              conversationId,
              userId,
              assistantMessageId,
              originalUserMsgs,
              verifyCtx: updatedCtx,
              issues: allIssues,
              hasImage,
              runId,
              signal: ac.signal,
            });
          }
        }

        await touchChatConversation(conversationId, userId, Date.now());
        return;
      }

      // ── fix_step 续流：某个修复步骤因客户端工具暂停，当前 continue 继续执行 ──
      if (incomingPhase === 'fix_step' && incomingFixStepIndex !== undefined) {
        const rawCtx = await getVerifyContext(conversationId, userId);
        const verifyCtx = rawCtx as VerifyContext | null;
        if (!verifyCtx || !Array.isArray(verifyCtx.allIssues)) {
          sendNdjson(reply, { type: 'error', message: '修复上下文丢失，跳过剩余步骤', schemaVersion: 1 });
        } else {
          const currentIssue = verifyCtx.allIssues[incomingFixStepIndex];
          if (currentIssue) {
            const totalIssues = verifyCtx.allIssues.length;
            const fixStepSystemPrompt = buildFixStepSystemPrompt(currentIssue, incomingFixStepIndex, totalIssues);

            // 通知前端：续流恢复同一子任务
            sendNdjson(reply, {
              type: 'fix.step.started',
              stepIndex: incomingFixStepIndex,
              totalSteps: totalIssues,
              description: `修复：${currentIssue.detail ?? currentIssue.code}`,
              ...(currentIssue.componentId ? { componentId: currentIssue.componentId } : {}),
              schemaVersion: 1,
            });

            // ── 重建该步骤的隔离上下文（而非使用 DB 全量历史）──────────────
            // 隔离基础 = 原始用户请求 + 当前步骤任务描述（与初次执行时完全相同）
            const stepTaskMsg: LlmMessage = {
              role: 'user',
              content: `当前任务（第 ${incomingFixStepIndex + 1}/${totalIssues} 步）：${issueToTaskDescription(currentIssue)}\n\n完成后调用 markPlanStepDone({ "stepIndex": ${incomingFixStepIndex} })。`,
            };
            const isolatedBase: LlmMessage[] = [...originalUserMsgs, stepTaskMsg];

            // 本步骤已累积的临时消息（暂停前服务端工具结果）+ 本次续流的客户端工具结果
            const pausedTempMessages = Array.isArray(verifyCtx.pausedStepTempMessages)
              ? (verifyCtx.pausedStepTempMessages as LlmMessage[])
              : [];
            const stepTempMessages: LlmMessage[] = [...pausedTempMessages, ...continueTempMessages];

            // 构造当前步骤的 fix plan 状态（已完成步骤标记 completed，当前及后续标记 pending）
            const fixPlanForStep: PlanStep[] = verifyCtx.allIssues.map((iss, idx) => ({
              index: idx,
              description: `修复：${iss.detail ?? iss.code}`,
              status: idx < incomingFixStepIndex ? 'completed' as const : 'pending' as const,
            }));

            logLlmFlowEvent({
              event: 'stream.continue.started',
              context: { reactRound: incomingReactTurn, isUserMessage: false, conversationId, assistantMessageId, runId },
              detail: {
                phase: 'fix_step',
                fixStepIndex: incomingFixStepIndex,
                isolatedBaseCount: isolatedBase.length,
                pausedTempCount: pausedTempMessages.length,
                continueTempCount: continueTempMessages.length,
              },
            });

            const stepStopReason = await runReactLoop({
              reply, conversationId, userId,
              baseMessages: isolatedBase,       // ← 隔离上下文，不含前序步骤历史
              temporaryMessages: stepTempMessages,
              preferVision: hasImage,
              maxTurns: 4,
              toolIdPrefixBase: `fixcont-${incomingFixStepIndex}`,
              firstTurnIsUserMessage: false,
              enableCheckRound: false,
              startReactTurn: incomingReactTurn,
              originalUserMessages: originalUserMsgs,
              signal: ac.signal,
              runId,
              maxToolsPerTurn: 6,
              maxStateCalls: 2,
              maxPreviewCalls: 0,
              maxCheckRounds: 0,
              pipelineCompleted: true,
              systemPromptOverride: fixStepSystemPrompt,
              fixPhaseOverride: { fixStepIndex: incomingFixStepIndex },
              initialPlanState: fixPlanForStep,
            });

            if (stepStopReason === 'awaiting_client_tools') {
              // 步骤再次暂停：更新 pausedStepTempMessages（加入本轮新产生的结果）
              const updatedCtx: VerifyContext = {
                ...verifyCtx,
                pausedStepTempMessages: [...stepTempMessages] as VerifyContext['pausedStepTempMessages'],
              };
              await saveVerifyContext(conversationId, userId, updatedCtx).catch(() => {});
            } else {
              // 当前步骤已完成，清空暂停状态，继续执行后续步骤
              const previousFixResults = Array.isArray(verifyCtx.fixResults) ? verifyCtx.fixResults : [];
              const completedCtx: VerifyContext = {
                ...verifyCtx,
                currentFixStepIndex: incomingFixStepIndex + 1,
                fixResults: [...previousFixResults, { stepDescription: `修复：${currentIssue.detail ?? currentIssue.code}`, outcome: '已完成' }],
                pausedStepTempMessages: undefined,
              };
              await saveVerifyContext(conversationId, userId, completedCtx).catch(() => {});

              const remainingIssues = verifyCtx.allIssues.slice(incomingFixStepIndex + 1);
              if (remainingIssues.length > 0) {
                await runVerifyFixPlan({
                  reply, conversationId, userId, assistantMessageId,
                  originalUserMsgs,
                  verifyCtx: completedCtx,
                  issues: remainingIssues,
                  hasImage, runId,
                  signal: ac.signal,
                  startFromIndex: incomingFixStepIndex + 1,
                  priorFixResults: completedCtx.fixResults ?? [],
                });
              } else {
                // 所有步骤完成，运行总结
                await runSummaryTurn({
                  reply, conversationId, userId, runId,
                  originalUserMsgs,
                  createResultSummary: `生成了 ${verifyCtx.components.length} 个顶层组件，${verifyCtx.sections.length} 个区域`,
                  verifyIssues: verifyCtx.allIssues as VerificationIssue[],
                  fixResults: completedCtx.fixResults ?? [],
                  hasImage,
                  signal: ac.signal,
                });
              }
            }
          }
        }
        await touchChatConversation(conversationId, userId, Date.now());
        return;
      }

      // Fix-4: pipeline 后卫模式下，在上下文开头注入"已完成"提示，防止被空消息淹没
      if (pipelineCompleted) {
        baseMessages.unshift({
          role: 'user',
          content: '[上下文] createTemplateFromImage 已成功完成，画布中已有完整组件树。当前任务仅限于校验与微调。',
        });
      }

      await runReactLoop({
        reply, conversationId, userId,
        baseMessages,
        temporaryMessages: continueTempMessages,
        preferVision: hasImage,
        maxTurns,
        toolIdPrefixBase: 'cont',
        firstTurnIsUserMessage: false,
        enableCheckRound,
        startReactTurn: incomingReactTurn,
        originalUserMessages: originalUserMsgs,
        initialPlanState: incomingPlanState,
        signal: ac.signal,
        runId,
        maxToolsPerTurn,
        maxStateCalls,
        maxPreviewCalls,
        maxCheckRounds,
        pipelineCompleted,
      });

      await touchChatConversation(conversationId, userId, Date.now());
    } catch (err) {
      if (err instanceof AbortedError || (err instanceof Error && err.name === 'AbortError')) {
        console.log(`[chat/stream/continue] aborted conversationId=${conversationId}`);
        logLlmFlowEvent({
          event: 'stream.continue.aborted',
          context: {
            reactRound: incomingReactTurn,
            isUserMessage: false,
            conversationId,
            assistantMessageId,
            runId,
          },
        });
      } else {
        const message = err instanceof Error ? err.message : '继续执行失败';
        logLlmFlowEvent({
          event: 'stream.continue.error',
          context: {
            reactRound: incomingReactTurn,
            isUserMessage: false,
            conversationId,
            assistantMessageId,
            runId,
          },
          detail: { message },
        });
        if (!reply.raw.writableEnded) sendNdjson(reply, { type: 'error', message, schemaVersion: 1 });
      }
    } finally {
      if (!reply.raw.writableEnded) reply.raw.end();
    }
  });
}
