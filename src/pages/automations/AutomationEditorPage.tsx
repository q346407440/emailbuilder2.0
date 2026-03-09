import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { apiGet, apiPut, apiPost } from '@shared/api/apiClient';
import { serverCreateEmptyProject } from '@shared/api/serverApi';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import styles from './AutomationEditorPage.module.css';

interface AutomationStep {
  id: string;
  type: 'wait' | 'condition' | 'send_email' | 'end';
  config: Record<string, unknown>;
  exitIfTrue?: boolean;
}

interface TemplateCatalogItem { id: string; title: string; previewUrl: string | null; }

const TRIGGER_OPTIONS = [
  { value: 'abandoned_cart',   label: '顾客弃单', desc: '顾客加入购物车但未完成付款' },
  { value: 'customer_created', label: '顾客注册', desc: '新顾客在 Shoplazza 完成注册' },
  { value: 'order_paid',       label: '订单付款', desc: '顾客完成订单付款' },
  { value: 'order_fulfilled',  label: '订单发货', desc: '订单发出给顾客' },
];

const STEP_TYPE_OPTIONS = [
  { value: 'wait',       label: '⏱ 等待', desc: '等待一段时间后继续' },
  { value: 'condition',  label: '🔀 条件判断', desc: '根据条件决定是否退出' },
  { value: 'send_email', label: '📧 发送邮件', desc: '发送邮件给联系人' },
  { value: 'end',        label: '🏁 结束', desc: '流程到此结束' },
];

export default function AutomationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('customer_created');
  const [steps, setSteps] = useState<AutomationStep[]>([]);
  const [status, setStatus] = useState('draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [templates, setTemplates] = useState<TemplateCatalogItem[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [auto, tmpl] = await Promise.all([
        apiGet<{ name: string; triggerType: string; steps: AutomationStep[]; status: string }>(`/api/automations/${id}`),
        apiGet<{ data: TemplateCatalogItem[] }>('/api/templates/mine?page=1&pageSize=50'),
      ]);
      setName(auto.name);
      setTriggerType(auto.triggerType);
      setSteps(Array.isArray(auto.steps) ? auto.steps : []);
      setStatus(auto.status);
      setTemplates(tmpl.data ?? []);
    } catch (err) { toastLoadError(err, '加载失败'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // 从 returnTo 回填：工程发布为模板后带回 selectedTemplateId + stepIndex
  useEffect(() => {
    const selectedTemplateId = searchParams.get('selectedTemplateId');
    const stepIndexStr = searchParams.get('stepIndex');
    if (!selectedTemplateId || !stepIndexStr) return;
    const stepIndex = parseInt(stepIndexStr, 10);
    if (Number.isNaN(stepIndex)) return;
    setSteps((prev) =>
      prev.map((s, i) =>
        i === stepIndex && s.type === 'send_email'
          ? { ...s, config: { ...s.config, templateId: selectedTemplateId } }
          : s
      )
    );
  }, [searchParams]);

  const save = async () => {
    if (!id || saving) return;
    setSaving(true);
    try {
      await apiPut(`/api/automations/${id}`, { name, triggerType, steps });
      toast('已保存', 'success');
    } catch (err) { toast(`保存失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setSaving(false); }
  };

  const activate = async () => {
    if (!id || publishing) return;
    setPublishing(true);
    try {
      await apiPut(`/api/automations/${id}`, { name, triggerType, steps });
      await apiPost(`/api/automations/${id}/activate`);
      setStatus('active');
      toast('流程已启用！', 'success');
    } catch (err) { toast(`启用失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setPublishing(false); }
  };

  const pause = async () => {
    if (!id) return;
    try {
      await apiPost(`/api/automations/${id}/pause`);
      setStatus('paused');
      toast('流程已暂停', 'info');
    } catch (err) { toast(`暂停失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const addStep = (afterIndex: number) => {
    const newStep: AutomationStep = { id: `step-${Date.now()}`, type: 'send_email', config: { subject: '' } };
    const newSteps = [...steps];
    newSteps.splice(afterIndex + 1, 0, newStep);
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, update: Partial<AutomationStep>) => {
    setSteps(steps.map((s, i) => i === index ? { ...s, ...update } : s));
  };

  if (loading) return <div className={styles.page}><div className={styles.loading} aria-live="polite">加载中…</div></div>;

  return (
    <div className={styles.page}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.backBtn} onClick={() => navigate('/automations')}>← 返回</button>
        <input
          type="text"
          className={styles.nameInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="流程名稱"
        />
        <div className={styles.toolbarActions}>
          <button className={styles.saveBtn} onClick={save} disabled={saving}>{saving ? '保存中…' : '保存草稿'}</button>
          {status === 'active' ? (
            <button className={styles.pauseBtn} onClick={pause}>⏸ 暂停</button>
          ) : (
            <button className={styles.activateBtn} onClick={activate} disabled={publishing}>
              {publishing ? '启用中...' : status === 'paused' ? '▶ 恢复启用' : '🚀 启用流程'}
            </button>
          )}
        </div>
        <span className={`${styles.statusBadge} ${styles[`status_${status}`] ?? ''}`}>
          {status === 'draft' ? '草稿' : status === 'active' ? '启用中' : '已暂停'}
        </span>
      </div>

      <div className={styles.canvas}>
        {/* Trigger */}
        <div className={styles.triggerBlock}>
          <div className={styles.blockHeader}>
            <span className={styles.blockIcon}>⚡</span>
            <span className={styles.blockType}>触发器</span>
          </div>
          <select
            className={styles.triggerSelect}
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
          >
            {TRIGGER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {TRIGGER_OPTIONS.find((o) => o.value === triggerType)?.desc && (
            <p className={styles.blockDesc}>{TRIGGER_OPTIONS.find((o) => o.value === triggerType)?.desc}</p>
          )}
        </div>

        {/* Add first step button */}
        <AddStepButton onClick={() => addStep(-1)} />

        {/* Steps */}
        {steps.map((step, index) => (
          <div key={step.id}>
            <StepBlock
              step={step}
              index={index}
              automationId={id}
              templates={templates}
              onUpdate={(u) => updateStep(index, u)}
              onDelete={() => removeStep(index)}
            />
            <AddStepButton onClick={() => addStep(index)} />
          </div>
        ))}

        {steps.length === 0 && (
          <div className={styles.emptySteps}>
            <p>点击「+ 添加步骤」开始构建流程</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AddStepButton({ onClick }: { onClick: () => void }) {
  return (
    <div className={styles.addStepWrap}>
      <div className={styles.addStepLine} />
      <button className={styles.addStepBtn} onClick={onClick}>+ 添加步驟</button>
      <div className={styles.addStepLine} />
    </div>
  );
}

function TemplatePicker({ stepIndex, automationId, templates, selectedId, onSelect }: {
  stepIndex: number;
  automationId: string | undefined;
  templates: TemplateCatalogItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [brokenIds, setBrokenIds] = useState<Set<string>>(new Set());
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleNewProject = async () => {
    if (creating || !automationId) return;
    setCreating(true);
    try {
      const { id: newId } = await serverCreateEmptyProject('未命名工程');
      const returnTo = encodeURIComponent(`/automations/edit/${automationId}?stepIndex=${stepIndex}`);
      navigate(`/projects/edit/${newId}?returnTo=${returnTo}`);
    } catch (err) {
      toast(`创建失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.templatePicker} ref={panelRef}>
      <div className={styles.templatePickerTrigger} onClick={() => setOpen((v) => !v)}>
        {selected ? (
          <div className={styles.templatePickerSelected}>
            <div className={styles.templatePickerThumb}>
              {selected.previewUrl && !brokenIds.has(selected.id) ? (
                <img
                  src={selected.previewUrl}
                  alt={selected.title}
                  className={`${styles.templatePickerThumbImg} ${!loadedIds.has(selected.id) ? styles.hidden : ''}`}
                  onLoad={() => setLoadedIds((p) => new Set(p).add(selected.id))}
                  onError={() => setBrokenIds((p) => new Set(p).add(selected.id))}
                />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              )}
            </div>
            <span className={styles.templatePickerTitle}>{selected.title}</span>
          </div>
        ) : (
          <span className={styles.templatePickerPlaceholder}>— 不指定模板（使用预设 HTML）—</span>
        )}
        <svg className={`${styles.templatePickerChevron}${open ? ` ${styles.open}` : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div className={styles.templatePickerPanel}>
          <div className={styles.templatePickerGrid}>
            <div
              className={`${styles.templatePickerItem}${!selectedId ? ` ${styles.templatePickerItemActive}` : ''}`}
              onClick={() => { onSelect(null); setOpen(false); }}
            >
              <div className={styles.templatePickerItemThumb}>
                <span className={styles.templatePickerNoneText}>不指定</span>
              </div>
              <span className={styles.templatePickerItemTitle}>使用预设 HTML</span>
            </div>
            {templates.map((t) => {
              const showPlaceholder = !t.previewUrl || brokenIds.has(t.id) || !loadedIds.has(t.id);
              return (
                <div
                  key={t.id}
                  className={`${styles.templatePickerItem}${selectedId === t.id ? ` ${styles.templatePickerItemActive}` : ''}`}
                  onClick={() => { onSelect(t.id); setOpen(false); }}
                >
                  <div className={styles.templatePickerItemThumb}>
                    {showPlaceholder && (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )}
                    {t.previewUrl && !brokenIds.has(t.id) && (
                      <img
                        src={t.previewUrl}
                        alt={t.title}
                        className={`${styles.templatePickerItemImg}${!loadedIds.has(t.id) ? ` ${styles.hidden}` : ''}`}
                        onLoad={() => setLoadedIds((p) => new Set(p).add(t.id))}
                        onError={() => setBrokenIds((p) => new Set(p).add(t.id))}
                      />
                    )}
                    {selectedId === t.id && <div className={styles.templatePickerCheck}>✓</div>}
                  </div>
                  <span className={styles.templatePickerItemTitle}>{t.title}</span>
                </div>
              );
            })}
          </div>
          <div className={styles.templatePickerFooter}>
            <button
              className={styles.templatePickerNewBtn}
              onClick={handleNewProject}
              disabled={creating}
            >
              {creating ? '创建中…' : '+ 新建工程'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepBlock({ step, index, automationId, templates, onUpdate, onDelete }: {
  step: AutomationStep; index: number;
  automationId: string | undefined;
  templates: TemplateCatalogItem[];
  onUpdate: (u: Partial<AutomationStep>) => void;
  onDelete: () => void;
}) {
  const ICONS: Record<string, string> = { wait: '⏱', condition: '🔀', send_email: '📧', end: '🏁' };

  return (
    <div className={styles.stepBlock}>
      <div className={styles.blockHeader}>
        <span className={styles.stepIndex}>步骤 {index + 1}</span>
        <span className={styles.blockIcon}>{ICONS[step.type] ?? '●'}</span>
        <span className={styles.blockType}>{STEP_TYPE_OPTIONS.find((o) => o.value === step.type)?.label ?? step.type}</span>
        <select
          className={styles.stepTypeSelect}
          value={step.type}
          onChange={(e) => onUpdate({ type: e.target.value as AutomationStep['type'], config: {} })}
        >
          {STEP_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button className={styles.deleteStepBtn} onClick={onDelete} title="删除此步骤">✕</button>
      </div>

      <div className={styles.stepConfig}>
        {step.type === 'wait' && (
          <div className={styles.waitConfig}>
            <span>等待</span>
            <input
              type="number"
              className={styles.waitAmount}
              min={1}
              value={Number(step.config.amount ?? 1)}
              onChange={(e) => onUpdate({ config: { ...step.config, amount: parseInt(e.target.value, 10) || 1 } })}
            />
            <select
              className={styles.waitUnit}
              value={String(step.config.unit ?? 'hour')}
              onChange={(e) => onUpdate({ config: { ...step.config, unit: e.target.value } })}
            >
              <option value="minute">分钟</option>
              <option value="hour">小时</option>
              <option value="day">天</option>
            </select>
          </div>
        )}

        {step.type === 'condition' && (
          <div className={styles.conditionConfig}>
            <select
              className={styles.conditionSelect}
              value={String(step.config.check ?? 'order_paid')}
              onChange={(e) => onUpdate({ config: { ...step.config, check: e.target.value } })}
            >
              <option value="order_paid">顾客是否已付款？</option>
              <option value="email_opened">顾客是否打开过上一封邮件？</option>
            </select>
            <label className={styles.exitCheck}>
              <input
                type="checkbox"
                checked={Boolean(step.exitIfTrue)}
                onChange={(e) => onUpdate({ exitIfTrue: e.target.checked })}
              />
              条件成立时退出流程
            </label>
          </div>
        )}

        {step.type === 'send_email' && (
          <div className={styles.emailConfig}>
            <label className={styles.configField}>
              模板
              <TemplatePicker
                stepIndex={index}
                automationId={automationId}
                templates={templates}
                selectedId={step.config.templateId ? String(step.config.templateId) : null}
                onSelect={(tid) => onUpdate({ config: { ...step.config, templateId: tid } })}
              />
            </label>
            <label className={styles.configField}>
              邮件主旨
              <input
                type="text"
                className={styles.subjectInput}
                placeholder="邮件主旨（留空使用预设）"
                value={String(step.config.subject ?? '')}
                onChange={(e) => onUpdate({ config: { ...step.config, subject: e.target.value } })}
              />
            </label>
          </div>
        )}

        {step.type === 'end' && (
          <p className={styles.endDesc}>流程到此结束，联系人完成流程。</p>
        )}
      </div>
    </div>
  );
}
