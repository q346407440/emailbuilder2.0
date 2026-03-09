import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '@shared/api/apiClient';
import { toast } from '@shared/store/useToastStore';
import type { WizardDraft } from './BroadcastWizard';
import styles from './WizardStep.module.css';

interface Segment { id: string; name: string; count: number; }
interface TemplateCatalogItem { id: string; title: string; previewUrl: string | null; }

interface Props {
  draft: WizardDraft;
  onChange: (d: Partial<WizardDraft>) => void;
  onBack: () => void;
  onPublish: (renderedHtml?: string) => Promise<void>;
}

export default function WizardStep3({ draft, onChange, onBack, onPublish }: Props) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [template, setTemplate] = useState<TemplateCatalogItem | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    apiGet<Segment[]>('/api/segments').then(setSegments).catch(() => {});
    if (draft.templateId) {
      apiGet<TemplateCatalogItem>(`/api/templates/${draft.templateId}`)
        .then(setTemplate).catch(() => {});
    }
  }, [draft.templateId]);

  const selectedSeg = segments.find((s) => s.id === draft.segmentId);

  const handleSendTest = async () => {
    if (!testEmail.trim() || !draft.broadcastId) return;
    setSendingTest(true);
    try {
      await apiPost(`/api/broadcasts/${draft.broadcastId}/send-test`, { email: testEmail.trim() });
      toast(`测试邮件已发送到 ${testEmail}`, 'success');
    } catch (err) { toast(`发送失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setSendingTest(false); }
  };

  const handlePublish = async () => {
    if (!draft.segmentId) { toast('请选择受众分组', 'error'); return; }
    setPublishing(true);
    try { await onPublish(); }
    finally { setPublishing(false); }
  };

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>受众与排期</h2>
      <p className={styles.cardDesc}>选择发送对象和发送时间</p>

      <div className={styles.fields}>
        {/* Audience */}
        <label className={styles.field}>
          <span className={styles.labelLine}>受众分组 <span className={styles.req}>*</span></span>
          <select
            className={styles.input}
            value={draft.segmentId ?? ''}
            onChange={(e) => onChange({ segmentId: e.target.value || null })}
          >
            <option value="">— 请选择分组 —</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.count} 位)</option>
            ))}
          </select>
          {selectedSeg && <span className={styles.hint}>预计触达 {selectedSeg.count} 位订阅者</span>}
        </label>

        {/* Schedule */}
        <div className={styles.field}>
          <span className={styles.fieldLabel}>发送时间</span>
          <div className={styles.scheduleOptions}>
            <label className={styles.radioOption}>
              <input type="radio" checked={draft.sendNow} onChange={() => onChange({ sendNow: true, scheduledAt: null })} />
              立即发送
            </label>
            <label className={styles.radioOption}>
              <input type="radio" checked={!draft.sendNow} onChange={() => onChange({ sendNow: false })} />
              选择时间
            </label>
          </div>
          {!draft.sendNow && (
            <input
              type="datetime-local"
              className={styles.input}
              value={draft.scheduledAt ?? ''}
              onChange={(e) => onChange({ scheduledAt: e.target.value || null })}
              min={new Date().toISOString().slice(0, 16)}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      </div>

      {/* Summary */}
      <div className={styles.summary}>
        <h3 className={styles.summaryTitle}>确认摘要</h3>
        <div className={styles.summaryRows}>
          <div className={styles.summaryRow}><span className={styles.summaryLabel}>活动名称</span><span>{draft.name}</span></div>
          <div className={styles.summaryRow}><span className={styles.summaryLabel}>邮件主旨</span><span>{draft.subject}</span></div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>模板</span>
            <span>{template?.title ?? draft.templateId ?? '—'}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>受众</span>
            <span>{selectedSeg ? `${selectedSeg.name}（${selectedSeg.count} 位）` : '—'}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>发送时间</span>
            <span>{draft.sendNow ? '立即发送' : (draft.scheduledAt ? new Date(draft.scheduledAt).toLocaleString('zh-CN') : '—')}</span>
          </div>
        </div>
      </div>

      {/* Test send */}
      {draft.broadcastId && (
        <div className={styles.testSend}>
          <span className={styles.testSendLabel}>发送测试邮件</span>
          <div className={styles.testSendRow}>
            <input
              type="email"
              className={styles.input}
              placeholder="your@email.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className={styles.testBtn} onClick={handleSendTest} disabled={sendingTest || !testEmail.trim()}>
              {sendingTest ? '发送中…' : '发送测试'}
            </button>
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button className={styles.backBtn} onClick={onBack}>← 返回</button>
        <button
          className={styles.publishBtn}
          onClick={handlePublish}
          disabled={publishing || !draft.segmentId || (!draft.sendNow && !draft.scheduledAt)}
        >
          {publishing ? '发布中…' : (draft.sendNow ? '🚀 立即发布' : '📅 排期发布')}
        </button>
      </div>
    </div>
  );
}
