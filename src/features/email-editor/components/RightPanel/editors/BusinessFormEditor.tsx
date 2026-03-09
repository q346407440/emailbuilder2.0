import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { useShopStore } from '@shared/store/useShopStore';
import { toast } from '@shared/store/useToastStore';
import FormField from './FormField';
import PxInput from './PxInput';
import ProductSelector from './ProductSelector';
import Modal, { ModalFooter } from '@shared/ui/Modal';
import ConfigSection from './ConfigSection';
import UploadOrUrlField from './UploadOrUrlField';
import type { EmailComponent } from '@shared/types/email';
import type { BusinessField, CompositeInstanceMeta } from '@shared/types/composite';
import type { ShopProductSummary } from '@shared/api/serverApi';
import { normalizeBusinessForm } from '@shared/utils/businessForm';
import styles from './Editors.module.css';

interface Props {
  component: EmailComponent;
}

/**
 * 业务封装模式编辑器：只展示创建时定义的业务表单字段。
 * 字段值变更时通过绑定映射更新底层原生组件属性。
 */
export default function BusinessFormEditor({ component }: Props) {
  const meta = component.compositeInstance as CompositeInstanceMeta;
  const normalizedBusinessForm = useMemo(
    () => normalizeBusinessForm(meta.businessForm),
    [meta.businessForm]
  );
  const fields = useMemo(() => normalizedBusinessForm?.fields ?? [], [normalizedBusinessForm]);
  const dataSource = normalizedBusinessForm?.dataSource ?? 'manual';
  const productTemplate = normalizedBusinessForm?.productTemplate;
  const findComponent = useEmailStore((s) => s.findComponent);
  const updateComponentProps = useEmailStore((s) => s.updateComponentProps);
  const updateComponentWrapperStyle = useEmailStore((s) => s.updateComponentWrapperStyle);
  const currentShopId = useShopStore((s) => s.currentShopId);
  const [selectedProducts, setSelectedProducts] = useState<ShopProductSummary[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftSelectedProducts, setDraftSelectedProducts] = useState<ShopProductSummary[]>([]);

  /**
   * 根据 pathToIdMap 解析绑定路径对应的实际组件 ID
   */
  const resolveComponentId = useCallback(
    (componentPath: number[]): string | null => {
      const pathKey = componentPath.join('.');
      return meta.pathToIdMap[pathKey] ?? null;
    },
    [meta.pathToIdMap]
  );

  /**
   * 读取某个绑定目标的当前值
   */
  const readBindingValue = useCallback(
    (field: BusinessField): string => {
      if (field.bindings.length === 0) return '';
      // 取第一个绑定的值作为显示值
      const binding = field.bindings[0];
      const compId = resolveComponentId(binding.componentPath);
      if (!compId) return '';
      const comp = findComponent(compId);
      if (!comp) return '';

      const parts = binding.propPath.split('.');
      if (parts[0] === 'props') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let val: any = comp.props;
        for (let i = 1; i < parts.length; i++) {
          val = val?.[parts[i]];
        }
        return val != null ? String(val) : '';
      }
      if (parts[0] === 'wrapperStyle') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let val: any = comp.wrapperStyle;
        for (let i = 1; i < parts.length; i++) {
          val = val?.[parts[i]];
        }
        return val != null ? String(val) : '';
      }
      return '';
    },
    [resolveComponentId, findComponent]
  );

  /**
   * 写入绑定值：遍历所有 bindings，逐一更新
   */
  const writeBindingValue = useCallback(
    (field: BusinessField, newValue: string) => {
      for (const binding of field.bindings) {
        const compId = resolveComponentId(binding.componentPath);
        if (!compId) continue;

        const parts = binding.propPath.split('.');
        if (parts[0] === 'props' && parts.length === 2) {
          updateComponentProps(compId, { [parts[1]]: newValue });
        } else if (parts[0] === 'wrapperStyle' && parts.length === 2) {
          updateComponentWrapperStyle(compId, { [parts[1]]: newValue } as Record<string, unknown>);
        }
      }
    },
    [resolveComponentId, updateComponentProps, updateComponentWrapperStyle]
  );

  const getProductSlotValue = useCallback((product: ShopProductSummary, slotKey?: BusinessField['slotKey']): string => {
    if (!slotKey) return '';
    switch (slotKey) {
      case 'product.image':
        return product.imageUrl ?? '';
      case 'product.title':
        return product.title ?? '';
      case 'product.price':
        return product.price ? `¥${product.price}` : '';
      case 'product.compareAtPrice':
        return product.compareAtPrice ? `¥${product.compareAtPrice}` : '';
      case 'product.url':
        return product.url ?? '';
      default:
        return '';
    }
  }, []);

  const applySelectedProducts = useCallback(() => {
    if (selectedProducts.length === 0) {
      toast('请先选择商品', 'info');
      return;
    }

    if (!productTemplate) return;
    const fieldsBySlot = new Map<number, BusinessField[]>();
    for (const field of fields) {
      if (field.slotIndex == null) continue;
      const list = fieldsBySlot.get(field.slotIndex) ?? [];
      list.push(field);
      fieldsBySlot.set(field.slotIndex, list);
    }

    for (let slotIndex = 0; slotIndex < productTemplate.maxSelectable; slotIndex += 1) {
      const fieldList = fieldsBySlot.get(slotIndex) ?? [];
      const product = selectedProducts[slotIndex];
      if (product) {
        for (const field of fieldList) {
          if (!field.slotKey) continue;
          writeBindingValue(field, getProductSlotValue(product, field.slotKey));
        }
        continue;
      }
      if (productTemplate.emptySlotBehavior === 'clear') {
        for (const field of fieldList) {
          if (!field.slotKey) continue;
          writeBindingValue(field, '');
        }
      }
    }
    toast('商品数据已应用到业务组件', 'success');
  }, [selectedProducts, productTemplate, fields, writeBindingValue, getProductSlotValue]);

  const openPicker = () => {
    setDraftSelectedProducts(selectedProducts);
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
  };

  const confirmPicker = () => {
    setSelectedProducts(draftSelectedProducts);
    setPickerOpen(false);
  };

  if (fields.length === 0) {
    return (
      <ConfigSection title="业务配置">
        <div className={styles.fieldFullWidth}>
          <p className={styles.configSectionEmptyState}>此业务组件暂无可配置字段</p>
        </div>
      </ConfigSection>
    );
  }

  return (
    <ConfigSection
      title="业务配置"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      {dataSource === 'shop_product' && productTemplate && (
        <div className={`${styles.fieldFullWidth} ${styles.shopProductFeature}`}>
          <div className={styles.selectorSummary}>
            <div className={styles.selectorSummaryHeader}>
              <span className={styles.selectorSummaryTitle}>商品选择</span>
              <span className={styles.selectorSummaryCount}>
                已选 {selectedProducts.length} / {productTemplate.maxSelectable}
              </span>
            </div>
            <button
              type="button"
              className={`${styles.layoutModeToggle} ${styles.shopProductPrimaryBtn}`}
              onClick={openPicker}
            >
              打开商品选择器
            </button>
            <div className={styles.selectorSummaryList}>
              {selectedProducts.length === 0 ? (
                <span className={styles.selectorSummaryEmpty}>尚未选择商品</span>
              ) : (
                selectedProducts.map((item, index) => (
                  <span key={item.id} className={styles.selectorSummaryTag}>
                    {index + 1}. {item.title || item.handle || item.id}
                  </span>
                ))
              )}
            </div>
          </div>
          <div className={styles.shopProductActions}>
            <button
              type="button"
              className={`${styles.layoutModeToggle} ${styles.shopProductPrimaryBtn}`}
              onClick={applySelectedProducts}
            >
              应用商品数据
            </button>
            <button
              type="button"
              className={`${styles.layoutModeToggle} ${styles.shopProductSecondaryBtn}`}
              onClick={applySelectedProducts}
              disabled={selectedProducts.length === 0}
            >
              重新应用
            </button>
          </div>
          <Modal
            open={pickerOpen}
            title={`选择商品（最多 ${productTemplate.maxSelectable} 个）`}
            onClose={closePicker}
            size="large"
            footer={(
              <ModalFooter
                onCancel={closePicker}
                onConfirm={confirmPicker}
                cancelText="取消"
                confirmText="确认选择"
              />
            )}
          >
            <ProductSelector
              shopId={currentShopId}
              maxSelectable={productTemplate.maxSelectable}
              selectedProducts={draftSelectedProducts}
              onChange={setDraftSelectedProducts}
              variant="modal"
            />
          </Modal>
        </div>
      )}
      {fields.map((field) => (
        <BusinessFieldEditor
          key={field.id}
          field={field}
          value={readBindingValue(field)}
          onChange={(val) => writeBindingValue(field, val)}
        />
      ))}
    </ConfigSection>
  );
}

/** 根据字段类型渲染对应编辑控件 */
function BusinessFieldEditor({
  field,
  value,
  onChange,
}: {
  field: BusinessField;
  value: string;
  onChange: (val: string) => void;
}) {
  switch (field.type) {
    case 'text':
      return (
        <div className={styles.fieldFullWidth}>
          <BusinessAutoTextField
            label={field.label}
            value={value}
            onChange={onChange}
            placeholder={`请输入${field.label}`}
          />
        </div>
      );
    case 'image':
      return (
        <div className={styles.fieldFullWidth}>
          <BusinessImageField label={field.label} value={value} onChange={onChange} />
        </div>
      );
    case 'color':
      return (
        <FormField
          label={field.label}
          type="color"
          value={value}
          onChange={onChange}
        />
      );
    case 'number':
      return (
        <div className={styles.field}>
          <label className={styles.label}>{field.label}</label>
          <PxInput value={value} onChange={onChange} placeholder="0" />
        </div>
      );
    default:
      return null;
  }
}

function BusinessImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className={styles.fieldWithLabelRow}>
      <label className={styles.label}>{label}</label>
      <UploadOrUrlField
        value={value}
        onChange={onChange}
        uploadButtonLabel="上传本地图片"
        placeholder="或输入图片 URL"
        accept="image/*"
      />
    </div>
  );
}

function BusinessAutoTextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 34)}px`;
  }, [value]);

  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <textarea
        ref={textareaRef}
        className={styles.businessAutoTextarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={1}
      />
    </div>
  );
}
