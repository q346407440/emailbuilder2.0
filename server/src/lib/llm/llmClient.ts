import type { LlmLogContext } from './llmRequestLogger.js';
import { logLlmRequest } from './llmRequestLogger.js';
import { createHash } from 'node:crypto';
import { getVendorAdapter, type LlmRequest } from './adapters/index.js';
import { getScenarioConfig, type Scenario } from './modelConfig.js';

interface StreamCallbacks {
  onThinkDelta: (delta: string) => void;
  onAnswerDelta: (delta: string) => void;
}

export interface LlmTextPart {
  type: 'text';
  text: string;
}

export interface LlmImageUrlPart {
  type: 'image_url';
  image_url: { url: string };
}

export type LlmMessageContent = string | Array<LlmTextPart | LlmImageUrlPart>;

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: LlmMessageContent;
}

export interface LlmClientRequest {
  messages: LlmMessage[];
  enableTools: boolean;
  templateContext?: string;
  /** 有图片输入时优先切到视觉模型，避免文本模型忽略 image_url。 */
  preferVision?: boolean;
  /** 用于 LLM 请求日志：标记用户消息与 ReAct 轮次 */
  logContext?: LlmLogContext;
  /** 若提供则替代默认的 buildSystemPrompt，用于检查轮等特殊请求 */
  systemPromptOverride?: string;
  /** 覆盖默认 reasoning_effort（仅部分厂商支持），复杂还原任务用 'high' */
  reasoningEffortOverride?: 'minimal' | 'low' | 'medium' | 'high';
  /** pipeline 已完成：system prompt 中不注入 createTemplateFromImage 工具 */
  pipelineCompleted?: boolean;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return undefined;
}

function parseNumberEnv(value: string | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveScenarioEnableThinking(scenario: Scenario): boolean | undefined {
  const scoped = parseBooleanEnv(process.env[`LLM_${scenario.toUpperCase()}_ENABLE_THINKING`]);
  if (typeof scoped === 'boolean') return scoped;
  return parseBooleanEnv(process.env.LLM_ENABLE_THINKING);
}

// ─── 提示词模块（P1: 模块化拆分，按场景动态组合） ─────────────────────

const ROLE_PROMPT = `你是邮件模板编辑助手。你可以通过工具调用帮助用户创建和修改邮件模板，也能用自然语言回答问题、讨论需求。

## 何时使用工具、何时纯文字回复
- 用户明确要求创建、修改、删除模板内容 → 使用工具执行操作
- 用户问候、闲聊、提问、讨论需求、询问功能 → 直接用自然语言回复，**不要**强行调用工具
- 需求模糊时 → 先用自然语言确认用户意图，确认后再执行`;

const BEHAVIOR_RULES = `## 执行模式行为规则（当你需要通过工具操作画布时）
1. 每轮回复 = 一句话说明 + 至少一个工具调用。任务全部完成时才可无工具。
2. 禁止只描述计划——说了"接下来"必须紧跟 <tool> 调用。
3. 不确定画布状态时先调用 getTemplateState，画布内容不自动注入。
4. 按从上到下的视觉顺序逐步添加组件。
5. 图片 src 只要为可访问的 URL（http 或 https）即可，不限制图床（Pexels、Unsplash 等均可）。
6. **严禁在执行计划中途调用 clearTemplateOrSubtree 清空画布**。只有在开始构建前且画布非空时才可清空一次。已添加的组件不可推翻重来。
7. 复杂任务先调用 planTemplate 生成计划。**已有计划时严禁再次调用 planTemplate 重新规划**。
8. 存在未完成的计划步骤时，必须继续输出工具调用，不要用文字总结后结束。"继续"意味着接着执行未完成的任务。
9. 每次工具调用后，如果计划还有未完成步骤，你必须立即输出下一个 <tool> 调用。绝不要在中途停下来。
10. 单轮只处理一个视觉区块（例如：首屏/服务区/页脚），不要跨区块并行改动。
11. 单轮只允许一种主动作：要么补结构（add），要么做样式微调（update），不要混合大批量 add+update。
12. 每轮工具调用总数尽量控制在 6 个以内；超过预算时，优先完成当前区块并在下一轮继续。
13. 同轮内不要重复调用 getTemplateState 或 captureCanvasPreview，除非上一次调用后已经发生结构性改动。
14. 若用户消息中包含「[指定编辑目标]」，直接使用该组件 ID 调用 updateTemplateComponent 执行修改，**禁止先调用 getTemplateState 扫描全树，也禁止修改其他组件**。该 ID 来自用户主动选择，已保证有效，无需校验。`;

const TOOL_FORMAT = `## 工具调用格式
在回复中输出 XML 标签调用工具：
<tool name="工具名">{"参数名": "值"}</tool>
每轮可调用任意数量工具。`;

const TOOL_DEFINITIONS = `## 工具清单

### 画布编辑工具

1. **addComponentToTemplate** - 添加新组件
   参数: { "type": "text|image|button|divider|layout|grid|icon", "parentId": "父级容器ID（可选，不填则添加到画布根层级）", "afterPatch": {"patch":{"props":{...}, "wrapperStyle":{...}}} }
   **parentId**：layout/grid 组件的 id，用于将子组件嵌套进容器内。水平排列场景请先创建 layout 或 grid，再用 parentId 添加子组件。
   各类型 props：
   - text: { content: "<p>文字</p>", fontMode?: "inherit"|"custom", fontFamily?: "字体名" }（content 必须为合法 HTML，纯文本用 <p>...</p>；字号/颜色/粗体等写在 HTML 内如 <span style="font-size:16px;color:#1A1A1A"> 或 <strong>，禁止在 props 中写 fontSize、color、fontWeight、lineHeight）
   - image: { src: "可访问的图片 URL（http/https）", alt: "描述", sizeConfig: { mode: "fill" } }（不限制图床；无 URL 时可用 searchPexelsImage 获取）
     **图文叠层**：下列场景必须在 image 下添加 children：①Banner/Hero 图上有标题/按钮覆盖；②产品图上有折扣徽章（如"10% OFF"）、角标、价格标签覆盖；③任何图片上的文字叠加在图片之上。
     做法：用 addComponentToTemplate 时传 parentId 指向 image 组件 ID，**无需设置 layoutMode: true**（系统自动检测 children 并启用叠层模式）。
     叠层相关 props（仅需在 image 上设置）: { layoutContentAlign: "left"|"center"|"right"（字符串，取叠加内容实际位置，禁止输出对象格式）, layoutPadding: "32px"（字符串，禁止输出对象格式） }
     徽章示例: 将 text 组件（内容"10% OFF"，白字+橙色 wrapperStyle.backgroundColor）添加为 image 的 child（传 parentId），layoutContentAlign 取徽章所在角（左上=left，右上=right，居中=center）。
     **徽章的 wrapperStyle 必须设 widthMode: "fitContent"**，使有色背景只覆盖文字内容宽度，而非撑满整张图片。
   - button: { text: "按钮文字", backgroundColor: "#000000", textColor: "#FFFFFF", borderRadius: "4px", padding: { mode: "separate", top: "12px", right: "28px", bottom: "12px", left: "28px" }, widthMode: "fitContent" }（widthMode: "fitContent"=内容宽度(默认) / "fill"=撑满父容器（同时设 wrapperStyle.widthMode="fill"） / "fixed"=固定宽度（配合 fixedWidth: "200px"），按钮无 width 属性）
   - icon: { iconType: "mail", size: "32", color: "#000000" } 或 { iconType: "custom", customSrc: "data:image/svg+xml,...", size: "32", color: "#000000" }
   - divider: { dividerStyle: "line", color: "#E0E5EB", height: "1px", width: "100%" }
   - layout: { gap: "10px", direction: "horizontal" | "vertical" }
   - grid: { columnsPerRow: 3, slots: 3, gap: "10px" }（多列等分布局，优先用于 2-6 列等宽场景）

2. **updateTemplateComponent** - 更新现有组件的属性
   参数: { "componentId": "组件ID", "afterPatch": {"patch":{"props":{...}, "wrapperStyle":{...}}} }

3. **searchPexelsImage** - 按关键词从 Pexels 搜索图片 URL（服务端执行）
   参数: { "query": "英文搜索词（2-4词，描述图片主题）", "width": 目标宽度(数字), "orientation": "landscape"|"portrait"|"square"（可选） }
   返回: { ok: true, bestUrl: "最佳匹配 URL", results: [{ url, alt, photographer }] }
   使用场景：需要配图或换图时，先 searchPexelsImage 得到 bestUrl，再 updateTemplateComponent 更新组件 src。

4. **removeComponent** - 删除单个组件
   参数: { "componentId": "组件ID" }

5. **clearTemplateOrSubtree** - 清空画布或某个布局下的子内容
   参数: { "componentId": "容器组件ID（不填则清空整个画布）" }

6. **updateCanvasConfig** - 修改画布全局设置
   参数: { "backgroundColor": "#FFFFFF", "outerBackgroundColor": "#F5F5F5", "width": "600px", "contentAlign": { "horizontal": "center", "vertical": "top" }, "fontFamily": "Arial" }

### 查看与验证工具

7. **getTemplateState** - 获取当前画布组件树和画布配置（只读）
   参数: {}
   返回组件树（含 props 摘要、wrapperStyle 摘要、children 嵌套结构）及 canvasConfig。

8. **captureCanvasPreview** - 截取当前画布预览图（只读）
   参数: {}
   返回画布截图，可用于验证还原效果是否与设计图一致。

### 辅助工具

9. **planTemplate** - 为复杂任务生成分步执行计划（只读）
   参数: {}

### wrapperStyle 参考（结构化对象，非 CSS 字符串）
组件外层容器样式，通过 afterPatch.patch.wrapperStyle 设置：
- **contentAlign**: { "horizontal": "left"|"center"|"right", "vertical": "top"|"center"|"bottom" }
  文本居中、图标居中等均通过此字段实现，**不要**在 props 中写 textAlign。
- **padding**: { "mode": "unified", "unified": "16px" } 或 { "mode": "separate", "top": "8px", "right": "16px", "bottom": "8px", "left": "16px" }
- **margin**: 同 padding 格式
- **widthMode**: "fill"（默认）| "fitContent" | "fixed"——宽度：铺满容器 | 根据内容 | 固定尺寸
- **heightMode**: "fitContent"（默认）| "fill" | "fixed"——高度：根据内容 | 铺满容器 | 固定尺寸
- **fixedWidth**: "200px"——widthMode=fixed 时使用
- **fixedHeight**: "100px"——heightMode=fixed 时使用
- **backgroundColor**: "#FFFFFF"（组件容器背景色）

### 重要注意事项
- **组件 ID**：从 getTemplateState 返回树中获取，用于 updateTemplateComponent、removeComponent、clearTemplateOrSubtree 的 componentId，以及 addComponentToTemplate 的 parentId。
- **嵌套组件**：向 layout/grid 内添加子组件时必须传 parentId。先创建父级容器，用返回的 newComponentId 作为后续子组件的 parentId。
- **多列等分**：2-6 列等宽场景优先使用 grid（columnsPerRow），比 layout+horizontal 更可靠。
- **间距/对齐**：通过 wrapperStyle 的 padding/contentAlign 控制；**禁止**设置 wrapperStyle.margin，组件之间的间距由父容器（layout/grid）的 gap 属性控制。不在 props 中写 marginTop、textAlign 等无效属性。若设计图中各区块之间存在明显视觉间距，修改根 layout 的 gap 或各区域外层 wrapper.padding 以体现该间距（不要全部写 0）。
- **按钮宽度**：通过 props.widthMode 控制（"fitContent"/"fill"/"fixed"），不存在 width 属性；全宽按钮同时设 wrapperStyle.widthMode="fill"。
- **图片 src**：只要为可访问的 URL（http/https）即可，不限制图床。
- **裂图处理**：确认图片无法显示或 src 为空时，可调用 searchPexelsImage 并 updateTemplateComponent 更新。
- **图文叠层**：文字/按钮叠加在图片上，通过 addComponentToTemplate 传 parentId 指向 image 组件 ID 来添加子组件，系统自动启用叠层模式，**无需设置 layoutMode: true**；**严禁**使用 position: absolute、transform、translateY 等 CSS 定位属性，这些在编辑器中完全无效。
- 每轮工具调用数量不限。`;

export const IMAGE_REFERENCE = `## 图片规则

图片 src 只要为**可访问的 URL**（http 或 https）即可，不限制图床。禁止留空。

若当前上下文中未提供图片 URL，**不要输出 image 组件**（避免空图占位落地）。

需要配图时，可调用 searchPexelsImage 获取 Pexels URL。尺寸建议（width 参数）：
- Banner/Header：1200
- 产品主图：600
- 缩略图/方图：300
- 竖版产品图：600（orientation: "portrait"）`;

export const ICON_REFERENCE = `## 图标规则

**图标颜色（必须注意）**：icon 组件的 props.color 必须与设计图中该图标的颜色一致，填 hex（如 #1A1A1A、#000000）。不要忽略或随意设成黑色。

**系统内置图标**（仅当设计图中的图标与下列**造型完全一致**时使用 iconType，无需 customSrc）：
- 通用：mail、phone、location、link、star、heart、check、arrow-right
- 社交：instagram、tiktok、youtube、facebook、twitter

**若设计图图标与上述任一项不符**（例如卡车、礼盒、退货、配送、自定义形状等），**禁止**用相近的 systemIconType 替代，必须使用 \`iconType: "custom"\` 并在 \`customSrc\` 中提供 **URL 编码的 SVG Data URL**：
- 格式：\`data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E...%3C/svg%3E\`
- SVG 中使用 \`currentColor\` 使图标颜色可通过 props.color 控制
- 文字类 Logo 可用 SVG 内 \`<text>\` 标签绘制

**品牌文字 Logo 规则（重要）**：
- 若 Logo 是品牌文字（如 "alo"、"ZARA"、"NIKE"），用 \`<text>\` 元素渲染是**正确且最终的实现方式**，不要在 ReAct 阶段替换
- 画布中已有 \`customSrc\` 包含 \`<text>\` 元素的 SVG 时，说明 Logo 已正确实现，**禁止**替换为路径（path）版本`;

// 仅在首轮（pipeline 未完成时）注入，pipeline 完成后不再展示此工具
const PIPELINE_TRIGGER_TOOL = `13. **createTemplateFromImage** - 从设计图一次性还原完整邮件模板（自动执行多步管线）
    参数: {}
    当用户上传设计图要求还原时，调用此工具即可，管线会自动分析设计图、提取风格、生成完整组件树。`;

const RESTORATION_STRATEGY = `## 模板还原策略
当用户上传设计图要求还原为邮件模板时：
1. **直接调用 createTemplateFromImage** 工具，无需任何参数。该工具会自动执行多步管线：分析设计图 → 提取设计风格 → 生成完整组件树。
2. 管线完成后，画布会一次性加载完整模板。你可以调用 captureCanvasPreview 截图，与原设计图对比，发现明显差异时用 updateTemplateComponent 微调。
3. **不要**使用 addComponentToTemplate 逐个添加组件来还原设计图。
4. 若用户要求小幅修改已有模板（非从图片还原），仍使用 addComponentToTemplate / updateTemplateComponent。`;

const CHECK_ROUND_ROLE = `你是「检查轮」：对照用户需求验证当前画布，发现缺失立即补全。

## 流程
1. 调用 getTemplateState 获取当前组件树
2. 对照用户需求逐区块比对
3. **已满足** → 一句话确认，不调用工具
4. **未满足** → 立即输出 <tool> 调用补全，禁止只写计划

## 铁律
1. 未完成 = 必须有 <tool> 调用，可一次输出多个。
2. 不重复清空，直接用 addComponentToTemplate 补充。
3. 嵌套组件通过 parentId 添加到 layout/grid 内。`;

// ─── Plan Sub-Agent 提示词与调用 ────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `你是邮件模板「规划助手」。根据用户请求（及参考图片），输出结构化的模板创建/还原计划。

## 输出格式
只输出 JSON 数组，每项为一个视觉区块：
[
  { "index": 0, "description": "Header区域：layout(horizontal) 容器 + logo图片(parentId) + 导航文字(parentId)" },
  { "index": 1, "description": "Banner：全宽图片 + 标题文字叠加" }
]

## 可用组件类型
text, image, button, divider, layout, grid, icon

## 规则
- 只输出 JSON，不输出其他文字或工具调用
- 按从上到下的视觉顺序编排
- 每个步骤对应一个视觉区块
- description 中标注组件类型、内容、关键样式
- 水平排列的多个元素必须用 layout(horizontal) 或 grid 作为父容器，子组件通过 parentId 添加
- 多列等宽（如 2-6 列图标、产品卡等）优先用 grid(columnsPerRow=N)
- 若有参考图片，仔细分析每个可见区块，不遗漏`;

export interface PlanStep {
  index: number;
  description: string;
  status: 'pending' | 'completed';
}

export interface PlanResult {
  ok: true;
  plan: PlanStep[];
}
export interface PlanError {
  ok: false;
  error: string;
}

export async function generateTemplatePlan(
  originalUserMessages: LlmMessage[],
  preferVision: boolean
): Promise<PlanResult | PlanError> {
  try {
    const scenarioToUse = preferVision ? 'vision' : ('plan' as const);
    const config = getScenarioConfig(scenarioToUse);
    const adapter = getVendorAdapter(config.vendor);

    const messages: LlmMessage[] = [
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      ...originalUserMessages.filter((m) => m.role !== 'system'),
    ];

    let content = '';
    await adapter.streamCompletion(
      {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        thinkingConfig: config.thinkingConfig,
      },
      {
        messages,
        systemPrompt: PLAN_SYSTEM_PROMPT,
        enableTools: false,
        enableThinking: resolveScenarioEnableThinking(scenarioToUse),
      },
      {
        onThinkDelta: () => {},
        onAnswerDelta: (delta) => { content += delta; },
      }
    );

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return { ok: false, error: '规划结果不含有效 JSON 数组' };
    }
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ index?: number; description?: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, error: '规划结果为空数组' };
    }
    const plan: PlanStep[] = parsed.map((item, i) => ({
      index: typeof item.index === 'number' ? item.index : i,
      description: typeof item.description === 'string' ? item.description : `步骤 ${i + 1}`,
      status: 'pending' as const,
    }));
    return { ok: true, plan };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误';
    return { ok: false, error: `规划失败：${msg}` };
  }
}

// ─── 提示词组合函数 ─────────────────────────────────────────────────

interface SystemPromptContext {
  enableTools: boolean;
  hasImage: boolean;
  /** pipeline 已完成时为 true，此时不注入 createTemplateFromImage 工具，避免 LLM 在 ReAct 中误调 */
  pipelineCompleted?: boolean;
}

export function buildCheckRoundSystemPrompt(): string {
  // 检查轮：不注入 createTemplateFromImage（检查轮只做校验，不允许重新跑 pipeline）
  return [CHECK_ROUND_ROLE, TOOL_FORMAT, TOOL_DEFINITIONS].join('\n\n');
}

/**
 * 总结轮专用：无工具、无行为规则，仅含简短角色描述。
 * 用于 createTemplateFromImage + 验证管线全部完成后的最终回复。
 */
export function buildSummarySystemPrompt(): string {
  return `你是邮件模板助手。根据以下提供的生成结果和验证报告，用简洁友好的语言向用户总结本次模板还原的结果。

## 规则
- 不调用任何工具
- 言简意赅（3-5 句话）
- 提及生成的区域数量和主要特色
- 若有修复过的问题，简要说明已修复了哪些
- 若验证通过无需修复，直接表示效果良好
- 用中文回复`;
}

function buildSystemPrompt(ctx: SystemPromptContext): string {
  if (!ctx.enableTools) {
    return ROLE_PROMPT + '\n\n当前禁用工具调用，请直接回复用户。';
  }
  // pipeline 完成后不再暴露 createTemplateFromImage，防止 LLM 在校验阶段误触发
  const toolDefs = ctx.pipelineCompleted
    ? TOOL_DEFINITIONS
    : TOOL_DEFINITIONS + '\n\n' + PIPELINE_TRIGGER_TOOL;
  const parts = [ROLE_PROMPT, BEHAVIOR_RULES, TOOL_FORMAT, toolDefs];
  if (ctx.hasImage) {
    parts.push(RESTORATION_STRATEGY, IMAGE_REFERENCE, ICON_REFERENCE);
  }
  return parts.join('\n\n');
}

function fallbackTitleFromMessage(message: string): string {
  const compact = message.replace(/\s+/g, '').replace(/[，。！？,.!?：:；;]/g, '');
  const chars = Array.from(compact);
  if (chars.length === 0) return '新会话';
  return chars.slice(0, 10).join('');
}

function normalizeTitle(raw: string, fallbackMessage: string): string {
  const cleaned = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[["'《【]+/g, '')
    .replace(/(?:\]|"|'|》|】)+$/g, '')
    .trim();
  const chars = Array.from(cleaned);
  if (chars.length === 0) return fallbackTitleFromMessage(fallbackMessage);
  return chars.slice(0, 10).join('');
}

export async function streamLlmResponse(
  scenario: Scenario,
  request: LlmClientRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const scenarioToUse: Scenario = request.preferVision ? 'vision' : scenario;
  const config = getScenarioConfig(scenarioToUse);

  const systemPrompt =
    typeof request.systemPromptOverride === 'string' && request.systemPromptOverride.length > 0
      ? request.systemPromptOverride
      : buildSystemPrompt({ enableTools: request.enableTools, hasImage: !!request.preferVision, pipelineCompleted: request.pipelineCompleted });
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...request.messages.filter((m) => m.role !== 'system'),
  ];
  const llmRequest: LlmRequest = {
    messages,
    systemPrompt,
    enableTools: request.enableTools,
    enableThinking: resolveScenarioEnableThinking(scenarioToUse),
    reasoningEffortOverride: request.reasoningEffortOverride,
  };

  const adapter = getVendorAdapter(config.vendor);
  let accThink = '';
  let accAnswer = '';

  await adapter.streamCompletion(
    {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      thinkingConfig: config.thinkingConfig,
    },
    llmRequest,
    {
      onThinkDelta: (delta) => {
        accThink += delta;
        callbacks.onThinkDelta(delta);
      },
      onAnswerDelta: (delta) => {
        accAnswer += delta;
        callbacks.onAnswerDelta(delta);
      },
    },
    signal
  );

  if (request.logContext) {
    const shouldIncludeSystemPrompt = request.logContext.includeSystemPrompt !== false;
    const requestMessagesForLog = shouldIncludeSystemPrompt
      ? messages
      : [
          {
            role: 'system' as const,
            content: `[system prompt omitted after first turn] sha256=${createHash('sha256').update(systemPrompt).digest('hex').slice(0, 12)} len=${systemPrompt.length}`,
          },
          ...messages.filter((m) => m.role !== 'system'),
        ];
    const requestJson = JSON.stringify({
      scenario: scenarioToUse,
      vendor: config.vendor,
      model: config.model,
      stream: true,
      ...('enableThinking' in config.thinkingConfig
        ? { enable_thinking: config.thinkingConfig.enableThinking }
        : { reasoning_effort: request.reasoningEffortOverride ?? config.thinkingConfig.reasoningEffort }),
      messages: requestMessagesForLog,
      systemPromptIncluded: shouldIncludeSystemPrompt,
    });
    const responseJson = JSON.stringify(
      { reasoning_content: accThink, content: accAnswer }
    );
    logLlmRequest({
      context: request.logContext,
      requestJson,
      responseJson,
    });
  }
}

/**
 * 管线专用：内部流式收集 LLM 完整输出文本。
 * 不需要工具调用和流式回调，仅收集最终文本。
 */
export async function callLlmCollect(
  scenario: Scenario,
  messages: LlmMessage[],
  systemPrompt: string,
  signal?: AbortSignal,
  logContext?: LlmLogContext,
): Promise<string> {
  const config = getScenarioConfig(scenario);
  const adapter = getVendorAdapter(config.vendor);

  const request: LlmRequest = {
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.filter((m) => m.role !== 'system'),
    ],
    systemPrompt,
    enableTools: false,
    enableThinking: resolveScenarioEnableThinking(scenario),
  };

  let content = '';
  let thinkContent = '';
  await adapter.streamCompletion(
    {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      thinkingConfig: config.thinkingConfig,
    },
    request,
    {
      onThinkDelta: (delta) => { thinkContent += delta; },
      onAnswerDelta: (delta) => { content += delta; },
    },
    signal
  );

  if (logContext) {
    const shouldIncludeSystemPrompt = logContext.includeSystemPrompt !== false;
    const requestMessagesForLog = shouldIncludeSystemPrompt
      ? request.messages
      : [
          {
            role: 'system' as const,
            content: `[system prompt omitted after first turn] sha256=${createHash('sha256').update(systemPrompt).digest('hex').slice(0, 12)} len=${systemPrompt.length}`,
          },
          ...request.messages.filter((m) => m.role !== 'system'),
        ];
    const requestJson = JSON.stringify({
      scenario,
      vendor: config.vendor,
      model: config.model,
      stream: true,
      messages: requestMessagesForLog,
      systemPromptIncluded: shouldIncludeSystemPrompt,
    });
    const responseJson = JSON.stringify(
      { reasoning_content: thinkContent, content }
    );
    logLlmRequest({ context: logContext, requestJson, responseJson });
  }

  return content;
}

export async function generateConversationTitle(firstUserMessage: string): Promise<string> {
  try {
    const config = getScenarioConfig('title');
    const adapter = getVendorAdapter(config.vendor);
    const prompt = [
      '你是会话标题助手。',
      '请根据用户首条消息生成一个会话标题。',
      '要求：',
      '- 仅输出标题本身，不要解释；',
      '- 简体中文；',
      '- 最多 10 个汉字；',
      '- 准确概括用户意图。',
    ].join('\n');

    const titleEnableThinking = resolveScenarioEnableThinking('title');
    const titleTemperature = parseNumberEnv(process.env.LLM_TITLE_TEMPERATURE) ?? 0.2;
    const titleMaxTokensRaw = parseNumberEnv(process.env.LLM_TITLE_MAX_TOKENS);
    const titleMaxTokens = typeof titleMaxTokensRaw === 'number' && titleMaxTokensRaw > 0
      ? Math.floor(titleMaxTokensRaw)
      : 32;

    const request: LlmRequest = {
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: firstUserMessage },
      ],
      systemPrompt: prompt,
      enableTools: false,
      enableThinking: typeof titleEnableThinking === 'boolean' ? titleEnableThinking : false,
      temperature: titleTemperature,
      maxTokens: titleMaxTokens,
    };

    let content = '';
    await adapter.streamCompletion(
      {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        thinkingConfig: config.thinkingConfig,
      },
      request,
      {
        onThinkDelta: () => {},
        onAnswerDelta: (delta) => {
          content += delta;
        },
      }
    );
    return normalizeTitle(content, firstUserMessage);
  } catch {
    return fallbackTitleFromMessage(firstUserMessage);
  }
}
