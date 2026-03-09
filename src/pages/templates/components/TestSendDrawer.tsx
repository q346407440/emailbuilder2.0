/**
 * 模板测试发送抽屉（Phase 3）
 * 允许用户输入测试邮箱、选择 Gmail 账号、选择 Shoplazza 店铺、
 * 手动填写变量值，然后发送一封渲染后的测试邮件。
 */
import { useState, useEffect } from 'react';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import {
  serverListGmailAccounts,
  serverGetShoplazzaIntegrations,
  serverSendTestEmail,
  type GmailAccount,
  type ShoplazzaIntegrationStatus,
} from '@shared/api/serverApi';
import { toast } from '@shared/store/useToastStore';
import styles from './TestSendDrawer.module.css';

interface Props {
  templateId: string;
  templateTitle: string;
  customVariables: CustomVariableDefinition[];
  onClose: () => void;
}

export default function TestSendDrawer({ templateId, templateTitle, customVariables, onClose }: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(`[测试] ${templateTitle}`);
  const [gmailAccountId, setGmailAccountId] = useState('');
  const [shopIntegrationId, setShopIntegrationId] = useState('');
  const [sampleData, setSampleData] = useState<Record<string, string>>({});
  const [gmailAccounts, setGmailAccounts] = useState<GmailAccount[]>([]);
  const [shops, setShops] = useState<ShoplazzaIntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      serverListGmailAccounts().catch(() => ({ accounts: [], lastSelectedGmailId: null })),
      serverGetShoplazzaIntegrations().catch(() => ({ shops: [] })),
    ]).then(([gmailRes, shopRes]) => {
      if (cancelled) return;
      setGmailAccounts(gmailRes.accounts);
      if (gmailRes.lastSelectedGmailId) setGmailAccountId(gmailRes.lastSelectedGmailId);
      else if (gmailRes.accounts.length > 0) setGmailAccountId(gmailRes.accounts[0].id);
      setShops(shopRes.shops);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleSend = async () => {
    if (!to.trim()) { toast('请填写收件人邮箱', 'error'); return; }
    if (!subject.trim()) { toast('请填写邮件主旨', 'error'); return; }
    if (!gmailAccountId) { toast('请选择发件 Gmail 账号', 'error'); return; }

    setSending(true);
    try {
      await serverSendTestEmail(templateId, {
        to: to.trim(),
        subject: subject.trim(),
        gmailAccountId,
        sampleData,
        shopIntegrationId: shopIntegrationId || undefined,
      });
      toast(`测试邮件已发送至 ${to.trim()}`, 'success');
      onClose();
    } catch (err) {
      toast(`发送失败：${err instanceof Error ? err.message : '未知错误'}`, 'error');
    } finally {
      setSending(false);
    }
  };

  // 过滤出需要手动填写的标量变量（非 shop.* / product.* 可由 Shoplazza 注入）
  const manualVars = customVariables.filter((v) => {
    if (shopIntegrationId && (v.key.startsWith('shop.') || v.key.startsWith('product.'))) return false;
    return true;
  });

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.drawer}>
        <div className={styles.header}>
          <h2 className={styles.title}>测试发送</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingWrap}>
            <span className={styles.loadingText}>加载中…</span>
          </div>
        ) : (
          <div className={styles.body}>
            {/* 收件人 */}
            <div className={styles.field}>
              <label className={styles.label}>收件人邮箱 <span className={styles.required}>*</span></label>
              <input
                type="email"
                className={styles.input}
                placeholder="test@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                autoFocus
              />
            </div>

            {/* 主旨 */}
            <div className={styles.field}>
              <label className={styles.label}>邮件主旨 <span className={styles.required}>*</span></label>
              <input
                type="text"
                className={styles.input}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            {/* Gmail 账号 */}
            <div className={styles.field}>
              <label className={styles.label}>发件 Gmail 账号 <span className={styles.required}>*</span></label>
              {gmailAccounts.length === 0 ? (
                <p className={styles.hint}>尚未授权 Gmail 账号，请前往「设置 → 集成」完成授权。</p>
              ) : (
                <select
                  className={styles.select}
                  value={gmailAccountId}
                  onChange={(e) => setGmailAccountId(e.target.value)}
                >
                  {gmailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.gmailAddress}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Shoplazza 店铺（可选） */}
            <div className={styles.field}>
              <label className={styles.label}>注入 Shoplazza 数据（可选）</label>
              <select
                className={styles.select}
                value={shopIntegrationId}
                onChange={(e) => setShopIntegrationId(e.target.value)}
              >
                <option value="">不注入店铺数据</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>{s.shopName || s.shopDomain}</option>
                ))}
              </select>
              {shopIntegrationId && (
                <p className={styles.hint}>将自动注入 shop.* 与 product.* 数据（取第一个商品）。</p>
              )}
            </div>

            {/* 手动填写变量值 */}
            {manualVars.length > 0 && (
              <div className={styles.varsSection}>
                <p className={styles.varsTitle}>手动填写变量值</p>
                <p className={styles.varsDesc}>以下变量将在渲染时替换，留空则保留占位符。</p>
                {manualVars.map((v) => (
                  <div key={v.key} className={styles.varField}>
                    <label className={styles.varLabel}>
                      <code className={styles.varKey}>{`{{${v.key}}}`}</code>
                      {v.label && <span className={styles.varLabelText}>{v.label}</span>}
                    </label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder={v.defaultValue ?? `${v.key} 的值`}
                      value={sampleData[v.key] ?? ''}
                      onChange={(e) => setSampleData((prev) => ({ ...prev, [v.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button
            type="button"
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={sending || loading || !gmailAccountId || !to.trim()}
          >
            {sending ? '发送中…' : '发送测试邮件'}
          </button>
        </div>
      </div>
    </div>
  );
}
