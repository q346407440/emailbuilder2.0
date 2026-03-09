import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '@shared/api/apiClient';
import { toastLoadError } from '@shared/store/useToastStore';
import styles from './AutomationAnalyticsPage.module.css';

interface AutoStats { totalEnrollments: number; activeEnrollments: number; emailsSent: number; }
interface StepStat {
  stepIndex: number; stepType: string; stepConfig: Record<string, unknown>;
  counts: { active: number; exited: number; completed: number };
  sent?: number; opens?: number; clicks?: number; openRate?: number; clickRate?: number;
}
interface Enrollment {
  id: string; contactEmail: string; contactName: string | null;
  currentStep: number; status: string; enrolledAt: string;
}

const STEP_ICONS: Record<string, string> = { wait: '⏱', condition: '🔀', send_email: '📧', end: '🏁' };
const STEP_LABELS: Record<string, string> = { wait: '等待', condition: '条件判断', send_email: '发送邮件', end: '结束' };
const STATUS_LABELS: Record<string, string> = { active: '进行中', completed: '已完成', exited: '已退出' };

function pct(v: number | undefined) { if (v === undefined) return '—'; return `${(v * 100).toFixed(1)}%`; }

export default function AutomationAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AutoStats | null>(null);
  const [stepStats, setStepStats] = useState<StepStat[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [autoName, setAutoName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiGet<AutoStats & { name: string }>(`/api/automations/${id}/stats`),
      apiGet<StepStat[]>(`/api/automations/${id}/step-stats`),
      apiGet<Enrollment[]>(`/api/automations/${id}/enrollments`),
      apiGet<{ name: string }>(`/api/automations/${id}`),
    ])
      .then(([s, ss, e, a]) => {
        setStats(s); setStepStats(ss); setEnrollments(e.slice(0, 20));
        setAutoName(a.name);
      })
      .catch((err) => toastLoadError(err, '加载数据失败'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <button className={styles.breadLink} onClick={() => navigate(`/automations/detail/${id}`)}>← 返回流程详情</button>
        <span> › 数据报告</span>
      </div>
      <h1 className={styles.title}>{autoName || '自动化流程'} — 数据报告</h1>

      {loading ? (
        <div className={styles.loading} aria-live="polite">加载中…</div>
      ) : (
        <>
          {/* Overview cards */}
          {stats && (
            <div className={styles.statsRow}>
              {[
                { label: '本月触发次数', value: stats.totalEnrollments },
                { label: '当前活跃', value: stats.activeEnrollments },
                { label: '本月邮件', value: stats.emailsSent },
              ].map((s) => (
                <div key={s.label} className={styles.statCard}>
                  <span className={styles.statValue}>{s.value}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Step funnel */}
          {stepStats.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>各步骤统计</h2>
              <div className={styles.stepList}>
                {stepStats.map((s) => (
                  <div key={s.stepIndex} className={styles.stepItem}>
                    <div className={styles.stepHeader}>
                      <span className={styles.stepIcon}>{STEP_ICONS[s.stepType] ?? '●'}</span>
                      <span className={styles.stepLabel}>步骤 {s.stepIndex + 1}：{STEP_LABELS[s.stepType] ?? s.stepType}</span>
                      {s.stepType === 'wait' && (
                        <span className={styles.stepConfig}>
                          等待 {String(s.stepConfig.amount ?? 1)} {String(s.stepConfig.unit ?? 'hour')}
                        </span>
                      )}
                      {s.stepType === 'condition' && (
                        <span className={styles.stepConfig}>
                          条件：{String(s.stepConfig.check ?? '—')}
                        </span>
                      )}
                    </div>
                    {s.stepType === 'send_email' && (
                      <div className={styles.stepStats}>
                        <span>发送 {s.sent ?? 0}</span>
                        <span>打开率 {pct(s.openRate)}</span>
                        <span>点击率 {pct(s.clickRate)}</span>
                      </div>
                    )}
                    {s.stepType === 'condition' && (
                      <div className={styles.stepStats}>
                        <span className={styles.statGreen}>繼續 {s.counts.active}</span>
                        <span className={styles.statOrange}>退出 {s.counts.exited}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent enrollments */}
          {enrollments.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>最近触发记录</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>联系人</th><th>进入时间</th><th>当前步骤</th><th>状态</th></tr></thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div>{e.contactEmail}</div>
                          {e.contactName && <div className={styles.muted}>{e.contactName}</div>}
                        </td>
                        <td className={styles.muted}>{new Date(e.enrolledAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td>步驟 {e.currentStep + 1}</td>
                        <td>
                          <span className={`${styles.badge} ${styles[`badge_${e.status}`] ?? ''}`}>
                            {STATUS_LABELS[e.status] ?? e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
