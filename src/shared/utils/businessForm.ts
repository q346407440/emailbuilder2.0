import { nanoid } from 'nanoid';
import type {
  BusinessField,
  BusinessFieldType,
  BusinessFormConfig,
  BusinessSlotKey,
  ProductSlotConfig,
} from '../types/composite';

export const PRODUCT_SLOT_FIELDS: Array<{ slotKey: BusinessSlotKey; type: BusinessFieldType; label: string }> = [
  { slotKey: 'product.image', type: 'image', label: '商品图片' },
  { slotKey: 'product.title', type: 'text', label: '商品标题' },
  { slotKey: 'product.price', type: 'text', label: '商品价格' },
  { slotKey: 'product.url', type: 'text', label: '商品链接' },
];

function ensureSlotFields(slotIndex: number, fields: BusinessField[]): BusinessField[] {
  const bySlotKey = new Map(fields.filter((f) => f.slotKey).map((f) => [f.slotKey, f] as const));
  const defaultSlotKeys = new Set(PRODUCT_SLOT_FIELDS.map((def) => def.slotKey));
  const baseFields = PRODUCT_SLOT_FIELDS.map((def) => {
    const existed = bySlotKey.get(def.slotKey);
    return {
      id: existed?.id ?? nanoid(8),
      label: existed?.label?.trim() ? existed.label : `商品${slotIndex + 1}${def.label}`,
      type: existed?.type ?? def.type,
      slotIndex,
      slotKey: def.slotKey,
      bindings: existed?.bindings ?? [],
    };
  });
  const customFields = fields
    .filter((f) => !f.slotKey || !defaultSlotKeys.has(f.slotKey))
    .map((field) => ({
      ...field,
      slotIndex,
    }));
  return [...baseFields, ...customFields];
}

export function flattenProductSlots(slots: ProductSlotConfig[]): BusinessField[] {
  return slots
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .flatMap((slot) => slot.fields);
}

export function createProductSlots(maxSelectable: number, seedFields: BusinessField[] = []): ProductSlotConfig[] {
  const max = Math.max(1, Math.min(6, maxSelectable || 1));
  const seedsByIndex = new Map<number, BusinessField[]>();
  for (const field of seedFields) {
    const idx = field.slotIndex ?? 0;
    const bucket = seedsByIndex.get(idx) ?? [];
    bucket.push(field);
    seedsByIndex.set(idx, bucket);
  }
  return Array.from({ length: max }, (_, slotIndex) => ({
    slotIndex,
    fields: ensureSlotFields(slotIndex, seedsByIndex.get(slotIndex) ?? []),
  }));
}

function inferSlotIndex(field: BusinessField): number {
  if (typeof field.slotIndex === 'number' && Number.isFinite(field.slotIndex)) return Math.max(0, field.slotIndex);
  const m = field.label?.match(/商品\s*(\d+)/);
  if (m?.[1]) return Math.max(0, Number(m[1]) - 1);
  return 0;
}

function inferSlotKey(field: BusinessField): BusinessSlotKey | undefined {
  if (field.slotKey) return field.slotKey;
  const label = String(field.label ?? '').toLowerCase();
  const paths = field.bindings.map((b) => b.propPath.toLowerCase());
  if (paths.some((p) => p.includes('props.src') || p.includes('backgroundimage'))) return 'product.image';
  if (paths.some((p) => p.includes('href') || p.includes('link'))) return 'product.url';
  if (label.includes('价格') || label.includes('price') || paths.some((p) => p.includes('price'))) return 'product.price';
  if (label.includes('标题') || label.includes('title') || label.includes('name')) return 'product.title';
  return undefined;
}

function normalizeLegacyProductSeedFields(fields: BusinessField[]): BusinessField[] {
  return fields
    .map((field): BusinessField => {
      const slotKey = inferSlotKey(field);
      return {
        ...field,
        slotIndex: inferSlotIndex(field),
        ...(slotKey ? { slotKey } : {}),
      };
    });
}

/**
 * 统一迁移 businessForm 到当前唯一格式：
 * - 显式 dataSource
 * - manual: 保证 fields 数组存在
 * - shop_product: 保证 productTemplate + slots 完整，并同步扁平 fields
 */
export function normalizeBusinessForm(form?: BusinessFormConfig | null): BusinessFormConfig | undefined {
  if (!form) return undefined;
  const legacy = form as BusinessFormConfig & {
    maxSelectable?: number;
    emptySlotBehavior?: 'keepDefault' | 'clear';
    dataSource?: string;
  };
  const rawDataSource = legacy.dataSource;
  const dataSource =
    rawDataSource === 'manual'
      ? 'manual'
      : rawDataSource === 'shop_product' || rawDataSource === 'shopProducts' || form.productTemplate
        ? 'shop_product'
        : 'manual';

  if (dataSource === 'manual') {
    return {
      dataSource: 'manual',
      fields: Array.isArray(form.fields) ? form.fields : [],
    };
  }

  const maxSelectable = form.productTemplate?.maxSelectable ?? legacy.maxSelectable ?? 1;
  const seedFieldsRaw =
    form.productTemplate?.slots?.length
      ? flattenProductSlots(form.productTemplate.slots)
      : Array.isArray(form.fields)
        ? form.fields
        : [];
  const independentFields = Array.isArray(form.fields)
    ? form.fields
      .filter((field) => field.slotIndex == null)
      .map((field) => ({ ...field, slotKey: undefined }))
    : [];
  const seedFields = normalizeLegacyProductSeedFields(seedFieldsRaw);
  const explicitSlots = form.productTemplate?.slots;
  const explicitSlotMap = new Map<number, ProductSlotConfig>(
    (explicitSlots ?? []).map((slot) => [slot.slotIndex, slot] as const)
  );
  const normalizedMax = Math.max(1, Math.min(6, maxSelectable || 1));
  const slots: ProductSlotConfig[] = [];
  for (let slotIndex = 0; slotIndex < normalizedMax; slotIndex += 1) {
    const explicit = explicitSlotMap.get(slotIndex);
    if (explicit) {
      const explicitFields = Array.isArray(explicit.fields) ? explicit.fields : [];
      slots.push({
        slotIndex,
        fields: explicitFields.map((field) => ({
          ...field,
          slotIndex,
        })),
      });
      continue;
    }
    const slotSeed = seedFields.filter((field) => (field.slotIndex ?? 0) === slotIndex);
    slots.push({
      slotIndex,
      fields: ensureSlotFields(slotIndex, slotSeed),
    });
  }

  return {
    dataSource: 'shop_product',
    fields: [...flattenProductSlots(slots), ...independentFields],
    productTemplate: {
      maxSelectable: slots.length,
      slots,
      emptySlotBehavior: form.productTemplate?.emptySlotBehavior ?? legacy.emptySlotBehavior ?? 'keepDefault',
    },
  };
}

