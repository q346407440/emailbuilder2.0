import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { serverGetTemplate, serverDeleteTemplate } from '@shared/api/serverApi';
import type { SavedEmailTemplate, CustomVariableDefinition } from '@shared/types/emailTemplate';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import EndpointList from './components/EndpointList';
import TestSendDrawer from './components/TestSendDrawer';
import styles from './TemplateDetailPage.module.css';

function formatDateTime(ts: number | null | undefined) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  text: '文本', image: '图片', link: '链接',
};

interface TemplateWithMeta extends SavedEmailTemplate {
  requiredVariableKeys?: string[];
  isPublic?: boolean;
}

type ActiveTab = 'overview' | 'endpoints';

export default function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [template, setTemplate] = useState<TemplateWithMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [previewImgError, setPreviewImgError] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [showTestSend, setShowTestSend] = useState(false);

  /* 支持从编辑器「查看接入配置」链接带 ?tab=endpoints 直接打开接入配置 Tab */
  useEffect(() => {
    if (searchParams.get('tab') === 'endpoints') setActiveTab('endpoints');
  }, [searchParams]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setPreviewImgError(false);
    serverGetTemplate(id)
      .then((t) => {
        setTemplate(t as TemplateWithMeta);
        setNameValue((t as TemplateWithMeta)?.title ?? '');
      })
      .catch((err) => toastLoadError(err, '模板加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id || !template) return;
    if (!window.confirm(`确定要删除「${template.title}」吗？`)) return;
    setDeleting(true);
    try {
      await serverDeleteTemplate(id);
      toast('已删除', 'success');
      navigate('/templates');
    } catch (err) {
      toast(`删除失败：${err instanceof Error ? err.message : ''}`, 'error');
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.skeleton}>
          <div className={styles.skeletonPreview} />
          <div className={styles.skeletonInfo}>
            <div className={styles.skeletonLine} style={{ width: '60%', height: 20 }} />
            <div className={styles.skeletonLine} style={{ width: '40%', height: 14 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <p>找不到模板</p>
          <button type="button" className={styles.backBtn} onClick={() => navigate('/templates')}>
            返回模板库
          </button>
        </div>
      </div>
    );
  }

  const requiredKeys: string[] = (template as TemplateWithMeta).requiredVariableKeys ?? [];
  const customVariables: CustomVariableDefinition[] = (template as TemplateWithMeta).customVariables ?? [];

  return (
    <div className={styles.page}>
      {/* 返回（与其它二级页统一：仅返回链接，无面包屑） */}
      <div className={styles.backRow}>
        <button type="button" className={styles.backBtn} onClick={() => navigate('/templates')}>
          ← 返回模板库
        </button>
      </div>

      {/* Tab 切换 */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          概览
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'endpoints' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('endpoints')}
        >
          接入配置
        </button>
      </div>

      {/* 接入配置 Tab */}
      {activeTab === 'endpoints' && id && (
        <div className={styles.endpointsPanel}>
          <EndpointList templateId={id} templateVariables={customVariables} />
        </div>
      )}

      {/* 概览 Tab */}
      {activeTab === 'overview' && (
      <div className={styles.layout}>
        {/* Left: preview */}
        <div className={styles.previewSection}>
          <div
            className={styles.previewFrame}
            onClick={() => navigate(`/templates/preview/${id}`)}
            title="点击查看全屏预览"
          >
            {template.previewDataUrl && !previewImgError ? (
              <img
                src={template.previewDataUrl}
                alt={template.title}
                className={styles.previewImg}
                onError={() => setPreviewImgError(true)}
              />
            ) : (
              <div className={styles.previewEmpty}>
                <svg className={styles.previewEmptyIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className={styles.previewEmptyText}>暂无预览图</span>
              </div>
            )}
            <div className={styles.previewOverlay}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              全屏预览
            </div>
          </div>
        </div>

        {/* Right: info */}
        <div className={styles.infoSection}>
          {/* Name */}
          {editingName ? (
            <div className={styles.nameEdit}>
              <input
                type="text"
                className={styles.nameInput}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className={styles.nameSave}
                onClick={() => {
                  setEditingName(false);
                  // TODO: persist name via API (Iter-1 scope: display only)
                }}
              >
                确认
              </button>
              <button type="button" className={styles.nameCancel} onClick={() => setEditingName(false)}>
                取消
              </button>
            </div>
          ) : (
            <div className={styles.nameRow}>
              <h1 className={styles.name}>{template.title}</h1>
              <button type="button" className={styles.editNameBtn} onClick={() => setEditingName(true)} title="编辑名称">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}

          {/* Meta */}
          <div className={styles.meta}>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>创建时间</span>
              <span className={styles.metaValue}>{formatDateTime(template.createdAt)}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>更新时间</span>
              <span className={styles.metaValue}>{formatDateTime(template.updatedAt)}</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>被哪些活動使用</span>
              <span className={styles.metaValue} style={{ color: 'var(--text-muted)' }}>—</span>
            </div>
          </div>

          {/* Variable keys */}
          <div className={styles.varSection}>
            <h2 className={styles.varTitle}>所需变量清单</h2>
            {requiredKeys.length === 0 ? (
              <p className={styles.varEmpty}>无变量绑定（固定内容模板）</p>
            ) : (
              <div className={styles.varList}>
                {requiredKeys.map((key) => {
                  const parts = key.split('.');
                  const group = parts[0];
                  const field = parts.slice(1).join('.');
                  return (
                    <div key={key} className={styles.varItem}>
                      <span className={styles.varKey}>{key}</span>
                      {field && CONTENT_TYPE_LABELS[field] && (
                        <span className={styles.varType}>{CONTENT_TYPE_LABELS[field]}</span>
                      )}
                      {!field && group && (
                        <span className={styles.varGroup}>{group}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => navigate(`/templates/edit/${id}`)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              编辑模板
            </button>
            <button
              type="button"
              className={`${styles.primaryBtn} ${styles.primaryBtnOutline}`}
              onClick={() => setShowTestSend(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              测试发送
            </button>
            <button
              type="button"
              className={`${styles.primaryBtn} ${styles.primaryBtnOutline}`}
              onClick={() => navigate(`/broadcasts/new?templateId=${id}`)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.18 2 2 0 014 1h3a2 2 0 012 1.72" />
              </svg>
              用于新活动
            </button>
            <button
              type="button"
              className={`${styles.primaryBtn} ${styles.primaryBtnDanger}`}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '删除中…' : '删除'}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* 测试发送抽屉（Phase 3） */}
      {showTestSend && id && template && (
        <TestSendDrawer
          templateId={id}
          templateTitle={template.title}
          customVariables={customVariables}
          onClose={() => setShowTestSend(false)}
        />
      )}
    </div>
  );
}
