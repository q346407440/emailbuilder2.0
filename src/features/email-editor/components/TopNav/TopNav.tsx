import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useCanvasToolbarStore } from '@shared/store/useCanvasToolbarStore';
import type { SavedStatus } from '@shared/store/useCanvasToolbarStore';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { collectVariableKeys } from '@shared/utils/collectVariableKeys';
import { VARIABLE_SCHEMA_MAP, getVariableLabel } from '@shared/constants/variableSchema';
import styles from './TopNav.module.css';

function SavedStatusDot({ status }: { status: SavedStatus }) {
  if (status === 'saved') return null;
  return (
    <span className={`${styles.savedStatus} ${styles[`savedStatus_${status}`]}`}>
      {status === 'saving' ? (
        <>
          <svg className={styles.spinner} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          保存中…
        </>
      ) : (
        <>
          <span className={styles.statusDot} />
          未保存
        </>
      )}
    </span>
  );
}

export default function TopNav() {
  const toolbarActions = useCanvasToolbarStore((s) => s.actions);
  const editorActions = useCanvasToolbarStore((s) => s.editorActions);
  const saveAndReturnLoading = useCanvasToolbarStore((s) => s.saveAndReturnLoading);
  const savedStatus = useCanvasToolbarStore((s) => s.savedStatus);

  const components = useEmailStore((s) => s.components);
  const renderingRules = useEmailStore((s) => s.renderingRules);

  // inline 改名状态
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const templateName = editorActions?.templateName;
  const canRename = !!editorActions?.onRenameTemplate;

  const startRename = useCallback(() => {
    if (!canRename) return;
    setRenameValue(templateName ?? '');
    setIsRenaming(true);
  }, [canRename, templateName]);

  const commitRename = useCallback(async () => {
    setIsRenaming(false);
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === templateName) return;
    await editorActions?.onRenameTemplate?.(trimmed);
  }, [renameValue, templateName, editorActions]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue('');
  }, []);

  useEffect(() => {
    if (isRenaming) renameInputRef.current?.select();
  }, [isRenaming]);

  // 画布预览模式（预览值 / 变量标签），预览值在左侧「变量」面板中填写
  const previewData = useEmailStore((s) => s.previewData);
  const canvasPreviewMode = useEmailStore((s) => s.canvasPreviewMode);
  const setCanvasPreviewMode = useEmailStore((s) => s.setCanvasPreviewMode);
  const customVariables = useEmailStore((s) => s.customVariables);

  const usedVariableKeys = useMemo(() => collectVariableKeys(components, renderingRules), [components, renderingRules]);

  // 构建自定义变量 key -> 定义 的映射
  const customVarMap = useMemo(
    () => new Map(customVariables.map((v) => [v.key, v])),
    [customVariables],
  );

  // 分为标量变量和列表变量，分别处理
  const { scalarVariables, arrayVariableKeys } = useMemo(() => {
    const scalar: Array<{ key: string; label: string; contentType: 'text' | 'image' | 'link' }> = [];
    const array: string[] = [];
    for (const key of usedVariableKeys) {
      const schema = VARIABLE_SCHEMA_MAP.get(key);
      const customDef = customVarMap.get(key);
      const contentType = schema?.contentType ?? customDef?.contentType ?? 'text';
      if (contentType === 'array') {
        array.push(key);
      } else {
        const label = schema?.label ?? customDef?.label ?? getVariableLabel(key) ?? key;
        scalar.push({ key, label, contentType: contentType as 'text' | 'image' | 'link' });
      }
    }
    return { scalarVariables: scalar, arrayVariableKeys: array };
  }, [usedVariableKeys, customVarMap]);

  const filledPreviewCount = useMemo(
    () => scalarVariables.filter(({ key }) => (previewData[key] ?? '').trim() !== '').length,
    [scalarVariables, previewData],
  );

  return (
    <>
      <header className={styles.nav}>
        {/* 左区：返回 + Logo + 模板身份 */}
        <div className={styles.left}>
          {editorActions ? (
            <button
              type="button"
              className={styles.backBtn}
              onClick={editorActions.onBack}
              title="返回上一页"
              aria-label="返回"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          ) : null}
          <img src="/favicon.svg" alt="" className={styles.logo} />

          <div className={styles.docInfo}>
            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                className={styles.renameInput}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void commitRename(); }
                  if (e.key === 'Escape') cancelRename();
                }}
                maxLength={80}
              />
            ) : (
              <button
                type="button"
                className={`${styles.docName} ${canRename ? styles.docNameEditable : ''}`}
                onClick={startRename}
                title={canRename ? '点击重命名' : undefined}
              >
                <span className={styles.docNameText}>
                  {templateName ?? '未命名模板'}
                </span>
                {canRename && (
                  <svg className={styles.docNamePen} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                )}
              </button>
            )}
            <SavedStatusDot status={savedStatus} />
          </div>
        </div>

        {/* 画布预览模式切换（视觉居中） */}
        {toolbarActions && (scalarVariables.length > 0 || arrayVariableKeys.length > 0) && (
          <div className={styles.center}>
            <div className={styles.previewModeSegment}>
              {/* 预览数据模式：用左侧「变量」面板中填写的预览值渲染画布 */}
              <button
                type="button"
                className={`${styles.previewModeBtn} ${canvasPreviewMode === 'data' ? styles.previewModeBtnActive : ''}`}
                onClick={() => setCanvasPreviewMode('data')}
                title="预览数据：用左侧变量面板中填写的预览值渲染画布"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span>预览值</span>
                {filledPreviewCount > 0 && canvasPreviewMode === 'data' && (
                  <span className={styles.varBadge}>{filledPreviewCount}</span>
                )}
              </button>

              {/* 变量标签模式：显示 {{key}} chip */}
              <button
                type="button"
                className={`${styles.previewModeBtn} ${canvasPreviewMode === 'variable' ? styles.previewModeBtnActive : ''}`}
                onClick={() => setCanvasPreviewMode(canvasPreviewMode === 'variable' ? 'data' : 'variable')}
                title="变量标签：在画布中显示变量绑定位置"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                <span>变量</span>
              </button>
            </div>
          </div>
        )}

        {/* 操作区 */}
        {toolbarActions ? (
          <div className={styles.actions}>
            <div className={styles.secondaryActions}>
              <button
                type="button"
                className={`${styles.iconBtn} ${toolbarActions.copyDone ? styles.iconBtnDone : ''}`}
                onClick={toolbarActions.onCopyImage}
                disabled={toolbarActions.copying}
                title="复制预览图片"
              >
                {toolbarActions.copying ? (
                  <svg className={styles.spinner} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                ) : toolbarActions.copyDone ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
              </button>

            </div>

            <div className={styles.divider} />

            {editorActions?.hasReturnTo && editorActions.onSaveAndReturn ? (
              <button
                type="button"
                className={styles.saveReturnBtn}
                onClick={editorActions.onSaveAndReturn}
                disabled={saveAndReturnLoading}
              >
                {saveAndReturnLoading && (
                  <svg className={styles.spinner} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                  </svg>
                )}
                <span>{saveAndReturnLoading ? '保存中…' : '保存并返回'}</span>
              </button>
            ) : toolbarActions.onSaveDraft ? (
              <>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={toolbarActions.onSaveDraft}
                >
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2z" />
                    <path d="M7 3v14M13 7h4" />
                  </svg>
                  <span>保存草稿</span>
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={toolbarActions.onSaveTemplate}
                >
                  <span>保存为模板</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.saveBtn}
                onClick={toolbarActions.onSaveTemplate}
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2z" />
                  <path d="M7 3v14M13 7h4" />
                </svg>
                <span>保存模板</span>
              </button>
            )}

            <button
              type="button"
              className={styles.sendBtn}
              onClick={toolbarActions.onSendEmail}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>发测试邮件</span>
            </button>
          </div>
        ) : null}
      </header>
    </>
  );
}
