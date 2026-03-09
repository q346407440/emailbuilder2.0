/**
 * 管线类型定义 — Compact 格式、Token、Grounding、Adjustment 等。
 */

// ── Compact 格式（LLM Step 3 输出） ──────────────────────────────────

export type CompactComponentType =
  | 'layout'
  | 'grid'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'icon';

export interface CompactComponent {
  type: CompactComponentType;
  /** 只写非默认值的 props；缺省 = 使用该组件类型的默认 props */
  props?: Record<string, unknown>;
  /** 只写非默认值的容器样式；缺省 = 使用该组件类型的默认 wrapperStyle */
  wrapper?: Record<string, unknown>;
  children?: CompactComponent[];
}

export interface CompactCanvas {
  bg?: string;
  contentBg?: string;
  width?: string;
}

export interface CompactOutput {
  canvas?: CompactCanvas;
  component: CompactComponent;
}

// ── Step 1: Grounding ────────────────────────────────────────────────

export interface GroundingLayoutHints {
  /** 区域根容器是否全宽 */
  fullWidth?: boolean;
  /** 内部主要对齐方式 */
  align?: 'left' | 'center' | 'right';
}

export interface GroundingVisualHints {
  fontSize?: string;
  fontWeight?: string;
  color?: string;
}

export interface GroundingSection {
  id: string;
  region: string;
  components: string;
  /** 布局约束：全宽/自适应/对齐方向 */
  layoutHints?: GroundingLayoutHints;
  /** 视觉参数估值：字号/颜色等 */
  hints?: Record<string, GroundingVisualHints>;
  /** 该区域是否包含需要用真实图片替换的占位图 */
  hasImage?: boolean;
  /** 若 hasImage=true，用于 Pexels 搜索的英文关键词（简洁 2-4 词，描述图片主题） */
  imageQuery?: string;
  /** 图片建议宽度（px） */
  imageWidth?: number;
  /** 图片建议高度（px） */
  imageHeight?: number;
  /** 该区域图片上是否有叠加文字/按钮/徽章等内容 */
  hasOverlay?: boolean;
  /** 叠加内容的对齐方向（"left" | "center" | "right"） */
  overlayAlign?: string;
  /** 叠加内容的文字描述（如"大标题 + 按钮"） */
  overlayItems?: string;
}

// ── Step 2.5: Icon Extraction ─────────────────────────────────────────

export interface ExtractedIcon {
  /** 引用 ID，供 Step3 compact 中 $icon.xxx 使用 */
  id: string;
  /** 图标语义描述 */
  label: string;
  /** 若为系统内置图标（含社交媒体），填此字段；有此字段时无需 svgDataUrl */
  systemIconType?: string;
  /** URL 编码的 SVG Data URL（仅非系统图标时使用） */
  svgDataUrl?: string;
  /** 设计图中该图标的颜色（hex），供结构生成时设置 icon.props.color */
  colorHex?: string;
}

// ── Step 2.6: Text Extraction ─────────────────────────────────────────

export interface ExtractedRegionText {
  /** 对应 GroundingSection.id */
  regionId: string;
  /** 该区域内所有可见文字，按出现顺序排列 */
  texts: string[];
}

// ── Step 2: Design Tokens ────────────────────────────────────────────

export type ColorPresetName =
  | 'corporate-blue'
  | 'elegant-dark'
  | 'warm-commerce'
  | 'fresh-green'
  | 'soft-purple'
  | 'minimal-mono';

export type SpacingPresetName = 'compact' | 'standard' | 'spacious' | 'generous';
export type TypographyPresetName = 'standard' | 'large' | 'compact';

export interface LlmTokenOutput {
  colorPreset: string;
  colorOverrides?: Record<string, string>;
  spacingPreset: string;
  typographyPreset: string;
  canvasBg?: string;
  contentBg?: string;
}

export interface ColorTokens {
  primary: string;
  heading: string;
  body: string;
  accent: string;
  mutedBg: string;
  cardBg: string;
  border: string;
}

export interface SpacingTokens {
  section: string;
  element: string;
  tight: string;
}

export interface TypographyLevel {
  fontSize: string;
  fontWeight: string;
}

export interface TypographyTokens {
  h1: TypographyLevel;
  h2: TypographyLevel;
  body: TypographyLevel;
  caption: TypographyLevel;
  [key: string]: TypographyLevel;
}

export interface ResolvedTokens {
  colors: ColorTokens;
  spacing: SpacingTokens;
  typography: TypographyTokens;
  canvasBg: string;
  contentBg: string;
}

// ── Step 4: Adjustments ──────────────────────────────────────────────

export interface Adjustment {
  path: string;
  issue: string;
  fix: {
    props?: Record<string, unknown>;
    wrapper?: Record<string, unknown>;
  };
}

// ── Pipeline 回调 ────────────────────────────────────────────────────

// ── Step 2.7: Image Search（Pexels） ─────────────────────────────────

export interface SearchedImage {
  /** 区域 ID（对应 GroundingSection.id） */
  regionId: string;
  /** 搜索关键词 */
  query: string;
  /** Pexels 返回的真实 URL */
  url: string;
  /** 图片描述 */
  alt: string;
  /** 建议宽度（px） */
  width: number;
  /** 建议高度（px） */
  height: number;
}

export type PipelineStepName =
  | 'grounding'
  | 'tokens'
  | 'icon_extraction'
  | 'text_extraction'
  | 'image_search'
  | 'structure'
  | `structure_${string}`;

export interface PipelineCallbacks {
  onStepStart: (step: PipelineStepName, label?: string) => void;
  onStepComplete: (step: PipelineStepName, label?: string) => void;
  /** 步骤完成后，回传该步骤 LLM 的原始输出文本（供前端折叠展示） */
  onStepResult?: (step: PipelineStepName, rawOutput: string) => void;
}

// ── Verification Pipeline ─────────────────────────────────────────────

export type VerifyStepName =
  | 'verify_structure'
  | 'verify_text'
  | 'verify_images'
  | 'verify_image_match'
  | 'verify_icons'
  | 'verify_spacing'
  | 'verify_typography'
  | 'verify_constraints'
  | 'verify_visual';

export interface VerificationIssue {
  step: VerifyStepName;
  /** 机器可读的问题代码，如 'empty_src' | 'missing_text' | 'should_replace' | 'gap_missing' */
  code: string;
  componentId?: string;
  regionId?: string;
  detail?: string;
  expected?: unknown;
  actual?: unknown;
  /** V3b：建议的 Pexels 搜索词 */
  suggestedQuery?: string;
}

export interface VerifyCallbacks {
  onStepStart: (step: VerifyStepName) => void;
  onStepComplete: (step: VerifyStepName) => void;
  onStepResult?: (step: VerifyStepName, output: string) => void;
}

/** 验证管线运行所需的完整上下文，存入 DB 跨请求使用 */
export interface VerifyContext {
  imageDataUrls: string[];
  sections: GroundingSection[];
  tokens: ResolvedTokens;
  extractedTexts: ExtractedRegionText[];
  extractedIcons: ExtractedIcon[];
  searchedImages: SearchedImage[];
  components: unknown[];
  /** runVerificationPipeline 工具调用 ID */
  verifyToolCallId: string;
  /** 验证管线关联的助手消息 ID */
  verifyAssistantMessageId: string;
  /** V1-V6 已完成的问题列表（V7 运行前先存） */
  v1to6Issues?: VerificationIssue[];
  /** V1-V7 全部问题列表（V7 完成后填入） */
  allIssues?: VerificationIssue[];
  /** 当前正在执行的修复步骤下标（0-based） */
  currentFixStepIndex?: number;
  /** 各步骤的修复结果摘要 */
  fixResults?: Array<{ stepDescription: string; outcome: string }>;
  /**
   * 当前暂停的 fix step 在 pauseAwaiting_client_tools 时已累积的临时消息。
   * 续流时将其与新到的 continueTempMessages 合并，重建该步骤的隔离上下文，
   * 避免使用 DB 全量历史污染。步骤完成后清空。
   */
  pausedStepTempMessages?: Array<{ role: string; content: unknown }>;
}
