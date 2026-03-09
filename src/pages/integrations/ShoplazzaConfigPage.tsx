import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiDelete, apiPatch, ApiError } from '@shared/api/apiClient';
import { toast } from '@shared/store/useToastStore';
import ShoplazzaConnectDrawer from '@features/integrations/shoplazza/components/ShoplazzaConnectDrawer';
import styles from './ShoplazzaConfigPage.module.css';

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

const VARIABLE_MAPPING = [
  { key: 'user.name',        shoplazza: 'customer.first_name + last_name' },
  { key: 'user.email',       shoplazza: 'customer.email' },
  { key: 'shop.name',        shoplazza: 'shop.name' },
  { key: 'product.title',    shoplazza: 'product.title' },
  { key: 'product.imageUrl', shoplazza: 'product.images[0].src' },
  { key: 'product.url',      shoplazza: 'product.handle' },
  { key: 'product.price',    shoplazza: 'product.variants[0].price' },
  { key: 'order.id',         shoplazza: 'order.name (#1234)' },
  { key: 'order.detailUrl',  shoplazza: 'order.order_status_url' },
  { key: 'order.trackingUrl',shoplazza: 'fulfillment.tracking_url' },
  { key: 'cart.url',         shoplazza: 'checkout.abandoned_checkout_url' },
];

const REQUIRED_TOPICS = ['customers/create', 'orders/paid', 'fulfillments/create', 'checkouts/create'];

function fmt(d: string | null | undefined) {
  if (!d) return '从未同步';
  return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

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

export default function ShoplazzaConfigPage() {
  const { integrationId } = useParams<{ integrationId: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<ShoplazzaStatus>({ status: 'disconnected' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [webhookToggling, setWebhookToggling] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await apiGet<ShoplazzaStatus>('/api/integrations/shoplazza/status');
      setStatus(s);
    } catch {
      setStatus({ status: 'disconnected' });
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const shops = getShopsList(status);
  const currentShop = integrationId
    ? shops.find((s) => s.id === integrationId) ?? shops[0]
    : shops[0];
  const isConnected = status.status === 'active';

  if (!integrationId) {
    navigate('/integrations/store/shoplazza', { replace: true });
    return null;
  }

  const handleSync = async () => {
    if (!currentShop) return;
    setSyncing(true);
    try {
      await apiPost('/api/integrations/shoplazza/sync', currentShop.id ? { integrationId: currentShop.id } : undefined);
      toast('联系人同步任务已排入队列', 'success');
      setTimeout(() => void fetchStatus(), 3000);
    } catch (err) {
      toast(`同步失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!currentShop) return;
    if (!window.confirm(`确定断开与 ${currentShop.shopDomain} 的连接？`)) return;
    setDisconnecting(true);
    try {
      const url = currentShop.id
        ? `/api/integrations/shoplazza/connect?integrationId=${encodeURIComponent(currentShop.id)}`
        : '/api/integrations/shoplazza/connect';
      await apiDelete(url);
      toast('已断开连接', 'success');
      setStatus({ status: 'disconnected' });
      navigate('/integrations/store/shoplazza');
    } catch (err) {
      toast(`断开失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleWebhookToggle = async (topic: string, checked: boolean) => {
    if (!currentShop?.id) return;
    setWebhookToggling(`${currentShop.id}:${topic}`);
    try {
      const next = checked
        ? [...currentShop.subscribedTopics, topic]
        : currentShop.subscribedTopics.filter((t) => t !== topic);
      await apiPatch<{ subscribedTopics: string[] }>('/api/integrations/shoplazza/webhooks', {
        integrationId: currentShop.id,
        topics: next,
      });
      toast(checked ? '已订阅该事件' : '已取消订阅', 'success');
      void fetchStatus();
    } catch (err) {
      toast(`操作失败：${err instanceof Error ? err.message : ''}`, 'error');
      if (err instanceof ApiError && (err.status === 410 || err.status === 403)) {
        void fetchStatus();
        navigate('/integrations/store/shoplazza');
      }
    } finally {
      setWebhookToggling(null);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Shoplazza 集成配置</h2>
<button type="button" className={styles.backLink} onClick={() => navigate('/integrations/store/shoplazza')}>
          ← 返回 Shoplazza 列表
        </button>
      </div>

      {shops.length > 1 && !integrationId && (
        <p className={styles.multiHint}>
          你已授权 {shops.length} 个店铺。在集成列表中点击某店铺的「查看详情」可单独配置该店铺。
        </p>
      )}

      {/* 连接状态 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>连接状态</h3>
        <div className={styles.card}>
          <div className={styles.statusRow}>
            <span className={`${styles.statusDot} ${isConnected ? styles.statusDotActive : ''}`} />
            <span className={styles.statusText}>{isConnected ? '已连接' : '未连接'}</span>
            {isConnected && currentShop && (
              <span className={styles.shopName}>{currentShop.shopName ?? currentShop.shopDomain}</span>
            )}
          </div>
          {isConnected ? (
            <div className={styles.actions}>
              <button className={styles.reconnectBtn} onClick={() => setDrawerOpen(true)}>重新授权</button>
              <button className={styles.disconnectBtn} onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? '断开中…' : '断开连接'}
              </button>
            </div>
          ) : (
            <button className={styles.connectBtn} onClick={() => setDrawerOpen(true)}>连接 Shoplazza</button>
          )}
        </div>
      </section>

      {/* 数据同步 */}
      {isConnected && currentShop && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>数据同步</h3>
          <div className={styles.card}>
            <div className={styles.syncInfo}>
              <div className={styles.syncRow}>
                <span className={styles.syncLabel}>已同步联系人</span>
                <span>{status.contactCount ?? 0} 位</span>
              </div>
              <div className={styles.syncRow}>
                <span className={styles.syncLabel}>最后同步时间</span>
                <span>{fmt(currentShop.lastSyncedAt)}</span>
              </div>
            </div>
            <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
              {syncing ? '同步中…' : '立即全量同步'}
            </button>
          </div>
        </section>
      )}

      {/* Webhook 事件 */}
      {isConnected && currentShop && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Webhook 事件</h3>
          <div className={styles.card}>
            <div className={styles.webhookList}>
              {REQUIRED_TOPICS.map((topic) => {
                const subscribed = currentShop.subscribedTopics.includes(topic);
                const busy = webhookToggling === `${currentShop.id}:${topic}`;
                return (
                  <div key={topic} className={styles.webhookRow}>
                    <span className={subscribed ? styles.checkOk : styles.checkFail}>
                      {subscribed ? '✓' : '✗'}
                    </span>
                    <code className={styles.topicCode}>{topic}</code>
                    <span className={styles.topicStatus}>{subscribed ? '已订阅' : '未订阅'}</span>
                    {currentShop.id && (
                      <label className={styles.webhookToggle}>
                        <input
                          type="checkbox"
                          checked={subscribed}
                          disabled={busy}
                          onChange={(e) => handleWebhookToggle(topic, e.target.checked)}
                        />
                        <span className={styles.webhookToggleLabel}>{subscribed ? '关闭' : '开启'}</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 变量映射说明 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>变量映射说明</h3>
        <div className={styles.card}>
          <p className={styles.mappingDesc}>模板中的标准变量 key 与 Shoplazza 字段的对应关系：</p>
          <div className={styles.mappingTable}>
            <div className={`${styles.mappingRow} ${styles.mappingHeader}`}>
              <span>标准 variableKey</span><span>Shoplazza 来源字段</span>
            </div>
            {VARIABLE_MAPPING.map((m) => (
              <div key={m.key} className={styles.mappingRow}>
                <code className={styles.varKey}>{m.key}</code>
                <code className={styles.varSource}>{m.shoplazza}</code>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ShoplazzaConnectDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onConnected={() => { void fetchStatus(); }}
      />
    </div>
  );
}
