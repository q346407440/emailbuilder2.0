import type { EmailComponent, RenderingRules } from './email';
import type { TemplateConfig } from './email';

/** 自定义变量的内容类型 */
export type VariableContentType = 'text' | 'number' | 'image' | 'link' | 'array';

/** 数组类型变量中每个项目的字段定义 */
export interface ArrayItemFieldDef {
  /** 字段 key，对应 item.* 或 arrayVar[index].* 的末端部分，如 "title"、"imageUrl" */
  key: string;
  /** 中文展示名，如「商品标题」 */
  label: string;
  /** 字段内容类型（用于子组件绑定时的过滤） */
  contentType: 'text' | 'image' | 'link';
}

/** 商品列表的预设字段 */
export const PRODUCT_LIST_PRESET_SCHEMA: ArrayItemFieldDef[] = [
  { key: 'title',    label: '商品标题',   contentType: 'text' },
  { key: 'imageUrl', label: '商品图片',   contentType: 'image' },
  { key: 'price',    label: '商品价格',   contentType: 'text' },
  { key: 'url',      label: '商品链接',   contentType: 'link' },
];

/** 模板级自定义变量定义（存在模板 JSON 中，随模板走） */
export interface CustomVariableDefinition {
  /** 变量 key，用于 variableBindings 与 {{key}} 插值 */
  key: string;
  /** 中文展示名，供选择器与管理面板展示 */
  label: string;
  /** 内容类型，用于变量选择器按 prop 类型过滤 */
  contentType: VariableContentType;
  /** 可选：默认/占位值，用于编辑预览时无赋值的兜底展示（scalar 类型） */
  defaultValue?: string;
  /** contentType='array' 时必填，描述每个数组项的字段结构 */
  itemSchema?: ArrayItemFieldDef[];
  /**
   * 可选：数组类型变量的默认预览项目（仅用于编辑器画布预览，不参与发信）。
   * 载入模板时自动填入 arrayPreviewData，让画布在未赋值时也能展示多行循环效果。
   * 每项为 itemSchema 字段 key → 字符串值 的映射。
   */
  defaultPreviewItems?: Record<string, string>[];
}

/** 入库的邮件模板（常驻项目内） */
export interface SavedEmailTemplate {
  id: string;
  title: string;
  desc: string;
  components: EmailComponent[];
  config: TemplateConfig;
  /** 预览图 data URL，保存时用当前画布截图 */
  previewDataUrl: string;
  createdAt: number;
  updatedAt: number;
  /** 模板级自定义变量定义，随模板保存，仅在此模板内有效 */
  customVariables?: CustomVariableDefinition[];
  /** Layer 4：渲染规则，组件 id → 动态逻辑字段（变量绑定、显示条件、条件分支、循环绑定） */
  renderingRules?: RenderingRules;
}

/** 工程（编辑中的工作项，仅创建者可见；发布后写入 email_templates） */
export interface SavedEmailProject {
  id: string;
  title: string;
  desc: string;
  components: EmailComponent[];
  config: TemplateConfig;
  previewDataUrl: string;
  createdAt: number;
  updatedAt: number;
  customVariables?: CustomVariableDefinition[];
  /** Layer 4：渲染规则，组件 id → 动态逻辑字段（变量绑定、显示条件、条件分支、循环绑定） */
  renderingRules?: RenderingRules;
}
