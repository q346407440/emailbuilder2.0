import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import styles from './LeftTabBar.module.css';

const tabs = [
  {
    id: 'template' as const,
    label: '模板组件',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="2" width="14" height="5" rx="1.5" />
        <rect x="3" y="9" width="14" height="5" rx="1.5" />
        <line x1="3" y1="17" x2="17" y2="17" />
      </svg>
    ),
  },
  {
    id: 'library' as const,
    label: '公共组件库',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="1.5" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" />
        <path d="M14.5 12.5v4M12.5 14.5h4" />
      </svg>
    ),
  },
  {
    id: 'email-templates' as const,
    label: '公共邮件模板',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="16" height="12" rx="1.5" />
        <path d="M2 6.5l8 5 8-5" />
      </svg>
    ),
  },
  {
    id: 'my-composites' as const,
    label: '我的复合组件',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10" cy="5.5" r="2.5" />
        <path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <rect x="12" y="2" width="5" height="5" rx="1" />
        <path d="M14.5 4.5v2M13.5 5.5h2" />
      </svg>
    ),
  },
  {
    id: 'my-templates' as const,
    label: '我的模板',
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="16" height="14" rx="1.5" />
        <path d="M2 7h16" />
        <circle cx="6" cy="5" r="1" />
        <path d="M5 11h4M5 14h6" />
      </svg>
    ),
  },
] as const;

export default function LeftTabBar() {
  const activeTab = useEmailStore((s) => s.activeLeftTab);
  const setActiveTab = useEmailStore((s) => s.setActiveLeftTab);

  return (
    <div className={styles.bar}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            aria-label={tab.label}
            aria-pressed={isActive}
          >
            <span className={styles.indicator} />
            <span className={styles.icon}>{tab.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
