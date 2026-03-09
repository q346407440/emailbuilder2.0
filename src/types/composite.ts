import type { EmailComponent } from './email';

// ===== 业务封装表单类型 =====

/** 业务表单字段类型 */
export type BusinessFieldType = 'image' | 'text' | 'color' | 'number';
/** 业务数据源类型 */
export type BusinessDataSourceType = 'manual' | 'shop_product';
/** 商品插槽字段语义 */
export type BusinessSlotKey =
  | 'product.image'
  | 'product.title'
  | 'product.price'
  | 'product.compareAtPrice'
  | 'product.url';

/** 绑定目标：指向复合组件树中某个组件的某个属性 */
export interface BusinessFieldBinding {
  /** 组件在树中的路径索引，如 [0, 1] 表示 root.children[0].children[1] */
  componentPath: number[];
  /** 属性路径，如 "props.src" / "props.content" / "wrapperStyle.backgroundColor" */
  propPath: string;
}

/** 单个业务表单字段 */
export interface BusinessField {
  id: string;
  label: string;
  type: BusinessFieldType;
  /** 商品插槽索引（从 0 开始），仅 shop_product 数据源使用 */
  slotIndex?: number;
  /** 插槽语义，仅 shop_product 数据源使用 */
  slotKey?: BusinessSlotKey;
  /** 绑定到一或多个原生配置 */
  bindings: BusinessFieldBinding[];
}

export interface ProductSlotConfig {
  slotIndex: number;
  fields: BusinessField[];
}

export interface ProductTemplateConfig {
  /** 用户最多可选择的商品数量（固定槽位上限） */
  maxSelectable: number;
  slots: ProductSlotConfig[];
  /** 空槽位处理策略 */
  emptySlotBehavior?: 'keepDefault' | 'clear';
}

/** 业务表单配置 */
export interface BusinessFormConfig {
  dataSource: BusinessDataSourceType;
  /**
   * manual 模式字段列表。
   * shop_product 模式下为兼容 UI 渲染可保留，但以 productTemplate.slots 为准。
   */
  fields: BusinessField[];
  /** 商品模板配置（仅 dataSource = shop_product） */
  productTemplate?: ProductTemplateConfig;
}

// ===== 复合组件模式 =====

export type CompositeMode = 'native' | 'business';

// ===== 复合组件（持久化于后端 PostgreSQL）=====

/** 复合组件 */
export interface CompositeComponent {
  id: string;
  name: string;
  /** 根布局组件（含所有子组件） */
  component: EmailComponent;
  /** 组件模式：原生 / 业务封装 */
  mode: CompositeMode;
  /** 业务表单配置（仅 business 模式） */
  businessForm?: BusinessFormConfig;
  /** 预览缩略图 data URL（png base64） */
  previewDataUrl?: string;
  createdAt: number;
  updatedAt: number;
  /** 软删除标记 */
  status: 'active' | 'deleted';
  /** 排序顺序（数字越小越靠前） */
  sortOrder: number;
}

// ===== 画布上复合实例元数据 =====

/** 复合组件实例元数据（挂载于画布中的根组件） */
export interface CompositeInstanceMeta {
  /** 来源复合组件 ID */
  sourceCompositeId: string;
  /** 当前模式 */
  mode: CompositeMode;
  /** 业务表单定义（从 CompositeComponent 复制） */
  businessForm?: BusinessFormConfig;
  /** 原始树路径 → 克隆后实际 component ID 的映射，key 为 "0.1" 格式 */
  pathToIdMap: Record<string, string>;
}
