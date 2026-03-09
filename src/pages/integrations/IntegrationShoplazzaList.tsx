import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiDelete, apiPatch, ApiError } from '@shared/api/apiClient';
import { toast } from '@shared/store/useToastStore';
import ShoplazzaConnectDrawer from '@features/integrations/shoplazza/components/ShoplazzaConnectDrawer';
import styles from './IntegrationListPage.module.css';

interface ShoplazzaShop {
  id: string;
  shopDomain: string;
  shopName?: string;
  subscribedTopics: string[];
  lastSyncedAt?: string | null;
}

interface ShoplazzaStatus {
  status: 'active' | 'disconnected';
  shops?: ShoplazzaShop[];
  shopDomain?: string;
  shopName?: string;
  subscribedTopics?: string[];
  lastSyncedAt?: string | null;
  contactCount?: number;
}

const WEBHOOK_TOPICS: { value: string; label: string }[] = [
  { value: 'customers/create', label: '新顾客' },
  { value: 'orders/paid', label: '订单付款' },
  { value: 'fulfillments/create', label: '发货' },
  { value: 'checkouts/create', label: '弃单' },
];

function getShopsList(status: ShoplazzaStatus): ShoplazzaShop[] {
  if (status.shops?.length) return status.shops;
  if (status.status === 'active' && (status.shopDomain ?? status.shopName)) {
    return [{
      id: '',
      shopDomain: status.shopDomain ?? '',
      shopName: status.shopName,
      subscribedTopics: status.subscribedTopics ?? [],
      lastSyncedAt: status.lastSyncedAt,
    }];
  }
  return [];
}

export default function IntegrationShoplazzaList() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<ShoplazzaStatus>({ status: 'disconnected' });
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [webhookToggling, setWebhookToggling] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await apiGet<ShoplazzaStatus>('/api/integrations/shoplazza/status');
      setStatus(s);
    } catch {
      setStatus({ status: 'disconnected' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const shops = getShopsList(status);
  const isConnected = status.status === 'active';

  const handleSync = async (integrationId: string | undefined) => {
    if (syncingId) return;
    setSyncingId(integrationId ?? '');
    try {
      await apiPost('/api/integrations/shoplazza/sync', integrationId ? { integrationId } : undefined);
      toast('联系人同步任务已排入队列，请稍后查看联系人列表', 'success');
      setTimeout(() => void fetchStatus(), 3000);
    } catch (err) {
      toast(`同步失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = async (shop: ShoplazzaShop) => {
    if (!window.confirm(`确定要断开与 ${shop.shopDomain} 的连接吗？\n这将停止接收 Webhook 事件，已同步的联系人不会删除。`)) return;
    setDisconnectingId(shop.id);
    try {
      const url = shop.id ? `/api/integrations/shoplazza/connect?integrationId=${encodeURIComponent(shop.id)}` : '/api/integrations/shoplazza/connect';
      await apiDelete(url);
      toast('已断开连接', 'success');
      void fetchStatus();
    } catch (err) {
      toast(`断开失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setDisconnectingId(null);
    }
  };

  const handleWebhookToggle = async (integrationId: string, topic: string, checked: boolean) => {
    const shop = shops.find((s) => s.id === integrationId);
    if (!shop) return;
    setWebhookToggling(`${integrationId}:${topic}`);
    try {
      const next = checked
        ? [...shop.subscribedTopics, topic]
        : shop.subscribedTopics.filter((t) => t !== topic);
      await apiPatch<{ subscribedTopics: string[] }>('/api/integrations/shoplazza/webhooks', { integrationId, topics: next });
      toast(checked ? '已订阅该事件' : '已取消订阅', 'success');
      void fetchStatus();
    } catch (err) {
      toast(`操作失败：${err instanceof Error ? err.message : ''}`, 'error');
      if (err instanceof ApiError && (err.status === 410 || err.status === 403)) void fetchStatus();
    } finally {
      setWebhookToggling(null);
    }
  };

  return (
    <>
      <div className={styles.listHeader}>
        <h2 className={styles.listTitle}>Shoplazza</h2>
        <p className={styles.listDesc}>独立站电商平台，连接后可自动同步联系人、接收订单/弃单事件。</p>
      </div>

      {loading ? (
        <div className={styles.loadingRow} aria-live="polite">加载中…</div>
      ) : isConnected ? (
        <>
          <div className={styles.authList}>
            {shops.map((shop) => (
              <div key={shop.id || shop.shopDomain} className={styles.authRow}>
                <div className={styles.authMain}>
                  <span className={styles.authTitle} title={shop.shopDomain}>
                    {shop.shopName || shop.shopDomain}
                  </span>
                  <span className={styles.authMeta}>{shop.shopDomain}</span>
                </div>
                <div className={styles.authActions}>
                  <button
                    type="button"
                    className={styles.detailLink}
                    onClick={() => navigate(shop.id ? `/integrations/store/shoplazza/${shop.id}` : '/integrations/store/shoplazza')}
                  >
                    查看详情
                  </button>
                  <button
                    type="button"
                    className={styles.syncBtn}
                    onClick={() => handleSync(shop.id || undefined)}
                    disabled={syncingId !== null}
                  >
                    {syncingId === (shop.id || '') ? <><span className={styles.spinner} aria-hidden="true" /> 同步中…</> : '同步'}
                  </button>
                  <button
                    type="button"
                    className={styles.disconnectBtn}
                    onClick={() => handleDisconnect(shop)}
                    disabled={disconnectingId !== null}
                  >
                    {disconnectingId === shop.id ? '断开中…' : '断开'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {shops.length === 1 && shops[0].id && (
            <div className={styles.webhookBlock}>
              <span className={styles.topicsTitle}>Webhook 订阅（可手动开关）</span>
              <div className={styles.webhookToggles}>
                {WEBHOOK_TOPICS.map(({ value, label }) => {
                  const shop = shops[0];
                  const subscribed = shop.subscribedTopics.includes(value);
                  const busy = webhookToggling === `${shop.id}:${value}`;
                  return (
                    <label key={value} className={styles.webhookRow}>
                      <span className={styles.webhookLabel}>{label}</span>
                      <code className={styles.webhookCode}>{value}</code>
                      <input
                        type="checkbox"
                        checked={subscribed}
                        disabled={busy}
                        onChange={(e) => handleWebhookToggle(shop.id, value, e.target.checked)}
                        className={styles.webhookCheckbox}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {shops.length > 1 && <p className={styles.multiShopHint}>已授权 {shops.length} 个店铺，点击「查看详情」可分别管理 Webhook 与同步。</p>}
          <button type="button" className={styles.addAuthBtn} onClick={() => setDrawerOpen(true)}>
            + 授权更多店铺
          </button>
        </>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.notConnectedDesc}>
            连接 Shoplazza 后可自动同步联系人、接收订单/弃单事件，并触发自动化邮件流程。
          </p>
          <button type="button" className={styles.connectBtn} onClick={() => setDrawerOpen(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            连接 Shoplazza
          </button>
        </div>
      )}

      <ShoplazzaConnectDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onConnected={() => void fetchStatus()} />
    </>
  );
}
