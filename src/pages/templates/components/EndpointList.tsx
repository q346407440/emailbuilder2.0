import { useState, useEffect, useCallback } from 'react';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import type { TemplateEndpoint } from '@shared/api/serverApi';
import {
  serverListEndpoints,
  serverCreateEndpoint,
  serverUpdateEndpoint,
  serverDeleteEndpoint,
  serverEndpointRender,
  serverGetShoplazzaIntegrations,
  type ShoplazzaIntegrationStatus,
} from '@shared/api/serverApi';
import type { SchemaField } from '@shared/utils/parseJsonSchema';
import { toast } from '@shared/store/useToastStore';
import EndpointEditor from './EndpointEditor';
import styles from './EndpointList.module.css';

interface Props {
  templateId: string;
  templateVariables: CustomVariableDefinition[];
}

type ViewState =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; endpoint: TemplateEndpoint }
  | { mode: 'test'; endpoint: TemplateEndpoint };

function formatDate(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function countMappedFields(mapping: Record<string, string>): number {
  return Object.values(mapping).filter(Boolean).length;
}

export default function EndpointList({ templateId, templateVariables }: Props) {
  const [endpoints, setEndpoints] = useState<TemplateEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>({ mode: 'list' });
  const [shops, setShops] = useState<ShoplazzaIntegrationStatus[]>([]);
  const [testShopId, setTestShopId] = useState('');
  const [testJsonText, setTestJsonText] = useState('{}');
  const [testHtml, setTestHtml] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await serverListEndpoints(templateId);
      setEndpoints(list);
    } catch (err) {
      toast(`加载接入点失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    serverGetShoplazzaIntegrations()
      .then((res) => setShops(res.shops))
      .catch(() => {});
  }, []);

  const handleCreate = async (data: {
    name: string;
    sourceSchema: SchemaField[];
    fieldMapping: Record<string, string>;
  }) => {
    try {
      await serverCreateEndpoint(templateId, {
        name: data.name,
        sourceSchema: data.sourceSchema,
        fieldMapping: data.fieldMapping,
      });
      toast('接入点已创建', 'success');
      setView({ mode: 'list' });
      void load();
    } catch (err) {
      toast(`创建失败：${err instanceof Error ? err.message : ''}`, 'error');
      throw err;
    }
  };

  const handleUpdate = async (
    endpointId: string,
    data: { name: string; sourceSchema: SchemaField[]; fieldMapping: Record<string, string> }
  ) => {
    try {
      await serverUpdateEndpoint(templateId, endpointId, {
        name: data.name,
        sourceSchema: data.sourceSchema,
        fieldMapping: data.fieldMapping,
      });
      toast('已保存', 'success');
      setView({ mode: 'list' });
      void load();
    } catch (err) {
      toast(`保存失败：${err instanceof Error ? err.message : ''}`, 'error');
      throw err;
    }
  };

  const handleTestRender = async (endpoint: TemplateEndpoint) => {
    setTesting(true);
    setTestHtml('');
    try {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(testJsonText) as Record<string, unknown>; } catch { /* ignore */ }
      const result = await serverEndpointRender(templateId, endpoint.id, {
        data,
        shopIntegrationId: testShopId || undefined,
      });
      setTestHtml(result.html);
    } catch (err) {
      toast(`渲染失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async (endpoint: TemplateEndpoint) => {
    if (!window.confirm(`确定删除接入点「${endpoint.name}」吗？`)) return;
    try {
      await serverDeleteEndpoint(templateId, endpoint.id);
      toast('已删除', 'success');
      void load();
    } catch (err) {
      toast(`删除失败：${err instanceof Error ? err.message : ''}`, 'error');
    }
  };

  if (view.mode === 'test') {
    const ep = view.endpoint;
    return (
      <div className={styles.editorWrap}>
        <div className={styles.editorHeader}>
          <span className={styles.editorTitle}>测试渲染 — {ep.name}</span>
          <button type="button" className={styles.backLink} onClick={() => { setTestHtml(''); setView({ mode: 'list' }); }}>
            ← 返回
          </button>
        </div>
        <div className={styles.testPanel}>
          {/* 店铺选择（Phase 2） */}
          <div className={styles.testField}>
            <label className={styles.testLabel}>注入 Shoplazza 数据（可选）</label>
            <select
              className={styles.testSelect}
              value={testShopId}
              onChange={(e) => setTestShopId(e.target.value)}
            >
              <option value="">不注入店铺数据</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>{s.shopName || s.shopDomain}</option>
              ))}
            </select>
          </div>
          {/* 外部数据 JSON */}
          <div className={styles.testField}>
            <label className={styles.testLabel}>外部数据（JSON）</label>
            <textarea
              className={styles.testTextarea}
              value={testJsonText}
              onChange={(e) => setTestJsonText(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder='{}'
            />
          </div>
          <button
            type="button"
            className={styles.testBtn}
            onClick={() => handleTestRender(ep)}
            disabled={testing}
          >
            {testing ? '渲染中…' : '执行渲染'}
          </button>
          {testHtml && (
            <div className={styles.testResult}>
              <p className={styles.testResultLabel}>渲染结果预览：</p>
              <iframe
                srcDoc={testHtml}
                className={styles.testIframe}
                title="渲染预览"
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view.mode === 'create') {
    return (
      <div className={styles.editorWrap}>
        <div className={styles.editorHeader}>
          <span className={styles.editorTitle}>新建接入点</span>
        </div>
        <EndpointEditor
          templateVariables={templateVariables}
          onSave={handleCreate}
          onCancel={() => setView({ mode: 'list' })}
        />
      </div>
    );
  }

  if (view.mode === 'edit') {
    return (
      <div className={styles.editorWrap}>
        <div className={styles.editorHeader}>
          <span className={styles.editorTitle}>编辑接入点</span>
        </div>
        <EndpointEditor
          templateVariables={templateVariables}
          initial={view.endpoint}
          onSave={(data) => handleUpdate(view.endpoint.id, data)}
          onCancel={() => setView({ mode: 'list' })}
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 头部 */}
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>接入配置</h3>
          <p className={styles.subtitle}>
            为外部系统配置数据字段到模板变量的映射关系，每个接入点对应一种外部数据源。
          </p>
        </div>
        <button
          type="button"
          className={styles.newBtn}
          onClick={() => setView({ mode: 'create' })}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建接入点
        </button>
      </div>

      {/* 变量签名提示 */}
      {templateVariables.length > 0 && (
        <div className={styles.schemaHint}>
          <span className={styles.schemaHintLabel}>此模板声明的变量：</span>
          {templateVariables.map((v) => (
            <span key={v.key} className={styles.schemaTag}>
              {v.key}
              <em>{v.contentType === 'array' ? '[]' : ''}</em>
            </span>
          ))}
        </div>
      )}
      {templateVariables.length === 0 && (
        <div className={styles.schemaHintEmpty}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>此模板没有自定义变量。接入点仍可创建，但无需配置字段映射。</span>
        </div>
      )}

      {/* 列表 */}
      {loading ? (
        <div className={styles.loading} aria-live="polite">加载中…</div>
      ) : endpoints.length === 0 ? (
        <div className={styles.empty}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <p>还没有接入点</p>
          <p className={styles.emptyHint}>点击「新建接入点」，配置外部数据字段到模板变量的映射关系。</p>
          <button type="button" className={styles.newBtn} onClick={() => setView({ mode: 'create' })}>
            新建接入点
          </button>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>接入点名称</th>
                <th>已映射字段</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.id}>
                  <td>
                    <span className={styles.epName}>{ep.name}</span>
                  </td>
                  <td>
                    <span className={styles.mappedCount}>
                      {countMappedFields(ep.fieldMapping)} / {templateVariables.length} 个变量已映射
                    </span>
                  </td>
                  <td>
                    <span className={styles.dateText}>{formatDate(ep.createdAt)}</span>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => { setTestHtml(''); setView({ mode: 'test', endpoint: ep }); }}
                      >
                        测试渲染
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => setView({ mode: 'edit', endpoint: ep })}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.dangerBtn}`}
                        onClick={() => handleDelete(ep)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
