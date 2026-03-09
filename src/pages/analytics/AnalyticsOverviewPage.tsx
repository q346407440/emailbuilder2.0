import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { apiGet } from '@shared/api/apiClient';
import { toastLoadError } from '@shared/store/useToastStore';
import styles from './AnalyticsOverviewPage.module.css';

interface OverviewData {
  range: string;
  totals: { sent: number; opens: number; clicks: number; openRate: number; clickRate: number };
  daily: { day: string; broadcastSent: number; automationSent: number; opens: number; clicks: number }[];
}
interface CampaignItem {
  id: string; name: string; type: string; status: string;
  sent: number; opens: number; clicks: number; openRate: number; clickRate: number;
  sentAt?: string; enrollments?: number; triggerType?: string;
}
interface HealthData {
  totalActive: number; activeRate: number;
  growth: { month: string; newContacts: number; unsubscribed: number }[];
}

type Range = '7d' | '30d' | '90d';
type Tab = 'overview' | 'campaigns' | 'health';

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }

const emptyOverview = (range: string): OverviewData => ({
  range,
  totals: { sent: 0, opens: 0, clicks: 0, openRate: 0, clickRate: 0 },
  daily: [],
});
const emptyCampaigns = { broadcasts: [] as CampaignItem[], automations: [] as CampaignItem[] };
const emptyHealth: HealthData = { totalActive: 0, activeRate: 0, growth: [] };

export default function AnalyticsOverviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const hash = (location.hash?.replace('#', '') as Tab) || 'overview';

  const [range, setRange] = useState<Range>('30d');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [campaigns, setCampaigns] = useState<{ broadcasts: CampaignItem[]; automations: CampaignItem[] } | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [sortBy, setSortBy] = useState<'openRate' | 'clickRate' | 'sent'>('sent');

  // 发送概览：仅在 overview tab 且 range 变化时请求一次
  useEffect(() => {
    if (hash !== 'overview') return;
    setLoadingOverview(true);
    apiGet<OverviewData>(`/api/analytics/overview?range=${range}`)
      .then(setOverview)
      .catch((err) => {
        toastLoadError(err, '加载失败');
        setOverview(emptyOverview(range));
      })
      .finally(() => setLoadingOverview(false));
  }, [hash, range]);

  useEffect(() => {
    if (hash !== 'campaigns') return;
    setLoadingCampaigns(true);
    apiGet<typeof emptyCampaigns>('/api/analytics/campaigns-comparison')
      .then(setCampaigns)
      .catch((err) => {
        toastLoadError(err, '加载失败');
        setCampaigns(emptyCampaigns);
      })
      .finally(() => setLoadingCampaigns(false));
  }, [hash]);

  useEffect(() => {
    if (hash !== 'health') return;
    setLoadingHealth(true);
    apiGet<HealthData>('/api/analytics/list-health')
      .then(setHealth)
      .catch((err) => {
        toastLoadError(err, '加载失败');
        setHealth(emptyHealth);
      })
      .finally(() => setLoadingHealth(false));
  }, [hash]);

  const switchTab = (tab: Tab) => navigate(`/analytics#${tab}`, { replace: true });

  const allCampaigns: CampaignItem[] = [
    ...(campaigns?.broadcasts ?? []),
    ...(campaigns?.automations ?? []),
  ].sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>数据总览</h1>
      </div>

      {/* Tab bar */}
      <div className={styles.tabs}>
        {(['overview', 'campaigns', 'health'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab}${hash === tab ? ` ${styles.tabActive}` : ''}`}
            onClick={() => switchTab(tab)}
          >
            {tab === 'overview' ? '发送概览' : tab === 'campaigns' ? '活动对比' : '清单健康'}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {hash === 'overview' && (
        <div className={styles.tabContent}>
          <div className={styles.rangeRow}>
            {(['7d', '30d', '90d'] as Range[]).map((r) => (
              <button key={r} className={`${styles.rangeBtn}${range === r ? ` ${styles.rangeBtnActive}` : ''}`}
                onClick={() => setRange(r)}>
                {r === '7d' ? '最近 7 天' : r === '30d' ? '最近 30 天' : '最近 90 天'}
              </button>
            ))}
          </div>

          {overview && (
            <div className={styles.statsRow}>
              {[
                { label: '总发送', value: overview.totals.sent },
                { label: '打开率', value: pct(overview.totals.openRate) },
                { label: '点击率', value: pct(overview.totals.clickRate) },
              ].map((s) => (
                <div key={s.label} className={styles.statCard}>
                  <span className={styles.statValue}>{s.value}</span>
                  <span className={styles.statLabel}>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {loadingOverview ? (
            <div className={styles.loading} aria-live="polite">加载中…</div>
          ) : overview && overview.daily.length > 0 ? (
            <>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>每日发送量</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={overview.daily} margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E5EB" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="broadcastSent" name="广播" stackId="a" fill="#1976D2" />
                    <Bar dataKey="automationSent" name="自动化" stackId="a" fill="#26C6DA" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>打开 / 点击趋势</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={overview.daily} margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E0E5EB" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="opens" stroke="#1976D2" name="打开" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="clicks" stroke="#66BB6A" name="点击" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : overview ? (
            <div className={styles.emptyMsg}>该时段暂无发送数据</div>
          ) : null}
        </div>
      )}

      {/* Tab: Campaigns comparison */}
      {hash === 'campaigns' && (
        <div className={styles.tabContent}>
          <div className={styles.sortRow}>
            <span className={styles.sortLabel}>排序：</span>
            {[{ key: 'sent', label: '发送量' }, { key: 'openRate', label: '打开率' }, { key: 'clickRate', label: '点击率' }].map((s) => (
              <button key={s.key} className={`${styles.sortBtn}${sortBy === s.key ? ` ${styles.sortBtnActive}` : ''}`}
                onClick={() => setSortBy(s.key as typeof sortBy)}>{s.label}</button>
            ))}
          </div>
          {loadingCampaigns ? <div className={styles.loading} aria-live="polite">加载中…</div> : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>名称</th><th>类型</th><th>状态</th><th>发送</th><th>打开率</th><th>点击率</th></tr>
                </thead>
                <tbody>
                  {allCampaigns.map((c) => (
                    <tr key={`${c.type}-${c.id}`} className={styles.row}
                      onClick={() => navigate(`/${c.type === 'broadcast' ? 'broadcasts' : 'automations'}/detail/${c.id}`)}>
                      <td className={styles.tdName}>{c.name}</td>
                      <td><span className={styles.typeBadge}>{c.type === 'broadcast' ? '广播' : '自动化'}</span></td>
                      <td className={styles.muted}>{c.status}</td>
                      <td>{c.sent}</td>
                      <td>{pct(c.openRate)}</td>
                      <td>{pct(c.clickRate)}</td>
                    </tr>
                  ))}
                  {allCampaigns.length === 0 && (
                    <tr><td colSpan={6} className={styles.emptyCell}>暂无活动数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: List health */}
      {hash === 'health' && (
        <div className={styles.tabContent}>
          {loadingHealth ? (
            <div className={styles.loading} aria-live="polite">加载中…</div>
          ) : health ? (
            <>
              <div className={styles.statsRow}>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{health.totalActive}</span>
                  <span className={styles.statLabel}>活跃订阅者</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statValue}>{pct(health.activeRate)}</span>
                  <span className={styles.statLabel}>90 天活跃率</span>
                </div>
              </div>
              {health.growth.length > 0 ? (
                <div className={styles.card}>
                  <h2 className={styles.cardTitle}>订阅者增长趋势（近 6 个月）</h2>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={health.growth} margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E0E5EB" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="newContacts" name="新增" fill="#1976D2" />
                      <Bar dataKey="unsubscribed" name="退订" fill="#DC3545" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className={styles.emptyMsg}>暂无订阅者数据</div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
