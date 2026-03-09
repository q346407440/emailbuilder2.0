import { useState, useCallback, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import LoginRegisterModal from '@features/auth/components/LoginRegisterModal';
import Modal, { ModalInput, ModalFooter } from '@shared/ui/Modal';
import { toast } from '@shared/store/useToastStore';
import styles from './AppShell.module.css';

interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconTemplates() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}
function IconBroadcast() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.18 2 2 0 014 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}
function IconAutomation() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
function IconAudience() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}
function IconIntegrations() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <circle cx="5" cy="19" r="3" />
      <line x1="7.5" y1="17.5" x2="9.5" y2="16" />
      <circle cx="19" cy="19" r="3" />
      <line x1="16.5" y1="17.5" x2="14.5" y2="16" />
    </svg>
  );
}
function IconAnalytics() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard',          label: '工作台',   icon: <IconDashboard /> },
  { path: '/templates',          label: '模板',     icon: <IconTemplates /> },
  { path: '/broadcasts',         label: '广播活动',  icon: <IconBroadcast /> },
  { path: '/automations',        label: '自动化',    icon: <IconAutomation /> },
  { path: '/audience/contacts',  label: '受众',      icon: <IconAudience /> },
  { path: '/integrations',       label: '集成',      icon: <IconIntegrations /> },
  { path: '/analytics',          label: '数据',      icon: <IconAnalytics /> },
];

const NAV_GROUPS = [
  { label: '概览', items: ['/dashboard'] },
  { label: '内容', items: ['/templates'] },
  { label: '发送', items: ['/broadcasts', '/automations', '/audience/contacts'] },
  { label: '系统', items: ['/integrations', '/analytics'] },
];

// ── 账户浮层菜单 ────────────────────────────────────────
function AccountPopover({
  anchorRef,
  onClose,
  onEditName,
  onChangePassword,
  onLogout,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  onEditName: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const popRef = useRef<HTMLDivElement>(null);

  // 定位：紧贴 anchor 上方
  const [pos, setPos] = useState<{ bottom: number; left: number; width: number } | null>(null);
  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    // 稍微上移一点，并加宽一点点
    setPos({ bottom: window.innerHeight - r.top + 8, left: r.left, width: Math.max(r.width, 220) });
  }, [anchorRef]);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', esc); };
  }, [anchorRef, onClose]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={popRef}
      className={styles.accountPopover}
      style={{ position: 'fixed', bottom: pos.bottom, left: pos.left, width: pos.width }}
    >
      <div className={styles.popoverHeader}>
        <span className={styles.popoverName}>{user?.displayName ?? user?.email}</span>
        <span className={styles.popoverEmail}>{user?.displayName ? user.email : ''}</span>
      </div>
      <div className={styles.popoverDivider} />
      <button type="button" className={styles.popoverItem} onClick={() => { onClose(); onEditName(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        修改显示名称
      </button>
      <button type="button" className={styles.popoverItem} onClick={() => { onClose(); onChangePassword(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        修改密码
      </button>
      <div className={styles.popoverDivider} />
      <button type="button" className={`${styles.popoverItem} ${styles.popoverItemDanger}`} onClick={() => { onClose(); onLogout(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
        退出登录
      </button>
    </div>,
    document.body
  );
}

export default function AppShell() {
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const changePassword = useAuthStore((s) => s.changePassword);
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const userRowRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  // Modals
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [changePwdOpen, setChangePwdOpen] = useState(false);
  
  // Edit Name State
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Change Password State
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login');
  const openLogin = useCallback((tab: 'login' | 'register') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  }, []);

  const initials = user?.displayName
    ? user.displayName.slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '??';

  const handleEditName = async () => {
    if (!newName.trim()) { toast('请输入名称', 'error'); return; }
    setSavingName(true);
    try {
      await updateProfile({ displayName: newName.trim() });
      setEditNameOpen(false);
    } catch (err) {
      toast(`更新失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!curPwd || !newPwd || !confirmPwd) { toast('请填写所有字段', 'error'); return; }
    if (newPwd !== confirmPwd) { toast('两次输入的新密码不一致', 'error'); return; }
    if (newPwd.length < 6) { toast('新密码至少 6 位', 'error'); return; }
    
    setSavingPwd(true);
    try {
      await changePassword(curPwd, newPwd);
      toast('密码已修改，请重新登录', 'success');
      setChangePwdOpen(false);
      // Clear form
      setCurPwd(''); setNewPwd(''); setConfirmPwd('');
      // Logout
      setTimeout(() => { logout(); navigate('/dashboard', { replace: true }); }, 1500);
    } catch (err) {
      toast(`修改失败：${err instanceof Error ? err.message : ''}`, 'error');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className={styles.shell}>
      <a href="#main-content" className={styles.skipLink}>跳到主内容</a>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarInner}>
          {/* Logo */}
          <div className={styles.logoArea}>
            <div className={styles.logoIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="6" fill="var(--accent)" />
                <path d="M6 10h20M6 10l10 9 10-9M6 10v14a1 1 0 001 1h18a1 1 0 001-1V10" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className={styles.logoText}>邮件编辑器</span>
            <span className={styles.logoTag}>Beta</span>
          </div>

          {/* Navigation */}
          <nav className={styles.nav}>
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className={styles.navGroup}>{group.label}</div>
                {NAV_ITEMS.filter((item) => group.items.includes(item.path)).map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => {
                      const audienceActive = item.path === '/audience/contacts' && window.location.pathname.startsWith('/audience');
                      return `${styles.navItem}${(isActive || audienceActive) ? ` ${styles.navItemActive}` : ''}`;
                    }}
                  >
                    <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
                    <span className={styles.navLabel}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          {/* Bottom: user row */}
          <div className={styles.bottomSection}>
            {user ? (
              <>
                <div
                  ref={userRowRef}
                  className={`${styles.userRow} ${accountOpen ? styles.userRowActive : ''}`}
                  onClick={() => setAccountOpen((o) => !o)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAccountOpen((o) => !o); }}
                  aria-label="账户设置"
                >
                  <div className={styles.avatar}>{initials}</div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>
                      {user.displayName ?? user.email ?? '—'}
                    </span>
                    {user.displayName && (
                      <span className={styles.userEmail}>{user.email}</span>
                    )}
                  </div>
                  <span className={styles.userRowChevron} aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </span>
                </div>
                {accountOpen && (
                  <AccountPopover
                    anchorRef={userRowRef as React.RefObject<HTMLElement>}
                    onClose={() => setAccountOpen(false)}
                    onEditName={() => { setNewName(user.displayName ?? ''); setEditNameOpen(true); }}
                    onChangePassword={() => { setCurPwd(''); setNewPwd(''); setConfirmPwd(''); setChangePwdOpen(true); }}
                    onLogout={handleLogout}
                  />
                )}
              </>
            ) : (
              <div className={styles.guestActions}>
                <button type="button" className={styles.guestBtn} onClick={() => openLogin('login')}>
                  登录
                </button>
                <button type="button" className={styles.guestBtnPrimary} onClick={() => openLogin('register')}>
                  注册
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main ref={mainRef} className={styles.main} id="main-content">
        {!user && (
          <div className={styles.loginBar}>
            <span className={styles.loginBarText}>请登录以使用完整功能</span>
            <div className={styles.loginBarActions}>
              <button type="button" className={styles.loginBarBtn} onClick={() => openLogin('login')}>
                登录
              </button>
              <button type="button" className={styles.loginBarBtnPrimary} onClick={() => openLogin('register')}>
                注册
              </button>
            </div>
          </div>
        )}
        <Outlet />
      </main>

      <LoginRegisterModal
        open={authModalOpen}
        initialTab={authModalTab}
        onClose={() => setAuthModalOpen(false)}
        login={login}
        register={register}
      />

      {/* 修改显示名称 Modal */}
      <Modal
        open={editNameOpen}
        title="修改显示名称"
        onClose={() => setEditNameOpen(false)}
        footer={
          <ModalFooter
            onCancel={() => setEditNameOpen(false)}
            onConfirm={handleEditName}
            confirmText={savingName ? '保存中...' : '保存'}
            confirmDisabled={savingName || !newName.trim()}
          />
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ModalInput
            value={newName}
            onChange={setNewName}
            placeholder="请输入显示名称"
            autoFocus
            onSubmit={handleEditName}
          />
        </div>
      </Modal>

      {/* 修改密码 Modal */}
      <Modal
        open={changePwdOpen}
        title="修改密码"
        onClose={() => setChangePwdOpen(false)}
        footer={
          <ModalFooter
            onCancel={() => setChangePwdOpen(false)}
            onConfirm={handleChangePassword}
            confirmText={savingPwd ? '修改中...' : '修改密码'}
            confirmDisabled={savingPwd || !curPwd || !newPwd || !confirmPwd}
          />
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className={styles.modalInput}
            type="password"
            value={curPwd}
            onChange={(e) => setCurPwd(e.target.value)}
            placeholder="当前密码"
            autoFocus
          />
          <input
            className={styles.modalInput}
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="新密码（至少 6 位）"
          />
          <input
            className={styles.modalInput}
            type="password"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            placeholder="确认新密码"
            onKeyDown={(e) => { if (e.key === 'Enter') handleChangePassword(); }}
          />
        </div>
      </Modal>
    </div>
  );
}