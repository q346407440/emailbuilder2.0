// 间距配置（支持统一或分别设置）
export interface SpacingConfig {
  mode: 'unified' | 'separate';
  unified?: string;  // 统一模式的值
  top?: string;      // 分别模式的值
  right?: string;
  bottom?: string;
  left?: string;
}

// 描边配置
export interface BorderConfig {
  mode: 'unified' | 'separate';
  unified?: string;  // 统一模式的宽度（0 表示无描边）
  topWidth?: string; // 分别模式各边宽度（0 表示无描边）
  rightWidth?: string;
  bottomWidth?: string;
  leftWidth?: string;
  color: string;     // 描边颜色（统一）
  style: 'solid' | 'dashed' | 'dotted';
}

// 圆角配置（四个角）
export interface BorderRadiusConfig {
  mode: 'unified' | 'separate';
  unified?: string;
  topLeft?: string;
  topRight?: string;
  bottomRight?: string;
  bottomLeft?: string;
}

// 容器内内容对齐（水平左中右 + 垂直上中下）
export interface ContentAlignConfig {
  horizontal: 'left' | 'center' | 'right';
  vertical: 'top' | 'center' | 'bottom';
}

/** 容器尺寸策略：铺满容器 | 根据内容 | 固定尺寸（宽/高可分别配置，类 Figma） */
export type ContainerSizeMode = 'fill' | 'fitContent' | 'fixed';

// 组件通用包装样式
export interface WrapperStyle {
  /** 宽度策略：铺满容器 | 根据内容 | 固定尺寸 */
  widthMode: ContainerSizeMode;
  /** 高度策略：铺满容器 | 根据内容 | 固定尺寸 */
  heightMode: ContainerSizeMode;
  /** 固定宽度（widthMode='fixed' 时使用），如 "200px" */
  fixedWidth?: string;
  /** 固定高度（heightMode='fixed' 时使用），如 "100px" */
  fixedHeight?: string;
  /** 宽高均为 fixed 时，是否锁定比例 */
  lockAspectRatio?: boolean;
  backgroundType: 'color' | 'image';
  backgroundColor: string;
  backgroundImage?: string;
  padding: SpacingConfig;
  margin: SpacingConfig;
  border: BorderConfig;
  borderRadius: BorderRadiusConfig;
  contentAlign: ContentAlignConfig;
}

// 布局组件属性（自由列表容器，子组件数量动态增长，不定义插槽数）
export interface LayoutProps {
  gap: string;
  direction: 'horizontal' | 'vertical';
  distribution: 'packed' | 'spaceBetween';
}

// 文本组件属性（content 为富文本产出的 HTML；对齐由 wrapperStyle.contentAlign 控制）
export interface TextProps {
  /** 富文本编辑器产出的 HTML 字符串 */
  content: string;
  fontMode: 'inherit' | 'custom';
  fontFamily: string;
  /** 默认字号（如 "16px"），未设置时继承画布字体大小；工具栏可对选区单独覆盖 */
  fontSize?: string;
  /** 行高（如 "1.5"），未设置时继承 */
  lineHeight?: string;
}

// 图片尺寸配置（1. 原图尺寸 2. 铺满容器 3. 固定尺寸）
export interface ImageSizeConfig {
  mode: 'original' | 'fill' | 'fixed';
  // 固定尺寸模式
  width?: string;
  height?: string;
  lockAspectRatio?: boolean;
  // 原图尺寸模式：最大宽高，超出时等比缩放
  maxWidth?: string;
  maxHeight?: string;
}

// 图片组件属性（objectFit 由 sizeConfig.mode 决定，不单独存储）
export interface ImageProps {
  src: string;
  alt: string;
  link: string;
  sizeConfig: ImageSizeConfig;
  /** 图片本身的圆角（统一或四角分别），与容器圆角独立 */
  borderRadius: BorderRadiusConfig;
  /** 布局模式：true 时图片可拥有子级，用于在图上叠加内容 */
  layoutMode: boolean;
  /** 布局模式下图片内部容器（overlay 子内容区域）的对齐 */
  layoutContentAlign?: ContentAlignConfig;
  /** 布局模式下叠加层内边距（统一或分别配置），仅 layoutMode 为 true 时生效 */
  layoutPadding: SpacingConfig;
}

// 分割组件属性
export interface DividerProps {
  dividerStyle: 'line' | 'block';
  color: string;
  height: string;
  width: string;
}

// 按钮组件属性
export interface ButtonProps {
  /** 按钮文案（纯文本） */
  text: string;
  buttonStyle: 'solid' | 'outlined';
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  fontSize: string;
  /** 字重：'400' 正常 | '600' 半粗 | '700' 粗体 */
  fontWeight: string;
  /** 字形：'normal' | 'italic' */
  fontStyle: 'normal' | 'italic';
  /** 文字装饰：'none' | 'underline' | 'line-through' */
  textDecoration: 'none' | 'underline' | 'line-through';
  /** 字体模式：继承画布或自定义 */
  fontMode: 'inherit' | 'custom';
  /** 自定义字体（fontMode=custom 时生效） */
  fontFamily: string;
  borderRadius: string;
  padding: SpacingConfig;
  /** 按钮宽度模式：fitContent（包裹内容）| fill（撑满父容器）| fixed（固定像素宽度） */
  widthMode: 'fitContent' | 'fill' | 'fixed';
  /** 固定宽度（widthMode=fixed 时生效，如 "200px"） */
  fixedWidth?: string;
  link: string;
}

// 图标组件属性
export type SystemIconType =
  | 'mail' | 'phone' | 'location' | 'link' | 'star' | 'heart' | 'check' | 'arrow-right'
  | 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'twitter'
  | 'app-store' | 'google-play';

export interface IconProps {
  iconType: SystemIconType | 'custom';
  /** 尺寸限制模式：限制宽度（高度自适应）或限制高度（宽度自适应） */
  sizeMode: 'width' | 'height';
  /** 尺寸数值（单位 px，依 sizeMode 决定限制宽度或高度） */
  size: string;
  color: string;
  link: string;
  /** 自定义图标来源（本地上传 DataURL 或外部 URL），仅 iconType === 'custom' 时使用 */
  customSrc?: string;
}

// 网格组件属性
export interface GridProps {
  columnsPerRow: number;  // 每行显示几个插槽（1-6）
  slots: number;          // 总插槽数量
  gap: string;            // 单元格间距
}

/** 普通组件商品绑定字段（用于从商品数据映射到组件属性） */
export type ProductBindingField =
  | 'product.image'
  | 'product.title'
  | 'product.price'
  | 'product.compareAtPrice'
  | 'product.url';

/** 商品快照（避免运行时再发请求，保持模板可重现） */
export interface ProductBindingSnapshot {
  id: string;
  title: string;
  handle: string;
  imageUrl: string;
  price: string;
  compareAtPrice: string;
  url: string;
}

/** 组件上「变量」的预览取值来源：仅用于编辑态画布，product.* 由此 snapshot 填充 */
export interface VariablePreviewSourceProduct {
  type: 'product';
  snapshot: ProductBindingSnapshot;
}

// 组件类型
export type EmailComponentType = 'layout' | 'grid' | 'text' | 'image' | 'divider' | 'button' | 'icon';

// 条件逻辑：运算符
// 字符串类运算符：eq / neq / isEmpty / isNotEmpty
// 数值类运算符：gt / gte / lt / lte（变量 contentType='number' 时可用）
export type ConditionOperator = 'eq' | 'neq' | 'isEmpty' | 'isNotEmpty' | 'gt' | 'gte' | 'lt' | 'lte';

// 条件逻辑：单条件
export interface SimpleCondition {
  /** 判断的变量 key，如 "user.tier" */
  variableKey: string;
  operator: ConditionOperator;
  /** eq / neq / gt / gte / lt / lte 时填写；isEmpty / isNotEmpty 时留空 */
  value?: string;
}

// 条件分支：同一组件在不同条件下覆盖部分 props / wrapperStyle（Figma States 语义）
export interface ComponentBranch {
  id: string;
  /** 用户命名，如「VIP 版本」，为空时以序号显示 */
  label?: string;
  condition: SimpleCondition;
  /** 满足条件时，覆盖组件的 props 中对应的字段（浅合并） */
  propsOverride: Record<string, unknown>;
  /** 可选：同时覆盖容器样式（如背景色、内边距等） */
  wrapperStyleOverride?: Partial<WrapperStyle>;
}

// ============================================================
// Layer 4：渲染规则（RenderingRules）
// 独立于组件树存储，运行时合并后渲染
// ============================================================

/** 单个组件的渲染规则（动态逻辑字段，从 EmailComponent 中独立出来） */
export interface ComponentRules {
  variableBindings?: Record<string, string>;
  visibilityCondition?: SimpleCondition;
  conditionalBranches?: ComponentBranch[];
  loopBinding?: LoopBinding;
}

/** 模板级渲染规则：组件 id → 该组件的规则 */
export type RenderingRules = Record<string, ComponentRules>;

/** 循环区块绑定：layout 组件支持（vertical / horizontal 均可） */
export interface LoopBinding {
  /** 绑定的 array 类型自定义变量 key，如 "products" */
  variableKey: string;
  /**
   * 画布预览时展示数组的第几项（0-based）。
   * 默认 0（展示第一项）。
   * horizontal 模式下预览会展示所有可用项（直接呈现多列效果），此值不影响预览。
   */
  previewIndex?: number;
  /**
   * 展开方向（默认 'vertical'）：
   * - 'vertical'：N 项纵向堆叠为 N 行（商品卡列表等场景）
   * - 'horizontal'：N 项并排为 N 个等宽列，包裹在一个横向父容器中
   *   （适合指标数据列等横向重复场景；邮件中为静态多列，不可滚动）
   */
  expandDirection?: 'vertical' | 'horizontal';
  /**
   * 循环子组件字段绑定：子组件 id → 属性路径 → 数组项字段 key（item.*）。
   * Layer 4 中定义，用于描述循环内部子组件与数组项字段的映射关系。
   * 格式：{ [childId]: { [propPath]: "item.fieldKey" } }
   */
  childBindings?: Record<string, Record<string, string>>;
}

// 组件基础结构（Layer 3 纯静态）
// 动态逻辑字段（variableBindings / visibilityCondition / conditionalBranches / loopBinding）
// 已移至 Layer 4 RenderingRules，运行时通过 mergeRulesIntoComponents 合并后渲染。
export interface EmailComponent {
  id: string;
  type: EmailComponentType;
  /** 在模板中的显示名称，用于左侧树与辨识；为空时以类型标签显示 */
  displayName?: string;
  wrapperStyle: WrapperStyle;
  props: LayoutProps | GridProps | TextProps | ImageProps | DividerProps | ButtonProps | IconProps;
  children?: EmailComponent[];
  /** 仅用于编辑态画布：该组件上 product.* 变量的预览取值来源 */
  variablePreviewSource?: VariablePreviewSourceProduct;
  /** 仅复合组件根节点携带，标记此组件为复合实例 */
  compositeInstance?: import('./composite').CompositeInstanceMeta;
}

// 画布配置（继承容器样式 + 特有配置）
export interface CanvasConfig {
  // 容器样式部分
  /** 邮件最外层（100% 区域）背景色，用于突出主体内容区 */
  outerBackgroundColor: string;
  backgroundType: 'color' | 'image';
  backgroundColor: string;
  backgroundImage?: string;
  padding: SpacingConfig;
  margin: SpacingConfig;
  border: BorderConfig;
  borderRadius: BorderRadiusConfig;
  /** 画布作为最大布局容器时，子内容的对齐方式 */
  contentAlign: ContentAlignConfig;
  /** 画布根级内容的主轴分布：packed 使用 contentGap；spaceBetween 均分剩余空间（Auto） */
  contentDistribution: 'packed' | 'spaceBetween';
  /** 画布根级组件间距（带 px），仅 contentDistribution=packed 时生效 */
  contentGap: string;
  // 画布特有配置
  width: string;
  fontFamily: string;
}

// 类型别名：画布配置与模板配置语义相同
export type TemplateConfig = CanvasConfig;

// 拖拽插入位置信息
export interface DragOverInfo {
  targetId: string;
  position: 'before' | 'after' | 'inside';
}

// 树列表拖拽位置信息
export interface TreeDragOverInfo {
  targetId: string;
  position: 'before' | 'after' | 'inside';
}

// 类型守卫
export function isLayoutProps(props: EmailComponent['props']): props is LayoutProps {
  return 'gap' in props && 'direction' in props && !('columnsPerRow' in props) && !('slots' in props);
}

export function isTextProps(props: EmailComponent['props']): props is TextProps {
  return 'content' in props && typeof (props as TextProps).content === 'string';
}

export function isImageProps(props: EmailComponent['props']): props is ImageProps {
  return 'src' in props && 'alt' in props && 'sizeConfig' in props;
}

export function isDividerProps(props: EmailComponent['props']): props is DividerProps {
  return 'dividerStyle' in props && 'height' in props && !('src' in props);
}

export function isButtonProps(props: EmailComponent['props']): props is ButtonProps {
  return 'buttonStyle' in props && 'text' in props && 'link' in props;
}

export function isIconProps(props: EmailComponent['props']): props is IconProps {
  return 'iconType' in props && 'size' in props;
}

export function isGridProps(props: EmailComponent['props']): props is GridProps {
  return 'columnsPerRow' in props && 'slots' in props;
}
