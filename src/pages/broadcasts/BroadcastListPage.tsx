import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from '@features/email-editor/components/RightPanel/editors/Select';
import { apiGet, apiDelete, apiPost } from '@shared/api/apiClient';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import Modal, { ModalFooter, ConfirmText } from '@shared/ui/Modal';
import styles from './BroadcastListPage.module.css';

interface Broadcast {
  id: string; name: string; subject: string; status: string;
  templateId: string | null; segmentName: string | null; segmentCount: number;
  scheduledAt: string | null; sentAt: string | null;
  totalCount: number; sentCount: number; failedCount: number;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', scheduled: '排期中', sending: '发送中', completed: '已完成', paused: '已暂停', failed: '失败',
};

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'scheduled', label: '排期中' },
  { value: 'sending', label: '发送中' },
  { value: 'completed', label: '已完成' },
  { value: 'paused', label: '已暂停' },
];

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function BroadcastListPage() {
  const navigate = useNavigate();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Broadcast | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetch = useCallback(async (status: string, options?: { background?: boolean }) => {
    if (!options?.background) setLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '20' });
      if (status) params.set('status', status);
      const res = await apiGet<{ data: Broadcast[]; total: number }>(`/api/broadcasts?${params}`);
      setBroadcasts(res.data);
      setTotal(res.total);
    } catch (err) { toastLoadError(err, '加载失败'); }
    finally { if (!options?.background) setLoading(false); }
  }, []);

  useEffect(() => { void fetch(''); }, [fetch]);

  const handleDeleteClick = (b: Broadcast) => setDeleteTarget(b);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/broadcasts/${deleteTarget.id}`);
      toast('已删除', 'success');
      setDeleteTarget(null);
      void fetch(statusFilter);
    } catch (err) {
      toast(`删除失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handlePause = async (b: Broadcast) => {
    try {
      await apiPost(`/api/broadcasts/${b.id}/pause`);
      toast('已暂停', 'success');
      void fetch(statusFilter);
    } catch (err) { toast(`暂停失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>广播活动</h1>
          <p className={styles.subtitle}>向受众分组批量发送邮件</p>
        </div>
        <button type="button" className={styles.newBtn} onClick={() => navigate('/broadcasts/new')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建广播活动
        </button>
      </div>

      <div className={styles.toolbar}>
        <Select
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            void fetch(v, { background: true });
          }}
          options={STATUS_FILTER_OPTIONS}
          aria-label="按状态筛选"
          fullWidth={false}
          className={styles.statusFilterSelect}
        />
        <span className={styles.total}>共 {total} 个活动</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>活动名称</th><th>主旨</th><th>受众</th><th>状态</th><th>发送进度</th><th>时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}><td colSpan={7}><div className={styles.skeleton} /></td></tr>
              ))
            ) : broadcasts.length === 0 ? (
              <tr><td colSpan={7} className={styles.emptyCell}>
                暂无广播活动，点击「新建广播活动」开始
              </td></tr>
            ) : broadcasts.map((b) => (
              <tr key={b.id} className={styles.row} onClick={() => navigate(`/broadcasts/detail/${b.id}`)}>
                <td className={styles.tdName}>{b.name}</td>
                <td className={styles.tdSubject}>{b.subject}</td>
                <td className={styles.muted}>{b.segmentName ?? '—'}{b.segmentCount > 0 ? ` (${b.segmentCount})` : ''}</td>
                <td><span className={`${styles.badge} ${styles[`badge_${b.status}`] ?? ''}`}>
                  {b.status === 'sending' && <span className={styles.dot} />}
                  {STATUS_LABELS[b.status] ?? b.status}
                </span></td>
                <td>
                  {b.totalCount > 0 ? (
                    <div className={styles.progress}>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: `${Math.round(b.sentCount / b.totalCount * 100)}%` }} />
                      </div>
                      <span className={styles.progressText}>{b.sentCount}/{b.totalCount}</span>
                    </div>
                  ) : <span className={styles.muted}>—</span>}
                </td>
                <td className={styles.muted}>{b.sentAt ? formatDate(b.sentAt) : formatDate(b.scheduledAt)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className={styles.actions}>
                    <button className={styles.actionBtn} onClick={() => navigate(`/broadcasts/detail/${b.id}`)}>详情</button>
                    {b.status === 'sending' && (
                      <button className={`${styles.actionBtn} ${styles.actionBtnWarn}`} onClick={() => handlePause(b)}>暂停</button>
                    )}
                    {(b.status === 'draft' || b.status === 'completed') && (
                      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => handleDeleteClick(b)}>删除</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
