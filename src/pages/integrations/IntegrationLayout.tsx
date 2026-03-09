import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import styles from './IntegrationLayout.module.css';

const STORE_CHANNELS = [
  { path: 'shoplazza', label: 'Shoplazza', comingSoon: false },
  { path: 'future-a', label: '未来平台 A', comingSoon: true },
  { path: 'future-b', label: '未来平台 B', comingSoon: true },
] as const;

const EMAIL_CHANNELS = [
  { path: 'gmail', label: 'Gmail', comingSoon: false },
  { path: 'outlook', label: 'Outlook', comingSoon: true },
  { path: 'qq', label: 'QQ 邮箱', comingSoon: true },
] as const;

export default function IntegrationLayout() {
  const { pathname } = useLocation();
  const isStore = pathname.startsWith('/integrations/store');
  const type = isStore ? 'store' : 'email';
  const channels = isStore ? STORE_CHANNELS : EMAIL_CHANNELS;
  const basePath = `/integrations/${type}`;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>集成</h1>
          <p className={styles.subtitle}>连接第三方平台，自动同步联系人和触发邮件</p>
        </div>
        <div className={styles.quickLinks}>
          {isStore && (
            <>
              <Link to="/integrations/store/shoplazza" className={styles.quickLink}>
                Shoplazza 详细配置 →
              </Link>
              <Link to="/integrations/schema" className={styles.quickLink}>
                变量 Schema 管理 →
              </Link>
            </>
          )}
        </div>
      </div>

      {/* 一级：集成类型 Tab */}
      <nav className={styles.topTabs} aria-label="集成类型">
        <NavLink
          to="/integrations/store/shoplazza"
          className={({ isActive }) => `${styles.topTab}${isActive ? ` ${styles.topTabActive}` : ''}`}
        >
          独立站集成
        </NavLink>
        <NavLink
          to="/integrations/email/gmail"
          className={({ isActive }) => `${styles.topTab}${isActive ? ` ${styles.topTabActive}` : ''}`}
        >
          发送邮箱的集成
        </NavLink>
      </nav>

      <div className={styles.layout}>
        {/* 二级：左侧渠道 Tab */}
        <nav className={styles.sidebar} aria-label="渠道">
          {channels.map((ch) => (
            <NavLink
              key={ch.path}
              to={`${basePath}/${ch.path}`}
              className={({ isActive }) =>
                `${styles.channelItem}${isActive ? ` ${styles.channelItemActive}` : ''}${ch.comingSoon ? ` ${styles.channelItemDisabled}` : ''}`
              }
              end={false}
            >
              {ch.label}
            </NavLink>
          ))}
        </nav>
        {/* 三级：右侧数据列表 */}
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
