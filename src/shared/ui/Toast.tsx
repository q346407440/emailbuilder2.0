import { useToastStore, type ToastType } from '../store/useToastStore';
import styles from './Toast.module.css';

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') {
    return (
      <svg className={styles.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 4L6 11 3 8" />
      </svg>
    );
  }
  if (type === 'error') {
    return (
      <svg className={styles.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    );
  }
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3M8 10v1" />
    </svg>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const exitingIds = useToastStore((s) => s.exitingIds);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container} role="region" aria-label="提示信息">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${styles[`toast${t.type.charAt(0).toUpperCase() + t.type.slice(1)}`]} ${exitingIds.includes(t.id) ? styles.toastExiting : ''}`}
          role="alert"
        >
          <ToastIcon type={t.type} />
          <span className={styles.message}>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
