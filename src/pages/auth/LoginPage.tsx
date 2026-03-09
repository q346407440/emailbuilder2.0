import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import styles from './LoginPage.module.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

  const { login, register, user, isLoading } = useAuthStore(
    useShallow((s) => ({
      login: s.login,
      register: s.register,
      user: s.user,
      isLoading: s.isLoading,
    }))
  );

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && user) {
      const target = from === '/login' ? '/dashboard' : from;
      navigate(target, { replace: true });
    }
  }, [user, isLoading, navigate, from]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) { setError('请输入邮箱'); return; }
    if (!password) { setError('请输入密码'); return; }
    if (tab === 'register' && password.length < 6) { setError('密码至少 6 位'); return; }

    setSubmitting(true);
    try {
      if (tab === 'login') {
        await login(trimmedEmail, password);
      } else {
        await register(trimmedEmail, password, displayName.trim() || undefined);
      }
      const target = from === '/login' ? '/dashboard' : from;
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  }, [tab, email, password, displayName, login, register, navigate, from]);

  if (isLoading) {
    return (
      <div className={styles.loadingWrap}>
        <div className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* 左侧品牌区 */}
      <div className={styles.brandPanel}>
        <div className={styles.brandTop}>
          <div className={styles.brandLogoIcon} aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect width="32" height="32" rx="6" fill="var(--accent)" />
              <path d="M6 10h20M6 10l10 9 10-9M6 10v14a1 1 0 001 1h18a1 1 0 001-1V10" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className={styles.brandLogoText}>邮件编辑器</span>
        </div>

        <div className={styles.brandMain}>
          <h2 className={styles.brandHeadline}>
            设计、发送<br />高转化邮件
          </h2>
          <p className={styles.brandDesc}>
            可视化拖拽编辑器，AI 辅助生成，支持广播活动与自动化流程，帮助独立站提升邮件营销效果。
          </p>
          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon} aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className={styles.featureText}>拖拽式邮件模板编辑器，所见即所得</span>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon} aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className={styles.featureText}>AI 智能还原设计图，快速生成模板</span>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon} aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className={styles.featureText}>广播活动与自动化流程，精准触达受众</span>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon} aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <span className={styles.featureText}>Shoplazza 集成，商品数据自动填充</span>
            </div>
          </div>
        </div>

        <div className={styles.brandBottom}>
          © 2025 邮件编辑器
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className={styles.formPanel}>
        <div className={styles.formInner}>
          <h1 className={styles.formTitle}>
            {tab === 'login' ? '欢迎回来' : '创建账号'}
          </h1>
          <p className={styles.formSubtitle}>
            {tab === 'login' ? '登录以继续使用邮件编辑器' : '注册一个新账号，免费开始使用'}
          </p>

          <div className={styles.tabRow}>
            <button
              type="button"
              className={`${styles.tabBtn}${tab === 'login' ? ` ${styles.tabBtnActive}` : ''}`}
              onClick={() => { setTab('login'); setError(''); }}
            >
              登录
            </button>
            <button
              type="button"
              className={`${styles.tabBtn}${tab === 'register' ? ` ${styles.tabBtnActive}` : ''}`}
              onClick={() => { setTab('register'); setError(''); }}
            >
              注册
            </button>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            {error && <p className={styles.errorMsg} role="alert">{error}</p>}

            <label className={styles.fieldLabel}>
              邮箱
              <input
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="例如：name@example.com"
                autoComplete="email"
                autoFocus
                disabled={submitting}
                spellCheck={false}
              />
            </label>

            <label className={styles.fieldLabel}>
              密码
              <input
                type="password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'register' ? '至少 6 位' : '请输入密码'}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                disabled={submitting}
              />
              {tab === 'login' && (
                <span className={styles.hint}>测试账号：testuser@test.com / TestPass456</span>
              )}
            </label>

            {tab === 'register' && (
              <label className={styles.fieldLabel}>
                显示名称
                <input
                  type="text"
                  className={styles.input}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="选填…"
                  autoComplete="name"
                  disabled={submitting}
                />
              </label>
            )}

            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting
                ? (tab === 'login' ? '登录中…' : '注册中…')
                : (tab === 'login' ? '登录' : '注册')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
