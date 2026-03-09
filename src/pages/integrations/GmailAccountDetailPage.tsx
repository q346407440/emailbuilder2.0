import { useParams, useNavigate } from 'react-router-dom';
import { useGmailStore } from '@shared/store/useGmailStore';
import styles from './GmailAccountDetailPage.module.css';

export default function GmailAccountDetailPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const accounts = useGmailStore((s) => s.accounts);
  const disconnect = useGmailStore((s) => s.disconnect);

  const account = accountId ? accounts.find((a) => a.id === accountId) : null;

  const handleDisconnect = () => {
    if (!account) return;
    if (!window.confirm(`确定要解除 ${account.gmailAddress} 的授权吗？`)) return;
    void disconnect(account.id);
    navigate('/integrations/email/gmail');
  };

  if (!accountId) {
    navigate('/integrations/email/gmail', { replace: true });
    return null;
  }

  if (!account) {
    return (
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={() => navigate('/integrations/email/gmail')}>
          ← 返回 Gmail 列表
        </button>
        <p className={styles.muted}>未找到该账号，或已断开连接。</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button type="button" className={styles.backLink} onClick={() => navigate('/integrations/email/gmail')}>
          ← 返回 Gmail 列表
        </button>
        <h1 className={styles.title}>Gmail 账号详情</h1>
      </div>

      <div className={styles.card}>
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
      </div>
    </div>
  );
}
