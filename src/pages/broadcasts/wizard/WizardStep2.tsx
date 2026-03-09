import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '@shared/api/apiClient';
import { serverCreateEmptyProject, serverGetTemplate, serverPutProject } from '@shared/api/serverApi';
import { toast } from '@shared/store/useToastStore';
import type { WizardDraft } from './BroadcastWizard';
import styles from './WizardStep.module.css';

interface TemplateCatalogItem {
  id: string; title: string; previewUrl: string | null;
  requiredVariableKeys: string[]; updatedAt: number;
}

interface Props {
  draft: WizardDraft;
  onChange: (d: Partial<WizardDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function WizardStep2({ draft, onChange, onNext, onBack }: Props) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [forking, setForking] = useState(false);
  const [brokenPreviewIds, setBrokenPreviewIds] = useState<Set<string>>(new Set());
  const [loadedPreviewIds, setLoadedPreviewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    apiGet<{ data: TemplateCatalogItem[] }>('/api/templates/mine?page=1&pageSize=50')
      .then((res) => setTemplates(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? templates.filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase()))
    : templates;

  const selected = templates.find((t) => t.id === draft.templateId);

  const handleEdit = () => {
    if (!draft.templateId) return;
    const returnTo = encodeURIComponent(`/broadcasts/new?step=2&selectedTemplateId=${draft.templateId}`);
    navigate(`/templates/edit/${draft.templateId}?returnTo=${returnTo}`);
  };

  const handleNewFromTemplate = async () => {
    if (!draft.templateId || !selected || forking) return;
    setForking(true);
    try {
      const tmpl = await serverGetTemplate(draft.templateId);
      if (!tmpl) { toast('模板不存在', 'error'); return; }
      const { id: newId } = await serverCreateEmptyProject(`${selected.title}（副本）`);
      await serverPutProject({
        id: newId,
        title: `${selected.title}（副本）`,
        desc: '',
        components: tmpl.components as unknown[],
        config: tmpl.config,
        customVariables: tmpl.customVariables as unknown[] | undefined,
        updatedAt: Date.now(),
      });
      const returnTo = encodeURIComponent('/broadcasts/new?step=2');
      navigate(`/projects/edit/${newId}?returnTo=${returnTo}`);
    } catch (err) {
      toast(`创建失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setForking(false);
    }
  };

  const handleNewTemplate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const { id } = await serverCreateEmptyProject('未命名工程');
      const returnTo = encodeURIComponent('/broadcasts/new?step=2');
      navigate(`/projects/edit/${id}?returnTo=${returnTo}`);
    } catch (err) {
      toast(`创建失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>选择模板</h2>
      <p className={styles.cardDesc}>选择此次广播要发送的邮件模板</p>

      <div className={styles.step2Toolbar}>
        <input
          type="text"
          className={styles.step2Search}
          placeholder="搜索模板…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className={styles.newTemplateBtn} onClick={handleNewTemplate} disabled={creating}>
          {creating ? '创建中…' : '+ 新建'}
        </button>
      </div>

      {loading ? (
        <div className={styles.templateGrid}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className={styles.templateSkeleton} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.templateEmpty}>
          <p>{search ? `没有符合「${search}」的模板` : '暂无模板，请先创建模板'}</p>
          <button className={styles.nextBtn} style={{ marginTop: 12 }} onClick={handleNewTemplate} disabled={creating}>
            新建第一个
          </button>
        </div>
      ) : (
        <div className={styles.templateGrid}>
          {filtered.map((t) => {
            const showPlaceholder = !t.previewUrl || brokenPreviewIds.has(t.id) || !loadedPreviewIds.has(t.id);
            return (
              <div
                key={t.id}
                className={`${styles.templateCard}${draft.templateId === t.id ? ` ${styles.templateCardSelected}` : ''}`}
                onClick={() => onChange({ templateId: t.id })}
              >
                <div className={styles.templatePreview}>
                  {showPlaceholder && (
                    <div className={styles.templatePreviewEmpty}>
                      <svg className={styles.templatePreviewEmptyIcon} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span className={styles.templatePreviewEmptyText}>暂无预览图</span>
                    </div>
                  )}
                  {t.previewUrl && !brokenPreviewIds.has(t.id) && (
                    <img
                      src={t.previewUrl}
                      alt={t.title}
                      className={`${styles.templateImg} ${!loadedPreviewIds.has(t.id) ? styles.templateImgHidden : ''}`}
                      onLoad={() => setLoadedPreviewIds((prev) => new Set(prev).add(t.id))}
                      onError={() => setBrokenPreviewIds((prev) => new Set(prev).add(t.id))}
                    />
                  )}
                  {draft.templateId === t.id && (
                    <div className={styles.selectedCheck}>✓</div>
                  )}
                </div>
                <div className={styles.templateInfo}>
                  <span className={styles.templateTitle}>{t.title}</span>
                  {t.requiredVariableKeys.length > 0 && (
                    <div className={styles.varTags}>
                      {t.requiredVariableKeys.slice(0, 3).map((k) => (
                        <span key={k} className={styles.varTag}>{k}</span>
                      ))}
                      {t.requiredVariableKeys.length > 3 && <span className={styles.varTagMore}>+{t.requiredVariableKeys.length - 3}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected template info */}
      {selected && (
        <div className={styles.selectedInfo}>
          <span>已选：<b>{selected.title}</b></span>
          <button
            className={styles.forkTemplateBtn}
            onClick={handleNewFromTemplate}
            disabled={forking}
            title="复制此模板内容，新建一个工程进行编辑"
          >
            {forking ? '创建中…' : '基于此模板新建工程'}
          </button>
          <button className={styles.editTemplateBtn} onClick={handleEdit}>去编辑</button>
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.backBtn} onClick={onBack}>← 返回</button>
        <button className={styles.nextBtn} onClick={onNext} disabled={!draft.templateId}>
          下一步：受众与排期 →
        </button>
      </div>
    </div>
  );
}
