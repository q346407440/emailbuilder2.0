import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPut, apiPost } from '@shared/api/apiClient';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import styles from './ContactListPage.module.css';

interface Contact {
  id: string;
  email: string;
  name: string | null;
  status: string;
  source: string;
  updatedAt: string;
}

interface ContactDetail extends Contact {
  shoplazzaCustomerId: string | null;
  segments: { id: string; name: string }[];
}

interface Segment { id: string; name: string; count: number; }

const PAGE_SIZE = 50;
const STATUS_LABELS: Record<string, string> = {
  subscribed: '订阅中', unsubscribed: '已退订', bounced: '退信',
};
const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'subscribed', label: '订阅中' },
  { value: 'unsubscribed', label: '已退订' },
  { value: 'bounced', label: '退信' },
];
const SOURCE_LABELS: Record<string, string> = {
  shoplazza_sync: 'Shoplazza', csv_import: 'CSV 导入', manual: '手动',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

export default function ContactListPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerContact, setDrawerContact] = useState<ContactDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showBatchSegMenu, setShowBatchSegMenu] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!filterOpen) {
      setMenuPosition(null);
      return;
    }
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setMenuPosition({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [filterOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (filterRef.current?.contains(t)) return;
      const menu = document.getElementById('contacts-status-dropdown');
      if (menu?.contains(t)) return;
      setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [filterOpen]);

  const fetchContacts = useCallback(async (pg: number, q: string, st: string, options?: { background?: boolean }) => {
    if (!options?.background) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pg), pageSize: String(PAGE_SIZE) });
      if (q.trim()) params.set('search', q.trim());
      if (st) params.set('status', st);
      const res = await apiGet<{ data: Contact[]; total: number }>(`/api/contacts?${params}`);
      setContacts(res.data);
      setTotal(res.total);
    } catch (err) {
      toastLoadError(err, '加载失败');
    } finally {
      if (!options?.background) setLoading(false);
    }
  }, []);

  const fetchSegments = useCallback(async () => {
    try {
      const list = await apiGet<Segment[]>('/api/segments');
      setSegments(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void fetchContacts(1, '', ''); void fetchSegments(); }, [fetchContacts, fetchSegments]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setPage(1); void fetchContacts(1, val, statusFilter); }, 400);
  };

  const handleStatusFilter = (val: string) => {
    setStatusFilter(val);
    setPage(1);
    void fetchContacts(1, search, val, { background: true });
  };

  const handlePageChange = (pg: number) => {
    setPage(pg);
    void fetchContacts(pg, search, statusFilter);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const handleBatchUnsubscribe = async () => {
    if (!window.confirm(`确定将 ${selectedIds.size} 位联系人标记为退订？`)) return;
    try {
      await apiPost('/api/contacts/batch', { action: 'unsubscribe', ids: [...selectedIds] });
      toast('已批量退订', 'success');
      setSelectedIds(new Set());
      void fetchContacts(page, search, statusFilter);
    } catch (err) { toast(`操作失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const handleBatchDelete = async () => {
    if (!window.confirm(`确定删除 ${selectedIds.size} 位联系人？`)) return;
    try {
      await apiPost('/api/contacts/batch', { action: 'delete', ids: [...selectedIds] });
      toast('已删除', 'success');
      setSelectedIds(new Set());
      void fetchContacts(page, search, statusFilter);
    } catch (err) { toast(`删除失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const handleBatchAddToSegment = async (segId: string) => {
    if (!segId) return;
    try {
      await apiPost('/api/contacts/batch', { action: 'add_to_segment', ids: [...selectedIds], segmentId: segId });
      toast('已加入分組', 'success');
      setSelectedIds(new Set());
      setShowBatchSegMenu(false);
      void fetchSegments();
    } catch (err) { toast(`操作失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const openDrawer = async (contact: Contact) => {
    setDrawerLoading(true);
    setDrawerContact({ ...contact, shoplazzaCustomerId: null, segments: [] });
    try {
      const detail = await apiGet<ContactDetail>(`/api/contacts/${contact.id}`);
      setDrawerContact(detail);
    } catch { /* show partial data */ }
    finally { setDrawerLoading(false); }
  };

  const handleDrawerStatusChange = async (status: string) => {
    if (!drawerContact) return;
    try {
      await apiPut(`/api/contacts/${drawerContact.id}`, { status });
      setDrawerContact({ ...drawerContact, status });
      toast('状态已更新', 'success');
      void fetchContacts(page, search, statusFilter);
    } catch (err) { toast(`更新失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>联系人</h1>
          <p className={styles.subtitle}>管理你的邮件订阅者</p>
        </div>
        <button className={styles.importBtn} onClick={() => navigate('/audience/import')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          导入联系人
        </button>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.search}
          placeholder="搜索邮箱 / 姓名…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <div className={`${styles.dropdownWrap} ${filterOpen ? styles.dropdownWrapOpen : ''}`} ref={filterRef}>
          <button
            ref={triggerRef}
            type="button"
            className={styles.dropdownTrigger}
            onClick={() => setFilterOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={filterOpen}
            aria-label="按状态筛选"
          >
            <span className={styles.dropdownLabel}>
              {STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label ?? '全部状态'}
            </span>
            <svg className={styles.dropdownChevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {filterOpen && menuPosition && createPortal(
            <div
              id="contacts-status-dropdown"
              className={styles.dropdownMenu}
              role="listbox"
              aria-label="状态选项"
              style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left, minWidth: menuPosition.width }}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value || 'all'}
                  type="button"
                  role="option"
                  aria-selected={statusFilter === opt.value}
                  className={statusFilter === opt.value ? `${styles.dropdownItem} ${styles.dropdownItemSelected}` : styles.dropdownItem}
                  onClick={() => {
                    handleStatusFilter(opt.value);
                    setFilterOpen(false);
                  }}
                >
                  {statusFilter === opt.value && (
                    <svg className={styles.dropdownCheck} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {opt.label}
                </button>
              ))}
            </div>,
            document.body
          )}
        </div>
        <span className={styles.total}>共 {total} 位</span>
      </div>

      {/* Batch actions (appear when selection > 0) */}
      {selectedIds.size > 0 && (
        <div className={styles.batchBar}>
          <span className={styles.batchCount}>已选 {selectedIds.size} 位</span>
          <div className={styles.batchActions}>
            <div className={styles.segmentDropdown}>
              <button className={styles.batchBtn} onClick={() => setShowBatchSegMenu(!showBatchSegMenu)}>
                加入分組 ▾
              </button>
              {showBatchSegMenu && (
                <div className={styles.segmentMenu}>
                  {segments.length === 0 ? (
                    <p className={styles.segmentMenuEmpty}>暂无分组，请先创建</p>
                  ) : segments.map((s) => (
                    <button key={s.id} className={styles.segmentMenuItem} onClick={() => handleBatchAddToSegment(s.id)}>
                      {s.name} ({s.count})
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className={styles.batchBtn} onClick={handleBatchUnsubscribe}>标记退订</button>
            <button className={`${styles.batchBtn} ${styles.batchBtnDanger}`} onClick={handleBatchDelete}>删除</button>
            <button className={styles.batchClear} onClick={() => setSelectedIds(new Set())}>取消选择</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCheck}>
                <input
                  type="checkbox"
                  checked={contacts.length > 0 && selectedIds.size === contacts.length}
                  onChange={toggleSelectAll}
                  className={styles.checkbox}
                />
              </th>
              <th>姓名</th>
              <th>邮箱</th>
              <th>状态</th>
              <th>来源</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={6}><div className={styles.skeleton} /></td></tr>
              ))
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyCell}>
                  {search || statusFilter ? '没有符合条件的联系人' : '暂无联系人，点击「导入联系人」开始'}
                </td>
              </tr>
            ) : contacts.map((c) => (
              <tr
                key={c.id}
                className={`${styles.row}${selectedIds.has(c.id) ? ` ${styles.rowSelected}` : ''}`}
                onClick={() => openDrawer(c)}
              >
                <td className={styles.tdCheck} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} className={styles.checkbox} />
                </td>
                <td className={styles.tdName}>{c.name ?? <span className={styles.muted}>—</span>}</td>
                <td className={styles.tdEmail}>{c.email}</td>
                <td>
                  <span className={`${styles.statusBadge} ${styles[`status_${c.status}`] ?? ''}`}>
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </td>
                <td className={styles.muted}>{SOURCE_LABELS[c.source] ?? c.source}</td>
                <td className={styles.muted}>{formatDate(c.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button className={styles.pageBtn} disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>← 上一頁</button>
          <span className={styles.pageInfo}>{page} / {totalPages}</span>
          <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)}>下一頁 →</button>
        </div>
      )}

      {/* Detail Drawer */}
      {drawerContact && (
        <>
          <div className={styles.drawerBackdrop} onClick={() => setDrawerContact(null)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>{drawerContact.name ?? drawerContact.email}</h2>
              <button className={styles.drawerClose} onClick={() => setDrawerContact(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {drawerLoading ? (
              <div className={styles.drawerLoading} aria-live="polite">加载中…</div>
            ) : (
              <div className={styles.drawerBody}>
                <div className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>基本信息</h3>
                  <div className={styles.drawerField}><span className={styles.drawerLabel}>邮箱</span><span>{drawerContact.email}</span></div>
                  <div className={styles.drawerField}><span className={styles.drawerLabel}>姓名</span><span>{drawerContact.name ?? '—'}</span></div>
                  {drawerContact.shoplazzaCustomerId && (
                    <div className={styles.drawerField}><span className={styles.drawerLabel}>Shoplazza ID</span><span className={styles.muted}>{drawerContact.shoplazzaCustomerId}</span></div>
                  )}
                  <div className={styles.drawerField}><span className={styles.drawerLabel}>来源</span><span>{SOURCE_LABELS[drawerContact.source] ?? drawerContact.source}</span></div>
                </div>

                <div className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>订阅状态</h3>
                  <div className={styles.statusButtons}>
                    {(['subscribed', 'unsubscribed'] as const).map((s) => (
                      <button
                        key={s}
                        className={`${styles.statusBtn}${drawerContact.status === s ? ` ${styles.statusBtnActive}` : ''}`}
                        onClick={() => handleDrawerStatusChange(s)}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>所属分组</h3>
                  {drawerContact.segments.length === 0 ? (
                    <p className={styles.drawerEmpty}>未加入任何分組</p>
                  ) : (
                    <div className={styles.segmentTags}>
                      {drawerContact.segments.map((seg) => (
                        <span key={seg.id} className={styles.segmentTag}>{seg.name}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>邮件收件历史</h3>
                  <p className={styles.drawerEmpty}>—（Iteration 6 补充）</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
