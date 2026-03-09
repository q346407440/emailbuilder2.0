import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '@shared/api/apiClient';
import { toast, toastLoadError } from '@shared/store/useToastStore';
import styles from './SchemaManagementPage.module.css';

interface VariableSchema {
  key: string; label: string; contentType: string; group: string;
  description: string | null; shoplazzaField: string | null; isCustom: boolean;
}

const GROUP_LABELS: Record<string, string> = {
  user: '用户', shop: '店铺', product: '商品', order: '订单', promo: '促销', custom: '自定义',
};
const TYPE_LABELS: Record<string, string> = { text: '文本', image: '图片', link: '链接' };
const TYPE_COLORS: Record<string, string> = { text: '#1976D2', image: '#26C6DA', link: '#66BB6A' };

export default function SchemaManagementPage() {
  const [schema, setSchema] = useState<VariableSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey] = useState('custom.');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'text' | 'image' | 'link'>('text');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiGet<VariableSchema[]>('/api/variable-schema');
      setSchema(list);
    } catch (err) { toastLoadError(err, '加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.startsWith('custom.') || newKey.length <= 7) { toast('key 必须以 custom. 开头且不能为空', 'error'); return; }
    if (!newLabel.trim()) { toast('请填写说明', 'error'); return; }
    setCreating(true);
    try {
      await apiPost('/api/variable-schema', { key: newKey.trim(), label: newLabel.trim(), contentType: newType });
      toast('已新增自定义变量', 'success');
      setShowModal(false); setNewKey('custom.'); setNewLabel('');
      void load();
    } catch (err) { toast(`新增失败：${err instanceof Error ? err.message : ''}`, 'error'); }
    finally { setCreating(false); }
  };

  const handleDelete = async (key: string) => {
    if (!window.confirm(`确定删除 ${key}？`)) return;
    try {
      await apiDelete(`/api/variable-schema/${encodeURIComponent(key)}`);
      toast('已删除', 'success');
      void load();
    } catch (err) { toast(`删除失败：${err instanceof Error ? err.message : ''}`, 'error'); }
  };

  const groups = Array.from(new Set(schema.map((s) => s.group)));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>变量 Schema 管理</h2>
          <p className={styles.subtitle}>所有可在模板中使用的标准变量 key 及其说明</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowModal(true)}>+ 新增自定义变量</button>
      </div>

      {loading ? <div className={styles.loading} aria-live="polite">加载中…</div> : (
        groups.map((group) => (
          <section key={group} className={styles.groupSection}>
            <h3 className={styles.groupTitle}>{GROUP_LABELS[group] ?? group}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>变量 key</th><th>中文说明</th><th>类型</th><th>Shoplazza 字段</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {schema.filter((s) => s.group === group).map((s) => (
                    <tr key={s.key}>
                      <td><code className={styles.keyCode}>{s.key}</code></td>
                      <td>{s.label}</td>
                      <td>
                        <span className={styles.typeBadge} style={{ color: TYPE_COLORS[s.contentType] ?? '#888' }}>
                          {TYPE_LABELS[s.contentType] ?? s.contentType}
                        </span>
                      </td>
                      <td className={styles.muted}>{s.shoplazzaField ?? '—'}</td>
                      <td>
                        {s.isCustom && (
                          <button className={styles.deleteBtn} onClick={() => handleDelete(s.key)}>删除</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {showModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>新增自定义变量</h3>
            <form onSubmit={handleCreate} className={styles.modalForm}>
              <label className={styles.field}>
                变量 key（必须以 custom. 开头）
                <input type="text" className={styles.input} value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="custom.memberLevel" autoFocus />
              </label>
              <label className={styles.field}>
                中文说明
                <input type="text" className={styles.input} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="会员等级" />
              </label>
              <label className={styles.field}>
                内容类型
                <select className={styles.input} value={newType} onChange={(e) => setNewType(e.target.value as 'text' | 'image' | 'link')}>
                  <option value="text">文本</option>
                  <option value="image">图片</option>
                  <option value="link">链接</option>
                </select>
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>取消</button>
                <button type="submit" className={styles.saveBtn} disabled={creating}>{creating ? '新增中…' : '新增'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
