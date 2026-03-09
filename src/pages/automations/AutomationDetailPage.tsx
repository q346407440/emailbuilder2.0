import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiDelete } from '@shared/api/apiClient';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import styles from './AutomationDetailPage.module.css';

interface AutoDetail {
  id: string; name: string; triggerType: string; status: string; stepCount: number;
  totalEnrollments: number; activeEnrollments: number; emailsSent: number;
  createdAt: string;
}
interface Enrollment {
  id: string; contactId: string; contactEmail: string; contactName: string | null;
  currentStep: number; status: string; enrolledAt: string; nextRunAt: string | null;
}

const STATUS_LABELS: Record<string, string> = { draft: '草稿', active: '启用中', paused: '已暂停' };
const TRIGGER_LABELS: Record<string, string> = {
  abandoned_cart: '顾客弃单', customer_created: '顾客注册',
  order_paid: '订单付款', order_fulfilled: '订单发货',
};
const ENROLLMENT_LABELS: Record<string, string> = { active: '进行中', completed: '已完成', exited: '已退出' };

export default function AutomationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [auto, setAuto] = useState<AutoDetail | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [a, e] = await Promise.all([
        apiGet<AutoDetail>(`/api/automations/${id}`),
        apiGet<Enrollment[]>(`/api/automations/${id}/enrollments`),
      ]);
      setAuto(a);
      setEnrollments(e);
    } catch (err) { toastLoadError(err, '加载失败'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const handleActivate = async () => {
    if (!id) return;
    try {
      await apiPost(`/api/automations/${id}/activate`);
      toast('流程已启用', 'success');
      void load();
    } catch (err) { toast(`启用失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const handlePause = async () => {
    if (!id) return;
    try {
      await apiPost(`/api/automations/${id}/pause`);
      toast('流程已暂停', 'info');
      void load();
    } catch (err) { toast(`暂停失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const handleDelete = async () => {
    if (!id || !auto || !window.confirm(`确定删除「${auto.name}」？`)) return;
    try {
      await apiDelete(`/api/automations/${id}`);
      toast('已删除', 'success');
      navigate('/automations');
    } catch (err) { toast(`删除失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  if (loading) return <div className={styles.page}><div className={styles.loading} aria-live="polite">加载中…</div></div>;
  if (!auto) return <div className={styles.page}><div className={styles.loading}>找不到流程</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <button className={styles.breadLink} onClick={() => navigate('/automations')}>自动化流程</button>
        <span> › </span><span>{auto.name}</span>
      </div>

      <div className={styles.layout}>
        <div className={styles.infoCol}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h1 className={styles.title}>{auto.name}</h1>
              <span className={`${styles.badge} ${styles[`badge_${auto.status}`] ?? ''}`}>
                {STATUS_LABELS[auto.status] ?? auto.status}
              </span>
            </div>
            <div className={styles.meta}>
              <div className={styles.metaRow}><span className={styles.metaLabel}>触发器</span><span>{TRIGGER_LABELS[auto.triggerType] ?? auto.triggerType}</span></div>
              <div className={styles.metaRow}><span className={styles.metaLabel}>步骤数</span><span>{auto.stepCount} 个步骤</span></div>
              <div className={styles.metaRow}><span className={styles.metaLabel}>创建时间</span><span className={styles.muted}>{new Date(auto.createdAt).toLocaleString('zh-CN')}</span></div>
            </div>
          </div>

          <div className={styles.actionRow}>
            <button className={styles.editBtn} onClick={() => navigate(`/automations/edit/${id}`)}>✏️ 编辑流程</button>
          <button className={styles.editBtn} onClick={() => navigate(`/automations/analytics/${id}`)}>📊 数据报告</button>
            {auto.status !== 'active' ? (
              <button className={styles.activateBtn} onClick={handleActivate}>🚀 启用</button>
            ) : (
              <button className={styles.pauseBtn} onClick={handlePause}>⏸ 暂停</button>
            )}
            <button className={styles.deleteBtn} onClick={handleDelete}>删除</button>
          </div>
        </div>

        <div className={styles.statsCol}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>本月统计</h2>
            <div className={styles.statsGrid}>
              <div className={styles.stat}><span className={styles.statNum}>{auto.totalEnrollments}</span><span>触发次数</span></div>
              <div className={styles.stat}><span className={styles.statNum} style={{ color: 'var(--accent)' }}>{auto.activeEnrollments}</span><span>进行中</span></div>
              <div className={styles.stat}><span className={styles.statNum}>{auto.emailsSent}</span><span>发出邮件</span></div>
            </div>
          </div>

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>最近触发记录</h2>
            {enrollments.length === 0 ? (
              <p className={styles.emptyEnrollments}>暂无触发记录</p>
            ) : (
              <div className={styles.enrollmentList}>
                {enrollments.map((e) => (
                  <div key={e.id} className={styles.enrollmentItem}>
                    <div>
                      <p className={styles.enrollmentEmail}>{e.contactEmail}</p>
                      {e.contactName && <p className={styles.muted}>{e.contactName}</p>}
                    </div>
                    <div className={styles.enrollmentMeta}>
                      <span className={`${styles.enrollBadge} ${styles[`enrollBadge_${e.status}`] ?? ''}`}>
                        {ENROLLMENT_LABELS[e.status] ?? e.status}
                      </span>
                      <span className={styles.muted}>步驟 {e.currentStep + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
