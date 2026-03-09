import { useState } from 'react';
import { apiPost } from '@shared/api/apiClient';
import { toast } from '@shared/store/useToastStore';
import styles from './ShoplazzaConnectDrawer.module.css';

interface ConnectResult {
  shopName: string;
  shopDomain: string;
  status: string;
  subscribedTopics: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: (result: ConnectResult) => void;
}

export default function ShoplazzaConnectDrawer({ open, onClose, onConnected }: Props) {
  const [shopDomain, setShopDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const domain = shopDomain.trim();
    const token = accessToken.trim();

    if (!domain) { setError('请填写店铺域名'); return; }
    if (!token) { setError('请填写 Access Token'); return; }

    setLoading(true);
    try {
      const result = await apiPost<ConnectResult>('/api/integrations/shoplazza/connect', {
        shopDomain: domain,
        accessToken: token,
      }, { timeoutMs: 20000 });
      toast(`已成功连接 ${result.shopName}`, 'success');
      onConnected(result);
      onClose();
      setShopDomain('');
      setAccessToken('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.drawer}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.logo}>
              <svg width="22" height="22" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="8" fill="#4F46E5"/>
                <path d="M10 18l5 5 11-11" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            连接 Shoplazza
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Instructions */}
        <div className={styles.steps}>
          <p className={styles.stepsTitle}>如何获取 Access Token：</p>
          <ol className={styles.stepList}>
            <li>进入 <b>Shoplazza 后台</b> → <b>应用</b> → <b>开发应用</b></li>
            <li>点击「<b>创建应用</b>」→ 填写应用名称</li>
            <li>在「<b>API 访问范围</b>」中勾选：
              <code>read_shop</code>、<code>read_customer</code>、<code>read_product</code>、<code>read_order</code>，以及弃单/结账相关范围（如 <code>read_checkout</code>，以 Shoplazza 后台实际选项为准）
            </li>
            <li>安装应用后，复制 <b>Admin API 访问令牌</b></li>
          </ol>
        </div>

        <form className={styles.form} onSubmit={handleConnect}>
          {error && <p className={styles.errorMsg}>{error}</p>}

          <label className={styles.field}>
            店铺域名
            <input
              type="text"
              className={styles.input}
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              placeholder="your-store.myshoplazza.com"
              autoFocus
              disabled={loading}
            />
            <span className={styles.hint}>填入你的 Shoplazza 店铺域名（不含 https://）</span>
          </label>

          <label className={styles.field}>
            Access Token
            <input
              type="password"
              className={styles.input}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="shppa_xxxxxxxxxxxxxxxxxxxxxxxx"
              disabled={loading}
            />
            <span className={styles.hint}>在 Shoplazza 后台「开发应用」中复制 Admin API 访问令牌</span>
          </label>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={loading}>
              取消
            </button>
            <button type="submit" className={styles.connectBtn} disabled={loading}>
              {loading ? (
                <>
                  <span className={styles.spinner} />
                  验证中...
                </>
              ) : '验证并连接'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
