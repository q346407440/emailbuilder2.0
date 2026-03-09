import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { captureElementPreview } from '@shared/utils/capturePreview';
import Modal from '@shared/ui/Modal';
import modalStyles from '@shared/ui/Modal.module.css';
import { useCompositeStore } from '@features/composite-library/store/useCompositeStore';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { toast } from '@shared/store/useToastStore';
import { TYPE_LABELS, TYPE_ICONS } from '@shared/constants/componentLibrary';
import { DEFAULT_TEXT_FONT_FAMILY } from '@shared/constants/fontOptions';
import { getFilteredBindableProps } from '@shared/constants/businessBindings';
import type { EmailComponent, EmailComponentType } from '@shared/types/email';
import type {
  CompositeComponent,
  CompositeMode,
  BusinessField,
  BusinessFieldType,
  BusinessFieldBinding,
  BusinessFormConfig,
  BusinessDataSourceType,
  ProductSlotConfig,
} from '@shared/types/composite';
import { renderEmailComponent } from '@email-components/renderEmailComponent';
import { PRODUCT_SLOT_FIELDS, createProductSlots, flattenProductSlots, normalizeBusinessForm } from '@shared/utils/businessForm';
import styles from './CreateCompositeWizard.module.css';

/**
 * 在离屏容器中渲染组件，经 prepareEmailHtml + 后端 Puppeteer 生成预览图。
 * 离屏容器结构：plain div > ComponentWrapper（不使用 Canvas 专属 CSS 类，避免 min-height/flex 干扰）。
 * 截图目标为 ComponentWrapper；使用组件自身渲染尺寸（scrollWidth/scrollHeight），不传画布宽度。
 */
async function capturePreviewFromSnapshot(snapshotEl: HTMLElement | null): Promise<string | undefined> {
  if (!snapshotEl) return undefined;
  // target = ComponentWrapper（离屏容器的直接子节点）
  const target = (snapshotEl.firstElementChild as HTMLElement | null) ?? snapshotEl;
  const dataUrl = await captureElementPreview(target, { backgroundColor: '#FFFFFF' });
  return dataUrl ?? undefined;
}

interface Props {
  open: boolean;
  onClose: () => void;
  component: EmailComponent;
  /** 传入则为编辑模式：预填该复合组件数据，确认时覆盖该条并可改名 */
  compositeId?: string;
}

const FIELD_TYPE_LABELS: Record<BusinessFieldType, string> = {
  image: '图片',
  text: '文字',
  color: '颜色',
  number: '数值',
};

const STEP_LABELS_NATIVE = ['基本信息'];
const STEP_LABELS_BUSINESS_CREATE = ['基本信息', '定义字段', '绑定配置', '确认创建'];
const STEP_LABELS_BUSINESS_EDIT = ['基本信息', '定义字段', '绑定配置', '确认修改'];
const SLOT_KEY_OPTIONS: Array<{ value: NonNullable<BusinessField['slotKey']>; label: string }> = [
  { value: 'product.image', label: '商品图片' },
  { value: 'product.title', label: '商品标题' },
  { value: 'product.price', label: '商品价格' },
  { value: 'product.compareAtPrice', label: '商品划线价' },
  { value: 'product.url', label: '商品链接' },
];

function CompositeOptionRow({
  composite,
  selected,
  onSelect,
}: {
  composite: CompositeComponent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.compositeOptionRow} ${selected ? styles.compositeOptionRowSelected : ''}`}
        onClick={onSelect}
      >
        <span className={`${styles.compositeOptionRadio} ${selected ? styles.compositeOptionRadioChecked : ''}`} aria-hidden />
        <span className={styles.compositeOptionTitle}>{composite.name}</span>
      </button>
    </li>
  );
}

/** 树节点（保留层级结构，支持折叠/展开） */
interface TreeNodeInfo {
  component: EmailComponent;
  path: number[];
  depth: number;
  children: TreeNodeInfo[];
}

/** 递归构建带层级的树结构 */
function buildTree(comp: EmailComponent, basePath: number[], depth: number): TreeNodeInfo {
  const children: TreeNodeInfo[] = [];
  if (comp.children) {
    comp.children.forEach((child, idx) => {
      children.push(buildTree(child, [...basePath, idx], depth + 1));
    });
  }
  return { component: comp, path: basePath, depth, children };
}

/** 扁平收集所有节点（用于 summary 步骤） */
function flattenTree(node: TreeNodeInfo): TreeNodeInfo[] {
  const result: TreeNodeInfo[] = [node];
  node.children.forEach((child) => result.push(...flattenTree(child)));
  return result;
}

function createDefaultSlotFields(slotIndex: number): BusinessField[] {
  return PRODUCT_SLOT_FIELDS.map((def) => ({
    id: nanoid(8),
    label: `商品${slotIndex + 1}${def.label}`,
    type: def.type,
    slotIndex,
    slotKey: def.slotKey,
    bindings: [],
  }));
}

function buildProductSlotsFromFields(
  slotCount: number,
  seedFields: BusinessField[],
  options?: { createDefaultsFromSlotIndex?: number }
): ProductSlotConfig[] {
  const normalizedCount = Math.max(1, Math.min(6, slotCount || 1));
  const bySlot = new Map<number, BusinessField[]>();
  for (const field of seedFields) {
    if (typeof field.slotIndex !== 'number' || !Number.isFinite(field.slotIndex)) continue;
    const idx =
      Math.max(0, field.slotIndex);
    const bucket = bySlot.get(idx) ?? [];
    bucket.push({ ...field, slotIndex: idx });
    bySlot.set(idx, bucket);
  }
  const createDefaultsFrom = options?.createDefaultsFromSlotIndex ?? Number.POSITIVE_INFINITY;
  const slots: ProductSlotConfig[] = [];
  for (let slotIndex = 0; slotIndex < normalizedCount; slotIndex += 1) {
    const existed = bySlot.get(slotIndex) ?? [];
    const fields = existed.length > 0
      ? existed
      : slotIndex >= createDefaultsFrom
        ? createDefaultSlotFields(slotIndex)
        : [];
    slots.push({ slotIndex, fields });
  }
  return slots;
}

function relabelFieldBySlotIndex(field: BusinessField, slotIndex: number): BusinessField {
  const nextLabel = field.label.replace(/^\s*商品\s*\d+/, `商品${slotIndex + 1}`);
  return {
    ...field,
    slotIndex,
    label: nextLabel,
  };
}

/** 收集树中所有有子节点的 pathKey（用于默认全部展开） */
function collectExpandableKeys(node: TreeNodeInfo): Set<string> {
  const keys = new Set<string>();
  if (node.children.length > 0) {
    keys.add(node.path.join('.'));
    node.children.forEach((child) => {
      collectExpandableKeys(child).forEach((k) => keys.add(k));
    });
  }
  return keys;
}

export type SaveCompositeMode = 'new' | 'overwrite';

export default function CreateCompositeWizard({ open, onClose, component, compositeId }: Props) {
  const user = useAuthStore((s) => s.user);
  const canChoosePublic = user?.isAdmin === true;
  const addComposite = useCompositeStore((s) => s.addComposite);
  const updateComposite = useCompositeStore((s) => s.updateComposite);
  const renameComposite = useCompositeStore((s) => s.renameComposite);
  const isLoaded = useCompositeStore((s) => s.isLoaded);
  const loadComposites = useCompositeStore((s) => s.loadComposites);
  const getActiveComposites = useCompositeStore((s) => s.getActiveComposites);
  const getCompositeById = useCompositeStore((s) => s.getCompositeById);
  const myComposites = useCompositeStore((s) => s.myComposites);
  const isMyCompositesLoaded = useCompositeStore((s) => s.isMyCompositesLoaded);
  const loadMyComposites = useCompositeStore((s) => s.loadMyComposites);
  const getMyCompositeById = useCompositeStore((s) => s.getMyCompositeById);
  const templateConfig = useEmailStore((s) => s.templateConfig);
  const isEditMode = Boolean(compositeId);
  const previewSnapshotRef = useRef<HTMLDivElement>(null);
  const initialComposite = useMemo(() => {
    if (!compositeId) return null;
    return getMyCompositeById(compositeId) ?? getCompositeById(compositeId) ?? null;
  }, [compositeId, getMyCompositeById, getCompositeById]);
  const initialNormalized = useMemo(
    () => normalizeBusinessForm(initialComposite?.businessForm),
    [initialComposite]
  );
  const initialDataSource = initialNormalized?.dataSource ?? 'manual';
  const initialMaxSelectable = initialNormalized?.productTemplate?.maxSelectable ?? 1;
  const initialFieldsSource = initialNormalized?.fields ?? [];
  const initialFields =
    initialDataSource === 'shop_product' && initialFieldsSource.length === 0
      ? flattenProductSlots(createProductSlots(initialMaxSelectable))
      : initialFieldsSource;
  const initialFirstSlotIndex =
    initialFields.reduce((min, field) => {
      const idx = typeof field.slotIndex === 'number' ? field.slotIndex : 0;
      return Math.min(min, idx);
    }, Number.POSITIVE_INFINITY);
  const initialActiveSlotIndex = Number.isFinite(initialFirstSlotIndex) ? initialFirstSlotIndex : 0;

  // Step state
  const [step, setStep] = useState(0);
  const [name, setName] = useState(() => initialComposite?.name ?? '');
  const [mode, setMode] = useState<CompositeMode>(() => initialComposite?.mode ?? 'native');
  /** 保存方式：保存为新组件 / 覆盖旧组件 */
  const [saveMode, setSaveMode] = useState<SaveCompositeMode>(() => (compositeId ? 'overwrite' : 'new'));
  /** 覆盖模式下选中的复合组件 ID */
  const [selectedCompositeId, setSelectedCompositeId] = useState<string | null>(() => compositeId ?? null);
  /** 覆盖模式下列表搜索关键字（预留分页/筛选扩展） */
  const [overwriteSearch, setOverwriteSearch] = useState('');
  /** 保存位置：仅「保存为新组件」时有效，仅管理员可选「保存到公共」 */
  const [saveLocation, setSaveLocation] = useState<'mine' | 'public'>('mine');
  /** 覆盖位置：管理员可在我的/公共之间切换 */
  const [overwriteLocation, setOverwriteLocation] = useState<'mine' | 'public'>('mine');

  // Business fields
  const [fields, setFields] = useState<BusinessField[]>(() => initialFields);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(() => initialFields[0]?.id ?? null);
  const [dataSource, setDataSource] = useState<BusinessDataSourceType>(() => initialDataSource);
  const [maxSelectable, setMaxSelectable] = useState(() => initialMaxSelectable);
  const [activeProductSlotIndex, setActiveProductSlotIndex] = useState(() => initialActiveSlotIndex);

  // 绑定步骤：树折叠状态（存储已折叠的 pathKey）
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  // 打开弹窗或 compositeId/initialComposite 变化时，用当前 initial* 重新同步表单状态，避免关闭后换一个 compositeId 再打开仍显示旧数据
  useEffect(() => {
    if (!open) return;
    setName(initialComposite?.name ?? '');
    setMode(initialComposite?.mode ?? 'native');
    setSaveMode(compositeId ? 'overwrite' : 'new');
    setSelectedCompositeId(compositeId ?? null);
    const norm = initialNormalized;
    const ds = norm?.dataSource ?? 'manual';
    const maxSel = norm?.productTemplate?.maxSelectable ?? 1;
    const fieldsSource = norm?.fields ?? [];
    const nextFields =
      ds === 'shop_product' && fieldsSource.length === 0
        ? flattenProductSlots(createProductSlots(maxSel))
        : fieldsSource;
    const firstSlot = nextFields.reduce(
      (min, field) => Math.min(min, typeof field.slotIndex === 'number' ? field.slotIndex : 0),
      Number.POSITIVE_INFINITY
    );
    setFields(nextFields);
    setActiveFieldId(nextFields[0]?.id ?? null);
    setDataSource(ds);
    setMaxSelectable(maxSel);
    setActiveProductSlotIndex(Number.isFinite(firstSlot) ? firstSlot : 0);
  }, [open, compositeId, initialComposite, initialNormalized]);

  useEffect(() => {
    if (!open) return;
    if (!isMyCompositesLoaded) loadMyComposites();
    if (canChoosePublic && !isLoaded) loadComposites();
  }, [open, isMyCompositesLoaded, loadMyComposites, canChoosePublic, isLoaded, loadComposites]);


  const reset = useCallback(() => {
    setStep(0);
    setName('');
    setMode('native');
    setSaveMode('new');
    setSelectedCompositeId(null);
    setOverwriteSearch('');
    setSaveLocation('mine');
    setOverwriteLocation('mine');
    setFields([]);
    setActiveFieldId(null);
    setDataSource('manual');
    setMaxSelectable(1);
    setActiveProductSlotIndex(0);
    setCollapsedNodes(new Set());
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const applyCompositeDefaults = useCallback((target: CompositeComponent | null) => {
    if (!target) return;
    setMode(target.mode);
    const normalized = normalizeBusinessForm(target.businessForm);
    const nextDataSource = normalized?.dataSource ?? 'manual';
    const nextMaxSelectable = normalized?.productTemplate?.maxSelectable ?? 1;
    let nextFields = normalized?.fields ?? [];
    if (nextDataSource === 'shop_product' && nextFields.length === 0) {
      nextFields = flattenProductSlots(createProductSlots(nextMaxSelectable));
    }
    const firstSlotIndex =
      nextFields.reduce((min, field) => {
        const idx = typeof field.slotIndex === 'number' ? field.slotIndex : 0;
        return Math.min(min, idx);
      }, Number.POSITIVE_INFINITY);
    setDataSource(nextDataSource);
    setMaxSelectable(nextMaxSelectable);
    setFields(nextFields);
    setActiveProductSlotIndex(Number.isFinite(firstSlotIndex) ? firstSlotIndex : 0);
    setActiveFieldId(nextFields[0]?.id ?? null);
  }, []);

  // ===== Field operations =====

  const addField = () => {
    const newField: BusinessField = {
      id: nanoid(8),
      label: '',
      type: 'text',
      bindings: [],
    };
    setFields((prev) => [...prev, newField]);
  };

  const addIndependentField = () => {
    const newField: BusinessField = {
      id: nanoid(8),
      label: '自定义字段',
      type: 'text',
      bindings: [],
    };
    setFields((prev) => [...prev, newField]);
    setActiveFieldId(newField.id);
  };

  const updateField = (id: string, updates: Partial<BusinessField>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (activeFieldId === id) setActiveFieldId(null);
  };

  const switchBusinessDataSource = (nextSource: BusinessDataSourceType) => {
    setDataSource(nextSource);
    if (nextSource === 'manual') {
      setActiveProductSlotIndex(0);
      setFields((prev) => prev.filter((field) => field.slotIndex == null));
      return;
    }
    setActiveProductSlotIndex(0);
    const slots = createProductSlots(
      maxSelectable,
      fields.filter((field) => field.slotIndex != null)
    );
    const independentFields = fields.filter((field) => field.slotIndex == null);
    const nextFields = [...flattenProductSlots(slots), ...independentFields];
    setFields(nextFields);
    setActiveFieldId(nextFields[0]?.id ?? null);
  };

  const addProductFieldForActiveSlot = () => {
    if (dataSource !== 'shop_product') return;
    const slotIndex = activeProductSlot?.slotIndex ?? 0;
    const newField: BusinessField = {
      id: nanoid(8),
      label: `商品${slotIndex + 1}自定义字段`,
      type: 'text',
      slotIndex,
      bindings: [],
    };
    setFields((prev) => [...prev, newField]);
    setActiveFieldId(newField.id);
  };

  const addProductSlot = () => {
    if (dataSource !== 'shop_product' || maxSelectable >= 6) return;
    const nextCount = Math.min(6, maxSelectable + 1);
    const slots = buildProductSlotsFromFields(nextCount, fields, {
      createDefaultsFromSlotIndex: maxSelectable,
    });
    const independentFields = fields.filter((field) => field.slotIndex == null);
    setMaxSelectable(nextCount);
    setFields([...flattenProductSlots(slots), ...independentFields]);
    setActiveProductSlotIndex(nextCount - 1);
  };

  const removeProductSlot = (slotIndex: number) => {
    if (dataSource !== 'shop_product' || maxSelectable <= 1) return;
    const currentSlots = buildProductSlotsFromFields(maxSelectable, fields);
    const kept = currentSlots.filter((slot) => slot.slotIndex !== slotIndex);
    if (kept.length === 0) return;
    const reindexed: ProductSlotConfig[] = kept.map((slot, idx) => ({
      slotIndex: idx,
      fields: slot.fields.map((field) => relabelFieldBySlotIndex(field, idx)),
    }));
    const independentFields = fields.filter((field) => field.slotIndex == null);
    const nextFields = [...flattenProductSlots(reindexed), ...independentFields];
    setMaxSelectable(reindexed.length);
    setFields(nextFields);
    if (!nextFields.some((f) => f.id === activeFieldId)) {
      setActiveFieldId(nextFields[0]?.id ?? null);
    }
    const nextActiveIndex = Math.min(activeProductSlotIndex, reindexed.length - 1);
    setActiveProductSlotIndex(Math.max(0, nextActiveIndex));
  };

  const productSlots = useMemo(() => {
    if (dataSource !== 'shop_product') return [] as Array<{ slotIndex: number; fields: BusinessField[] }>;
    const groups = new Map<number, BusinessField[]>();
    for (const field of fields) {
      const idx =
        typeof field.slotIndex === 'number' && Number.isFinite(field.slotIndex)
          ? Math.max(0, field.slotIndex)
          : 0;
      const bucket = groups.get(idx) ?? [];
      bucket.push(field);
      groups.set(idx, bucket);
    }

    const orderMap = new Map(PRODUCT_SLOT_FIELDS.map((def, index) => [def.slotKey, index] as const));
    const maxExistingSlot = groups.size > 0 ? Math.max(...Array.from(groups.keys())) + 1 : 0;
    const totalSlots = Math.max(1, maxSelectable, maxExistingSlot);
    const slots: Array<{ slotIndex: number; fields: BusinessField[] }> = [];
    for (let i = 0; i < totalSlots; i++) {
      const slotFieldsRaw = (groups.get(i) ?? []).slice();
      const originalOrder = new Map(slotFieldsRaw.map((field, index) => [field.id, index] as const));
      const slotFields = slotFieldsRaw.sort((a, b) => {
        const oa = a.slotKey ? orderMap.get(a.slotKey) : undefined;
        const ob = b.slotKey ? orderMap.get(b.slotKey) : undefined;
        const aRank = oa ?? 1000 + (originalOrder.get(a.id) ?? 0);
        const bRank = ob ?? 1000 + (originalOrder.get(b.id) ?? 0);
        return aRank - bRank;
      });
      slots.push({ slotIndex: i, fields: slotFields });
    }
    return slots;
  }, [dataSource, fields, maxSelectable]);

  const independentFields = useMemo(
    () => fields.filter((field) => field.slotIndex == null),
    [fields]
  );

  const effectiveActiveProductSlotIndex = useMemo(() => {
    if (dataSource !== 'shop_product') return 0;
    const maxIndex = productSlots.length - 1;
    if (maxIndex < 0) return 0;
    return Math.min(activeProductSlotIndex, maxIndex);
  }, [dataSource, productSlots.length, activeProductSlotIndex]);

  const activeProductSlot =
    productSlots.find((slot) => slot.slotIndex === effectiveActiveProductSlotIndex) ?? productSlots[0];
  const totalProductFieldCount = useMemo(
    () => productSlots.reduce((sum, slot) => sum + slot.fields.length, 0) + independentFields.length,
    [productSlots, independentFields.length]
  );

  const toggleBinding = (fieldId: string, binding: BusinessFieldBinding) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f;
        const pathKey = binding.componentPath.join('.');
        const exists = f.bindings.some(
          (b) => b.componentPath.join('.') === pathKey && b.propPath === binding.propPath
        );
        if (exists) {
          return {
            ...f,
            bindings: f.bindings.filter(
              (b) => !(b.componentPath.join('.') === pathKey && b.propPath === binding.propPath)
            ),
          };
        }
        return { ...f, bindings: [...f.bindings, binding] };
      })
    );
  };

  // ===== Navigation =====

  const stepLabels =
    mode === 'business'
      ? (isEditMode ? STEP_LABELS_BUSINESS_EDIT : STEP_LABELS_BUSINESS_CREATE)
      : STEP_LABELS_NATIVE;
  const totalSteps = stepLabels.length;
  const isLastStep = step === totalSteps - 1;

  const canNext = () => {
    if (isEditMode && step === 0) return name.trim().length > 0;
    if (saveMode === 'overwrite' && step === 0) return selectedCompositeId != null;
    if (step === 0) return name.trim().length > 0;
    if (step === 1 && mode === 'business') return fields.length > 0 && fields.every((f) => f.label.trim().length > 0);
    return true;
  };

  const handleNext = () => {
    if (isLastStep) {
      handleConfirm();
      return;
    }
    // Native mode: step 0 → confirm directly
    if (mode === 'native' && step === 0) {
      handleConfirm();
      return;
    }
    setStep((s) => s + 1);
    // Auto-select first field when entering binding step
    if (step === 1 && mode === 'business' && fields.length > 0 && !activeFieldId) {
      setActiveFieldId(fields[0].id);
    }
  };

  const handleBack = () => {
    setStep((s) => Math.max(0, s - 1));
  };

  const handleConfirm = async () => {
    try {
      // 等待离屏容器渲染完成（图片加载等），再截图
      await new Promise((r) => setTimeout(r, 500));
      const previewDataUrl = await capturePreviewFromSnapshot(previewSnapshotRef.current);
      if (!previewDataUrl) {
        console.warn('[CreateCompositeWizard] 预览图生成失败，将以无缩略图方式保存');
      }
      const normalizedBusinessForm: BusinessFormConfig | undefined =
        mode === 'business'
          ? dataSource === 'shop_product'
            ? (() => {
              const slotFields = fields.filter((field) => field.slotIndex != null);
              const independent = fields
                .filter((field) => field.slotIndex == null)
                .map((field) => ({ ...field, slotKey: undefined }));
              const slots = buildProductSlotsFromFields(maxSelectable, slotFields);
              return {
                dataSource: 'shop_product',
                fields: [...flattenProductSlots(slots), ...independent],
                productTemplate: {
                  maxSelectable: slots.length,
                  slots,
                  emptySlotBehavior: 'keepDefault' as const,
                },
              };
            })()
            : {
              dataSource: 'manual',
              fields: fields.filter((field) => field.slotKey == null && field.slotIndex == null),
            }
          : undefined;

      const id = isEditMode ? compositeId! : selectedCompositeId;
      if (isEditMode || saveMode === 'overwrite') {
        if (!id) return;
        const options =
          mode === 'native'
            ? { mode: 'native' as const }
            : { mode: 'business' as const, businessForm: normalizedBusinessForm };
        await updateComposite(id, component, previewDataUrl, options);
        if (isEditMode) {
          const current = getCompositeById(id);
          if (current && name.trim() !== current.name) {
            await renameComposite(id, name.trim());
          }
        }
        handleClose();
        return;
      }
      if (!name.trim()) return;
      const businessForm = normalizedBusinessForm;
      const isPublic = saveLocation === 'public' && user?.isAdmin === true;
      await addComposite(name.trim(), component, mode, businessForm, previewDataUrl, isPublic);
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast(`保存复合组件失败：${msg}`, 'error');
    }
  };

  // ===== Collect tree nodes for binding step =====
  const treeRoot = useMemo(() => buildTree(component, [], 0), [component]);
  const treeNodes = useMemo(() => flattenTree(treeRoot), [treeRoot]);
  const allExpandableKeys = useMemo(() => collectExpandableKeys(treeRoot), [treeRoot]);

  // 折叠/展开操作
  const toggleCollapse = useCallback((pathKey: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) {
        next.delete(pathKey);
      } else {
        next.add(pathKey);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedNodes(new Set(allExpandableKeys));
  }, [allExpandableKeys]);

  // ===== Rendering helpers =====
  const activeField = fields.find((f) => f.id === activeFieldId);
  // 覆盖模式 Step0 双栏布局 / 业务模式 Step1+ 使用大弹窗
  const useLargeModal = (step === 0 && saveMode === 'overwrite') || (mode === 'business' && step > 0);

  // ===== Step indicator =====
  const renderStepper = () => {
    // 业务模式的 step 0 不显示 stepper，进入后续步骤才展示
    if (mode !== 'business' || step === 0) return null;
    return (
      <div className={styles.stepper}>
        {stepLabels.map((label, idx) => {
          const isActive = idx === step;
          const isDone = idx < step;
          return (
            <span key={label} style={{ display: 'contents' }}>
              {idx > 0 && (
                <span className={`${styles.stepConnector} ${isDone ? styles.stepConnectorDone : ''}`} />
              )}
              <span className={`${styles.stepItem} ${isActive ? styles.stepItemActive : ''} ${isDone ? styles.stepItemDone : ''}`}>
                <span className={styles.stepCircle}>
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 5l3 3 7-7" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </span>
                {label}
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  // ===== Step 0: 保存方式切换 + 新组件表单 / 覆盖列表 =====
  const activeComposites = getActiveComposites();
  const myActiveComposites = [...myComposites]
    .filter((c) => c.status === 'active')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const myCompositeIdSet = new Set(myActiveComposites.map((c) => c.id));
  const editablePublicComposites = activeComposites.filter((c) => myCompositeIdSet.has(c.id));
  const overwriteComposites = overwriteLocation === 'public' ? editablePublicComposites : myActiveComposites;
  const overwriteLoading = overwriteLocation === 'public' ? !isLoaded : !isMyCompositesLoaded;
  const overwriteSearchTrim = overwriteSearch.trim();
  const filteredOverwriteComposites = overwriteSearchTrim
    ? overwriteComposites.filter((c) => c.name.toLowerCase().includes(overwriteSearchTrim.toLowerCase()))
    : overwriteComposites;

  const renderStep0 = () => (
    <div className={styles.step0Wrap}>
      {isEditMode ? (
        <>
          <div className={styles.step0Section}>
            <label className={styles.sectionLabel} htmlFor="composite-name-edit">组件名称</label>
            <input
              id="composite-name-edit"
              className={modalStyles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入复合组件名称"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mode === 'native' && canNext()) handleNext();
              }}
            />
          </div>
          <div className={styles.step0Section}>
            <label className={styles.sectionLabel}>选择模式</label>
            <div className={styles.modeSelector}>
              <button
                type="button"
                className={`${styles.modeCard} ${mode === 'native' ? styles.modeCardActive : ''}`}
                onClick={() => setMode('native')}
              >
                <span className={styles.modeCardHead}>
                  <span className={styles.modeCardIcon}>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="14" height="14" rx="2" />
                      <path d="M7 7h6M7 10h6M7 13h4" />
                    </svg>
                  </span>
                  <span className={styles.modeCardTitle}>原生模式</span>
                  <span className={styles.modeCardRadio} />
                </span>
                <span className={styles.modeCardDesc}>
                  保留所有原生配置项，使用时可完整编辑每个子组件
                </span>
              </button>
              <button
                type="button"
                className={`${styles.modeCard} ${mode === 'business' ? styles.modeCardActive : ''}`}
                onClick={() => setMode('business')}
              >
                <span className={styles.modeCardHead}>
                  <span className={styles.modeCardIcon}>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="2" width="14" height="16" rx="2" />
                      <path d="M7 6h6M7 9.5h6M7 13h3" />
                      <circle cx="14" cy="14" r="3" fill="var(--bg-panel)" />
                      <path d="M13 14h2M14 13v2" />
                    </svg>
                  </span>
                  <span className={styles.modeCardTitle}>业务封装模式</span>
                  <span className={styles.modeCardRadio} />
                </span>
                <span className={styles.modeCardDesc}>
                  自定义简化表单，只暴露需要修改的配置给使用者
                </span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={styles.saveModeSwitch}>
            <button
              type="button"
              className={`${styles.saveModeBtn} ${saveMode === 'new' ? styles.saveModeBtnActive : ''}`}
              onClick={() => {
                setSaveMode('new');
                setSelectedCompositeId(null);
              }}
            >
              保存为新组件
            </button>
            <button
              type="button"
              className={`${styles.saveModeBtn} ${saveMode === 'overwrite' ? styles.saveModeBtnActive : ''}`}
              onClick={() => setSaveMode('overwrite')}
            >
              覆盖旧组件
            </button>
          </div>

          {saveMode === 'overwrite' ? (
        <div className={styles.step0OverwriteLayout}>
          <div className={styles.step0OverwriteListColumn}>
            {canChoosePublic && (
              <div className={styles.step0Section}>
                <label className={styles.sectionLabel}>覆盖目标</label>
                <div className={styles.saveLocationRow} role="radiogroup" aria-label="覆盖目标">
                  <label className={styles.saveLocationOption}>
                    <input
                      type="radio"
                      name="compositeOverwriteLocation"
                      checked={overwriteLocation === 'mine'}
                      onChange={() => {
                        setOverwriteLocation('mine');
                        setSelectedCompositeId(null);
                      }}
                      className={styles.saveLocationRadio}
                    />
                    <span>覆盖我的组件</span>
                  </label>
                  <label className={styles.saveLocationOption}>
                    <input
                      type="radio"
                      name="compositeOverwriteLocation"
                      checked={overwriteLocation === 'public'}
                      onChange={() => {
                        setOverwriteLocation('public');
                        setSelectedCompositeId(null);
                      }}
                      className={styles.saveLocationRadio}
                    />
                    <span>覆盖公共组件</span>
                  </label>
                </div>
              </div>
            )}
            <label className={styles.sectionLabel} htmlFor="overwrite-search">
              选择要覆盖的组件
            </label>
            <input
              id="overwrite-search"
              type="search"
              className={styles.overwriteSearchInput}
              value={overwriteSearch}
              onChange={(e) => setOverwriteSearch(e.target.value)}
              placeholder="搜索组件名称…"
              autoComplete="off"
              aria-label="搜索组件名称"
            />
            <div className={styles.overwriteListScroll}>
              {overwriteLoading ? (
                <p className={styles.overwriteHint}>加载中…</p>
              ) : overwriteComposites.length === 0 ? (
                <p className={styles.overwriteHint}>
                  {overwriteLocation === 'public' ? '暂无你可覆盖的公共组件。' : '暂无你可覆盖的复合组件，请先使用「保存为新组件」保存当前选区。'}
                </p>
              ) : filteredOverwriteComposites.length === 0 ? (
                <p className={styles.overwriteHint}>未找到匹配「{overwriteSearchTrim}」的组件</p>
              ) : (
                <ul className={styles.compositeOptions} role="radiogroup" aria-label="选择要覆盖的复合组件">
                  {filteredOverwriteComposites.map((c) => (
                    <CompositeOptionRow
                      key={c.id}
                      composite={c}
                      selected={selectedCompositeId === c.id}
                      onSelect={() => {
                        setSelectedCompositeId(c.id);
                        if (!isEditMode && saveMode === 'overwrite') {
                          applyCompositeDefaults(c);
                        }
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
            <div className={styles.overwriteListFooter} aria-hidden>
              {overwriteComposites.length > 0 && (
                <span className={styles.overwriteListCount}>
                  {filteredOverwriteComposites.length === overwriteComposites.length
                    ? `共 ${overwriteComposites.length} 个组件`
                    : `${filteredOverwriteComposites.length} / ${overwriteComposites.length} 个`}
                </span>
              )}
            </div>
          </div>
          <div className={styles.step0OverwriteModeColumn}>
            <div className={styles.step0Section}>
              <label className={styles.sectionLabel}>选择模式</label>
              <div className={styles.modeSelector}>
                <button
                  type="button"
                  className={`${styles.modeCard} ${mode === 'native' ? styles.modeCardActive : ''}`}
                  onClick={() => setMode('native')}
                >
                  <span className={styles.modeCardHead}>
                    <span className={styles.modeCardIcon}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="14" height="14" rx="2" />
                        <path d="M7 7h6M7 10h6M7 13h4" />
                      </svg>
                    </span>
                    <span className={styles.modeCardTitle}>原生模式</span>
                    <span className={styles.modeCardRadio} />
                  </span>
                  <span className={styles.modeCardDesc}>
                    保留所有原生配置项，使用时可完整编辑每个子组件
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.modeCard} ${mode === 'business' ? styles.modeCardActive : ''}`}
                  onClick={() => setMode('business')}
                >
                  <span className={styles.modeCardHead}>
                    <span className={styles.modeCardIcon}>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="2" width="14" height="16" rx="2" />
                        <path d="M7 6h6M7 9.5h6M7 13h3" />
                        <circle cx="14" cy="14" r="3" fill="var(--bg-panel)" />
                        <path d="M13 14h2M14 13v2" />
                      </svg>
                    </span>
                    <span className={styles.modeCardTitle}>业务封装模式</span>
                    <span className={styles.modeCardRadio} />
                  </span>
                  <span className={styles.modeCardDesc}>
                    自定义简化表单，只暴露需要修改的配置给使用者
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.step0Section}>
            <label className={styles.sectionLabel} htmlFor="composite-name">组件名称</label>
            <input
              id="composite-name"
              className={modalStyles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入复合组件名称"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && mode === 'native' && canNext()) handleNext();
              }}
            />
          </div>
          <div className={styles.step0Section}>
            <label className={styles.sectionLabel}>保存位置</label>
            <div className={styles.saveLocationRow} role="radiogroup" aria-label="保存位置">
              <label className={styles.saveLocationOption}>
                <input
                  type="radio"
                  name="compositeSaveLocation"
                  checked={saveLocation === 'mine'}
                  onChange={() => setSaveLocation('mine')}
                  className={styles.saveLocationRadio}
                />
                <span>保存到我的</span>
              </label>
              <label className={styles.saveLocationOption}>
                <input
                  type="radio"
                  name="compositeSaveLocation"
                  checked={saveLocation === 'public'}
                  onChange={() => setSaveLocation('public')}
                  className={styles.saveLocationRadio}
                  disabled={user?.isAdmin !== true}
                  title={user?.isAdmin !== true ? '仅管理员可保存到公共组件库' : undefined}
                />
                <span>保存到公共</span>
              </label>
            </div>
          </div>
          <div className={styles.step0Section}>
            <label className={styles.sectionLabel}>选择模式</label>
            <div className={styles.modeSelector}>
              <button
                type="button"
                className={`${styles.modeCard} ${mode === 'native' ? styles.modeCardActive : ''}`}
                onClick={() => setMode('native')}
              >
                <span className={styles.modeCardHead}>
                  <span className={styles.modeCardIcon}>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="14" height="14" rx="2" />
                      <path d="M7 7h6M7 10h6M7 13h4" />
                    </svg>
                  </span>
                  <span className={styles.modeCardTitle}>原生模式</span>
                  <span className={styles.modeCardRadio} />
                </span>
                <span className={styles.modeCardDesc}>
                  保留所有原生配置项，使用时可完整编辑每个子组件
                </span>
              </button>
              <button
                type="button"
                className={`${styles.modeCard} ${mode === 'business' ? styles.modeCardActive : ''}`}
                onClick={() => setMode('business')}
              >
                <span className={styles.modeCardHead}>
                  <span className={styles.modeCardIcon}>
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="2" width="14" height="16" rx="2" />
                      <path d="M7 6h6M7 9.5h6M7 13h3" />
                      <circle cx="14" cy="14" r="3" fill="var(--bg-panel)" />
                      <path d="M13 14h2M14 13v2" />
                    </svg>
                  </span>
                  <span className={styles.modeCardTitle}>业务封装模式</span>
                  <span className={styles.modeCardRadio} />
                </span>
                <span className={styles.modeCardDesc}>
                  自定义简化表单，只暴露需要修改的配置给使用者
                </span>
              </button>
            </div>
          </div>
        </>
      )}
        </>
      )}
    </div>
  );

  // ===== Step 1: Define fields =====
  const renderStep1 = () => (
    <div className={styles.fieldListWrap}>
      <p className={styles.stepDesc}>
        定义需要暴露给使用者的配置字段。每个字段对应一个表单项，可在下一步绑定到具体的组件属性。
      </p>
      <div className={styles.dataSourceSwitch}>
        <button
          type="button"
          className={`${styles.dataSourceBtn} ${dataSource === 'manual' ? styles.dataSourceBtnActive : ''}`}
          onClick={() => switchBusinessDataSource('manual')}
        >
          手动字段模式
        </button>
        <button
          type="button"
          className={`${styles.dataSourceBtn} ${dataSource === 'shop_product' ? styles.dataSourceBtnActive : ''}`}
          onClick={() => switchBusinessDataSource('shop_product')}
        >
          商品选择器模式
        </button>
      </div>
      {dataSource === 'shop_product' && (
        <div className={styles.slotConfigSummary}>
          当前共 {totalProductFieldCount} 个字段；不同商品可配置不同字段数量。
        </div>
      )}
      {dataSource === 'manual' ? (
        fields.length === 0 ? (
          <div className={styles.emptyFields}>
            <span className={styles.emptyFieldsIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </span>
            <span className={styles.emptyFieldsText}>暂未添加字段</span>
            <span className={styles.emptyFieldsHint}>点击下方按钮开始添加配置字段</span>
          </div>
        ) : (
          <div className={styles.fieldList}>
            {fields.map((field, idx) => (
              <div key={field.id} className={styles.fieldItem}>
                <span className={styles.fieldIndex}>{idx + 1}</span>
                <input
                  className={styles.fieldLabelInput}
                  type="text"
                  value={field.label}
                  onChange={(e) => updateField(field.id, { label: e.target.value })}
                  placeholder="字段名称"
                />
                <select
                  className={styles.fieldTypeSelect}
                  value={field.type}
                  onChange={(e) =>
                    updateField(field.id, {
                      type: e.target.value as BusinessFieldType,
                      bindings: [], // 类型切换时清空绑定
                    })
                  }
                >
                  {(Object.keys(FIELD_TYPE_LABELS) as BusinessFieldType[]).map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.fieldRemoveBtn}
                  onClick={() => removeField(field.id)}
                  title="删除字段"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className={styles.shopProductConfigWrap}>
          <div className={styles.productSlotLayout}>
            <div className={styles.productSlotSidebar}>
              {productSlots.map((slot) => {
                const isActive = slot.slotIndex === activeProductSlot?.slotIndex;
                return (
                  <div
                    key={slot.slotIndex}
                    className={`${styles.productSlotTab} ${isActive ? styles.productSlotTabActive : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveProductSlotIndex(slot.slotIndex)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveProductSlotIndex(slot.slotIndex);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className={styles.productSlotDeleteInlineBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeProductSlot(slot.slotIndex);
                      }}
                      disabled={maxSelectable <= 1}
                      title={maxSelectable <= 1 ? '至少保留 1 个商品' : '删除该商品'}
                      aria-label={`删除商品 ${slot.slotIndex + 1}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                    <span className={styles.productSlotTabTitle}>商品 {slot.slotIndex + 1}</span>
                    <span className={styles.productSlotTabMeta}>{slot.fields.length} 个字段</span>
                  </div>
                );
              })}
              <div className={styles.productSlotActions}>
                <button
                  type="button"
                  className={styles.productSlotAddBtn}
                  onClick={addProductSlot}
                  disabled={maxSelectable >= 6}
                >
                  + 新增商品
                </button>
              </div>
            </div>
            <div className={styles.productSlotContent}>
              <div className={styles.productSlotContentHead}>
                <span>当前编辑：商品 {activeProductSlot ? activeProductSlot.slotIndex + 1 : 1}</span>
                <button
                  type="button"
                  className={styles.slotAddFieldBtn}
                  onClick={addProductFieldForActiveSlot}
                >
                  为当前商品新增字段
                </button>
              </div>
              {!activeProductSlot || activeProductSlot.fields.length === 0 ? (
                <div className={styles.emptyFields}>
                  <span className={styles.emptyFieldsText}>该商品暂未配置字段</span>
                </div>
              ) : (
                <div className={styles.fieldList}>
                  {activeProductSlot.fields.map((field, idx) => (
                    <div key={field.id} className={styles.fieldItem}>
                      <span className={styles.fieldIndex}>{idx + 1}</span>
                      <input
                        className={styles.fieldLabelInput}
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        placeholder="字段名称"
                      />
                      <select
                        className={styles.fieldTypeSelect}
                        value={field.type}
                        onChange={(e) =>
                          updateField(field.id, {
                            type: e.target.value as BusinessFieldType,
                            bindings: [],
                          })
                        }
                      >
                        {(Object.keys(FIELD_TYPE_LABELS) as BusinessFieldType[]).map((t) => (
                          <option key={t} value={t}>
                            {FIELD_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <select
                        className={styles.slotSemanticSelect}
                        value={field.slotKey ?? 'product.title'}
                        onChange={(e) => {
                          const next = e.target.value as BusinessField['slotKey'];
                          updateField(field.id, { slotKey: next });
                        }}
                      >
                        {SLOT_KEY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={styles.fieldRemoveBtn}
                        onClick={() => removeField(field.id)}
                        title="删除字段"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.independentFieldCard}>
            <div className={styles.independentFieldHead}>
              <span className={styles.sectionLabel}>独立字段（不关联商品）</span>
              <button
                type="button"
                className={styles.slotAddFieldBtn}
                onClick={addIndependentField}
              >
                新增独立字段
              </button>
            </div>
            {independentFields.length === 0 ? (
              <p className={styles.independentFieldEmpty}>暂无独立字段。用于配置不随商品自动变化的内容。</p>
            ) : (
              <div className={styles.fieldList}>
                {independentFields.map((field, idx) => (
                  <div key={field.id} className={styles.fieldItem}>
                    <span className={styles.fieldIndex}>{idx + 1}</span>
                    <input
                      className={styles.fieldLabelInput}
                      type="text"
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                      placeholder="字段名称"
                    />
                    <select
                      className={styles.fieldTypeSelect}
                      value={field.type}
                      onChange={(e) =>
                        updateField(field.id, {
                          type: e.target.value as BusinessFieldType,
                          bindings: [],
                        })
                      }
                    >
                      {(Object.keys(FIELD_TYPE_LABELS) as BusinessFieldType[]).map((t) => (
                        <option key={t} value={t}>
                          {FIELD_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={styles.fieldRemoveBtn}
                      onClick={() => removeField(field.id)}
                      title="删除字段"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {dataSource === 'manual' && (
        <button type="button" className={styles.addFieldBtn} onClick={addField}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          添加字段
        </button>
      )}
    </div>
  );

  // ===== Step 2: Binding - 递归渲染树节点 =====
  const renderTreeNode = (node: TreeNodeInfo, activeField: BusinessField): React.ReactNode => {
    const filteredProps = getFilteredBindableProps(
      node.component.type as EmailComponentType,
      activeField.type
    );
    const pathKey = node.path.join('.');
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedNodes.has(pathKey);
    // 只有当自身有可绑定属性或子树中有可绑定属性时才显示
    const hasOwnProps = filteredProps.length > 0;

    return (
      <div key={pathKey}>
        <div
          className={styles.bindingTreeRow}
          style={{ paddingLeft: `${node.depth * 16 + 12}px` }}
        >
          {/* Chevron */}
          {hasChildren ? (
            <button
              type="button"
              className={`${styles.treeChevron} ${isCollapsed ? '' : styles.treeChevronOpen}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(pathKey);
              }}
              aria-label={isCollapsed ? '展开' : '收起'}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2l4 3-4 3" />
              </svg>
            </button>
          ) : (
            <span className={styles.treeChevronSpacer} />
          )}
          <span className={styles.bindingTreeIcon}>
            {TYPE_ICONS[node.component.type]}
          </span>
          <span className={styles.bindingTreeLabel}>
            {TYPE_LABELS[node.component.type]}
          </span>
          {node.path.length > 0 && (
            <span className={styles.bindingTreePath}>
              [{node.path.join('.')}]
            </span>
          )}
        </div>
        {/* 可绑定属性 */}
        {hasOwnProps && !isCollapsed && filteredProps.map((prop) => {
          const isBound = activeField.bindings.some(
            (b) => b.componentPath.join('.') === pathKey && b.propPath === prop.propPath
          );
          return (
            <div
              key={`${pathKey}-${prop.propPath}`}
              className={styles.bindingPropItem}
              style={{ paddingLeft: `${node.depth * 16 + 36}px` }}
              onClick={() =>
                toggleBinding(activeField.id, {
                  componentPath: node.path,
                  propPath: prop.propPath,
                })
              }
            >
              <span className={`${styles.checkbox} ${isBound ? styles.checkboxChecked : ''}`}>
                {isBound && (
                  <svg width="10" height="10" viewBox="0 0 12 10" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 5l3 3 7-7" />
                  </svg>
                )}
              </span>
              {prop.label}
            </div>
          );
        })}
        {/* 递归渲染子节点 */}
        {hasChildren && !isCollapsed && node.children.map((child) => renderTreeNode(child, activeField))}
      </div>
    );
  };

  const renderStep2 = () => (
    <>
      <p className={styles.stepDesc}>
        为每个字段选择要绑定的组件属性。修改字段值时，会同步更新所有绑定的属性。
      </p>
      <div className={styles.bindingLayout}>
        {/* Left: field tabs */}
        <div className={styles.bindingFieldList}>
          <div className={styles.bindingFieldListHeader}>配置字段</div>
          {fields.map((field) => (
            <button
              key={field.id}
              type="button"
              className={`${styles.bindingFieldItem} ${activeFieldId === field.id ? styles.bindingFieldItemActive : ''}`}
              onClick={() => setActiveFieldId(field.id)}
              title={field.label}
            >
              {field.label || '未命名'}
              {field.bindings.length > 0 && (
                <span className={styles.bindingFieldBadge}>{field.bindings.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Right: tree */}
        <div className={styles.bindingTree}>
          <div className={styles.bindingTreeHeader}>
            <span>{activeField ? `绑定目标 — ${activeField.label || '未命名'}` : '组件属性'}</span>
            {activeField && allExpandableKeys.size > 0 && (
              <span className={styles.treeToggleActions}>
                <button
                  type="button"
                  className={styles.treeToggleBtn}
                  onClick={expandAll}
                  title="全部展开"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={styles.treeToggleBtn}
                  onClick={collapseAll}
                  title="全部收起"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10l4-4 4 4" />
                  </svg>
                </button>
              </span>
            )}
          </div>
          <div className={styles.bindingTreeContent}>
            {activeField ? (
              renderTreeNode(treeRoot, activeField)
            ) : (
              <div className={styles.bindingEmpty}>请在左侧选择一个字段</div>
            )}
          </div>
        </div>
      </div>
    </>
  );

  // ===== Step 3: Summary =====
  const overwriteTargetName = selectedCompositeId ? getCompositeById(selectedCompositeId)?.name : '';
  const renderStep3 = () => (
    <div className={styles.summaryWrap}>
      <div className={styles.summaryInfo}>
        <span className={styles.summaryInfoIcon}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v3.5M8 10.5v0" />
          </svg>
        </span>
        {isEditMode
          ? `确认以下配置后，将更新组件「${name}」的业务封装配置，共 ${fields.length} 个配置字段。`
          : saveMode === 'overwrite' && selectedCompositeId
            ? `确认以下配置后，将覆盖组件「${overwriteTargetName}」为业务封装模式，共 ${fields.length} 个配置字段。`
            : `确认以下配置后，将创建名为「${name}」的业务封装复合组件，共 ${fields.length} 个配置字段。`}
        {dataSource === 'shop_product' ? ` 当前为商品选择器模式，最多可选择 ${maxSelectable} 个商品。` : ''}
      </div>
      {fields.map((field) => (
        <div key={field.id} className={styles.summaryCard}>
          <div className={styles.summaryCardHeader}>
            <span className={styles.summaryCardLabel}>{field.label}</span>
            <span className={styles.summaryCardType}>{FIELD_TYPE_LABELS[field.type]}</span>
          </div>
          {field.bindings.length > 0 ? (
            <div className={styles.summaryBindings}>
              {field.bindings.map((b) => {
                const pathKey = b.componentPath.join('.');
                const node = treeNodes.find((n) => n.path.join('.') === pathKey);
                const compLabel = node ? TYPE_LABELS[node.component.type] : '未知';
                const allProps = node
                  ? getFilteredBindableProps(node.component.type as EmailComponentType, field.type)
                  : [];
                const propDef = allProps.find((p) => p.propPath === b.propPath);
                const propLabel = propDef?.label || b.propPath.split('.').pop() || b.propPath;
                return (
                  <span key={`${pathKey}-${b.propPath}`} className={styles.summaryBindingTag}>
                    <span className={styles.summaryBindingIcon}>
                      {node && TYPE_ICONS[node.component.type]}
                    </span>
                    {compLabel}{pathKey ? `[${pathKey}]` : ''} → {propLabel}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className={styles.summaryEmpty}>未绑定任何属性</span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Modal
      open={open}
      title={isEditMode ? '编辑复合组件' : '创建复合组件'}
      onClose={handleClose}
      size={useLargeModal ? 'large' : 'default'}
      footer={
        <div className={styles.wizardFooter}>
          <div>
            {step > 0 && mode === 'business' && (
              <button type="button" className={modalStyles.btnCancel} onClick={handleBack}>
                上一步
              </button>
            )}
          </div>
          <div className={styles.wizardFooterRight}>
            <button type="button" className={modalStyles.btnCancel} onClick={handleClose}>
              取消
            </button>
            {isEditMode && step === 0 && mode === 'native' ? (
              <button
                type="button"
                className={modalStyles.btnConfirm}
                onClick={handleConfirm}
                disabled={!canNext()}
              >
                确认修改
              </button>
            ) : isEditMode && step === 0 && mode === 'business' ? (
              <button
                type="button"
                className={modalStyles.btnConfirm}
                onClick={handleNext}
                disabled={!canNext()}
              >
                下一步
              </button>
            ) : saveMode === 'overwrite' && step === 0 && mode === 'native' ? (
              <button
                type="button"
                className={modalStyles.btnConfirm}
                onClick={handleConfirm}
                disabled={!selectedCompositeId}
              >
                确认
              </button>
            ) : saveMode === 'overwrite' && step === 0 && mode === 'business' ? (
              <button
                type="button"
                className={modalStyles.btnConfirm}
                onClick={handleNext}
                disabled={!selectedCompositeId}
              >
                下一步
              </button>
            ) : (
              <button
                type="button"
                className={modalStyles.btnConfirm}
                onClick={handleNext}
                disabled={!canNext()}
              >
                {isEditMode && (isLastStep || (mode === 'native' && step === 0))
                  ? '确认修改'
                  : saveMode === 'overwrite' && mode === 'business' && isLastStep
                    ? '确认覆盖'
                    : isLastStep || (mode === 'native' && step === 0)
                      ? '创建'
                      : '下一步'}
              </button>
            )}
          </div>
        </div>
      }
    >
      {renderStepper()}
      {step === 0 && renderStep0()}
      {step === 1 && mode === 'business' && renderStep1()}
      {step === 2 && mode === 'business' && renderStep2()}
      {step === 3 && mode === 'business' && renderStep3()}
      {open && (
        <div
          ref={previewSnapshotRef}
          style={{
            position: 'fixed',
            left: -9999,
            top: 0,
            width: templateConfig.width || '600px',
            fontFamily: templateConfig.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
            background: '#FFFFFF',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          {renderEmailComponent(component, null, () => {})}
        </div>
      )}
    </Modal>
  );
}
