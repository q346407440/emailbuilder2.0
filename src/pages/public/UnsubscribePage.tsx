import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');

  const handleConfirm = async () => {
    if (!token) { setStatus('error'); setMessage('无效的退订链接'); return; }
    setStatus('loading');
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL
        ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
        : import.meta.env.DEV
          ? 'http://localhost:3001'
          : '';
      const res = await fetch(`${baseUrl}/api/contacts/unsubscribe?token=${encodeURIComponent(token)}`, { method: 'POST' });
      const data = (await res.json()) as { ok?: boolean; email?: string; error?: string };
      if (data.ok) {
        setStatus('success');
        setEmail(data.email ?? '');
      } else {
        setStatus('error');
        setMessage(data.error ?? '退订失败');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : '网络错误，请稍后重试');
    }
  };

  const iconStyle: React.CSSProperties = { marginBottom: 16 };
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#F5F7FA', fontFamily: "'Source Sans 3', sans-serif", padding: 24,
  };
  const cardStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #E0E5EB', borderRadius: 16, padding: '40px 36px',
    maxWidth: 420, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  };

  if (!token) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={iconStyle}>❌</div>
          <h2 style={{ margin: '0 0 8px', fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 700 }}>无效链接</h2>
          <p style={{ color: '#5C6B7A', fontSize: '0.875rem', margin: 0 }}>退订链接不完整或已过期，请从邮件中重新点击退订链接。</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {status === 'idle' && (
          <>
            <div style={iconStyle}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1976D2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8l10 6 10-6"/>
              </svg>
            </div>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: '#1A1A1A' }}>确认退订</h2>
            <p style={{ color: '#5C6B7A', fontSize: '0.875rem', marginBottom: 24, lineHeight: 1.6 }}>
              点击下方按钮确认退订，退订后你将不再收到来自此商家的邮件。
            </p>
            <button
              onClick={handleConfirm}
              style={{
                width: '100%', padding: '11px', background: '#1976D2', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.12s',
              }}
              onMouseOver={(e) => { (e.target as HTMLButtonElement).style.background = '#1565C0'; }}
              onMouseOut={(e) => { (e.target as HTMLButtonElement).style.background = '#1976D2'; }}
            >
              确认退订
            </button>
            <p style={{ color: '#8A949C', fontSize: '0.75rem', marginTop: 12, marginBottom: 0 }}>
              退订后你仍可随时重新订阅。
            </p>
          </>
        )}

        {status === 'loading' && (
          <>
            <div style={{ ...iconStyle, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 36, border: '3px solid #E0E5EB', borderTopColor: '#1976D2', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }} aria-live="polite">处理中，请稍候…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={iconStyle}>✅</div>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: '#1A1A1A' }}>已成功退订</h2>
            <p style={{ color: '#5C6B7A', fontSize: '0.875rem', margin: 0, lineHeight: 1.6 }}>
              {email ? <><b>{email}</b> 已成功退订，</> : '你已成功退订，'}
              你将不再收到来自此商家的邮件。
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={iconStyle}>❌</div>
            <h2 style={{ margin: '0 0 8px', fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 700, color: '#1A1A1A' }}>退订失败</h2>
            <p style={{ color: '#DC3545', fontSize: '0.875rem', marginBottom: 20 }}>{message}</p>
            <button
              onClick={() => setStatus('idle')}
              style={{ padding: '8px 20px', border: '1px solid #E0E5EB', borderRadius: 8, background: '#fff', color: '#5C6B7A', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem' }}
            >
              重试
            </button>
          </>
        )}
      </div>
    </div>
  );
}
