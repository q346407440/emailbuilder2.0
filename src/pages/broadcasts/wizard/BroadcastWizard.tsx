/**
 * 广播活动创建向导（3 步）
 * 整个向导状态存 sessionStorage，从编辑器返回后可恢复
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiPost, apiPut } from '@shared/api/apiClient';
import { toast } from '@shared/store/useToastStore';
import WizardStep1 from './WizardStep1';
import WizardStep2 from './WizardStep2';
import WizardStep3 from './WizardStep3';
import styles from './BroadcastWizard.module.css';

export interface WizardDraft {
  broadcastId?: string;
  step: number;
  name: string;
  subject: string;
  previewText: string;
  templateId: string | null;
  segmentId: string | null;
  scheduledAt: string | null;
  sendNow: boolean;
}

const STORAGE_KEY = 'broadcast-wizard-draft';

function loadDraft(): WizardDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WizardDraft) : null;
  } catch { return null; }
}

function saveDraft(d: WizardDraft) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

function clearDraft() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

const initialDraft = (): WizardDraft => ({
  step: 1, name: '', subject: '', previewText: '',
  templateId: null, segmentId: null, scheduledAt: null, sendNow: true,
});

export default function BroadcastWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Restore from sessionStorage on mount
  const [draft, setDraft] = useState<WizardDraft>(() => {
    const saved = loadDraft();
    if (saved) {
      // Handle return from editor: restore step and templateId from URL
      const urlStep = searchParams.get('step');
      const urlTemplateId = searchParams.get('selectedTemplateId');
      if (urlStep) saved.step = parseInt(urlStep, 10);
      if (urlTemplateId) saved.templateId = urlTemplateId;
    }
    // Handle ?templateId from template detail page "用于新活动"
    const preselectedTemplate = searchParams.get('templateId');
    if (preselectedTemplate) {
      return { ...(saved ?? initialDraft()), templateId: preselectedTemplate, step: saved ? saved.step : 1 };
    }
    return saved ?? initialDraft();
  });

  useEffect(() => { saveDraft(draft); }, [draft]);

  const updateDraft = (changes: Partial<WizardDraft>) => {
    setDraft((prev) => ({ ...prev, ...changes }));
  };

  const handleNext = async () => {
    // On first advance from Step 1, create the broadcast in DB
    if (draft.step === 1) {
      if (!draft.name.trim()) { toast('请填写活动名称', 'error'); return; }
      if (!draft.subject.trim()) { toast('请填写邮件主旨', 'error'); return; }

      if (!draft.broadcastId) {
        try {
          const res = await apiPost<{ id: string }>('/api/broadcasts', {
            name: draft.name, subject: draft.subject, previewText: draft.previewText || undefined,
          });
          updateDraft({ broadcastId: res.id, step: 2 });
        } catch (err) { toast(`创建失败：${err instanceof Error ? err.message : ''}`, 'error'); }
      } else {
        // Update existing
        await apiPut(`/api/broadcasts/${draft.broadcastId}`, {
          name: draft.name, subject: draft.subject, previewText: draft.previewText || undefined,
        }).catch(() => {});
        updateDraft({ step: 2 });
      }
    } else if (draft.step === 2) {
      if (!draft.templateId) { toast('请选择邮件模板', 'error'); return; }
      if (draft.broadcastId) {
        await apiPut(`/api/broadcasts/${draft.broadcastId}`, { templateId: draft.templateId }).catch(() => {});
      }
      updateDraft({ step: 3 });
    }
  };

  const handleBack = () => {
    updateDraft({ step: Math.max(1, draft.step - 1) });
  };

  const handlePublish = async (renderedHtml?: string) => {
    if (!draft.broadcastId) return;
    try {
      // Save final config
      await apiPut(`/api/broadcasts/${draft.broadcastId}`, {
        segmentId: draft.segmentId,
        scheduledAt: draft.sendNow ? null : draft.scheduledAt,
      });

      // Publish
      await apiPost(`/api/broadcasts/${draft.broadcastId}/publish`, {
        renderedHtml: renderedHtml ?? undefined,
      });

      clearDraft();
      toast('广播已发布！', 'success');
      navigate(`/broadcasts/detail/${draft.broadcastId}`);
    } catch (err) {
      toast(`发布失败：${err instanceof Error ? err.message : ''}`, 'error');
    }
  };

  return (
    <div className={styles.page}>
      {/* Steps indicator */}
      <div className={styles.stepsRow}>
        {(['基本信息', '选择模板', '受众与排期'] as const).map((label, i) => (
          <div key={i} className={`${styles.stepItem}${draft.step > i + 1 ? ` ${styles.stepDone}` : draft.step === i + 1 ? ` ${styles.stepActive}` : ''}`}>
            <span className={styles.stepNum}>{draft.step > i + 1 ? '✓' : i + 1}</span>
            <span className={styles.stepLabel}>{label}</span>
            {i < 2 && <span className={styles.stepArrow}>→</span>}
          </div>
        ))}
        <button className={styles.cancelBtn} onClick={() => { clearDraft(); navigate('/broadcasts'); }}>取消</button>
      </div>

      <div className={styles.content}>
        {draft.step === 1 && (
          <WizardStep1 draft={draft} onChange={updateDraft} onNext={handleNext} />
        )}
        {draft.step === 2 && (
          <WizardStep2 draft={draft} onChange={updateDraft} onNext={handleNext} onBack={handleBack} />
        )}
        {draft.step === 3 && (
          <WizardStep3 draft={draft} onChange={updateDraft} onBack={handleBack} onPublish={handlePublish} />
        )}
      </div>
    </div>
  );
}
