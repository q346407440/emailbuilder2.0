import { useState, useRef, useEffect, useMemo } from 'react';
import Modal from '@shared/ui/Modal';
import {
  getAllVariables,
  VARIABLE_SCHEMA_MAP,
  getArrayVariables,
  type VariableSchemaItem,
  type VariableContentType,
} from '@shared/constants/variableSchema';
import type { CustomVariableDefinition, ArrayItemFieldDef } from '@shared/types/emailTemplate';
import { PRODUCT_LIST_PRESET_SCHEMA } from '@shared/types/emailTemplate';
import Select from './Select';
import styles from './VariablePickerModal.module.css';

const FIELD_TYPE_LABELS: Record<'text' | 'image' | 'link', string> = {
  text:  '文本',
  image: '图片',
  link:  '链接',
};

const FIELD_TYPE_OPTIONS = (Object.entries(FIELD_TYPE_LABELS) as ['text' | 'image' | 'link', string][]).map(([value, label]) => ({ value, label }));

const RECENT_STORAGE_KEY = 'email-editor-variable-picker-recent';
const RECENT_MAX = 20;

function getRecentVariableKeys(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function addRecentVariableKey(key: string): void {
  const prev = getRecentVariableKeys();
  const next = [key, ...prev.filter((k) => k !== key)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

const NAMESPACE_LABELS: Record<string, string> = {
  shop:        '店铺',
  user:        '用户',
  product:     '商品',
  order:       '订单',
  shipping:    '收货',
  promo:       '促销',
  campaign:    '活动',
  collection:  '专辑',
  cart:        '购物车',
  footer:      '页脚',
  unsubscribe: '退订',
};

const CONTENT_TYPE_OPTIONS: { value: VariableContentType; label: string }[] = [
  { value: 'text',   label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'image',  label: '图片 URL' },
  { value: 'link',   label: '链接 URL' },
  { value: 'array',  label: '列表' },
];

export interface VariablePickerModalProps {
  open: boolean;
  onClose: () => void;
  /** 当前已选中的 key，用于列表高亮 */
  selectedKey?: string;
  onSelect: (key: string) => void;
  customVariables: CustomVariableDefinition[];
  /** 若指定，仅展示该内容类型的常规变量；自定义分组始终全量展示 */
  contentType?: VariableContentType;
  onAddCustomVariable: (v: CustomVariableDefinition) => void;
  /**
   * 循环区块上下文：当前组件在一个 loop block 内部时传入，
   * 自动增加「循环项字段（item.*）」分组，让用户直接选 item.fieldKey。
   */
  loopContext?: {
    /** 循环区块绑定的数组变量 key（用于展示说明） */
    variableKey: string;
    /** 数组变量的 itemSchema（用于展示可选字段） */
    itemSchema: ArrayItemFieldDef[];
  };
  /**
   * 当用户点击「去查看」时调用，传入当前表单状态；父组件应关闭本弹窗、打开查看弹窗，
   * 查看弹窗关闭后再打开本弹窗并传入 restoreState / onRestoreConsumed 以恢复内容。
   */
  onRequestViewExisting?: (payload: { existingKey: string; restoreState: VariablePickerRestoreState }) => void;
  /** 从「去查看」返回时传入，用于恢复表单与 tab，恢复后请调用 onRestoreConsumed 清除 */
  restoreState?: VariablePickerRestoreState | null;
  onRestoreConsumed?: () => void;
}

export type VariablePickerRestoreState = {
  form: CreateForm;
  creating: boolean;
  activeTab: 'standard' | 'custom' | 'recent' | 'array' | 'loop';
};

interface CreateForm {
  label: string;
  keySuffix: string;
  contentType: VariableContentType;
  itemSchema: ArrayItemFieldDef[];
  error: string;
}

const EMPTY_FORM: CreateForm = { label: '', keySuffix: '', contentType: 'text', itemSchema: [], error: '' };

export default function VariablePickerModal({
  open,
  onClose,
  selectedKey,
  onSelect,
  customVariables,
  contentType,
  onAddCustomVariable,
  loopContext,
  restoreState,
  onRestoreConsumed,
}: VariablePickerModalProps) {
  const [query,    setQuery]    = useState('');
  const [creating, setCreating] = useState(false);
  const [form,     setForm]     = useState<CreateForm>(EMPTY_FORM);

  const preserveKeyExistsError = (f: CreateForm, next: Partial<CreateForm>) => {
    const trimmed = (f.keySuffix ?? '').trim().replace(/^custom\./, '');
    const fullKey = trimmed ? `custom.${trimmed}` : '';
    const keyExists = fullKey && customVariables.some((v) => v.key === fullKey);
    return { ...f, ...next, error: keyExists ? `"${fullKey}" 已存在` : (f.error && f.error.includes('已存在') ? '' : (next.error ?? f.error)) };
  };
  const addSchemaField = () =>
    setForm((f) => preserveKeyExistsError(f, { itemSchema: [...(f.itemSchema ?? []), { key: '', label: '', contentType: 'text' }] }));
  const updateSchemaField = (index: number, updates: Partial<ArrayItemFieldDef>) =>
    setForm((f) => preserveKeyExistsError(f, {
      itemSchema: (f.itemSchema ?? []).map((field, i) => (i === index ? { ...field, ...updates } : field)),
    }));
  const removeSchemaField = (index: number) =>
    setForm((f) => preserveKeyExistsError(f, { itemSchema: (f.itemSchema ?? []).filter((_, i) => i !== index) }));
  const applySchemaPreset = () =>
    setForm((f) => preserveKeyExistsError(f, {
      itemSchema: [...PRODUCT_LIST_PRESET_SCHEMA],
      label: f.label.trim() ? f.label : '商品列表',
      keySuffix: f.keySuffix.trim() ? f.keySuffix : 'productList',
    }));
  type TabId = 'standard' | 'custom' | 'recent' | 'array' | 'loop';
  const [activeTab, setActiveTab] = useState<TabId>(() => loopContext ? 'loop' : 'standard');
  /** 常规变量类别筛选：'' 为全部，否则为 sourceNamespace */
  const [standardCategory, setStandardCategory] = useState('');
  /** 最近使用的 variable key 列表（从 localStorage 读取，打开弹窗时刷新） */
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  /** 数组变量：展开的 varKey → 选中的 index */
  const [arrayExpandedKey, setArrayExpandedKey] = useState<string | null>(null);
  const [arraySelectedIndex, setArraySelectedIndex] = useState<number>(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const labelRef  = useRef<HTMLInputElement>(null);
  const didRestoreThisOpenRef = useRef(false);

  // 获取 array 类型自定义变量
  const arrayVars = useMemo(() => getArrayVariables(customVariables), [customVariables]);

  /* 打开时：若有 restoreState 则恢复表单/tab，否则重置状态；关闭时清除“已恢复”标记 */
  useEffect(() => {
    if (!open) {
      didRestoreThisOpenRef.current = false;
      return;
    }
    if (restoreState) {
      setForm(restoreState.form);
      setCreating(restoreState.creating);
      setActiveTab(restoreState.activeTab);
      onRestoreConsumed?.();
      didRestoreThisOpenRef.current = true;
    } else if (!didRestoreThisOpenRef.current) {
      setQuery('');
      setCreating(false);
      setForm(EMPTY_FORM);
      setActiveTab(
        loopContext ? 'loop'
          : contentType === 'array' ? 'array'
          : 'standard',
      );
      const t = setTimeout(() => searchRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
    setStandardCategory('');
    setRecentKeys(getRecentVariableKeys());
    setArrayExpandedKey(null);
    setArraySelectedIndex(0);
  }, [open, loopContext, contentType, restoreState, onRestoreConsumed]);

  /* 展开新建表单时聚焦 label 输入框 */
  useEffect(() => {
    if (creating) {
      const t = setTimeout(() => labelRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [creating]);

  /* ---- 数据过滤 ---- */
  const allStandardVars = useMemo(
    () => getAllVariables([]).filter((v) => !v.isCustom && (!contentType || v.contentType === contentType)),
    [contentType],
  );

  /** 常规变量：先按类别筛选，再按搜索关键词筛选 */
  const filteredStandard = useMemo((): VariableSchemaItem[] => {
    let list = allStandardVars;
    if (standardCategory) {
      list = list.filter((v) => v.sourceNamespace === standardCategory);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (v) => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allStandardVars, standardCategory, query]);

  /** 当前 contentType 下常规变量出现的类别列表（用于类别筛选） */
  const standardCategories = useMemo(() => {
    const set = new Set<string>();
    allStandardVars.forEach((v) => {
      if (v.sourceNamespace && NAMESPACE_LABELS[v.sourceNamespace]) set.add(v.sourceNamespace);
    });
    const order = Object.keys(NAMESPACE_LABELS);
    return [
      { value: '', label: '全部' },
      ...Array.from(set)
        .sort((a, b) => order.indexOf(a) - order.indexOf(b))
        .map((ns) => ({ value: ns, label: NAMESPACE_LABELS[ns] })),
    ];
  }, [allStandardVars]);

  const filteredCustom = useMemo((): CustomVariableDefinition[] => {
    const base = contentType ? customVariables.filter((v) => v.contentType === contentType) : customVariables;
    if (!query.trim()) return base;
    const q = query.trim().toLowerCase();
    return base.filter((v) => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q));
  }, [customVariables, contentType, query]);

  /** 最近使用：按 key 顺序解析为项，再按 contentType、搜索过滤 */
  const filteredRecent = useMemo((): (VariableSchemaItem | CustomVariableDefinition)[] => {
    const items: (VariableSchemaItem | CustomVariableDefinition)[] = [];
    for (const key of recentKeys) {
      const custom = customVariables.find((c) => c.key === key);
      if (custom) {
        if (contentType && custom.contentType !== contentType) continue;
        items.push(custom);
        continue;
      }
      const std = VARIABLE_SCHEMA_MAP.get(key);
      if (std) {
        if (contentType && std.contentType !== contentType) continue;
        items.push(std);
      }
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return items.filter(
        (v) => v.key.toLowerCase().includes(q) || v.label.toLowerCase().includes(q),
      );
    }
    return items;
  }, [recentKeys, customVariables, contentType, query]);

  /* 自定义分组：无 contentType 过滤时的完整条数（用于判断空状态） */
  const allCustomCount = contentType
    ? customVariables.filter((v) => v.contentType === contentType).length
    : customVariables.length;

  /* ---- 新建自定义变量（含列表变量） ---- */
  const handleCreateSubmit = () => {
    const trimLabel     = form.label.trim();
    const trimKeySuffix = form.keySuffix.trim();
    if (!trimLabel)     return setForm((f) => ({ ...f, error: '请输入变量名称' }));
    if (!trimKeySuffix) return setForm((f) => ({ ...f, error: '请输入变量键后缀' }));
    if (!/^[a-zA-Z0-9_]+$/.test(trimKeySuffix))
      return setForm((f) => ({ ...f, error: '变量键只能包含字母、数字和下划线' }));
    const fullKey = `custom.${trimKeySuffix}`;
    if (customVariables.some((v) => v.key === fullKey))
      return setForm((f) => ({ ...f, error: `"${fullKey}" 已存在` }));
    if (form.contentType === 'array') {
      const validSchema = (form.itemSchema ?? []).filter((f) => (f.key ?? '').trim() && (f.label ?? '').trim());
      if (validSchema.length === 0)
        return setForm((f) => ({ ...f, error: '列表变量至少需要一个字段，请添加字段键与展示名' }));
    }

    const def: CustomVariableDefinition = { key: fullKey, label: trimLabel, contentType: form.contentType };
    if (form.contentType === 'array' && (form.itemSchema ?? []).length > 0) {
      def.itemSchema = form.itemSchema!.map((f) => ({
        key: (f.key ?? '').trim() || 'field',
        label: (f.label ?? '').trim() || f.key || '字段',
        contentType: (f.contentType ?? 'text') as 'text' | 'image' | 'link',
      }));
    }
    onAddCustomVariable(def);
    addRecentVariableKey(fullKey);
    onSelect(fullKey);
    onClose();
  };

  const handleSelect = (key: string) => {
    addRecentVariableKey(key);
    onSelect(key);
    onClose();
  };

  const tableHeader = (
    <thead className={styles.listThead}>
      <tr>
        <th className={styles.listTh}>变量 key</th>
        <th className={styles.listTh}>名称</th>
        <th className={styles.listTh}>分类</th>
      </tr>
    </thead>
  );

  const renderStandardRow = (v: VariableSchemaItem) => (
    <tr
      key={v.key}
      role="button"
      tabIndex={0}
      className={styles.listTr}
      data-selected={v.key === selectedKey}
      onClick={() => handleSelect(v.key)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(v.key); } }}
    >
      <td className={`${styles.listTd} ${styles.listTdKey}`} title={v.key}>{v.key}</td>
      <td className={`${styles.listTd} ${styles.listTdLabel}`} title={v.label}>{v.label}</td>
      <td className={styles.listTdTag}>
        {v.sourceNamespace && NAMESPACE_LABELS[v.sourceNamespace] ? (
          <span className={styles.itemNs}>{NAMESPACE_LABELS[v.sourceNamespace]}</span>
        ) : null}
      </td>
    </tr>
  );

  const renderCustomRow = (v: CustomVariableDefinition) => (
    <tr
      key={v.key}
      role="button"
      tabIndex={0}
      className={styles.listTr}
      data-selected={v.key === selectedKey}
      onClick={() => handleSelect(v.key)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(v.key); } }}
    >
      <td className={`${styles.listTd} ${styles.listTdKey}`} title={v.key}>{v.key}</td>
      <td className={`${styles.listTd} ${styles.listTdLabel}`} title={v.label}>{v.label}</td>
      <td className={styles.listTdTag}>
        <span className={styles.itemCustomTag}>自定义</span>
      </td>
    </tr>
  );

  const renderRecentRow = (v: VariableSchemaItem | CustomVariableDefinition) => {
    const isStandard = 'sourceNamespace' in v && typeof (v as VariableSchemaItem).sourceNamespace === 'string';
    if (isStandard) return renderStandardRow(v as VariableSchemaItem);
    return renderCustomRow(v as CustomVariableDefinition);
  };

  const showCustomEmpty = activeTab === 'custom' && allCustomCount === 0 && !query;
  const showStandardNoMatch = activeTab === 'standard' && filteredStandard.length === 0 && query;
  const showRecentEmpty = activeTab === 'recent' && filteredRecent.length === 0;
  const hasRecent = recentKeys.length > 0;
  const hasArrayVars = arrayVars.length > 0;

  return (
    <Modal open={open} title="选择变量" onClose={onClose} size="large">
      <div className={styles.root}>
        {/* ── 左侧：常规 / 自定义 / 最近使用 / 列表变量 / 循环项 ── */}
        <aside className={styles.sidebar}>
          {loopContext && (
            <button
              type="button"
              className={styles.sidebarTab}
              data-active={activeTab === 'loop'}
              onClick={() => setActiveTab('loop')}
            >
              <span className={styles.sidebarDot} />
              循环项字段
            </button>
          )}
          {contentType !== 'array' && (
            <button
              type="button"
              className={styles.sidebarTab}
              data-active={activeTab === 'standard'}
              onClick={() => setActiveTab('standard')}
            >
              <span className={styles.sidebarDot} />
              常规
            </button>
          )}
          <button
            type="button"
            className={styles.sidebarTab}
            data-active={activeTab === 'custom'}
            onClick={() => setActiveTab('custom')}
          >
            <span className={styles.sidebarDot} />
            自定义
          </button>
          {hasArrayVars && (
            <button
              type="button"
              className={styles.sidebarTab}
              data-active={activeTab === 'array'}
              onClick={() => setActiveTab('array')}
            >
              <span className={styles.sidebarDot} />
              列表变量
            </button>
          )}
          {hasRecent && (
            <button
              type="button"
              className={styles.sidebarTab}
              data-active={activeTab === 'recent'}
              onClick={() => setActiveTab('recent')}
            >
              <span className={styles.sidebarDot} />
              最近使用
            </button>
          )}
        </aside>

        {/* ── 右侧：搜索 + 类别（常规时）+ 列表 ── */}
        <div className={styles.main}>
          <div className={styles.searchRow}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              className={styles.searchIcon} aria-hidden>
              <circle cx="7" cy="7" r="5" /><path d="M12 12l-2.5-2.5" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              className={styles.searchInput}
              placeholder={
                activeTab === 'custom' ? '搜索自定义变量…'
                  : activeTab === 'recent' ? '搜索最近使用的变量…'
                  : '搜索变量名称或 key…'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && onClose()}
            />
            {query && (
              <button type="button" className={styles.searchClear} onClick={() => setQuery('')}>×</button>
            )}
          </div>

          {activeTab === 'standard' && standardCategories.length > 1 && (
            <div className={styles.categoryRow}>
              {standardCategories.map(({ value, label }) => (
                <button
                  key={value || 'all'}
                  type="button"
                  className={styles.categoryChip}
                  data-active={standardCategory === value}
                  onClick={() => setStandardCategory(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 筛选与列表之间：结果行（数量统计公用；自定义 tab 时左侧有按钮则数量靠右，否则数量自然靠左） */}
          {(activeTab !== 'custom' || !creating) && activeTab !== 'array' && activeTab !== 'loop' && (
            <div className={`${styles.resultRow} ${activeTab === 'custom' && !creating ? styles.resultRowWithAction : ''}`}>
              {activeTab === 'custom' && !creating && (
                <button type="button" className={styles.addCustomBtn} onClick={() => setCreating(true)}>
                  + 新建自定义变量
                </button>
              )}
              <p className={styles.resultCount}>
                {activeTab === 'standard' && `共 ${filteredStandard.length} 条`}
                {activeTab === 'custom' && `共 ${filteredCustom.length} 条`}
                {activeTab === 'recent' && `共 ${filteredRecent.length} 条`}
              </p>
            </div>
          )}

          <div className={styles.list}>
            {/* ── 循环项字段（loopContext 时显示） ── */}
            {activeTab === 'loop' && loopContext && (
              <>
                <p className={styles.arrayHint}>
                  当前组件在循环区块 <code>{loopContext.variableKey}</code> 内，选择字段后绑定为 item.*
                </p>
                {loopContext.itemSchema.length === 0 ? (
                  <p className={styles.emptyAll}>该循环变量未定义字段，请先在「变量管理」中编辑</p>
                ) : (
                  <table className={styles.listTable}>
                    {tableHeader}
                    <tbody className={styles.listTbody}>
                      {loopContext.itemSchema
                        .filter((f) => !contentType || f.contentType === contentType)
                        .map((field) => {
                          const itemKey = `item.${field.key}`;
                          return (
                            <tr
                              key={itemKey}
                              role="button"
                              tabIndex={0}
                              className={styles.listTr}
                              data-selected={selectedKey === itemKey}
                              onClick={() => handleSelect(itemKey)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(itemKey); } }}
                            >
                              <td className={`${styles.listTd} ${styles.listTdKey}`} title={itemKey}>{itemKey}</td>
                              <td className={`${styles.listTd} ${styles.listTdLabel}`} title={field.label}>{field.label}</td>
                              <td className={styles.listTdTag}>
                                <span className={styles.itemCustomTag} style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>循环</span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </>
            )}

            {/* ── 列表变量（固定索引绑定 或 循环绑定列表变量） ── */}
            {activeTab === 'array' && (
              <>
                {arrayVars.length === 0 ? (
                  <p className={styles.emptyAll}>暂无列表类型变量，请在左侧「变量」面板中新增</p>
                ) : contentType === 'array' ? (
                  /* 循环绑定：直接选择列表变量 key */
                  <table className={styles.listTable}>
                    {tableHeader}
                    <tbody className={styles.listTbody}>
                      {arrayVars.map((arrayVar) => (
                        <tr
                          key={arrayVar.key}
                          role="button"
                          tabIndex={0}
                          className={styles.listTr}
                          data-selected={selectedKey === arrayVar.key}
                          onClick={() => handleSelect(arrayVar.key)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(arrayVar.key); } }}
                        >
                          <td className={`${styles.listTd} ${styles.listTdKey}`} title={arrayVar.key}>{arrayVar.key}</td>
                          <td className={`${styles.listTd} ${styles.listTdLabel}`} title={arrayVar.label}>{arrayVar.label}</td>
                          <td className={styles.listTdTag}>
                            <span className={styles.itemCustomTag} style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>列表</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  arrayVars.map((arrayVar) => {
                    const isExpanded = arrayExpandedKey === arrayVar.key;
                    const schema = (arrayVar.itemSchema ?? []).filter(
                      (f) => !contentType || f.contentType === contentType
                    );
                    return (
                      <div key={arrayVar.key} className={styles.arrayVarGroup}>
                        <button
                          type="button"
                          className={styles.arrayVarHeader}
                          onClick={() => {
                            setArrayExpandedKey(isExpanded ? null : arrayVar.key);
                            setArraySelectedIndex(0);
                          }}
                        >
                          <span className={styles.arrayVarChevron}>{isExpanded ? '▾' : '▸'}</span>
                          <span className={styles.itemKey}>{arrayVar.key}</span>
                          <span className={styles.itemLabel}>{arrayVar.label}</span>
                          <span className={styles.itemCustomTag} style={{ background: 'rgba(22,163,74,0.1)', color: 'var(--success)' }}>列表</span>
                        </button>
                        {isExpanded && (
                          <div className={styles.arrayVarBody}>
                            {/* 索引选择 */}
                            <div className={styles.arrayIndexRow}>
                              <span className={styles.arrayIndexLabel}>选择第几项：</span>
                              {[0, 1, 2, 3].map((idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  className={styles.arrayIndexBtn}
                                  data-active={arraySelectedIndex === idx}
                                  onClick={() => setArraySelectedIndex(idx)}
                                >
                                  {idx + 1}
                                </button>
                              ))}
                            </div>
                            {/* 字段列表 */}
                            {schema.length === 0 ? (
                              <p className={styles.emptyAll}>该列表变量无{contentType ? `「${contentType}」类型` : ''}可选字段</p>
                            ) : (
                              <table className={styles.listTable}>
                                {tableHeader}
                                <tbody className={styles.listTbody}>
                                  {schema.map((field) => {
                                    const compositeKey = `${arrayVar.key}[${arraySelectedIndex}].${field.key}`;
                                    return (
                                      <tr
                                        key={compositeKey}
                                        role="button"
                                        tabIndex={0}
                                        className={styles.listTr}
                                        data-selected={selectedKey === compositeKey}
                                        onClick={() => handleSelect(compositeKey)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(compositeKey); } }}
                                      >
                                        <td className={`${styles.listTd} ${styles.listTdKey}`} title={compositeKey}>{compositeKey}</td>
                                        <td className={`${styles.listTd} ${styles.listTdLabel}`} title={field.label}>{field.label}</td>
                                        <td className={styles.listTdTag} />
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}

            {activeTab === 'custom' && (
              <>
                {creating ? (
                  <div className={styles.createForm}>
                    <div className={styles.createField}>
                      <label className={styles.createLabel}>变量名称</label>
                      <input
                        ref={labelRef}
                        type="text"
                        className={styles.createInput}
                        placeholder="例：会员等级"
                        value={form.label}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((f) => {
                            const trimmed = (f.keySuffix ?? '').trim().replace(/^custom\./, '');
                            const fullKey = trimmed ? `custom.${trimmed}` : '';
                            const keyExists = fullKey && customVariables.some((v) => v.key === fullKey);
                            return {
                              ...f,
                              label: val,
                              error: keyExists ? `"${fullKey}" 已存在` : (f.error && f.error.includes('已存在') ? '' : f.error),
                            };
                          });
                        }}
                      />
                    </div>
                    <div className={styles.createField}>
                      <label className={styles.createLabel}>变量键</label>
                      <div className={styles.createKeyRow}>
                        <span className={styles.createKeyPrefix}>custom.</span>
                        <input
                          type="text"
                          className={`${styles.createInput} ${styles.createKeyInput}`}
                          placeholder="tier"
                          value={form.keySuffix}
                          onChange={(e) => {
                            const val = e.target.value;
                            const trimmed = val.trim().replace(/^custom\./, '');
                            const fullKey = trimmed ? `custom.${trimmed}` : '';
                            const keyExists = fullKey && customVariables.some((v) => v.key === fullKey);
                            setForm((f) => ({
                              ...f,
                              keySuffix: val,
                              error: keyExists ? `"${fullKey}" 已存在` : (f.error && f.error.includes('已存在') ? '' : f.error),
                            }));
                          }}
                        />
                      </div>
                      {form.keySuffix && (
                        <span className={styles.createKeyPreview}>完整键：custom.{form.keySuffix.replace(/^custom\./, '')}</span>
                      )}
                      {form.error && form.error.includes('已存在') && (() => {
                        const trimmed = (form.keySuffix ?? '').trim().replace(/^custom\./, '');
                        const fullKey = trimmed ? `custom.${trimmed}` : '';
                        const existingVar = fullKey ? customVariables.find((v) => v.key === fullKey) : undefined;
                        const typeLabel = existingVar ? (CONTENT_TYPE_OPTIONS.find((o) => o.value === existingVar.contentType)?.label ?? existingVar.contentType) : '';
                        return (
                          <div className={styles.createKeyErrorBlock}>
                            <span className={styles.createKeyError}>{form.error}</span>
                            {existingVar && (
                              <p className={styles.existingVarInfo}>
                                已存在的变量：<strong>{existingVar.label}</strong>（<code>{existingVar.key}</code>），类型：{typeLabel}
                              </p>
                            )}
                            <button
                              type="button"
                              className={styles.viewExistingBtn}
                              onClick={() => fullKey && handleSelect(fullKey)}
                            >
                              使用该变量
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <div className={styles.createField}>
                      <label className={styles.createLabel}>内容类型</label>
                      <Select
                        value={form.contentType}
                        onChange={(next) => {
                          setForm((f) => {
                            const trimmed = (f.keySuffix ?? '').trim().replace(/^custom\./, '');
                            const fullKey = trimmed ? `custom.${trimmed}` : '';
                            const keyExists = fullKey && customVariables.some((v) => v.key === fullKey);
                            return {
                              ...f,
                              contentType: next as VariableContentType,
                              itemSchema: next === 'array' ? (f.itemSchema ?? []) : f.itemSchema,
                              error: keyExists ? `"${fullKey}" 已存在` : (f.error && f.error.includes('已存在') ? '' : f.error),
                            };
                          });
                        }}
                        options={CONTENT_TYPE_OPTIONS}
                        aria-label="内容类型"
                      />
                    </div>
                    {form.contentType === 'array' && (
                      <div className={styles.schemaEditor}>
                        <div className={styles.schemaHeader}>
                          <span className={styles.schemaTitle}>列表项字段</span>
                          <button type="button" className={styles.schemaPresetBtn} onClick={applySchemaPreset}>
                            快速填入：商品列表
                          </button>
                        </div>
                        {(form.itemSchema ?? []).length === 0 ? (
                          <p className={styles.schemaEmpty}>至少添加一个字段，或使用上方「快速填入」</p>
                        ) : (
                          <div className={styles.schemaFieldList}>
                            {(form.itemSchema ?? []).map((field, i) => (
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
                                  onChange={(v) => updateSchemaField(i, { contentType: v as 'text' | 'image' | 'link' })}
                                  options={FIELD_TYPE_OPTIONS}
                                  aria-label="字段类型"
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
                    {form.error && !form.error.includes('已存在') && <p className={styles.createError}>{form.error}</p>}
                    <div className={styles.createActions}>
                      <button type="button" className={styles.cancelBtn}
                        onClick={() => { setCreating(false); setForm(EMPTY_FORM); }}>
                        取消
                      </button>
                      <button type="button" className={styles.submitBtn} onClick={handleCreateSubmit}>
                        创建并选择
                      </button>
                    </div>
                  </div>
                ) : filteredCustom.length > 0 ? (
                  <table className={styles.listTable}>
                    {tableHeader}
                    <tbody className={styles.listTbody}>
                      {filteredCustom.map(renderCustomRow)}
                    </tbody>
                  </table>
                ) : showCustomEmpty ? (
                  <div className={styles.emptyCustom}>
                    <p className={styles.emptyCustomText}>暂无自定义变量，点击上方「新建自定义变量」添加</p>
                  </div>
                ) : (
                  <p className={styles.noMatchText}>未找到匹配的自定义变量</p>
                )}
              </>
            )}

            {activeTab === 'standard' && (
              <>
                {filteredStandard.length > 0 ? (
                  <table className={styles.listTable}>
                    {tableHeader}
                    <tbody className={styles.listTbody}>
                      {filteredStandard.map(renderStandardRow)}
                    </tbody>
                  </table>
                ) : showStandardNoMatch ? (
                  <p className={styles.emptyAll}>未找到匹配的变量</p>
                ) : null}
              </>
            )}

            {activeTab === 'recent' && (
              <>
                {filteredRecent.length > 0 ? (
                  <table className={styles.listTable}>
                    {tableHeader}
                    <tbody className={styles.listTbody}>
                      {filteredRecent.map((v) => renderRecentRow(v))}
                    </tbody>
                  </table>
                ) : showRecentEmpty ? (
                  <p className={styles.emptyAll}>暂无最近使用的变量</p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
