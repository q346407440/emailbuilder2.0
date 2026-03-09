import { Link, useLocation } from 'react-router-dom';
import styles from './IntegrationPlaceholder.module.css';

interface Props {
  title: string;
  desc?: string;
}

/** 集成「即将支持」占位：提供明确下一步，避免死胡同 */
export default function IntegrationPlaceholder({ title, desc = '即将支持' }: Props) {
  const { pathname } = useLocation();
  const isEmail = pathname.includes('/integrations/email/');
  const suggestTo = isEmail ? '/integrations/email/gmail' : '/integrations/store/shoplazza';
  const suggestLabel = isEmail ? '先去配置 Gmail' : '先去连接 Shoplazza';

  return (
    <div className={styles.block}>
      <div className={styles.card}>
        <svg
          className={styles.icon}
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.desc}>{desc}</p>
        <Link to={suggestTo} className={styles.primaryAction}>
          {suggestLabel}
        </Link>
      </div>
    </div>
  );
}
