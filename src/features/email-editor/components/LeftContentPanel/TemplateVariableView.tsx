import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useParams, Link } from 'react-router-dom';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { getAllVariables, CONTENT_TYPE_LABEL } from '@shared/constants/variableSchema';
import { TYPE_LABELS } from '@shared/constants/componentLibrary';
import type { ComponentRules, EmailComponent } from '@shared/types/email';
import type { CustomVariableDefinition, VariableContentType, ArrayItemFieldDef } from '@shared/types/emailTemplate';
import { mergeRulesIntoComponents } from '@shared/utils/mergeRulesIntoComponents';
import { PRODUCT_LIST_PRESET_SCHEMA } from '@shared/types/emailTemplate';
import Modal, { ModalFooter, ConfirmText, ConfirmHighlight } from '@shared/ui/Modal';
import ArrayPreviewDataModal from '@shared/ui/ArrayPreviewDataModal';
import { toast } from '@shared/store/useToastStore';
import Select from '@features/email-editor/components/RightPanel/editors/Select';
import styles from './TemplateVariableView.module.css';

// ─── types ───────────────────────────────────────────────────────────────────

interface CompRef {
  id: string;
  name: string;
  type: string;
  via: string[];
}

interface VarUsage {
  key: string;
  label: string;
  isCustom: boolean;
  contentType: VariableContentType | 'unknown';
  refs: CompRef[];
}

const CONTENT_TYPE_LABELS: Record<VariableContentType, string> = {
  text:  '文本',
  number: '数字',
  image: '图片',
  link:  '链接',
  array: '列表',
};

type RightPanelFocusSection = 'visibility' | 'branches' | 'binding' | 'loop';
type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

const FIELD_TYPE_LABELS: Record<'text' | 'image' | 'link', string> = {
  text:  '文本',
  image: '图片',
  link:  '链接',
};

const CONTENT_TYPE_OPTIONS = (Object.entries(CONTENT_TYPE_LABELS) as [VariableContentType, string][])
  .map(([value, label]) => ({ value, label }));

const FIELD_TYPE_OPTIONS = (Object.entries(FIELD_TYPE_LABELS) as ['text' | 'image' | 'link', string][])
  .map(([value, label]) => ({ value, label }));

// ─── utility ─────────────────────────────────────────────────────────────────

const RICH_TEXT_VAR_REGEX = /\{\{([\w.]+)\}\}/g;

function scanComponents(
  components: EmailComponentWithRules[],
  map: Map<string, CompRef[]>,
) {
  for (const comp of components) {
    const name = (comp.displayName?.trim()) || TYPE_LABELS[comp.type] || comp.type;

    const addVia = (key: string, via: string) => {
      // item.* 是循环区块内的字段占位符，不作为独立变量展示
      if (!key || key.startsWith('item.')) return;
      const refs = map.get(key) ?? [];
      const existing = refs.find((r) => r.id === comp.id);
      if (existing) {
        if (!existing.via.includes(via)) existing.via.push(via);
      } else {
        refs.push({ id: comp.id, name, type: comp.type, via: [via] });
      }
      map.set(key, refs);
    };

    // variableBindings: { propPath -> variableKey }
    for (const varKey of Object.values(comp.variableBindings ?? {})) {
      if (varKey) addVia(varKey as string, '绑定');
    }
    // visibilityCondition
    if (comp.visibilityCondition?.variableKey) {
      addVia(comp.visibilityCondition.variableKey, '可见条件');
    }
    // conditionalBranches
    for (const branch of comp.conditionalBranches ?? []) {
      if (branch.condition?.variableKey) {
        addVia(branch.condition.variableKey, '条件分支');
      }
    }
    // loopBinding
    if (comp.loopBinding?.variableKey) {
      addVia(comp.loopBinding.variableKey, '循环');
    }
    // 富文本内嵌变量（props.content 中的 {{key}}）
    const propsContent = (comp.props as unknown as Record<string, unknown> | undefined)?.content;
    if (typeof propsContent === 'string') {
      RICH_TEXT_VAR_REGEX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RICH_TEXT_VAR_REGEX.exec(propsContent)) !== null) {
        if (m[1]?.trim()) addVia(m[1].trim(), '富文本');
      }
    }

    if (comp.children?.length) scanComponents(comp.children as EmailComponentWithRules[], map);
  }
}

function buildUsages(components: EmailComponent[], customVariables: CustomVariableDefinition[]): VarUsage[] {
  const map = new Map<string, CompRef[]>();
  scanComponents(components as EmailComponentWithRules[], map);

  const allVars = getAllVariables(customVariables);
  const varMap = new Map(allVars.map((v) => [v.key, v]));
  const customVarMap = new Map(customVariables.map((v) => [v.key, v]));

  return Array.from(map.entries())
    .map(([key, refs]) => {
      const meta = varMap.get(key);
      const customMeta = customVarMap.get(key);
      const contentType: VariableContentType | 'unknown' =
        meta?.contentType ?? customMeta?.contentType ?? 'unknown';
      return {
        key,
        label: meta?.label ?? customMeta?.label ?? key,
        isCustom: !!meta?.isCustom || !!customMeta,
        contentType,
        refs,
      };
    })
    .sort((a, b) => {
      if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
      return a.key.localeCompare(b.key);
    });
}

// ─── var card menu position ──────────────────────────────────────────────────

const VAR_MENU_GAP = 4;
const VAR_MENU_VIEWPORT_PAD = 8;
const VAR_MENU_EST_WIDTH = 140;
const VAR_MENU_EST_HEIGHT = 120;

type MenuPlacement = 'bottom' | 'top' | 'left' | 'right';

function computeVarMenuPosition(
  triggerRect: DOMRect,
): { placement: MenuPlacement; top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = VAR_MENU_VIEWPORT_PAD;
  const w = VAR_MENU_EST_WIDTH;
  const h = VAR_MENU_EST_HEIGHT;

  const spaceBelow = vh - triggerRect.bottom - VAR_MENU_GAP;
  const spaceAbove = triggerRect.top - VAR_MENU_GAP;

  const clampH = (left: number) => Math.max(pad, Math.min(left, vw - w - pad));
  const clampV = (top: number) => Math.max(pad, Math.min(top, vh - h - pad));

  if (spaceBelow >= h + pad) {
    return { placement: 'bottom', top: triggerRect.bottom + VAR_MENU_GAP, left: clampH(triggerRect.right - w) };
  }
  if (spaceAbove >= h + pad) {
    return { placement: 'top', top: clampV(triggerRect.top - VAR_MENU_GAP - h), left: clampH(triggerRect.right - w) };
  }
  return { placement: 'bottom', top: clampV(triggerRect.bottom + VAR_MENU_GAP), left: clampH(triggerRect.right - w) };
}

// ─── create / edit form ──────────────────────────────────────────────────────

interface VarFormState {
  label: string;
  keySuffix: string;
  contentType: VariableContentType;
  itemSchema: ArrayItemFieldDef[];
  previewValue: string;
  error: string;
}
const EMPTY_FORM: VarFormState = { label: '', keySuffix: '', contentType: 'text', itemSchema: [], previewValue: '', error: '' };

function VarForm({
  initial,
  isEdit,
  existingKeys,
  onSave,
  onCancel,
}: {
  initial?: CustomVariableDefinition;
  isEdit: boolean;
  existingKeys: string[];
  onSave: (v: CustomVariableDefinition, previewValue?: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<VarFormState>(() =>
    initial
      ? {
          label: initial.label,
          keySuffix: initial.key.replace(/^custom\./, ''),
          contentType: initial.contentType,
          itemSchema: initial.itemSchema ?? [],
          previewValue: '',
          error: '',
        }
      : EMPTY_FORM
  );

  const normalizeKeySuffix = (s: string) =>
    s.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

  const handleSave = () => {
    const trimLabel     = form.label.trim();
    const rawKeySuffix  = form.keySuffix.trim();
    if (!trimLabel)     return setForm((f) => ({ ...f, error: '请输入变量名称' }));
    if (!rawKeySuffix)  return setForm((f) => ({ ...f, error: '请输入变量键后缀' }));
    const trimKeySuffix = /^[a-zA-Z0-9_]+$/.test(rawKeySuffix)
      ? rawKeySuffix
      : normalizeKeySuffix(rawKeySuffix);
    if (!trimKeySuffix)
      return setForm((f) => ({ ...f, error: '变量键只能包含字母、数字和下划线' }));
    if (trimKeySuffix !== rawKeySuffix)
      toast(`变量键已规范为「${trimKeySuffix}」`, 'info');
    const fullKey = `custom.${trimKeySuffix}`;
    if (!isEdit && existingKeys.includes(fullKey))
      return setForm((f) => ({ ...f, error: `"${fullKey}" 已存在` }));
    if (form.contentType === 'array' && form.itemSchema.length === 0)
      return setForm((f) => ({ ...f, error: '列表变量至少需要一个字段' }));

    const def: CustomVariableDefinition = {
      key: fullKey,
      label: trimLabel,
      contentType: form.contentType,
    };
    if (form.contentType === 'array') def.itemSchema = form.itemSchema;
    onSave(def, form.contentType !== 'array' ? form.previewValue : undefined);
  };

  const addSchemaField = () => {
    setForm((f) => ({
      ...f,
      itemSchema: [...f.itemSchema, { key: '', label: '', contentType: 'text' }],
      error: '',
    }));
  };

  const updateSchemaField = (index: number, updates: Partial<ArrayItemFieldDef>) => {
    setForm((f) => ({
      ...f,
      itemSchema: f.itemSchema.map((field, i) => i === index ? { ...field, ...updates } : field),
      error: '',
    }));
  };

  const removeSchemaField = (index: number) => {
    setForm((f) => ({
      ...f,
      itemSchema: f.itemSchema.filter((_, i) => i !== index),
      error: '',
    }));
  };

  const applyPreset = () => {
    setForm((f) => ({
      ...f,
      itemSchema: [...PRODUCT_LIST_PRESET_SCHEMA],
      // 快速填入时若未填写变量名/变量键，一并填入默认值，便于直接保存
      label: f.label.trim() ? f.label : '商品列表',
      keySuffix: f.keySuffix.trim() ? f.keySuffix : 'productList',
      error: '',
    }));
  };

  const previewPlaceholder =
    form.contentType === 'image' ? '粘贴图片 URL 用于预览' :
    form.contentType === 'link'  ? '粘贴链接 URL 用于预览' :
    '输入预览文本（可选）';

  return (
    <div className={styles.form}>
      <div className={styles.formField}>
        <label className={styles.formLabel}>变量名称</label>
        <input
          type="text"
          className={styles.formInput}
          placeholder="例：商品列表"
          autoFocus
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value, error: '' }))}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel}>变量键</label>
        <div className={`${styles.formKeyRow} ${isEdit ? styles.formKeyRowDisabled : ''}`}>
          <span className={styles.formKeyPrefix}>custom.</span>
          <input
            type="text"
            className={styles.formKeyInput}
            placeholder="products"
            value={form.keySuffix}
            disabled={isEdit}
            onChange={(e) => {
              if (isEdit) return;
              const val = e.target.value;
              const trimmed = val.trim().replace(/^custom\./, '');
              const fullKey = trimmed ? `custom.${trimmed}` : '';
              const keyExists = fullKey && existingKeys.includes(fullKey);
              setForm((f) => ({
                ...f,
                keySuffix: val,
                error: keyExists ? `"${fullKey}" 已存在` : (f.error && f.error.includes('已存在') ? '' : f.error),
              }));
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>
        {!isEdit && form.error && form.error.includes('已存在') && (
          <span className={styles.formKeyHint} style={{ color: 'var(--danger, #DC3545)' }}>{form.error}</span>
        )}
        {isEdit && (
          <span className={styles.formKeyHint}>键创建后不可修改</span>
        )}
      </div>
      <div className={styles.formField}>
        <label className={styles.formLabel}>内容类型</label>
        <Select
          value={form.contentType}
          onChange={(value) =>
            setForm((f) => ({ ...f, contentType: value as VariableContentType, error: '' }))
          }
          options={CONTENT_TYPE_OPTIONS}
          disabled={isEdit}
          aria-label="内容类型"
          className={styles.formSelectTrigger}
        />
        {isEdit && form.contentType === 'array' && (
          <span className={styles.formKeyHint}>类型创建后不可修改</span>
        )}
      </div>

      {/* 列表字段编辑器（仅 array 类型） */}
      {form.contentType === 'array' && (
        <div className={styles.schemaEditor}>
          <div className={styles.schemaHeader}>
            <span className={styles.schemaTitle}>列表项字段</span>
            <button type="button" className={styles.schemaPresetBtn} onClick={applyPreset}>
              快速填入：商品列表
            </button>
          </div>
          {form.itemSchema.length === 0 ? (
            <p className={styles.schemaEmpty}>尚无字段，点击「添加字段」或使用预设</p>
          ) : (
            <div className={styles.schemaFieldList}>
              {form.itemSchema.map((field, i) => (
                <div key={i} className={styles.schemaFieldRow}>
                  <input
                    type="text"
                    className={styles.schemaFieldKey}
                    placeholder="字段键（如 title）"
                    value={field.key}
                    onChange={(e) => updateSchemaField(i, { key: e.target.value })}
                  />
                  <input
                    type="text"
                    className={styles.schemaFieldLabel}
                    placeholder="展示名"
                    value={field.label}
                    onChange={(e) => updateSchemaField(i, { label: e.target.value })}
                  />
                  <Select
                    value={field.contentType}
                    onChange={(value) =>
                      updateSchemaField(i, { contentType: value as 'text' | 'image' | 'link' })
                    }
                    options={FIELD_TYPE_OPTIONS}
                    aria-label={`字段 ${i + 1} 的内容类型`}
                    className={styles.schemaFieldTypeTrigger}
                  />
                  <button
                    type="button"
                    className={styles.schemaFieldRemove}
                    onClick={() => removeSchemaField(i)}
                    title="删除此字段"
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className={styles.schemaAddBtn} onClick={addSchemaField}>
            + 添加字段
          </button>
        </div>
      )}

      {/* 非列表变量可同步填写预览值 */}
      {form.contentType !== 'array' && (
        <div className={styles.formField}>
          <label className={styles.formLabel}>预览值 <span className={styles.formKeyHint}>（可选，创建后可在变量面板中修改）</span></label>
          <input
            type={form.contentType === 'image' || form.contentType === 'link' ? 'url' : 'text'}
            className={styles.formInput}
            placeholder={previewPlaceholder}
            value={form.previewValue}
            onChange={(e) => setForm((f) => ({ ...f, previewValue: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>
      )}

      {form.error && !form.error.includes('已存在') && <p className={styles.formError}>{form.error}</p>}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>取消</button>
        <button type="button" className={styles.saveBtn} onClick={handleSave}>
          {isEdit ? '保存' : '创建'}
        </button>
      </div>
    </div>
  );
}

// ─── custom var row ───────────────────────────────────────────────────────────

function CustomVarRow({
  variable,
  existingKeys,
  onUpdate,
  onDelete,
  arrayItems,
  onSetArrayItems,
  inModal = false,
}: {
  variable: CustomVariableDefinition;
  existingKeys: string[];
  onUpdate: (key: string, updates: Partial<Omit<CustomVariableDefinition, 'key'>>) => void;
  onDelete: (key: string) => void;
  arrayItems?: Record<string, string>[];
  onSetArrayItems?: (items: Record<string, string>[]) => void;
  inModal?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [arrayModalOpen, setArrayModalOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ placement: MenuPlacement; top: number; left: number } | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const computePos = useCallback(() => {
    if (!moreBtnRef.current) return null;
    return computeVarMenuPosition(moreBtnRef.current.getBoundingClientRect());
  }, []);

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const update = () => setMenuPosition(computePos());
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [showMenu, computePos]);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = e.target as Node;
      if (menuRef.current?.contains(el) || moreBtnRef.current?.contains(el)) return;
      closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, closeMenu]);

  const handleSave = (v: CustomVariableDefinition) => {
    onUpdate(variable.key, { label: v.label, contentType: v.contentType, itemSchema: v.itemSchema });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={styles.varRowEditing}>
        <VarForm
          initial={variable}
          isEdit
          existingKeys={existingKeys}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  if (pendingDelete) {
    return (
      <div className={styles.varCardConfirmDelete}>
        <span className={styles.varCardConfirmDeleteMsg}>
          确认删除 <strong>{variable.label}</strong>？
        </span>
        <div className={styles.varCardConfirmDeleteActions}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => setPendingDelete(false)}
          >
            取消
          </button>
          <button
            type="button"
            className={styles.deleteBtnInline}
            onClick={() => { onDelete(variable.key); setPendingDelete(false); }}
          >
            确认删除
          </button>
        </div>
      </div>
    );
  }

  const placementClass = menuPosition
    ? styles[`varMenuDropdown${menuPosition.placement.charAt(0).toUpperCase() + menuPosition.placement.slice(1)}`]
    : '';

  return (
    <>
      <div className={styles.varCard}>
        <div className={styles.varCardInfo}>
          <span className={styles.varCardLabel}>{variable.label}</span>
          <span className={styles.varCardKey} title={variable.key}>{variable.key}</span>
        </div>
        <div className={styles.varCardRight}>
          <span className={styles.varTypeBadge} data-ct={variable.contentType}>
            {CONTENT_TYPE_LABELS[variable.contentType]}
          </span>
          <button
            ref={moreBtnRef}
            type="button"
            className={`${styles.varMoreBtn} ${showMenu ? styles.varMoreBtnActive : ''}`}
            title="更多操作"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((v) => {
                const next = !v;
                setMenuPosition(next ? computePos() : null);
                return next;
              });
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
            </svg>
          </button>
        </div>
      </div>

      {showMenu && menuPosition && createPortal(
        <div
          ref={menuRef}
          className={`${styles.varMenuDropdown} ${placementClass}`}
          style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, zIndex: 9999 }}
        >
          {variable.contentType === 'array' && onSetArrayItems && (
            <button
              type="button"
              className={styles.varMenuItem}
              onClick={() => { setArrayModalOpen(true); closeMenu(); }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="3" width="11" height="8" rx="1" />
                <path d="M4 6.5h6M4 9h4" />
              </svg>
              编辑预览数据
            </button>
          )}
          <button
            type="button"
            className={styles.varMenuItem}
            onClick={() => { setEditing(true); closeMenu(); }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 1.5l2.5 2.5L4.5 12H2v-2.5z" />
              <path d="M8.5 3l2.5 2.5" />
            </svg>
            编辑变量
          </button>
          <div className={styles.varMenuDivider} />
          <button
            type="button"
            className={`${styles.varMenuItem} ${styles.varMenuItemDanger}`}
            onClick={() => {
              if (inModal) {
                setPendingDelete(true);
              } else {
                setShowDelete(true);
              }
              closeMenu();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3.5h10M4.5 3.5V2.5a.8.8 0 01.8-.8h3.4a.8.8 0 01.8.8v1M11.5 3.5v7.2a.8.8 0 01-.8.8H3.3a.8.8 0 01-.8-.8V3.5" />
            </svg>
            删除变量
          </button>
        </div>,
        document.body
      )}

      {!inModal && (
        <Modal
          open={showDelete}
          title="删除自定义变量"
          onClose={() => setShowDelete(false)}
          footer={
            <ModalFooter
              onCancel={() => setShowDelete(false)}
              onConfirm={() => { onDelete(variable.key); setShowDelete(false); }}
              confirmText="确认删除"
              danger
            />
          }
        >
          <ConfirmText>
            确定要删除自定义变量 <ConfirmHighlight>{variable.label}（{variable.key}）</ConfirmHighlight> 吗？
            模板中引用该变量的配置将失效。
          </ConfirmText>
        </Modal>
      )}

      {variable.contentType === 'array' && onSetArrayItems && (
        <ArrayPreviewDataModal
          open={arrayModalOpen}
          onClose={() => setArrayModalOpen(false)}
          variable={variable}
          items={arrayItems ?? []}
          onSetItems={onSetArrayItems}
        />
      )}
    </>
  );
}

// ─── custom var manager modal ─────────────────────────────────────────────────

function CustomVarManagerModal({
  open,
  onClose,
  customVariables,
  existingKeys,
  onAdd,
  onUpdate,
  onDelete,
  arrayPreviewData,
  onSetArrayItems,
  onSetPreviewValue,
}: {
  open: boolean;
  onClose: () => void;
  customVariables: CustomVariableDefinition[];
  existingKeys: string[];
  onAdd: (v: CustomVariableDefinition) => void;
  onUpdate: (key: string, updates: Partial<Omit<CustomVariableDefinition, 'key'>>) => void;
  onDelete: (key: string) => void;
  arrayPreviewData: Record<string, Record<string, string>[]>;
  onSetArrayItems: (key: string, items: Record<string, string>[]) => void;
  onSetPreviewValue: (key: string, value: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <Modal open={open} title="自定义变量管理" onClose={onClose} size="large">
      <div className={styles.managerBody}>
        {creating ? (
          <VarForm
            isEdit={false}
            existingKeys={existingKeys}
            onSave={(v, previewValue) => {
              onAdd(v);
              if (previewValue?.trim()) onSetPreviewValue(v.key, previewValue.trim());
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button
            type="button"
            className={styles.addBtn}
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setCreating(true)}
          >
            + 新增变量
          </button>
        )}

        {customVariables.length === 0 && !creating ? (
          <div className={styles.emptyCustom}>
            <p className={styles.emptyText}>暂无自定义变量</p>
            <p className={styles.emptyHint}>点击「新增变量」为此模板添加专属变量</p>
          </div>
        ) : (
          <div className={styles.varList}>
            {customVariables.map((v) => (
              <CustomVarRow
                key={v.key}
                variable={v}
                existingKeys={existingKeys}
                onUpdate={onUpdate}
                onDelete={onDelete}
                arrayItems={v.contentType === 'array' ? (arrayPreviewData[v.key] ?? []) : undefined}
                onSetArrayItems={v.contentType === 'array' ? (items) => onSetArrayItems(v.key, items) : undefined}
                inModal
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── via badge ────────────────────────────────────────────────────────────────

const VIA_BADGE_STYLES: Record<string, string> = {
  '绑定':    'binding',
  '可见条件': 'visibility',
  '条件分支': 'branch',
  '循环':    'loop',
};

function ViaBadge({ via }: { via: string }) {
  return (
    <span className={styles.viaBadge} data-via={VIA_BADGE_STYLES[via] ?? 'binding'}>
      {via}
    </span>
  );
}

// ─── ref popover（多处引用时展示的组件选择浮层）────────────────────────────────

function RefPopover({
  refs,
  position,
  onSelect,
  onClose,
}: {
  refs: CompRef[];
  position: { top: number; left: number };
  onSelect: (ref: CompRef) => void;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [onClose]);

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.refPopover}
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9999 }}
    >
      <span className={styles.refPopoverTitle}>定位到组件</span>
      {refs.map((ref) => (
        <button
          key={ref.id}
          type="button"
          className={styles.refPopoverItem}
          onClick={() => onSelect(ref)}
        >
          <span className={styles.refPopoverName}>{ref.name}</span>
          <span className={styles.refPopoverVias}>
            {ref.via.map((v) => <ViaBadge key={v} via={v} />)}
          </span>
        </button>
      ))}
    </div>,
    document.body
  );
}

// ─── usage card（单个变量引用卡片）──────────────────────────────────────────────

function UsageCard({
  usage: u,
  previewData,
  setPreviewVariable,
  selectComponent,
  setRightPanelFocusHint,
  customVarDef,
  arrayItems,
  onSetArrayItems,
}: {
  usage: VarUsage;
  previewData: Record<string, string>;
  setPreviewVariable: (key: string, value: string) => void;
  selectComponent: (id: string) => void;
  setRightPanelFocusHint: (hint: RightPanelFocusSection) => void;
  customVarDef?: CustomVariableDefinition;
  arrayItems?: Record<string, string>[];
  onSetArrayItems?: (items: Record<string, string>[]) => void;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [arrayModalOpen, setArrayModalOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const navigateTo = useCallback((ref: CompRef) => {
    selectComponent(ref.id);
    const section =
      ref.via.includes('可见条件') ? 'visibility'
      : ref.via.includes('条件分支') ? 'branches'
      : 'binding';
    setRightPanelFocusHint(section);
  }, [selectComponent, setRightPanelFocusHint]);

  const handleCardClick = useCallback(() => {
    if (u.refs.length === 0) return;
    if (u.refs.length === 1) {
      navigateTo(u.refs[0]);
      return;
    }
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const popoverW = 230;
    const estimatedH = 44 + u.refs.length * 38;
    const left = Math.min(rect.left, window.innerWidth - popoverW - 8);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow >= estimatedH ? rect.bottom + 4 : rect.top - estimatedH - 4;
    setPopoverPos({ top, left });
    setShowPopover(true);
  }, [u.refs, navigateTo]);

  const isScalar = u.contentType !== 'array';
  const currentVal = previewData[u.key] ?? '';
  const isFilled = currentVal.trim() !== '';
  const placeholder =
    u.contentType === 'image' ? '输入图片 URL 预览效果' :
    u.contentType === 'link'  ? '输入链接 URL 预览效果' :
    '输入预览文本…';
  const contentTypeLabel =
    u.contentType === 'unknown' ? '' : CONTENT_TYPE_LABEL[u.contentType as VariableContentType];

  return (
    <>
      <div
        ref={cardRef}
        className={`${styles.usageItem} ${u.refs.length > 0 ? styles.usageItemClickable : ''}`}
        onClick={handleCardClick}
      >
        <div className={styles.usageItemHeader}>
          <div className={styles.usageItemTopRow}>
            <div className={styles.usageItemBadges}>
              {contentTypeLabel && (
                <span className={styles.usageTypeBadge} data-ct={u.contentType}>
                  {contentTypeLabel}
                </span>
              )}
              {u.isCustom && <span className={styles.customTag}>自定义</span>}
            </div>
            {u.refs.length > 0 ? (
              <span className={styles.usageRefCount}>
                {u.refs.length > 1 ? `${u.refs.length} 处引用` : '1 处引用'}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 2l4 3-4 3" />
                </svg>
              </span>
            ) : (
              <span className={styles.usageRefCountNone}>未引用</span>
            )}
          </div>
          <div className={styles.usageTitleBlock}>
            <span className={styles.usageLabel}>{u.label}</span>
            <span className={styles.usageKey} title={u.key}>{u.key}</span>
          </div>
        </div>

        {isScalar && (
          <div
            className={styles.usagePreviewArea}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="text"
              className={`${styles.usagePreviewInput} ${isFilled ? styles.usagePreviewInputFilled : ''}`}
              placeholder={placeholder}
              value={currentVal}
              onChange={(e) => setPreviewVariable(u.key, e.target.value)}
            />
            {isFilled && (
              <button
                type="button"
                className={styles.usagePreviewClear}
                title="清除预览值"
                onClick={() => setPreviewVariable(u.key, '')}
              >×</button>
            )}
          </div>
        )}

        {/* 数组变量：点击按钮打开弹窗配置多组预览数据 */}
        {!isScalar && customVarDef && onSetArrayItems && (
          <div
            className={styles.usageArrayToggle}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.usageArrayToggleBtn}
              onClick={() => setArrayModalOpen(true)}
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1.5" y="3" width="11" height="8" rx="1" />
                <path d="M4 6.5h6M4 9h4" />
              </svg>
              <span>
                {arrayItems && arrayItems.length > 0
                  ? `${arrayItems.length} 组预览数据`
                  : '配置预览数据'}
              </span>
            </button>
          </div>
        )}
      </div>

      {customVarDef && onSetArrayItems && (
        <ArrayPreviewDataModal
          open={arrayModalOpen}
          onClose={() => setArrayModalOpen(false)}
          variable={customVarDef}
          items={arrayItems ?? []}
          onSetItems={onSetArrayItems}
        />
      )}

      {showPopover && popoverPos && (
        <RefPopover
          refs={u.refs}
          position={popoverPos}
          onSelect={(ref) => { navigateTo(ref); setShowPopover(false); }}
          onClose={() => setShowPopover(false)}
        />
      )}
    </>
  );
}

// ─── API 对接说明（简要 + 跳转） ─────────────────────────────────────────────────

function ApiIntroSection({ templateId }: { templateId: string | undefined }) {
  return (
    <div className={styles.apiSection}>
      <div className={styles.apiIntroHeader}>
        <span className={styles.sectionTitle}>API 对接说明</span>
      </div>
      <div className={styles.apiSectionBody}>
        <p className={styles.apiIntroText}>
          调用自动化或群发时需传入本模板的变量数据。完整的对接说明、调用示例与接入点配置请前往模板的「接入配置」页面。
        </p>
        {templateId && templateId !== 'new' ? (
          <Link to={`/templates/detail/${templateId}?tab=endpoints`} className={styles.apiIntroLink}>
            查看接入配置 →
          </Link>
        ) : (
          <p className={styles.apiIntroHint}>保存模板后，在模板详情页的「接入配置」中可查看完整说明。</p>
        )}
      </div>
    </div>
  );
}

// ─── main view ────────────────────────────────────────────────────────────────

export default function TemplateVariableView() {
  const { id: templateId } = useParams<{ id: string }>();
  const {
    customVariables,
    components,
    renderingRules,
    previewData,
    arrayPreviewData,
    addCustomVariable,
    updateCustomVariable,
    deleteCustomVariable,
    setPreviewVariable,
    setArrayPreviewItems,
    selectComponent,
    setRightPanelFocusHint,
  } = useEmailStore(
    useShallow((s) => ({
      customVariables:         s.customVariables,
      components:              s.components,
      renderingRules:          s.renderingRules,
      previewData:             s.previewData,
      arrayPreviewData:        s.arrayPreviewData,
      addCustomVariable:       s.addCustomVariable,
      updateCustomVariable:    s.updateCustomVariable,
      deleteCustomVariable:    s.deleteCustomVariable,
      setPreviewVariable:      s.setPreviewVariable,
      setArrayPreviewItems:    s.setArrayPreviewItems,
      selectComponent:         s.selectComponent,
      setRightPanelFocusHint:  s.setRightPanelFocusHint,
    }))
  );

  const [showVarManager, setShowVarManager] = useState(false);
  const existingKeys = useMemo(() => customVariables.map((v) => v.key), [customVariables]);

  // 合併 Layer 4 規則後再掃描，否則靜態組件樹上讀不到任何動態字段
  const mergedComponents = useMemo(
    () => mergeRulesIntoComponents(components, renderingRules),
    [components, renderingRules]
  );

  const usages = useMemo(() => buildUsages(mergedComponents, customVariables), [mergedComponents, customVariables]);
  const customVarMap = useMemo(
    () => new Map(customVariables.map((v) => [v.key, v])),
    [customVariables],
  );

  return (
    <div className={styles.root}>

      {/* ── 变量引用 ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionTitle}>变量引用</span>
            {usages.length > 0 && (
              <span className={styles.usageCount}>{usages.length}</span>
            )}
          </div>
          <div className={styles.sectionHeaderRight}>
            <button
              type="button"
              className={styles.syncBtnIcon}
              title="变量管理"
              onClick={() => setShowVarManager(true)}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3l2 2" />
              </svg>
            </button>
          </div>
        </div>

        {usages.length === 0 ? (
          <div className={styles.emptyUsage}>
            <p className={styles.emptyText}>此模板暂未使用任何变量</p>
            <p className={styles.emptyHint}>为组件绑定变量后，变量将显示在这里</p>
          </div>
        ) : (
          <div className={styles.usageList}>
            {usages.map((u) => (
              <UsageCard
                key={u.key}
                usage={u}
                previewData={previewData}
                setPreviewVariable={setPreviewVariable}
                selectComponent={selectComponent}
                setRightPanelFocusHint={setRightPanelFocusHint}
                customVarDef={u.contentType === 'array' ? customVarMap.get(u.key) : undefined}
                arrayItems={u.contentType === 'array' ? (arrayPreviewData[u.key] ?? []) : undefined}
                onSetArrayItems={u.contentType === 'array'
                  ? (items) => setArrayPreviewItems(u.key, items)
                  : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <CustomVarManagerModal
        open={showVarManager}
        onClose={() => setShowVarManager(false)}
        customVariables={customVariables}
        existingKeys={existingKeys}
        onAdd={addCustomVariable}
        onUpdate={updateCustomVariable}
        onDelete={deleteCustomVariable}
        arrayPreviewData={arrayPreviewData}
        onSetArrayItems={setArrayPreviewItems}
        onSetPreviewValue={setPreviewVariable}
      />

      {/* ── API 对接说明（简要 + 跳转至接入配置） ── */}
      <ApiIntroSection templateId={templateId} />
    </div>
  );
}
