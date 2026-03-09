import { useState, useCallback, useEffect } from 'react';
import Modal, { ModalInput, ModalFooter } from '@shared/ui/Modal';
import modalStyles from '@shared/ui/Modal.module.css';

interface LoginRegisterModalProps {
  open: boolean;
  initialTab?: 'login' | 'register';
  onClose: () => void;
  onSuccess?: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
}

export default function LoginRegisterModal({
  open,
  initialTab = 'login',
  onClose,
  onSuccess,
  login,
  register,
}: LoginRegisterModalProps) {
  const [authTab, setAuthTab] = useState<'login' | 'register'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (open) {
      setAuthTab(initialTab);
      setEmail('');
      setPassword('');
      setDisplayName('');
      setAuthError('');
    }
  }, [open, initialTab]);

  const handleSubmit = useCallback(async () => {
    setAuthError('');
    const e = email.trim().toLowerCase();
    const p = password.trim();
    if (!e) {
      setAuthError('请输入邮箱');
      return;
    }
    if (!p) {
      setAuthError('请输入密码');
      return;
    }
    if (authTab === 'register' && p.length < 6) {
      setAuthError('密码至少 6 位');
      return;
    }
    setAuthSubmitting(true);
    try {
      if (authTab === 'login') {
        await login(e, p);
      } else {
        await register(e, p, displayName.trim() || undefined);
      }
      onClose();
      onSuccess?.();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setAuthSubmitting(false);
    }
  }, [authTab, email, password, displayName, login, register, onClose, onSuccess]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={authTab === 'login' ? '登录' : '注册'}
      onClose={onClose}
      footer={
        <ModalFooter
          cancelText="取消"
          onCancel={onClose}
          confirmText={authTab === 'login' ? '登录' : '注册'}
          onConfirm={handleSubmit}
          confirmDisabled={authSubmitting}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            width: '100%',
            gap: '8px',
            marginBottom: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => setAuthTab('login')}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '8px 12px',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: '1px solid var(--border)',
              borderRadius: '6px',
              background: authTab === 'login' ? 'var(--accent-subtle)' : 'transparent',
              color: authTab === 'login' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => setAuthTab('register')}
            style={{
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '8px 12px',
              fontSize: '0.875rem',
              fontWeight: 500,
              border: '1px solid var(--border)',
              borderRadius: '6px',
              background: authTab === 'register' ? 'var(--accent-subtle)' : 'transparent',
              color: authTab === 'register' ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            注册
          </button>
        </div>
        {authError && (
          <p style={{ fontSize: '0.8125rem', color: '#DC3545', margin: 0 }}>{authError}</p>
        )}
        <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          邮箱
          <ModalInput
            value={email}
            onChange={setEmail}
            onBlur={() => setEmail((v) => v.trim())}
            placeholder="请输入邮箱"
            autoFocus={false}
          />
        </label>
        <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          密码
          <input
            type="password"
            className={modalStyles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPassword((v) => v.trim())}
            placeholder={authTab === 'register' ? '至少 6 位' : '请输入密码'}
          />
          {authTab === 'login' && (
            <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              测试账号：testuser@test.com / TestPass456
            </div>
          )}
        </label>
        {authTab === 'register' && (
          <label style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            显示名称（选填）
            <ModalInput
              value={displayName}
              onChange={setDisplayName}
              placeholder="选填"
              autoFocus={false}
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
