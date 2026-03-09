import type { GmailAccount } from '@shared/api/serverApi';
import { useGmailStore } from '@shared/store/useGmailStore';
import styles from './GmailAccountDetailDrawer.module.css';

interface Props {
  open: boolean;
  account: GmailAccount | null;
  onClose: () => void;
}

export default function GmailAccountDetailDrawer({ open, account, onClose }: Props) {
  const disconnect = useGmailStore((s) => s.disconnect);
  const loading = !account;

  if (!open) return null;

  const handleDisconnect = () => {
    if (!account) return;
    if (!window.confirm(`确定要解除 ${account.gmailAddress} 的授权吗？`)) return;
    void disconnect(account.id);
    onClose();
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden />
      <div className={styles.drawer} role="dialog" aria-label="Gmail 账号详情">
        <div className={styles.header}>
          <h3 className={styles.title}>Gmail 账号详情</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>
          {loading ? (
            <p className={styles.muted}>加载中...</p>
          ) : account ? (
            <>
              <div className={styles.field}>
                <span className={styles.label}>邮箱地址</span>
                <span className={styles.value}>{account.gmailAddress}</span>
              </div>
              <div className={styles.usage}>
                <span className={styles.label}>使用场景</span>
                <p className={styles.usageText}>
                  该账号将作为发件人，用于：编辑器中发送测试邮件、广播活动、自动化邮件流程。
                </p>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.disconnectBtn} onClick={handleDisconnect}>
                  解除授权
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
