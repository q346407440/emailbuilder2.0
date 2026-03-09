import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGmailStore } from '@shared/store/useGmailStore';
import styles from './IntegrationListPage.module.css';

export default function IntegrationGmailList() {
  const navigate = useNavigate();
  const gmailAccounts = useGmailStore((s) => s.accounts);
  const gmailLoading = useGmailStore((s) => s.loading);
  const gmailConnecting = useGmailStore((s) => s.connecting);
  const loadGmailAccounts = useGmailStore((s) => s.loadAccounts);
  const startGmailConnect = useGmailStore((s) => s.startConnect);
  const disconnectGmail = useGmailStore((s) => s.disconnect);

  useEffect(() => {
    void loadGmailAccounts();
  }, [loadGmailAccounts]);

  const gmailConnected = gmailAccounts.length > 0;

  return (
    <>
      <div className={styles.listHeader}>
        <h2 className={styles.listTitle}>Gmail</h2>
        <p className={styles.listDesc}>通过 Google 账号授权发送邮件，用于编辑器发测试邮件、广播与自动化。</p>
      </div>

      {gmailLoading ? (
        <div className={styles.loadingRow} aria-live="polite">加载中…</div>
      ) : gmailConnected ? (
        <>
          <div className={styles.authList}>
            {gmailAccounts.map((acc) => (
              <div key={acc.id} className={styles.authRow}>
                <div className={styles.authMain}>
                  <span className={styles.authTitle} title={acc.gmailAddress}>{acc.gmailAddress}</span>
                </div>
                <div className={styles.authActions}>
                  <button
                    type="button"
                    className={styles.detailLink}
                    onClick={() => navigate(`/integrations/email/gmail/${acc.id}`)}
                  >
                    查看详情
                  </button>
                  <button type="button" className={styles.disconnectBtn} onClick={() => disconnectGmail(acc.id)}>
                    断开
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.addAuthBtn}
            onClick={() => startGmailConnect()}
            disabled={gmailConnecting}
          >
            {gmailConnecting ? '授权中…' : '+ 添加 Gmail 账号'}
          </button>
        </>
      ) : (
        <div className={styles.emptyState}>
          <p className={styles.notConnectedDesc}>
            使用 Google 账号授权后，可从编辑器内直接使用该邮箱发送测试邮件、广播与自动化邮件。
          </p>
          <button
            type="button"
            className={styles.connectBtn}
            onClick={() => startGmailConnect()}
            disabled={gmailConnecting}
          >
            {gmailConnecting ? (
              <><span className={styles.spinner} aria-hidden="true" /> 授权中…</>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                </svg>
                连接 Gmail
              </>
            )}
          </button>
        </div>
      )}
    </>
  );
}
