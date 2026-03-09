import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiDelete } from '@shared/api/apiClient';
import { toast } from '@shared/store/useToastStore';
import styles from './SegmentListPage.module.css';

interface Segment { id: string; name: string; type: string; count: number; createdAt: string; }
interface Contact { id: string; email: string; name: string | null; status: string; updatedAt: string; }

const STATUS_LABELS: Record<string, string> = { subscribed: '订阅中', unsubscribed: '已退订' };

export default function SegmentListPage() {
  const navigate = useNavigate();
  const { id: activeSegmentId } = useParams<{ id?: string }>();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSegName, setNewSegName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Selected segment detail
  const [detailContacts, setDetailContacts] = useState<Contact[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearch, setDetailSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<Contact[]>([]);
  const [addLoading, setAddLoading] = useState(false);

  const fetchSegments = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiGet<Segment[]>('/api/segments');
      setSegments(list);
    } catch (err) { toast(`加载失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setLoading(false); }
  }, []);

  const fetchDetailContacts = useCallback(async (segId: string, q = '') => {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      if (q.trim()) params.set('search', q.trim());
      const res = await apiGet<{ data: Contact[]; total: number }>(`/api/segments/${segId}/contacts?${params}`);
      setDetailContacts(res.data);
      setDetailTotal(res.total);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { void fetchSegments(); }, [fetchSegments]);
  useEffect(() => {
    if (activeSegmentId) { setDetailSearch(''); void fetchDetailContacts(activeSegmentId); }
  }, [activeSegmentId, fetchDetailContacts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSegName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const seg = await apiPost<Segment>('/api/segments', { name });
      toast(`分组「${seg.name}」已创建`, 'success');
      setNewSegName('');
      setShowCreateModal(false);
      await fetchSegments();
      navigate(`/audience/segments/${seg.id}`);
    } catch (err) { toast(`创建失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setCreating(false); }
  };

  const handleRename = async (id: string) => {
    const name = editingName.trim();
    if (!name) return;
    try {
      await apiPut(`/api/segments/${id}`, { name });
      toast('已更新', 'success');
      setEditingId(null);
      await fetchSegments();
    } catch (err) { toast(`更新失敗：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const handleDelete = async (seg: Segment) => {
    if (!window.confirm(`确定删除分组「${seg.name}」？联系人不会被删除。`)) return;
    try {
      await apiDelete(`/api/segments/${seg.id}`);
      toast('已删除', 'success');
      if (activeSegmentId === seg.id) navigate('/audience/segments');
      await fetchSegments();
    } catch (err) { toast(`删除失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const handleRemoveContact = async (contactId: string) => {
    if (!activeSegmentId) return;
    try {
      await apiDelete(`/api/segments/${activeSegmentId}/contacts/${contactId}`);
      toast('已移除', 'success');
      void fetchDetailContacts(activeSegmentId, detailSearch);
      void fetchSegments();
    } catch (err) { toast(`移除失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const handleAddSearch = async (q: string) => {
    setAddSearch(q);
    if (!q.trim() || !activeSegmentId) { setAddResults([]); return; }
    setAddLoading(true);
    try {
      const res = await apiGet<{ data: Contact[] }>(`/api/contacts?search=${encodeURIComponent(q)}&pageSize=20`);
      setAddResults(res.data);
    } catch { /* ignore */ }
    finally { setAddLoading(false); }
  };

  const handleAddContact = async (contactId: string) => {
    if (!activeSegmentId) return;
    try {
      await apiPost(`/api/segments/${activeSegmentId}/contacts`, { contactIds: [contactId] });
      toast('已加入分組', 'success');
      void fetchDetailContacts(activeSegmentId, detailSearch);
      void fetchSegments();
      setShowAddModal(false);
      setAddSearch('');
      setAddResults([]);
    } catch (err) { toast(`加入失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const activeSegment = segments.find((s) => s.id === activeSegmentId);

  return (
    <div className={styles.page}>
      {/* Left: segment list */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>分組</span>
          <button className={styles.createBtn} onClick={() => setShowCreateModal(true)}>+ 新建</button>
        </div>
        {loading ? (
          <div className={styles.sidebarLoading} aria-live="polite">加载中…</div>
        ) : segments.length === 0 ? (
          <div className={styles.sidebarEmpty}>
            <p>暂无分组</p>
            <button className={styles.createBtnFull} onClick={() => setShowCreateModal(true)}>建立第一个分组</button>
          </div>
        ) : (
          <ul className={styles.segmentList}>
            {segments.map((s) => (
              <li
                key={s.id}
                className={`${styles.segmentItem}${activeSegmentId === s.id ? ` ${styles.segmentItemActive}` : ''}`}
                onClick={() => navigate(`/audience/segments/${s.id}`)}
              >
                {editingId === s.id ? (
                  <form onSubmit={(e) => { e.preventDefault(); void handleRename(s.id); }} onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      className={styles.editInput}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => { if (editingName.trim() !== s.name) void handleRename(s.id); else setEditingId(null); }}
                    />
                  </form>
                ) : (
                  <>
                    <span className={styles.segmentName}>{s.name}</span>
                    <span className={styles.segmentCount}>{s.count}</span>
                    <div className={styles.segmentActions} onClick={(e) => e.stopPropagation()}>
                      <button className={styles.iconBtn} title="重命名" onClick={() => { setEditingId(s.id); setEditingName(s.name); }}>✎</button>
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="删除" onClick={() => handleDelete(s)}>✕</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: segment detail */}
      <div className={styles.main}>
        {!activeSegmentId ? (
          <div className={styles.selectPrompt}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <p>请选择左侧分组查看联系人</p>
          </div>
        ) : (
          <>
            <div className={styles.mainHeader}>
              <div>
                <h2 className={styles.mainTitle}>{activeSegment?.name ?? '…'}</h2>
                <p className={styles.mainSubtitle}>静态分组 · {detailTotal} 位联系人</p>
              </div>
              <button className={styles.addContactBtn} onClick={() => setShowAddModal(true)}>
                + 添加联系人
              </button>
            </div>

            <div className={styles.detailSearch}>
              <input
                type="text"
                placeholder="搜索..."
                value={detailSearch}
                onChange={(e) => {
                  setDetailSearch(e.target.value);
                  void fetchDetailContacts(activeSegmentId, e.target.value);
                }}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>姓名</th><th>邮箱</th><th>状态</th><th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLoading ? (
                    <tr><td colSpan={4} className={styles.emptyCell} aria-live="polite">加载中…</td></tr>
                  ) : detailContacts.length === 0 ? (
                    <tr><td colSpan={4} className={styles.emptyCell}>分组中暂无联系人</td></tr>
                  ) : detailContacts.map((c) => (
                    <tr key={c.id} className={styles.row}>
                      <td>{c.name ?? <span className={styles.muted}>—</span>}</td>
                      <td className={styles.tdEmail}>{c.email}</td>
                      <td><span className={styles.statusBadge}>{STATUS_LABELS[c.status] ?? c.status}</span></td>
                      <td>
                        <button className={styles.removeBtn} onClick={() => handleRemoveContact(c.id)}>移除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Create segment modal */}
      {showCreateModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>新建分组</h3>
            <form onSubmit={handleCreate}>
              <input
                autoFocus
                type="text"
                className={styles.modalInput}
                placeholder="分组名称"
                value={newSegName}
                onChange={(e) => setNewSegName(e.target.value)}
                maxLength={100}
              />
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalCancel} onClick={() => setShowCreateModal(false)}>取消</button>
                <button type="submit" className={styles.modalConfirm} disabled={creating || !newSegName.trim()}>
                  {creating ? '创建中…' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add contact modal */}
      {showAddModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowAddModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>添加联系人到「{activeSegment?.name}」</h3>
            <input
              autoFocus
              type="text"
              className={styles.modalInput}
              placeholder="搜索邮箱 / 姓名…"
              value={addSearch}
              onChange={(e) => handleAddSearch(e.target.value)}
            />
            <div className={styles.addResults}>
              {addLoading ? <p className={styles.addEmpty} aria-live="polite">搜索中…</p> :
               addResults.length === 0 && addSearch ? <p className={styles.addEmpty}>没有结果</p> :
               addResults.map((c) => (
                <div key={c.id} className={styles.addResultItem}>
                  <div><p className={styles.addResultEmail}>{c.email}</p>{c.name && <p className={styles.muted}>{c.name}</p>}</div>
                  <button className={styles.addResultBtn} onClick={() => handleAddContact(c.id)}>加入</button>
                </div>
              ))}
            </div>
            <button type="button" className={styles.modalCancel} onClick={() => setShowAddModal(false)} style={{ marginTop: 8 }}>关闭</button>
          </div>
        </div>
      )}
    </div>
  );
}
