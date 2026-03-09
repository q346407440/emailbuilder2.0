/**
 * 标准变量 Schema：与《基础组件业务赋值配置说明》7.2 对齐。
 * 供变量选择器展示与按内容类型过滤使用。
 */
import type {
  CustomVariableDefinition,
  ArrayItemFieldDef,
  VariableContentType,
} from '../types/emailTemplate';
export type { VariableContentType } from '../types/emailTemplate';
export type { ArrayItemFieldDef };

export interface VariableSchemaItem {
  key: string;
  label: string;
  contentType: VariableContentType;
  sourceNamespace: string;
  /** 是否为模板级自定义变量 */
  isCustom?: boolean;
  /**
   * 编辑器预览用的 demo 默认值。
   * 打开编辑器时自动填入，用户可随时修改或清除。
   * 图片类型留空（无法提供通用图片 URL）。
   */
  defaultPreviewValue?: string;
}

export const VARIABLE_SCHEMA: VariableSchemaItem[] = [
  // 文本
  { key: 'shop.name',                  label: '店铺名称',           contentType: 'text', sourceNamespace: 'shop',      defaultPreviewValue: '示例店铺' },
  { key: 'shop.slogan',                label: '店铺 slogan',        contentType: 'text', sourceNamespace: 'shop',      defaultPreviewValue: '品质生活，从这里开始' },
  { key: 'user.name',                  label: '用户/收件人姓名',     contentType: 'text', sourceNamespace: 'user',      defaultPreviewValue: '张三' },
  { key: 'user.email',                 label: '用户邮箱',           contentType: 'text', sourceNamespace: 'user',      defaultPreviewValue: 'zhangsan@example.com' },
  { key: 'shipping.recipientName',     label: '收货人姓名',          contentType: 'text', sourceNamespace: 'shipping',  defaultPreviewValue: '张三' },
  { key: 'shipping.addressText',       label: '收货地址全文',        contentType: 'text', sourceNamespace: 'shipping',  defaultPreviewValue: '上海市浦东新区陆家嘴金融贸易区世纪大道100号' },
  { key: 'product.title',              label: '商品标题',           contentType: 'text', sourceNamespace: 'product',   defaultPreviewValue: '精选夏日新品 T恤' },
  { key: 'product.description',        label: '商品描述摘要',        contentType: 'text', sourceNamespace: 'product',   defaultPreviewValue: '采用高品质纯棉面料，透气舒适，多色可选，适合夏日出行' },
  { key: 'product.price',              label: '商品价格',           contentType: 'text', sourceNamespace: 'product',   defaultPreviewValue: '¥199.00' },
  { key: 'product.compareAtPrice',     label: '商品原价/比价',       contentType: 'text', sourceNamespace: 'product',   defaultPreviewValue: '¥299.00' },
  { key: 'product.skuOrVariant',       label: '商品 SKU/规格',      contentType: 'text', sourceNamespace: 'product',   defaultPreviewValue: '白色 / M码' },
  { key: 'order.id',                   label: '订单号',             contentType: 'text', sourceNamespace: 'order',     defaultPreviewValue: '#2024-001234' },
  { key: 'order.statusText',           label: '订单状态文案',        contentType: 'text', sourceNamespace: 'order',     defaultPreviewValue: '已发货，运输中' },
  { key: 'order.shippingMethodName',   label: '配送方式名称',        contentType: 'text', sourceNamespace: 'order',     defaultPreviewValue: '顺丰速运' },
  { key: 'order.estimatedDeliveryText',label: '预计送达时间',        contentType: 'text', sourceNamespace: 'order',     defaultPreviewValue: '预计 3-5 个工作日送达' },
  { key: 'promo.code',                 label: '优惠券码',           contentType: 'text', sourceNamespace: 'promo',     defaultPreviewValue: 'SUMMER20' },
  { key: 'promo.description',          label: '优惠/折扣描述',       contentType: 'text', sourceNamespace: 'promo',     defaultPreviewValue: '全场夏季新品 8折优惠，限时48小时' },
  { key: 'campaign.name',              label: '活动名称',           contentType: 'text', sourceNamespace: 'campaign',  defaultPreviewValue: '夏日清爽季' },
  { key: 'campaign.description',       label: '活动说明',           contentType: 'text', sourceNamespace: 'campaign',  defaultPreviewValue: '焕新夏日穿搭，尽享专属优惠' },
  { key: 'collection.name',            label: '专辑/合集名称',       contentType: 'text', sourceNamespace: 'collection',defaultPreviewValue: '夏日新品系列' },
  { key: 'collection.description',     label: '专辑/合集描述',       contentType: 'text', sourceNamespace: 'collection',defaultPreviewValue: '精心挑选的夏日必备单品，时尚与舒适兼备' },
  { key: 'footer.policyText',          label: '政策/页脚文案',       contentType: 'text', sourceNamespace: 'footer',    defaultPreviewValue: '© 2024 示例店铺 版权所有 · 隐私政策 · 退款政策' },
  // 图片（无通用默认值，留空由用户或「从店铺同步」填入）
  { key: 'shop.logoUrl',               label: '店铺 Logo',          contentType: 'image', sourceNamespace: 'shop' },
  { key: 'shop.bannerUrl',             label: '店铺 Banner',        contentType: 'image', sourceNamespace: 'shop' },
  { key: 'product.imageUrl',           label: '商品主图 URL',        contentType: 'image', sourceNamespace: 'product' },
  { key: 'collection.imageUrl',        label: '专辑/合集封面图',     contentType: 'image', sourceNamespace: 'collection' },
  { key: 'campaign.bannerUrl',         label: '活动 Banner',        contentType: 'image', sourceNamespace: 'campaign' },
  { key: 'campaign.imageUrl',          label: '活动配图',           contentType: 'image', sourceNamespace: 'campaign' },
  // 链接
  { key: 'shop.homeUrl',               label: '店铺首页 URL',        contentType: 'link', sourceNamespace: 'shop',      defaultPreviewValue: 'https://shop.example.com' },
  { key: 'shop.policyUrl',             label: '店铺政策页 URL',      contentType: 'link', sourceNamespace: 'shop',      defaultPreviewValue: 'https://shop.example.com/policies/refund' },
  { key: 'user.accountUrl',            label: '用户账户/订单中心 URL',contentType: 'link', sourceNamespace: 'user',      defaultPreviewValue: 'https://shop.example.com/account' },
  { key: 'product.url',                label: '商品详情页 URL',      contentType: 'link', sourceNamespace: 'product',   defaultPreviewValue: 'https://shop.example.com/products/example-summer-tshirt' },
  { key: 'collection.url',             label: '专辑/合集页 URL',     contentType: 'link', sourceNamespace: 'collection',defaultPreviewValue: 'https://shop.example.com/collections/summer-new' },
  { key: 'order.detailUrl',            label: '订单详情页 URL',      contentType: 'link', sourceNamespace: 'order',     defaultPreviewValue: 'https://shop.example.com/orders/2024-001234' },
  { key: 'order.trackingUrl',          label: '物流追踪 URL',        contentType: 'link', sourceNamespace: 'order',     defaultPreviewValue: 'https://track.sf-express.com/tracking/123456789' },
  { key: 'cart.url',                   label: '购物车 URL',          contentType: 'link', sourceNamespace: 'cart',      defaultPreviewValue: 'https://shop.example.com/cart' },
  { key: 'campaign.landingUrl',        label: '活动落地页 URL',      contentType: 'link', sourceNamespace: 'campaign',  defaultPreviewValue: 'https://shop.example.com/campaigns/summer' },
  { key: 'unsubscribe.url',            label: '退订/偏好设置 URL',   contentType: 'link', sourceNamespace: 'unsubscribe',defaultPreviewValue: 'https://shop.example.com/email/unsubscribe' },
];

/** 按 key 快速查找变量定义 */
export const VARIABLE_SCHEMA_MAP = new Map<string, VariableSchemaItem>(
  VARIABLE_SCHEMA.map((v) => [v.key, v])
);

/** 内容类型对应的中文标签 */
export const CONTENT_TYPE_LABEL: Record<VariableContentType, string> = {
  text: '文本',
  number: '数字',
  image: '图片',
  link: '链接',
  array: '列表',
};

/**
 * 合并标准变量与模板级自定义变量，返回完整列表。
 * 标准变量在前，自定义变量在后；key 相同时自定义覆盖标准。
 */
/**
 * 合并标准变量与模板级自定义变量，返回完整列表。
 * 标准变量在前，自定义变量在后；key 相同时自定义覆盖标准。
 * array 类型的自定义变量不包含在结果中（array 变量通过 getArrayVariables 单独获取）。
 */
export function getAllVariables(customVariables?: CustomVariableDefinition[]): VariableSchemaItem[] {
  if (!customVariables || customVariables.length === 0) return VARIABLE_SCHEMA;
  const customSet = new Set(customVariables.map((v) => v.key));
  const base = VARIABLE_SCHEMA.filter((v) => !customSet.has(v.key));
  const custom: VariableSchemaItem[] = customVariables
    .filter((v) => v.contentType !== 'array')
    .map((v) => ({
      key: v.key,
      label: v.label,
      contentType: v.contentType,
      sourceNamespace: 'custom',
      isCustom: true,
    }));
  return [...base, ...custom];
}

/**
 * 获取指定内容类型的变量列表。
 * array 类型变量不会出现在 text/image/link 的过滤结果中。
 */
export function getVariablesByContentType(
  type: VariableContentType,
  customVariables?: CustomVariableDefinition[]
): VariableSchemaItem[] {
  return getAllVariables(customVariables).filter((v) => v.contentType === type);
}

/**
 * 获取所有 array 类型的自定义变量（标准变量无 array 类型）。
 */
export function getArrayVariables(
  customVariables?: CustomVariableDefinition[]
): CustomVariableDefinition[] {
  return (customVariables ?? []).filter((v) => v.contentType === 'array');
}

export function getVariableLabel(key: string, customVariables?: CustomVariableDefinition[]): string {
  if (customVariables) {
    const custom = customVariables.find((v) => v.key === key);
    if (custom) return custom.label;
  }
  const item = VARIABLE_SCHEMA.find((v) => v.key === key);
  return item?.label ?? key;
}

/**
 * 构建编辑器初始预览数据：所有有 defaultPreviewValue 的标准变量写入初始值。
 * 用于 useEmailStore 初始化 previewData，让画布打开后不再显示 {{key}} 占位符。
 * 用户可随时在变量管理面板或顶部「预览数据」中修改或清除这些值。
 */
export function buildDefaultPreviewData(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of VARIABLE_SCHEMA) {
    if (item.defaultPreviewValue) {
      result[item.key] = item.defaultPreviewValue;
    }
  }
  return result;
}
