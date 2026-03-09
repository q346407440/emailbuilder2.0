export interface ChatAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  dataUrl?: string;
}

export interface ComponentAttachment {
  /** 組件在畫布中的 ID */
  id: string;
  /** 組件類型（layout / text / image / button / icon / divider / grid） */
  type: string;
  /** Puppeteer 截圖的 data URL PNG，用於縮略圖展示；為空字串時搭配 snapshotLoading 顯示載入中 */
  snapshot: string;
  /** true 表示截圖正在後台請求中，UI 顯示 spinner */
  snapshotLoading?: boolean;
  /** 完整組件 JSON（與導出 JSON 一致） */
  componentJson: Record<string, unknown>;
}

export interface PipelineStep {
  step: string;
  state: 'running' | 'completed';
  /** 动态标签（如"生成区域：主图横幅"），优先于 labelsMap 显示 */
  label?: string;
  /** 步骤 LLM 输出内容（步骤完成后填充，供折叠展示） */
  output?: string;
}

export interface VerifyStep {
  step: string;
  state: 'running' | 'completed';
  output?: string;
}

export interface ChatToolCall {
  id: string;
  name: string;
  state: 'detected' | 'running' | 'completed' | 'failed';
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  /** 模板编辑类工具完成后，后端下发 change.card.created 时挂到同一条工具上，用于将工具行演变为「查看改动/撤回更改」卡片 */
  changeCard?: ChatChangeCard;
  /** createTemplateFromImage 管线执行时的子步骤进度 */
  pipelineSteps?: PipelineStep[];
  /** runVerificationPipeline 验证步骤进度 */
  verifySteps?: VerifyStep[];
}

export interface ChatChangeCard {
  id: string;
  summary: string;
  status: 'applied' | 'reverted';
  toolCallId: string;
  targetComponentId?: string;
  beforePatch?: Record<string, unknown>;
  afterPatch?: Record<string, unknown>;
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  lastMessageAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  /** 特殊消息类型：fix-step-header 表示子任务启动分隔标题 */
  kind?: 'fix-step-header';
  /** fix-step-header 专用：步骤序号（0-based） */
  fixStepIndex?: number;
  /** fix-step-header 专用：总步骤数 */
  fixTotalSteps?: number;
  /** fix-step-header 专用：步骤描述文本 */
  fixStepDescription?: string;
  /** fix-step-header 专用：当前执行状态 */
  fixStepStatus?: 'running' | 'completed';
  /** fix-step-header 专用：目标组件 ID（若已知） */
  fixStepComponentId?: string;
  /** 仅用于流式拼接，不在 UI 中直接渲染 */
  rawAnswerBuffer?: string;
  thinkContent?: string;
  typing?: boolean;
  streaming?: boolean;
  attachments?: ChatAttachment[];
  toolCalls?: ChatToolCall[];
  changeCards?: ChatChangeCard[];
  componentAttachment?: ComponentAttachment;
}
