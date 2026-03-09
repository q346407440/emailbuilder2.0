import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '@shared/api/apiClient';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import styles from './BroadcastDetailPage.module.css';

interface BroadcastDetail {
  id: string; name: string; subject: string; previewText: string | null;
  status: string; templateId: string | null; templateTitle: string | null;
  templatePreviewUrl: string | null; segmentId: string | null;
  segmentName: string | null; segmentCount: number;
  scheduledAt: string | null; sentAt: string | null;
  totalCount: number; sentCount: number; failedCount: number;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', scheduled: '排期中', sending: '发送中',
  completed: '已完成', paused: '已暂停', failed: '失败',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [broadcast, setBroadcast] = useState<BroadcastDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pausing, setPausing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiGet<BroadcastDetail>(`/api/broadcasts/${id}`);
      setBroadcast(data);
      // Stop polling when done
      if (data.status !== 'sending' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err) {
      toastLoadError(err, '加载失败');
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchDetail().finally(() => setLoading(false));
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id, fetchDetail]);

  useEffect(() => {
    if (broadcast?.status === 'sending' && !pollRef.current) {
      pollRef.current = setInterval(fetchDetail, 5000);
    }
  }, [broadcast?.status, fetchDetail]);

  const handlePause = async () => {
    if (!id || pausing) return;
    setPausing(true);
    try {
      await apiPost(`/api/broadcasts/${id}/pause`);
      toast('已暂停', 'success');
      void fetchDetail();
    } catch (err) { toast(`暂停失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setPausing(false); }
  };

  if (loading) {
    return <div className={styles.page}><div className={styles.loading} aria-live="polite">加载中…</div></div>;
  }

  if (!broadcast) {
    return <div className={styles.page}><div className={styles.loading}>找不到广播活动</div></div>;
  }

  const progressPct = broadcast.totalCount > 0
    ? Math.round((broadcast.sentCount + broadcast.failedCount) / broadcast.totalCount * 100)
    : 0;

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <button className={styles.breadLink} onClick={() => navigate('/broadcasts')}>广播活动</button>
        <span className={styles.breadSep}>›</span>
        <span>{broadcast.name}</span>
      </div>

      <div className={styles.layout}>
        {/* Left: info */}
        <div className={styles.infoCol}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h1 className={styles.title}>{broadcast.name}</h1>
              <span className={`${styles.badge} ${styles[`badge_${broadcast.status}`] ?? ''}`}>
                {broadcast.status === 'sending' && <span className={styles.dot} />}
                {STATUS_LABELS[broadcast.status] ?? broadcast.status}
              </span>
            </div>

            <div className={styles.meta}>
              <div className={styles.metaRow}><span className={styles.metaLabel}>邮件主旨</span><span>{broadcast.subject}</span></div>
              {broadcast.previewText && <div className={styles.metaRow}><span className={styles.metaLabel}>预览文案</span><span className={styles.muted}>{broadcast.previewText}</span></div>}
              <div className={styles.metaRow}><span className={styles.metaLabel}>模板</span><span>{broadcast.templateTitle ?? '—'}</span></div>
              <div className={styles.metaRow}><span className={styles.metaLabel}>受众</span><span>{broadcast.segmentName ?? '—'}{broadcast.segmentCount > 0 ? ` (${broadcast.segmentCount} 位)` : ''}</span></div>
              <div className={styles.metaRow}><span className={styles.metaLabel}>排期时间</span><span>{formatDate(broadcast.scheduledAt)}</span></div>
              {broadcast.sentAt && <div className={styles.metaRow}><span className={styles.metaLabel}>发送完成</span><span>{formatDate(broadcast.sentAt)}</span></div>}
              <div className={styles.metaRow}><span className={styles.metaLabel}>创建时间</span><span className={styles.muted}>{formatDate(broadcast.createdAt)}</span></div>
            </div>
          </div>

          {/* Actions */}
          <div className={styles.actionRow}>
            {broadcast.status === 'sending' && (
              <button className={styles.pauseBtn} onClick={handlePause} disabled={pausing}>
{pausing ? '暂停中…' : '⏸ 暂停发送'}
            </button>
            )}
            <button className={styles.analyticsBtn} onClick={() => navigate(`/broadcasts/analytics/${id}`)}>
              📊 查看数据报告
            </button>
          </div>
        </div>

        {/* Right: progress */}
        <div className={styles.progressCol}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>发送进度</h2>

            <div className={styles.progressNumbers}>
              <div className={styles.progressStat}><span className={styles.progressNum} style={{ color: '#16a34a' }}>{broadcast.sentCount}</span><span>成功</span></div>
              <div className={styles.progressStat}><span className={styles.progressNum} style={{ color: '#DC3545' }}>{broadcast.failedCount}</span><span>失败</span></div>
              <div className={styles.progressStat}><span className={styles.progressNum}>{broadcast.totalCount}</span><span>总计</span></div>
            </div>

            {broadcast.totalCount > 0 && (
              <>
                <div className={styles.progressBarWrap}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFillGreen} style={{ width: `${Math.round(broadcast.sentCount / broadcast.totalCount * 100)}%` }} />
                    <div className={styles.progressFillRed} style={{ width: `${Math.round(broadcast.failedCount / broadcast.totalCount * 100)}%` }} />
                  </div>
                  <span className={styles.progressPct}>{progressPct}%</span>
                </div>
              </>
            )}

            {broadcast.status === 'sending' && (
              <p className={styles.pollingNote}>
                <span className={styles.dot} />
                每 5 秒自动刷新
              </p>
            )}
            {broadcast.status === 'draft' && broadcast.totalCount === 0 && (
              <p className={styles.pollingNote}>尚未发送</p>
            )}
            {broadcast.status === 'completed' && (
              <p className={styles.completedNote}>✅ 发送完成于 {formatDate(broadcast.sentAt)}</p>
            )}
          </div>

          {/* Template preview thumb */}
          {broadcast.templatePreviewUrl && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>邮件模板</h2>
              <img src={broadcast.templatePreviewUrl} alt="template" className={styles.templateThumb} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
