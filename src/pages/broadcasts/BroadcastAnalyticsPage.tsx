import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { apiGet } from '@shared/api/apiClient';
import { toastLoadError } from '@shared/store/useToastStore';
import styles from './BroadcastAnalyticsPage.module.css';

interface Stats {
  sent: number; delivered: number; opens: number; clicks: number; unsubs: number;
  openRate: number; clickRate: number; unsubRate: number; deliveryRate: number;
}
interface TrendPoint { hour: string; opens: number; clicks: number; }
interface LinkStat { url: string; clicks: number; uniqueClicks: number; clickRate: number; lastClick: string; }

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function fmt(d: string) { return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

export default function BroadcastAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [links, setLinks] = useState<LinkStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [broadcastName, setBroadcastName] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiGet<Stats>(`/api/broadcasts/${id}/stats`),
      apiGet<TrendPoint[]>(`/api/broadcasts/${id}/trends`),
      apiGet<LinkStat[]>(`/api/broadcasts/${id}/link-stats`),
      apiGet<{ name: string }>(`/api/broadcasts/${id}`),
    ])
      .then(([s, t, l, b]) => { setStats(s); setTrends(t); setLinks(l); setBroadcastName(b.name); })
      .catch((err) => toastLoadError(err, '加载数据失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const funnel = stats ? [
    { name: '发送', value: stats.sent, fill: '#1976D2' },
    { name: '送达', value: stats.delivered, fill: '#42A5F5' },
    { name: '打开', value: stats.opens, fill: '#26C6DA' },
    { name: '点击', value: stats.clicks, fill: '#66BB6A' },
  ] : [];

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumb}>
        <button className={styles.breadLink} onClick={() => navigate(`/broadcasts/detail/${id}`)}>← 返回活动详情</button>
        <span> › 数据报告</span>
      </div>
      <h1 className={styles.title}>{broadcastName || '广播活动'} — 数据报告</h1>

      {loading ? (
        <div className={styles.loading} aria-live="polite">加载中…</div>
      ) : !stats ? null : (
        <>
          {/* Stats cards */}
          <div className={styles.statsRow}>
            {[
              { label: '发送总数', value: String(stats.sent), sub: '' },
              { label: '送达率', value: pct(stats.deliveryRate), sub: `${stats.delivered} 封` },
              { label: '打开率', value: pct(stats.openRate), sub: `${stats.opens} 人` },
              { label: '点击率', value: pct(stats.clickRate), sub: `${stats.clicks} 人` },
            ].map((s) => (
              <div key={s.label} className={styles.statCard}>
                <span className={styles.statValue}>{s.value}</span>
                <span className={styles.statLabel}>{s.label}</span>
                {s.sub && <span className={styles.statSub}>{s.sub}</span>}
              </div>
            ))}
          </div>

          {/* Funnel */}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>发送漏斗</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart layout="vertical" data={funnel} margin={{ left: 40, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 13, fill: '#5C6B7A' }} width={50} />
                <Tooltip formatter={(v) => [v, '人数']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {funnel.map((e) => (
                    <rect key={e.name} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Trend chart */}
          {trends.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>打开 / 点击趋势（按小时）</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trends.map((t) => ({ ...t, hour: fmt(t.hour) }))} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E5EB" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="opens" stroke="#1976D2" name="打开" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="clicks" stroke="#66BB6A" name="点击" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Link stats */}
          {links.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>链接点击明细</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>链接</th><th>点击次数</th><th>独立点击</th><th>点击率</th><th>最后点击</th></tr></thead>
                  <tbody>
                    {links.map((l, i) => (
                      <tr key={i}>
                        <td className={styles.tdUrl} title={l.url}>{l.url.slice(0, 60)}{l.url.length > 60 ? '…' : ''}</td>
                        <td>{l.clicks}</td>
                        <td>{l.uniqueClicks}</td>
                        <td>{pct(l.clickRate)}</td>
                        <td className={styles.muted}>{l.lastClick ? fmt(l.lastClick) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {stats.unsubs > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>退订</h2>
              <p className={styles.muted}>共 {stats.unsubs} 位联系人退订（{pct(stats.unsubRate)}）</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
