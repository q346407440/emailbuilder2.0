import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RiCheckboxCircleLine, RiMailLine, RiShoppingCartLine, RiStarLine, RiTruckLine, RiUserAddLine } from 'react-icons/ri';
import { apiGet, apiPost, apiDelete } from '@shared/api/apiClient';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import Modal, { ModalFooter, ConfirmText } from '@shared/ui/Modal';
import type { IconType } from 'react-icons';
import styles from './AutomationListPage.module.css';

interface Preset { id: string; name: string; description: string; triggerType: string; icon: string; stepCount: number; }

const PRESET_ICONS: Record<string, IconType> = {
  abandoned_cart: RiShoppingCartLine,
  welcome_series: RiUserAddLine,
  order_confirmation: RiCheckboxCircleLine,
  shipping_notification: RiTruckLine,
  post_purchase: RiStarLine,
};
interface Automation { id: string; name: string; triggerType: string; status: string; stepCount: number; totalEnrollments: number; emailsSent: number; activeEnrollments: number; }

const STATUS_LABELS: Record<string, string> = { draft: '草稿', active: '启用中', paused: '已暂停' };
const TRIGGER_LABELS: Record<string, string> = {
  abandoned_cart: '顾客弃单', customer_created: '顾客注册',
  order_paid: '订单付款', order_fulfilled: '订单发货', post_purchase: '订单付款后',
};

export default function AutomationListPage() {
  const navigate = useNavigate();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        apiGet<Preset[]>('/api/automations/presets'),
        apiGet<Automation[]>('/api/automations'),
      ]);
      setPresets(p);
      setAutomations(a);
    } catch (err) { toastLoadError(err, '加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUsePreset = async (presetId: string) => {
    if (creating) return;
    setCreating(presetId);
    try {
      const res = await apiPost<{ id: string }>(`/api/automations/from-preset/${presetId}`);
      navigate(`/automations/edit/${res.id}`);
    } catch (err) { toast(`创建失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setCreating(null); }
  };

  const handleNewBlank = async () => {
    if (creating) return;
    setCreating('blank');
    try {
      const res = await apiPost<{ id: string }>('/api/automations', { name: '新自动化流程', triggerType: 'customer_created', steps: [] });
      navigate(`/automations/edit/${res.id}`);
    } catch (err) { toast(`创建失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setCreating(null); }
  };

  const handleDeleteClick = (a: Automation) => setDeleteTarget(a);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/automations/${deleteTarget.id}`);
      toast('已删除', 'success');
      setDeleteTarget(null);
      void load();
    } catch (err) {
      toast(`删除失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>自动化流程</h1>
          <p className={styles.subtitle}>由 Shoplazza 事件自动触发的邮件序列</p>
        </div>
        <button className={styles.newBtn} onClick={handleNewBlank} disabled={!!creating}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建自动化
        </button>
      </div>

      {/* Preset templates */}
      <section className={styles.presetsSection}>
        <h2 className={styles.sectionTitle}>从预设模板快速开始</h2>
        <div className={styles.presetsGrid}>
          {presets.map((p) => {
            const Icon = PRESET_ICONS[p.id] ?? RiMailLine;
            return (
              <article key={p.id} className={styles.presetCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.iconBadge} aria-hidden>
                    <Icon size={18} />
                  </div>
                  <h3 className={styles.presetName}>{p.name}</h3>
                </div>
                <p className={styles.presetDesc}>{p.description}</p>
                <div className={styles.cardFooter}>
                  <div className={styles.presetMeta}>
                    <span className={styles.presetTrigger}>{TRIGGER_LABELS[p.triggerType] ?? p.triggerType}</span>
                    <span className={styles.presetSteps}>{p.stepCount} 个步骤</span>
                  </div>
                  <button
                    className={styles.usePresetBtn}
                    onClick={() => handleUsePreset(p.id)}
                    disabled={!!creating}
                  >
                    {creating === p.id ? '创建中…' : '使用'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Existing automations */}
      <section className={styles.listSection}>
        <h2 className={styles.sectionTitle}>我的自动化流程</h2>
        {loading ? (
          <div className={styles.loadingRow} aria-live="polite">加载中…</div>
        ) : automations.length === 0 ? (
          <div className={styles.emptyRow}>暂无自动化流程，从上方选择预设模板开始</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>流程名称</th><th>触发器</th><th>状态</th><th>本月触发</th><th>本月邮件</th><th>当前活跃</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {automations.map((a) => (
                  <tr key={a.id} className={styles.row} onClick={() => navigate(`/automations/detail/${a.id}`)}>
                    <td className={styles.tdName}>{a.name}</td>
                    <td className={styles.muted}>{TRIGGER_LABELS[a.triggerType] ?? a.triggerType}</td>
                    <td><span className={`${styles.badge} ${styles[`badge_${a.status}`] ?? ''}`}>{STATUS_LABELS[a.status] ?? a.status}</span></td>
                    <td>{a.totalEnrollments}</td>
                    <td>{a.emailsSent}</td>
                    <td>{a.activeEnrollments}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn} onClick={() => navigate(`/automations/edit/${a.id}`)}>编辑</button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => handleDeleteClick(a)}>删除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={!!deleteTarget}
        title="确认删除"
        onClose={() => !deleting && setDeleteTarget(null)}
        footer={
          <ModalFooter
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleDeleteConfirm}
            confirmText={deleting ? '删除中…' : '删除'}
            confirmDisabled={deleting}
            danger
          />
        }
      >
        <ConfirmText>确定删除「{deleteTarget?.name}」？</ConfirmText>
      </Modal>
    </div>
  );
}
