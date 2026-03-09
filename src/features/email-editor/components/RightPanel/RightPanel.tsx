import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useEmailStore, findNearestLoopAncestor } from '@features/email-editor/store/useEmailStore';
import { isTextProps, isImageProps, isLayoutProps, isGridProps, isDividerProps, isButtonProps, isIconProps } from '@shared/types/email';
import type { EmailComponent } from '@shared/types/email';
import { mergeRulesIntoComponents } from '@shared/utils/mergeRulesIntoComponents';
import { TYPE_LABELS, TYPE_ICONS } from '@shared/constants/componentLibrary';
import Modal, { ConfirmText, ModalFooter } from '@shared/ui/Modal';
import WrapperStyleEditor, { WrapperBorderBackgroundSection } from './editors/WrapperStyleEditor';
import SpacingField from './editors/SpacingField';
import CanvasStyleEditor, { CanvasSpecificEditor } from './editors/CanvasStyleEditor';
import { TextContentSection, TextStyleSection } from './editors/TextPropsEditor';
import { ImageContentSection, ImageStyleSection } from './editors/ImagePropsEditor';
import { ButtonContentSection, ButtonStyleSection } from './editors/ButtonPropsEditor';
import { IconContentSection, IconStyleSection } from './editors/IconPropsEditor';
import LayoutPropsEditor from './editors/LayoutPropsEditor';
import GridPropsEditor from './editors/GridPropsEditor';
import DividerPropsEditor from './editors/DividerPropsEditor';
import BusinessFormEditor from './editors/BusinessFormEditor';
import VisibilityConditionEditor from './editors/VisibilityConditionEditor';
import ConditionalBranchesEditor from './editors/ConditionalBranchesEditor';
import LoopBindingEditor from './editors/LoopBindingEditor';
import VariableSelector from './editors/VariableSelector';
import { getVariableBindingTargets } from './editors/variableBindingTargets';
import { getVariableLabel } from '@shared/constants/variableSchema';
import AlignPairSection from './editors/AlignPairSection';
import styles from './RightPanel.module.css';
import editorStyles from './editors/Editors.module.css';

// ===== Export helpers =====

const defaultFileName = (component: EmailComponent) => `${component.type}-${component.id}.json`;

type SaveFilePickerLikeOptions = {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
};
type WindowWithSaveFilePicker = Window & {
  showSaveFilePicker?: (options?: SaveFilePickerLikeOptions) => Promise<FileSystemFileHandle>;
};

function fallbackDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

async function saveWithPicker(json: string, name: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const win = window as WindowWithSaveFilePicker;
  if (typeof win.showSaveFilePicker === 'function') {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'JSON 文件', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json); await writable.close(); return;
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
    }
  }
  fallbackDownload(blob, name);
}

async function exportComponentJson(component: EmailComponent) {
  await saveWithPicker(JSON.stringify(component, null, 2), defaultFileName(component));
}

async function exportCanvasJson(components: EmailComponent[], templateConfig: unknown) {
  const payload = { templateConfig, components };
  await saveWithPicker(JSON.stringify(payload, null, 2), `template-${Date.now()}.json`);
}

// ===== Export icon =====

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v8M5 7l3 3 3-3" />
    <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" />
  </svg>
);

// ===== Canvas Config Editor =====

type CanvasTabId = 'style' | 'advanced';

function CanvasConfigEditor() {
  const canvasConfig = useEmailStore((s) => s.templateConfig);
  const updateCanvasConfig = useEmailStore((s) => s.updateTemplateConfig);
  const [activeTab, setActiveTab] = useState<CanvasTabId>('style');

  const canvasTabs: { id: CanvasTabId; label: string }[] = [
    { id: 'style', label: '样式' },
    { id: 'advanced', label: '高级' },
  ];

  return (
    <>
      <div className={styles.tabBar}>
        {canvasTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={styles.tabBtn}
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={styles.tabDot} />
            {tab.label}
          </button>
        ))}
      </div>

      <div key={activeTab} className={styles.tabContent}>
        {activeTab === 'style' && (
          <div className={styles.configSection}>
            <CanvasStyleEditor canvasConfig={canvasConfig} onChange={updateCanvasConfig} />
          </div>
        )}

        {activeTab === 'advanced' && (
          <div className={styles.configSection}>
            <CanvasSpecificEditor canvasConfig={canvasConfig} onChange={updateCanvasConfig} />
          </div>
        )}
      </div>
    </>
  );
}

// ===== 判断组件是否有内容配置段 =====

const showContentTabByType: Partial<Record<EmailComponent['type'], true>> = {
  text: true,
  image: true,
  button: true,
  icon: true,
};

function hasContentSection(type: EmailComponent['type']): boolean {
  return !!showContentTabByType[type];
}

type TabId = 'content' | 'style' | 'container' | 'logic';

// ===== Component Config Editor =====

function ComponentConfigEditor() {
  const selectedId = useEmailStore((s) => s.selectedId);
  const rawComponent = useEmailStore((s) =>
    s.selectedId ? s.findComponent(s.selectedId) : null
  );
  const renderingRules = useEmailStore((s) => s.renderingRules);
  const updateComponentRules = useEmailStore((s) => s.updateComponentRules);
  // 將 Layer 4 規則合併到組件，讓右側面板編輯器可以讀取動態字段
  const component = useMemo(() => {
    if (!rawComponent) return null;
    const rules = renderingRules[rawComponent.id];
    if (!rules) return rawComponent;
    return { ...rawComponent, ...rules };
  }, [rawComponent, renderingRules]);
  const updateComponentProps = useEmailStore((s) => s.updateComponentProps);
  const updateComponentWrapperStyle = useEmailStore((s) => s.updateComponentWrapperStyle);
  const switchToNativeMode = useEmailStore((s) => s.switchToNativeMode);
  const rightPanelFocusHint = useEmailStore((s) => s.rightPanelFocusHint);
  const clearRightPanelFocusHint = useEmailStore((s) => s.clearRightPanelFocusHint);

  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);
  const [variableBindingPropPath, setVariableBindingPropPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('content');
  const [tabBarScrolled, setTabBarScrolled] = useState(false);
  const customVariables = useEmailStore((s) => s.customVariables);
  const tabBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tabBarRef.current?.closest('[data-panel-inner]') as HTMLElement | null;
    if (!el) return;
    const onScroll = () => setTabBarScrolled(el.scrollTop > 4);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // 左側「邏輯」聚焦時自動切到邏輯 Tab
  useEffect(() => {
    const section = rightPanelFocusHint?.section;
    if (section === 'visibility' || section === 'branches' || section === 'loop') setActiveTab('logic');
  }, [rightPanelFocusHint?.section, rightPanelFocusHint?.ts]);

  /* 细粒度订阅：仅计算当前组件所处的循环祖先 variableKey（string | null），
   * 避免订阅整个 components 树——只有「选中组件的循环祖先关系」真正变化时才触发重渲染 */
  const loopVariableKey = useEmailStore(
    useCallback((s) => {
      if (!s.selectedId) return null;
      // 先合併 Layer 4 規則再查找循環祖先
      const mergedComponents = mergeRulesIntoComponents(s.components, s.renderingRules);
      const loopAncestor = findNearestLoopAncestor(s.selectedId, mergedComponents);
      return (loopAncestor as { loopBinding?: { variableKey?: string } } | null)?.loopBinding?.variableKey ?? null;
    }, [])
  );

  const loopContext = useMemo(() => {
    if (!loopVariableKey) return undefined;
    const arrayVar = customVariables.find((v) => v.key === loopVariableKey);
    if (!arrayVar?.itemSchema?.length) return undefined;
    return {
      variableKey: loopVariableKey,
      itemSchema: arrayVar.itemSchema,
    };
  }, [loopVariableKey, customVariables]);

  if (!selectedId || !component) return null;

  const isBusinessMode = component.compositeInstance?.mode === 'business';

  const handlePropsChange = (updates: Record<string, unknown>) => updateComponentProps(component.id, updates);
  const handleWrapperChange = (updates: Parameters<typeof updateComponentWrapperStyle>[1]) =>
    updateComponentWrapperStyle(component.id, updates);
  const handleSwitchToNative = () => { switchToNativeMode(component.id); setShowSwitchConfirm(false); };
  const handleBindVariable = (propPath: string) => setVariableBindingPropPath(propPath);
  const handleUnbindVariable = (propPath: string) => {
    const existing = renderingRules[component.id]?.variableBindings ?? {};
    const next = { ...existing };
    delete next[propPath];
    updateComponentRules(component.id, { variableBindings: Object.keys(next).length ? next : undefined });
  };

  // ===== 业务模式 =====
  if (isBusinessMode) {
    return (
      <>
        <div className={styles.switchNativeBar}>
          <button type="button" className={styles.switchNativeBtn} onClick={() => setShowSwitchConfirm(true)}>
            切换到原生模式
          </button>
          <span className={styles.switchNativeHint}>切换后无法恢复业务模式</span>
        </div>
        <div className={styles.configSection} style={{ borderBottom: 'none' }}>
          <BusinessFormEditor component={component} />
        </div>
        <div className={styles.collapsibleBlockWrap}>
          <VisibilityConditionEditor
            component={component}
            focusSignal={rightPanelFocusHint?.section === 'visibility' ? rightPanelFocusHint.ts : undefined}
            onFocusConsumed={clearRightPanelFocusHint}
          />
          <ConditionalBranchesEditor
            component={component}
            focusSignal={rightPanelFocusHint?.section === 'branches' ? rightPanelFocusHint.ts : undefined}
            onFocusConsumed={clearRightPanelFocusHint}
          />
        </div>
        <Modal open={showSwitchConfirm} title="切换到原生模式" onClose={() => setShowSwitchConfirm(false)}
          footer={<ModalFooter onCancel={() => setShowSwitchConfirm(false)} onConfirm={handleSwitchToNative} confirmText="确认切换" />}>
          <ConfirmText>切换后将展示所有原生配置项，业务封装表单将被移除且无法恢复。确定要切换吗？</ConfirmText>
        </Modal>
      </>
    );
  }

  // ===== 原生模式 =====
  const imageProps = component.type === 'image' && isImageProps(component.props) ? component.props : null;
  const hasLayoutModeConfig = !!(imageProps && imageProps.layoutMode === true);
  const showContentTab = hasContentSection(component.type);
  const componentVariableBindings = renderingRules[component.id]?.variableBindings;
  const effectiveTab: TabId =
    !showContentTab && activeTab === 'content' ? 'style' : activeTab;
  const tabDefinitions: Array<{ id: TabId; label: string; title?: string; hidden?: boolean }> = [
    { id: 'content', label: '内容', hidden: !showContentTab },
    { id: 'style', label: '样式' },
    { id: 'container', label: '布局', title: '控制组件的尺寸、间距、边框等外部样式' },
    { id: 'logic', label: '逻辑', title: '显示条件、条件分支、循环绑定' },
  ];

  const contentEditorsByType: Partial<Record<EmailComponent['type'], () => ReactNode>> = {
    text: () => isTextProps(component.props) ? (
      <TextContentSection
        props={component.props}
        onChange={handlePropsChange}
        customVariables={customVariables}
        loopContext={loopContext}
      />
    ) : null,
    image: () => isImageProps(component.props) ? (
      <ImageContentSection
        props={component.props}
        onChange={handlePropsChange}
        variableBindings={componentVariableBindings}
        onBindVariable={handleBindVariable}
        onUnbindVariable={handleUnbindVariable}
        getVariableLabel={(key) => getVariableLabel(key, customVariables)}
      />
    ) : null,
    button: () => isButtonProps(component.props) ? (
      <ButtonContentSection
        props={component.props}
        onChange={handlePropsChange}
        variableBindings={componentVariableBindings}
        onBindVariable={handleBindVariable}
        onUnbindVariable={handleUnbindVariable}
        getVariableLabel={(key) => getVariableLabel(key, customVariables)}
      />
    ) : null,
    icon: () => isIconProps(component.props) ? (
      <IconContentSection
        props={component.props}
        onChange={handlePropsChange}
        variableBindings={componentVariableBindings}
        onBindVariable={handleBindVariable}
        onUnbindVariable={handleUnbindVariable}
        getVariableLabel={(key) => getVariableLabel(key, customVariables)}
      />
    ) : null,
  };

  const styleEditorsByType: Partial<Record<EmailComponent['type'], () => ReactNode>> = {
    text: () => isTextProps(component.props) ? <TextStyleSection props={component.props} onChange={handlePropsChange} /> : null,
    image: () => isImageProps(component.props) ? (
      <>
        <ImageStyleSection props={component.props} onChange={handlePropsChange} />
        {hasLayoutModeConfig && (
          <AlignPairSection
            title="布局内对齐"
            className={editorStyles.sectionWithBlockSpacingTight}
            horizontal={(imageProps?.layoutContentAlign ?? component.wrapperStyle.contentAlign).horizontal}
            vertical={(imageProps?.layoutContentAlign ?? component.wrapperStyle.contentAlign).vertical}
            onHorizontalChange={(horizontal) =>
              handlePropsChange({
                layoutContentAlign: {
                  ...(imageProps?.layoutContentAlign ?? component.wrapperStyle.contentAlign),
                  horizontal,
                },
              })
            }
            onVerticalChange={(vertical) =>
              handlePropsChange({
                layoutContentAlign: {
                  ...(imageProps?.layoutContentAlign ?? component.wrapperStyle.contentAlign),
                  vertical,
                },
              })
            }
          >
            <SpacingField
              label="内边距"
              value={imageProps?.layoutPadding ?? { mode: 'unified', unified: '0' }}
              onChange={(layoutPadding) => handlePropsChange({ layoutPadding })}
              placeholder="0"
            />
          </AlignPairSection>
        )}
      </>
    ) : null,
    button: () => isButtonProps(component.props) ? <ButtonStyleSection props={component.props} onChange={handlePropsChange} /> : null,
    icon: () => isIconProps(component.props) ? <IconStyleSection props={component.props} onChange={handlePropsChange} /> : null,
    divider: () => isDividerProps(component.props) ? <DividerPropsEditor props={component.props} onChange={handlePropsChange} /> : null,
    layout: () => isLayoutProps(component.props) ? <LayoutPropsEditor props={component.props} onChange={handlePropsChange} /> : null,
    grid: () => isGridProps(component.props) ? <GridPropsEditor props={component.props} onChange={handlePropsChange} /> : null,
  };

  const extraLogicSectionByType: Partial<Record<EmailComponent['type'], () => ReactNode>> = {
    layout: () => isLayoutProps(component.props) ? (
      <div className={editorStyles.sectionWithBlockSpacing}>
        <LoopBindingEditor
          component={component}
          focusSignal={rightPanelFocusHint?.section === 'loop' ? rightPanelFocusHint.ts : undefined}
          onFocusConsumed={clearRightPanelFocusHint}
          variant="panel"
        />
      </div>
    ) : null,
  };

  return (
    <>
      {/* 变量选择器弹窗 */}
      {variableBindingPropPath && (
        <VariableSelector
          open={!!variableBindingPropPath}
          onClose={() => setVariableBindingPropPath(null)}
          contentType={getVariableBindingTargets(component.type).find((t) => t.propPath === variableBindingPropPath)?.contentType ?? 'text'}
          customVariables={customVariables}
          loopContext={loopContext}
          onSelect={(key) => {
            const existing = renderingRules[component.id]?.variableBindings ?? {};
            const next = { ...existing, [variableBindingPropPath]: key };
            updateComponentRules(component.id, { variableBindings: next });
            setVariableBindingPropPath(null);
          }}
        />
      )}

      {/* Tab 栏 */}
      <div ref={tabBarRef} className={styles.tabBar} data-scrolled={tabBarScrolled}>
        {tabDefinitions.filter((tab) => !tab.hidden).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={styles.tabBtn}
            data-active={effectiveTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.title}
          >
            <span className={styles.tabDot} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div key={effectiveTab} className={styles.tabContent}>

        {/* 内容 Tab */}
        {effectiveTab === 'content' && showContentTab && (
          <div className={styles.configSection}>
            {contentEditorsByType[component.type]?.() ?? null}
          </div>
        )}

        {/* 样式 Tab */}
        {effectiveTab === 'style' && (
          <div className={styles.configSection}>
            <AlignPairSection
              horizontal={component.wrapperStyle.contentAlign.horizontal}
              vertical={component.wrapperStyle.contentAlign.vertical}
              onHorizontalChange={(horizontal) =>
                handleWrapperChange({ contentAlign: { ...component.wrapperStyle.contentAlign, horizontal } })}
              onVerticalChange={(vertical) =>
                handleWrapperChange({ contentAlign: { ...component.wrapperStyle.contentAlign, vertical } })}
              fullWidth
            />

            {/* 与对齐、字體、邊框&背景 等区块间距统一：8px + 顶部分隔线 */}
            <div className={editorStyles.sectionWithBlockSpacingTight}>
              {styleEditorsByType[component.type]?.() ?? null}
              {/* 边框 & 背景：视觉样式统一放在样式 Tab */}
              <WrapperBorderBackgroundSection wrapperStyle={component.wrapperStyle} onChange={handleWrapperChange} />
            </div>
          </div>
        )}

        {/* 容器 Tab */}
        {effectiveTab === 'container' && (
          <div className={styles.configSection}>
            <WrapperStyleEditor wrapperStyle={component.wrapperStyle} onChange={handleWrapperChange} />
          </div>
        )}

        {/* 逻辑 Tab：显示条件、条件分支、循环绑定 */}
        {effectiveTab === 'logic' && (
          <div className={styles.configSection}>
            <VisibilityConditionEditor
              component={component}
              focusSignal={rightPanelFocusHint?.section === 'visibility' ? rightPanelFocusHint.ts : undefined}
              onFocusConsumed={clearRightPanelFocusHint}
              variant="panel"
            />
            <div className={editorStyles.sectionWithBlockSpacing}>
              <ConditionalBranchesEditor
                component={component}
                focusSignal={rightPanelFocusHint?.section === 'branches' ? rightPanelFocusHint.ts : undefined}
                onFocusConsumed={clearRightPanelFocusHint}
                variant="panel"
              />
            </div>
            {extraLogicSectionByType[component.type]?.() ?? null}
          </div>
        )}
      </div>

      {/* 切换原生模式确认弹窗 */}
      <Modal open={showSwitchConfirm} title="切换到原生模式" onClose={() => setShowSwitchConfirm(false)}
        footer={<ModalFooter onCancel={() => setShowSwitchConfirm(false)} onConfirm={handleSwitchToNative} confirmText="确认切换" />}>
        <ConfirmText>切换后将展示所有原生配置项，业务封装表单将被移除且无法恢复。确定要切换吗？</ConfirmText>
      </Modal>
    </>
  );
}

// ===== Main Config Panel =====

export default function ConfigPanel() {
  const selectedId = useEmailStore((s) => s.selectedId);
  const components = useEmailStore((s) => s.components);
  const templateConfig = useEmailStore((s) => s.templateConfig);
  const findComponent = useEmailStore((s) => s.findComponent);
  const updateComponent = useEmailStore((s) => s.updateComponent);
  const selectedComponent = selectedId ? findComponent(selectedId, components) : null;

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const panelInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditingName(false);
    setDraftName('');
  }, [selectedId]);

  const handleTitleClick = () => {
    if (!selectedComponent) return;
    setDraftName(selectedComponent.displayName ?? '');
    setEditingName(true);
  };

  const commitName = useCallback(() => {
    if (!selectedComponent) return;
    const trimmed = draftName.trim();
    updateComponent(selectedComponent.id, { displayName: trimmed || undefined });
    setEditingName(false);
  }, [selectedComponent, draftName, updateComponent]);

  const cancelName = () => setEditingName(false);

  const handleExportComponentJson = useCallback(() => {
    if (selectedComponent) exportComponentJson(selectedComponent);
  }, [selectedComponent]);

  const handleExportCanvasJson = useCallback(() => {
    exportCanvasJson(components, templateConfig);
  }, [components, templateConfig]);

  const isNativeComposite = selectedComponent?.compositeInstance?.mode === 'native';

  return (
    <aside className={styles.panel}>
      {/* 顶部固定标题行：画布模式 / 组件模式分别渲染 */}
      <div className={styles.panelTitleRow}>
        {selectedId && selectedComponent ? (
          // 组件模式：图标 + 类型名/可编辑名 + 徽标
          <>
            <span className={styles.componentIcon}>
              {TYPE_ICONS[selectedComponent.type]}
            </span>
            {editingName ? (
              <input
                ref={titleInputRef}
                autoFocus
                className={styles.titleEditInput}
                value={draftName}
                placeholder={TYPE_LABELS[selectedComponent.type]}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); commitName(); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelName(); }
                }}
              />
            ) : (
              <h2
                className={styles.panelTitleComponent}
                data-named={!!selectedComponent.displayName}
                onClick={handleTitleClick}
                title="单击修改组件名称"
              >
                {selectedComponent.displayName || TYPE_LABELS[selectedComponent.type]}
              </h2>
            )}
            {isNativeComposite && (
              <span className={styles.compositeTag} data-mode="native">原生</span>
            )}
            <button type="button" className={styles.exportJsonBtn} onClick={handleExportComponentJson} title="导出组件 JSON（含子级）">
              <ExportIcon />
            </button>
          </>
        ) : (
          // 画布模式
          <>
            <span className={styles.canvasIcon}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="1" width="14" height="14" rx="2.5" />
                <path d="M1 5.5h14" />
              </svg>
            </span>
            <h2 className={styles.panelTitle}>画布配置</h2>
            <button type="button" className={styles.exportJsonBtn} onClick={handleExportCanvasJson} title="导出整个模板树 JSON">
              <ExportIcon />
            </button>
          </>
        )}
      </div>

      <div className={styles.panelInner} ref={panelInnerRef} data-panel-inner>
        {selectedId ? <ComponentConfigEditor key={selectedId} /> : <CanvasConfigEditor />}
      </div>
    </aside>
  );
}
