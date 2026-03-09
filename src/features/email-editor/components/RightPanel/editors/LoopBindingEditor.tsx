import { useState, useCallback, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { getArrayVariables } from '@shared/constants/variableSchema';
import type { ComponentRules, EmailComponent, LayoutProps } from '@shared/types/email';
import { isLayoutProps } from '@shared/types/email';
import type { ArrayItemFieldDef } from '@shared/types/emailTemplate';
import { toast } from '@shared/store/useToastStore';
import { deepCloneWithNewIds } from '@shared/utils/cloneComponent';
import { extractPreviewFromLayoutChildren } from '@shared/utils/extractLoopPreviewFromChildren';
import ArrayPreviewDataModal from '@shared/ui/ArrayPreviewDataModal';
import Modal, { ModalFooter } from '@shared/ui/Modal';
import VariablePicker from './VariablePicker';
import Select from './Select';
import type { SelectOption } from './Select';
import styles from './Editors.module.css';
import ConfigSection from './ConfigSection';
import loopStyles from './LoopBindingEditor.module.css';

type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

/** 根据属性路径推断列表项字段内容类型，用于筛选项 */
function getContentTypeForPropPath(propPath: string): 'text' | 'image' | 'link' | null {
  if (propPath === 'props.content' || propPath === 'props.text') return 'text';
  if (propPath === 'props.src') return 'image';
  if (propPath === 'props.link') return 'link';
  return null;
}

interface LoopBindingEditorProps {
  component: EmailComponent;
  /** 来自逻辑面板的跳转信号；变化时自动滚动到此区块 */
  focusSignal?: number;
  onFocusConsumed?: () => void;
  /** 渲染模式：'accordion' (默认，折叠面板) | 'panel' (平铺，用于逻辑 Tab) */
  variant?: 'accordion' | 'panel';
}

interface QuickCreateVarState {
  label: string;
  keySuffix: string;
  error: string;
}
const EMPTY_CREATE: QuickCreateVarState = { label: '', keySuffix: '', error: '' };

/** 按 schema 顺序从组件子树收集 (childId, propPath, variableKey)，用于转为循环后自动绑定；顺序与 extractLoopPreview 的 schema 一致 */
function buildMappingsFromTree(comp: EmailComponent, schema: ArrayItemFieldDef[], variableKeyPrefix: string): Array<{ childId: string; propPath: string; variableKey: string }> {
  const out: Array<{ childId: string; propPath: string; variableKey: string }> = [];
  let idx = 0;
  function walk(c: EmailComponent) {
    if (c.type === 'text' && 'content' in c.props && typeof (c.props as { content?: string }).content === 'string') {
      if (idx < schema.length) {
        out.push({ childId: c.id, propPath: 'props.content', variableKey: `${variableKeyPrefix}.${schema[idx].key}` });
        idx++;
      }
      return;
    }
    if (c.type === 'image' && 'src' in c.props) {
      if (idx + 1 < schema.length && schema[idx].contentType === 'image' && schema[idx + 1].contentType === 'link') {
        out.push({ childId: c.id, propPath: 'props.src', variableKey: `${variableKeyPrefix}.${schema[idx].key}` });
        out.push({ childId: c.id, propPath: 'props.link', variableKey: `${variableKeyPrefix}.${schema[idx + 1].key}` });
        idx += 2;
      } else if (idx < schema.length && schema[idx].contentType === 'image') {
        out.push({ childId: c.id, propPath: 'props.src', variableKey: `${variableKeyPrefix}.${schema[idx].key}` });
        idx++;
      }
      return;
    }
    if (c.type === 'button' && 'text' in c.props) {
      if (idx + 1 < schema.length) {
        out.push({ childId: c.id, propPath: 'props.text', variableKey: `${variableKeyPrefix}.${schema[idx].key}` });
        out.push({ childId: c.id, propPath: 'props.link', variableKey: `${variableKeyPrefix}.${schema[idx + 1].key}` });
        idx += 2;
      } else if (idx < schema.length) {
        out.push({ childId: c.id, propPath: 'props.text', variableKey: `${variableKeyPrefix}.${schema[idx].key}` });
        idx++;
      }
      return;
    }
    for (const child of c.children ?? []) walk(child);
  }
  walk(comp);
  return out;
}

export default function LoopBindingEditor({ component, focusSignal, onFocusConsumed, variant = 'accordion' }: LoopBindingEditorProps) {
  const customVariables = useEmailStore((s) => s.customVariables);
  const arrayPreviewData = useEmailStore((s) => s.arrayPreviewData);
  const setArrayPreviewItems = useEmailStore((s) => s.setArrayPreviewItems);
  const updateComponent = useEmailStore((s) => s.updateComponent);
  const updateComponentRules = useEmailStore((s) => s.updateComponentRules);
  const findComponent = useEmailStore((s) => s.findComponent);
  const renderingRules = useEmailStore((s) => s.renderingRules);
  const addCustomVariable = useEmailStore((s) => s.addCustomVariable);
  const previewData = useEmailStore((s) => s.previewData);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [arrayModalOpen, setArrayModalOpen] = useState(false);
  const [pendingMappings, setPendingMappings] = useState<Array<{ childId: string; childName: string; propPath: string; variableKey: string }>>([]);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreate, setQuickCreate] = useState<QuickCreateVarState>(EMPTY_CREATE);

  const arrayVars = getArrayVariables(customVariables);
  const loopBinding = (component as EmailComponentWithRules).loopBinding;
  const canConvertFromChildren =
    component.type === 'layout' && !loopBinding && (component.children?.length ?? 0) >= 2;

  const handleToggle = useCallback(() => {
    if (loopBinding) {
      updateComponentRules(component.id, { loopBinding: undefined });
    } else {
      // 若已有列表变量则默认选第一个，否则用空串占位（body 内有提示引导用户创建）
      updateComponentRules(component.id, { loopBinding: { variableKey: arrayVars[0]?.key ?? '', previewIndex: 0 } });
    }
  }, [loopBinding, arrayVars, component.id, updateComponentRules]);

  const handleVarChange = useCallback((variableKey: string) => {
    updateComponentRules(component.id, { loopBinding: { ...loopBinding, variableKey, previewIndex: loopBinding?.previewIndex ?? 0 } });
  }, [component.id, loopBinding, updateComponentRules]);

  const handleExpandDirectionChange = useCallback((dir: 'vertical' | 'horizontal') => {
    if (!loopBinding) return;
    updateComponentRules(component.id, { loopBinding: { ...loopBinding, expandDirection: dir } });
  }, [component.id, loopBinding, updateComponentRules]);

  const handlePreviewIndexChange = useCallback((delta: number) => {
    if (!loopBinding) return;
    const items = arrayPreviewData[loopBinding.variableKey];
    const total = items?.length ?? 0;
    if (total === 0) return;
    const cur = loopBinding.previewIndex ?? 0;
    const next = (cur + delta + total) % total;
    updateComponentRules(component.id, { loopBinding: { ...loopBinding, previewIndex: next } });
  }, [component.id, loopBinding, arrayPreviewData, updateComponentRules]);

  // 自动绑定：根据 itemSchema 类型，为子组件推荐 variableBindings
  const handleAutoBind = useCallback(() => {
    if (!loopBinding) return;
    const arrayVar = customVariables.find((v) => v.key === loopBinding.variableKey);
    if (!arrayVar?.itemSchema || arrayVar.itemSchema.length === 0) {
      toast('该列表变量尚未定义字段，请先在「变量」面板中编辑', 'info');
      return;
    }

    const schema = arrayVar.itemSchema;
    const mappings: typeof pendingMappings = [];

    function collectChildren(comp: EmailComponent) {
      for (const child of comp.children ?? []) {
        const name = child.displayName?.trim() || child.type;
        if (child.type === 'image') {
          const imgField = schema.find((f) => f.contentType === 'image');
          const linkField = schema.find((f) => f.contentType === 'link');
          if (imgField) mappings.push({ childId: child.id, childName: name, propPath: 'props.src', variableKey: `item.${imgField.key}` });
          if (linkField) mappings.push({ childId: child.id, childName: name, propPath: 'props.link', variableKey: `item.${linkField.key}` });
        } else if (child.type === 'text') {
          const textField = schema.find((f) => f.contentType === 'text');
          if (textField) mappings.push({ childId: child.id, childName: name, propPath: 'props.content', variableKey: `item.${textField.key}` });
        } else if (child.type === 'button') {
          const textField = schema.find((f) => f.contentType === 'text');
          const linkField = schema.find((f) => f.contentType === 'link');
          if (textField) mappings.push({ childId: child.id, childName: name, propPath: 'props.text', variableKey: `item.${textField.key}` });
          if (linkField) mappings.push({ childId: child.id, childName: name, propPath: 'props.link', variableKey: `item.${linkField.key}` });
        }
        if (child.children?.length) collectChildren(child);
      }
    }
    collectChildren(component);

    if (mappings.length === 0) {
      toast('未找到可自动绑定的子组件（图片、文本、按钮）', 'info');
      return;
    }

    setPendingMappings(mappings);
    setConfirmOpen(true);
  }, [loopBinding, customVariables, component]);

  const applyMappings = useCallback(() => {
    let applied = 0;
    for (const { childId, propPath, variableKey } of pendingMappings) {
      const child = findComponent(childId);
      if (!child) continue;
      const existingBindings = renderingRules[childId]?.variableBindings ?? {};
      const newBindings = { ...existingBindings };
      if (variableKey) {
        newBindings[propPath] = variableKey;
        applied++;
      } else {
        delete newBindings[propPath];
      }
      updateComponentRules(childId, { variableBindings: Object.keys(newBindings).length ? newBindings : undefined });
    }
    setConfirmOpen(false);
    setPendingMappings([]);
    toast(applied > 0 ? `已绑定 ${applied} 个字段` : '已更新映射', 'success');
  }, [pendingMappings, findComponent, updateComponentRules, renderingRules]);

  /** 从当前多个子组件转为动态列表：创建列表变量、用子组件内容生成预览数据、只保留一条作为模板并自动绑定 item.* */
  const handleConvertFromChildren = useCallback(() => {
    const result = extractPreviewFromLayoutChildren(component, previewData);
    if (!result) {
      toast('当前容器子组件不足或无法解析，请至少保留 2 个结构一致的子项', 'info');
      return;
    }
    const existingKeys = new Set(customVariables.map((v) => v.key));
    let fullKey = `custom.list_${nanoid(6)}`;
    while (existingKeys.has(fullKey)) fullKey = `custom.list_${nanoid(6)}`;

    addCustomVariable({
      key: fullKey,
      label: '动态列表',
      contentType: 'array',
      itemSchema: result.schema,
    });
    setArrayPreviewItems(fullKey, result.items);

    // 自动检测父容器方向，决定展开方向
    const parentDirection = isLayoutProps(component.props)
      ? (component.props as LayoutProps).direction
      : 'vertical';
    const expandDirection: 'horizontal' | 'vertical' = parentDirection === 'horizontal' ? 'horizontal' : 'vertical';

    const firstChild = component.children![0];
    const clonedFirst = deepCloneWithNewIds(firstChild);
    const mappings = buildMappingsFromTree(clonedFirst, result.schema, 'item');

    updateComponent(component.id, {
      children: [clonedFirst],
    });
    updateComponentRules(component.id, {
      loopBinding: { variableKey: fullKey, previewIndex: 0, expandDirection },
    });

    for (const m of mappings) {
      const child = findComponent(m.childId);
      if (!child) continue;
      const existingBindings = renderingRules[m.childId]?.variableBindings ?? {};
      const newBindings = { ...existingBindings, [m.propPath]: m.variableKey };
      updateComponentRules(m.childId, { variableBindings: newBindings });
    }

    toast(`已转为动态列表并绑定「${fullKey}」，预览数据来自当前 ${result.items.length} 个子项`, 'success');
  }, [
    component,
    previewData,
    customVariables,
    addCustomVariable,
    setArrayPreviewItems,
    updateComponent,
    updateComponentRules,
    findComponent,
    renderingRules,
  ]);

  const handleQuickCreate = useCallback(() => {
    const trimLabel = quickCreate.label.trim();
    const trimKey = quickCreate.keySuffix.trim().replace(/[^a-zA-Z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (!trimLabel) return setQuickCreate((f) => ({ ...f, error: '请输入变量名称' }));
    if (!trimKey) return setQuickCreate((f) => ({ ...f, error: '请输入有效的键后缀（字母、数字、下划线）' }));
    const fullKey = `custom.${trimKey}`;
    const existingKeys = customVariables.map((v) => v.key);
    if (existingKeys.includes(fullKey)) return setQuickCreate((f) => ({ ...f, error: `"${fullKey}" 已存在` }));

    // 推断常见字段：从子组件类型推断
    const inferredSchema: ArrayItemFieldDef[] = [];
    function collectChildTypes(comp: EmailComponent) {
      for (const child of comp.children ?? []) {
        if (child.type === 'image' && !inferredSchema.find((f) => f.key === 'image')) {
          inferredSchema.push({ key: 'image', label: '图片', contentType: 'image' });
          inferredSchema.push({ key: 'link', label: '链接', contentType: 'link' });
        } else if (child.type === 'text' && !inferredSchema.find((f) => f.key === 'title')) {
          inferredSchema.push({ key: 'title', label: '标题', contentType: 'text' });
        } else if (child.type === 'button' && !inferredSchema.find((f) => f.key === 'btnText')) {
          inferredSchema.push({ key: 'btnText', label: '按钮文字', contentType: 'text' });
          inferredSchema.push({ key: 'btnLink', label: '按钮链接', contentType: 'link' });
        }
        if (child.children?.length) collectChildTypes(child);
      }
    }
    collectChildTypes(component);
    // 如果没有推断到字段，给一个默认文本字段
    if (inferredSchema.length === 0) inferredSchema.push({ key: 'value', label: '内容', contentType: 'text' });

    addCustomVariable({ key: fullKey, label: trimLabel, contentType: 'array', itemSchema: inferredSchema });
    updateComponentRules(component.id, { loopBinding: { variableKey: fullKey, previewIndex: 0 } });
    setShowQuickCreate(false);
    setQuickCreate(EMPTY_CREATE);
    toast(`已创建列表变量「${trimLabel}」并绑定到循环`, 'success');
  }, [quickCreate, customVariables, addCustomVariable, updateComponentRules, component]);

  const currentArrayVar = loopBinding
    ? customVariables.find((v) => v.key === loopBinding.variableKey)
    : null;
  const previewItems = loopBinding ? (arrayPreviewData[loopBinding.variableKey] ?? []) : [];
  const previewIndex = loopBinding?.previewIndex ?? 0;

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusSignal) return;
    rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onFocusConsumed?.();
  }, [focusSignal, onFocusConsumed]);

  const renderContent = () => (
    <>
      {!loopBinding && canConvertFromChildren && (
        <div className={loopStyles.convertFromChildrenSection}>
          <p className={loopStyles.convertHint}>
            当前容器内有 {component.children!.length} 个结构一致的子项，可一键转为动态列表并绑定预览数据。
          </p>
          <button
            type="button"
            className={loopStyles.convertFromChildrenBtn}
            onClick={handleConvertFromChildren}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7 1v12M1 7h12" />
            </svg>
            从当前子组件转为动态列表
          </button>
        </div>
      )}
      {loopBinding && (
        <div className={variant === 'panel' ? styles.section : loopStyles.body}>

          {/* 展开方向 */}
          <div className={styles.field}>
            <label className={styles.label}>展开方向</label>
            <div className={loopStyles.directionRow}>
              <button
                type="button"
                className={`${loopStyles.dirBtn} ${(loopBinding.expandDirection ?? 'vertical') === 'vertical' ? loopStyles.dirBtnActive : ''}`}
                onClick={() => handleExpandDirectionChange('vertical')}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M6 1v10M3 8l3 3 3-3" />
                </svg>
                纵向堆叠
              </button>
              <button
                type="button"
                className={`${loopStyles.dirBtn} ${(loopBinding.expandDirection ?? 'vertical') === 'horizontal' ? loopStyles.dirBtnActive : ''}`}
                onClick={() => handleExpandDirectionChange('horizontal')}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 6h10M8 3l3 3-3 3" />
                </svg>
                横向等宽列
              </button>
            </div>
            {(loopBinding.expandDirection ?? 'vertical') === 'horizontal' && (
              <p className={loopStyles.hintWarn}>
                ⚠️ 邮件不支持轮播滚动，横向循环将渲染为静态等宽列。建议 2–5 项以内，过多会导致列宽过窄。
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>绑定的列表变量</label>
            <VariablePicker
              value={loopBinding.variableKey}
              onChange={handleVarChange}
              customVariables={customVariables}
              contentType="array"
              placeholder="— 点击选择列表变量 —"
            />
            {arrayVars.length === 0 && !showQuickCreate && (
              <div className={loopStyles.noVarSection}>
                <p className={loopStyles.hint}>尚无列表变量</p>
                <button
                  type="button"
                  className={loopStyles.quickCreateBtn}
                  onClick={() => setShowQuickCreate(true)}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                  就地创建列表变量
                </button>
              </div>
            )}
            {arrayVars.length === 0 && showQuickCreate && (
              <div className={loopStyles.quickCreateForm}>
                <div className={loopStyles.quickCreateTitle}>创建列表变量</div>
                <input
                  type="text"
                  className={loopStyles.quickCreateInput}
                  placeholder="变量名称（如：数据指标）"
                  autoFocus
                  value={quickCreate.label}
                  onChange={(e) => setQuickCreate((f) => ({ ...f, label: e.target.value, error: '' }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickCreate()}
                />
                <div className={loopStyles.quickCreateKeyRow}>
                  <span className={loopStyles.quickCreatePrefix}>custom.</span>
                  <input
                    type="text"
                    className={loopStyles.quickCreateInput}
                    placeholder="键后缀（如：metrics）"
                    value={quickCreate.keySuffix}
                    onChange={(e) => setQuickCreate((f) => ({ ...f, keySuffix: e.target.value, error: '' }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickCreate()}
                  />
                </div>
                <p className={loopStyles.quickCreateHint}>字段将根据容器内子组件类型自动推断，创建后可在「变量」面板中调整</p>
                {quickCreate.error && <p className={loopStyles.quickCreateError}>{quickCreate.error}</p>}
                <div className={loopStyles.quickCreateActions}>
                  <button
                    type="button"
                    className={loopStyles.quickCreateCancelBtn}
                    onClick={() => { setShowQuickCreate(false); setQuickCreate(EMPTY_CREATE); }}
                  >取消</button>
                  <button
                    type="button"
                    className={loopStyles.quickCreateSaveBtn}
                    onClick={handleQuickCreate}
                  >创建并绑定</button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.label}>画布预览项</label>
            <div className={loopStyles.previewRow}>
              <button
                type="button"
                className={loopStyles.previewNavBtn}
                disabled={previewItems.length <= 1}
                onClick={() => handlePreviewIndexChange(-1)}
              >‹</button>
              <span className={loopStyles.previewIndexLabel}>
                {previewItems.length > 0
                  ? `第 ${previewIndex + 1} 项 / 共 ${previewItems.length} 项`
                  : '（无预览数据）'}
              </span>
              <button
                type="button"
                className={loopStyles.previewNavBtn}
                disabled={previewItems.length <= 1}
                onClick={() => handlePreviewIndexChange(1)}
              >›</button>
            </div>
            {loopBinding.variableKey && currentArrayVar && (
              <button
                type="button"
                className={loopStyles.configPreviewBtn}
                onClick={() => setArrayModalOpen(true)}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1.5" y="3" width="11" height="8" rx="1" />
                  <path d="M4 6.5h6M4 9h4" />
                </svg>
                {previewItems.length > 0
                  ? `配置预览数据（${previewItems.length} 组）`
                  : '配置预览数据'}
              </button>
            )}
          </div>

          <button
            type="button"
            className={loopStyles.autoBindBtn}
            onClick={handleAutoBind}
            disabled={!currentArrayVar?.itemSchema?.length}
            title={
              !loopBinding?.variableKey
                ? '请先绑定一个列表变量'
                : !currentArrayVar?.itemSchema?.length
                  ? '请先在左侧「变量」面板中为该列表变量定义字段（如 label、value），再使用自动绑定'
                  : '根据列表变量的字段结构，自动为内部子组件绑定对应变量'
            }
          >
            自动绑定内部组件
          </button>
        </div>
      )}

      {/* 预览数据配置弹窗 */}
      {currentArrayVar && (
        <ArrayPreviewDataModal
          open={arrayModalOpen}
          onClose={() => setArrayModalOpen(false)}
          variable={currentArrayVar}
          items={previewItems}
          onSetItems={(items) => setArrayPreviewItems(loopBinding?.variableKey ?? '', items)}
        />
      )}

      {/* 自动绑定确认弹窗：使用公共 Modal 挂到 body，避免被右侧面板裁切；支持在弹窗内修改每行绑定的变量字段 */}
      {confirmOpen && (
        <Modal
          open={confirmOpen}
          title="确认字段映射"
          onClose={() => { setConfirmOpen(false); setPendingMappings([]); }}
          footer={
            <ModalFooter
              onCancel={() => { setConfirmOpen(false); setPendingMappings([]); }}
              onConfirm={applyMappings}
              confirmText="确认绑定"
            />
          }
          size="default"
        >
          {!(currentArrayVar?.itemSchema && currentArrayVar.itemSchema.length > 0) ? (
            <p className={loopStyles.confirmDesc}>
              列表变量不存在或未定义字段，请关闭后先在「变量」面板中维护列表变量再试。
            </p>
          ) : (
            <>
              <p className={loopStyles.confirmDesc}>
                自动匹配了以下映射，可在下方修改每条「绑定到」的变量字段后再确认。
              </p>
              <div className={loopStyles.confirmList}>
                {pendingMappings.map((m, i) => {
                  const contentType = getContentTypeForPropPath(m.propPath);
                  const itemSchema = currentArrayVar?.itemSchema ?? [];
                  const options: SelectOption[] = [
                    { value: '', label: '不绑定' },
                    ...(itemSchema
                      .filter((f) => !contentType || f.contentType === contentType)
                      .map((f) => ({ value: `item.${f.key}`, label: f.label || f.key }))),
                  ];
                  return (
                    <div key={`${m.childId}-${m.propPath}`} className={loopStyles.confirmRow}>
                      <span className={loopStyles.confirmChild} title={m.propPath}>
                        {m.childName}
                      </span>
                      <span className={loopStyles.confirmArrow}>→</span>
                      <Select
                        value={m.variableKey}
                        onChange={(value) =>
                          setPendingMappings((prev) =>
                            prev.map((p, j) => (j === i ? { ...p, variableKey: value } : p))
                          )
                        }
                        options={options}
                        placeholder="选择变量字段"
                        fullWidth={true}
                        className={loopStyles.confirmSelect}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );

  if (variant === 'panel') {
    return (
      <div ref={rootRef}>
        <ConfigSection
          title="循环（动态列表）"
          headerRight={
            <button
              type="button"
              className={`${loopStyles.toggle} ${loopStyles.toggleCompact} ${loopBinding ? loopStyles.toggleOn : ''}`}
              onClick={handleToggle}
              title={loopBinding ? '关闭循环' : '开启循环'}
            >
              <span className={loopStyles.toggleKnob} />
            </button>
          }
        >
          {renderContent()}
        </ConfigSection>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={loopStyles.root}>
      <div className={loopStyles.header}>
        <span className={loopStyles.title}>循环（动态列表）</span>
        <button
          type="button"
          className={`${loopStyles.toggle} ${loopBinding ? loopStyles.toggleOn : ''}`}
          onClick={handleToggle}
          title={loopBinding ? '关闭循环' : '开启循环'}
        >
          <span className={loopStyles.toggleKnob} />
        </button>
      </div>
      {renderContent()}
    </div>
  );
}
