import { useEffect } from 'react';

/**
 * OAuth 回调后重定向到此页（在弹窗中打开）。
 * 仅提示用户可关闭窗口，可选自动关闭。
 */
export default function GmailOAuthDonePage() {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.close();
      } catch {
        // 部分浏览器不允许脚本关闭非脚本打开的窗口，忽略
      }
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontFamily: 'system-ui, sans-serif',
        background: 'var(--bg-base, #F5F7FA)',
        color: 'var(--text-primary, #1A1A1A)',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.9375rem' }}>
        授权处理完成，您可关闭此窗口。
      </p>
      <a
        href="/"
        style={{ fontSize: '0.875rem', color: 'var(--accent, #1976D2)', textDecoration: 'none' }}
      >
        返回首页
      </a>
    </div>
  );
}
