import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { serverGetTemplate } from '@shared/api/serverApi';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import type { SavedEmailTemplate } from '@shared/types/emailTemplate';
import type { EmailComponent, TemplateConfig } from '@shared/types/email';
import { ToastContainer } from '@shared/ui/Toast';
import { prepareEmailHtml } from '@shared/utils/prepareEmailHtml';
import ReadOnlyEmailRenderer from '@features/email-editor/components/ReadOnlyEmailRenderer/ReadOnlyEmailRenderer';
import { resolveVariableValues } from '@shared/utils/resolveVariableValues';
import { expandLoopBlocksForExport, flattenArrayPreviewData } from '@shared/utils/expandLoopBlocks';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import styles from './TemplatePreviewPage.module.css';

interface TemplateWithKeys extends SavedEmailTemplate {
  requiredVariableKeys?: string[];
}

const TYPE_LABELS: Record<string, string> = { text: '文本', image: '图片', link: '链接' };
const TYPE_PLACEHOLDERS: Record<string, string> = {
  text: '请输入文字',
  image: 'https://example.com/image.jpg',
  link: 'https://example.com',
};

function inferType(key: string): string {
  if (key.toLowerCase().includes('url') || key.toLowerCase().includes('link')) return 'link';
  if (key.toLowerCase().includes('image') || key.toLowerCase().includes('logo')) return 'image';
  return 'text';
}

export default function TemplatePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rendererRef = useRef<HTMLDivElement>(null);

  const [template, setTemplate] = useState<TemplateWithKeys | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [sampleData, setSampleData] = useState<Record<string, string>>({});
  const [arrayPreviewData, setArrayPreviewData] = useState<Record<string, Record<string, string>[]>>({});
  const [resolvedComponents, setResolvedComponents] = useState<EmailComponent[]>([]);
  const [resolvedConfig, setResolvedConfig] = useState<TemplateConfig | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    serverGetTemplate(id)
      .then((t) => {
        const tmpl = t as TemplateWithKeys;
        setTemplate(tmpl);
        if (tmpl) {
          const keys = tmpl.requiredVariableKeys ?? [];
          const init: Record<string, string> = {};
          keys.forEach((k) => { init[k] = ''; });
          setSampleData(init);
          setResolvedComponents(tmpl.components ?? []);
          setResolvedConfig(tmpl.config ?? null);
        }
      })
      .catch((err) => toastLoadError(err, '模板加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  /** 從 ReadOnlyEmailRenderer DOM 產生 HTML 並寫入 iframe，寫入後自動調整高度 */
  const refreshIframe = useCallback(() => {
    const el = rendererRef.current;
    if (!el || !resolvedConfig) return;
    const html = prepareEmailHtml(el, {
      outerBackgroundColor: resolvedConfig.outerBackgroundColor,
    });
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        // 等 DOM 完成渲染再量高度，避免截斷
        requestAnimationFrame(() => {
          if (iframeRef.current?.contentDocument?.body) {
            const h = iframeRef.current.contentDocument.body.scrollHeight;
            iframeRef.current.style.height = `${Math.max(h + 40, 400)}px`;
          }
        });
      }
    }
  }, [resolvedConfig]);

  // 每次 resolvedComponents/resolvedConfig 更新後，等 React 渲染完畢再刷新 iframe
  useEffect(() => {
    if (resolvedComponents.length === 0 || !resolvedConfig) return;
    // requestAnimationFrame 確保 DOM 已更新
    const rafId = requestAnimationFrame(() => {
      refreshIframe();
    });
    return () => cancelAnimationFrame(rafId);
  }, [resolvedComponents, resolvedConfig, refreshIframe]);

  const handleApply = () => {
    if (!template) return;
    // Step 1: 展开循环区块（export 模式，每个 loop 区块展开 N 次）
    const expanded = expandLoopBlocksForExport(template.components ?? [], arrayPreviewData);
    // Step 2: 合并标量预览数据 + 数组扁平化键
    const flatData = { ...sampleData, ...flattenArrayPreviewData(arrayPreviewData) };
    const applied = resolveVariableValues(expanded, flatData);
    setResolvedComponents(applied);
    toast('已应用样例数据', 'success');
  };

  const handleReset = () => {
    const keys = Object.keys(sampleData);
    const empty: Record<string, string> = {};
    keys.forEach((k) => { empty[k] = ''; });
    setSampleData(empty);
    setArrayPreviewData({});
    if (template) {
      setResolvedComponents(template.components ?? []);
    }
  };

  const arrayVars: CustomVariableDefinition[] = (template?.customVariables ?? []).filter(
    (v) => v.contentType === 'array'
  );

  const copyHtml = useCallback(async () => {
    const el = rendererRef.current;
    if (!el || !resolvedConfig) return;
    setCopying(true);
    try {
      const html = prepareEmailHtml(el, {
        outerBackgroundColor: resolvedConfig.outerBackgroundColor,
      });
      await navigator.clipboard.writeText(html);
      toast('已复制 HTML', 'success');
    } catch {
      toast('复制失败', 'error');
    } finally {
      setTimeout(() => setCopying(false), 1500);
    }
  }, [resolvedConfig]);

  const variableKeys = template ? ((template as TemplateWithKeys).requiredVariableKeys ?? []) : [];

  return (
    <div className={styles.page}>
      <ToastContainer />

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>← 返回</button>
          <span className={styles.templateName}>{template?.title ?? '加载中…'}</span>
        </div>

        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={styles.copyBtn}
            onClick={copyHtml}
            disabled={!resolvedConfig || copying}
          >
            {copying ? '已复制！' : '复制 HTML'}
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {/* Preview iframe */}
        <div className={styles.previewArea}>
          {loading ? (
            <div className={styles.loadingMsg} aria-live="polite">加载中…</div>
          ) : template ? (
            <div className={styles.iframeWrapper}>
              <iframe
                ref={iframeRef}
                title="模板预览"
                className={styles.iframe}
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className={styles.loadingMsg}>找不到模板</div>
          )}
        </div>

        {/* Sample data panel */}
        {template && (
          <div className={`${styles.samplePanel}${panelOpen ? '' : ` ${styles.samplePanelClosed}`}`}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>填写样例数据</span>
              <button className={styles.panelToggle} onClick={() => setPanelOpen(!panelOpen)}>
                {panelOpen ? '收起 ›' : '‹ 展开'}
              </button>
            </div>

            {panelOpen && (
              <div className={styles.panelBody}>
                {variableKeys.length === 0 && arrayVars.length === 0 ? (
                  <p className={styles.noVarsMsg}>此模板没有绑定变量，无需填写样例数据。</p>
                ) : (
                  <>
                    <p className={styles.panelHint}>填入样例值后点「应用」，预览将以填入值渲染。</p>

                    {/* 标量变量 */}
                    {variableKeys.length > 0 && (
                      <div className={styles.variableList}>
                        {variableKeys.map((key) => {
                          const type = inferType(key);
                          return (
                            <label key={key} className={styles.varField}>
                              <div className={styles.varFieldHeader}>
                                <code className={styles.varKey}>{key}</code>
                                <span className={styles.varType}>{TYPE_LABELS[type]}</span>
                              </div>
                              <input
                                type={type === 'image' || type === 'link' ? 'url' : 'text'}
                                className={styles.varInput}
                                placeholder={TYPE_PLACEHOLDERS[type] ?? ''}
                                value={sampleData[key] ?? ''}
                                onChange={(e) => setSampleData((prev) => ({ ...prev, [key]: e.target.value }))}
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* 列表变量（array 类型） */}
                    {arrayVars.map((arrayVar) => {
                      const schema = arrayVar.itemSchema ?? [];
                      const items = arrayPreviewData[arrayVar.key] ?? [];

                      const addItem = () => {
                        const empty: Record<string, string> = {};
                        schema.forEach((f) => { empty[f.key] = ''; });
                        setArrayPreviewData((prev) => ({
                          ...prev,
                          [arrayVar.key]: [...(prev[arrayVar.key] ?? []), empty],
                        }));
                      };

                      const removeItem = (idx: number) => {
                        setArrayPreviewData((prev) => ({
                          ...prev,
                          [arrayVar.key]: (prev[arrayVar.key] ?? []).filter((_, i) => i !== idx),
                        }));
                      };

                      const updateField = (idx: number, fieldKey: string, value: string) => {
                        setArrayPreviewData((prev) => {
                          const current = prev[arrayVar.key] ?? [];
                          return {
                            ...prev,
                            [arrayVar.key]: current.map((item, i) =>
                              i === idx ? { ...item, [fieldKey]: value } : item
                            ),
                          };
                        });
                      };

                      return (
                        <div key={arrayVar.key} className={styles.arrayVarBlock}>
                          <div className={styles.arrayVarBlockHeader}>
                            <code className={styles.varKey}>{arrayVar.key}</code>
                            <span className={styles.varType}>列表（{items.length} 项）</span>
                          </div>
                          {items.map((item, idx) => (
                            <div key={idx} className={styles.arrayItemBlock}>
                              <div className={styles.arrayItemBlockHeader}>
                                <span>第 {idx + 1} 项</span>
                                <button type="button" className={styles.removeItemBtn} onClick={() => removeItem(idx)}>×</button>
                              </div>
                              {schema.map((field) => (
                                <label key={field.key} className={styles.varField}>
                                  <div className={styles.varFieldHeader}>
                                    <span className={styles.varKey}>{field.label}</span>
                                  </div>
                                  <input
                                    type={field.contentType === 'text' ? 'text' : 'url'}
                                    className={styles.varInput}
                                    placeholder={field.contentType === 'image' ? 'https://...' : field.contentType === 'link' ? 'https://...' : ''}
                                    value={item[field.key] ?? ''}
                                    onChange={(e) => updateField(idx, field.key, e.target.value)}
                                  />
                                </label>
                              ))}
                            </div>
                          ))}
                          <button type="button" className={styles.addItemBtn} onClick={addItem}>
                            + 添加一项
                          </button>
                        </div>
                      );
                    })}

                    <div className={styles.panelActions}>
                      <button className={styles.applyBtn} onClick={handleApply}>
                        ✓ 应用
                      </button>
                      <button className={styles.resetBtn} onClick={handleReset}>重置</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 隱藏的 ReadOnlyEmailRenderer，供 prepareEmailHtml 讀取 DOM */}
      {resolvedConfig && resolvedComponents.length > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            top: 0,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <ReadOnlyEmailRenderer
            ref={rendererRef}
            components={resolvedComponents}
            templateConfig={resolvedConfig}
          />
        </div>
      )}
    </div>
  );
}
