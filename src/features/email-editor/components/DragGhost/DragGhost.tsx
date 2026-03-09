import type { EmailComponentType } from '@shared/types/email';
import { TYPE_LABELS, TYPE_ICONS } from '@shared/constants/componentLibrary';
import styles from './DragGhost.module.css';

interface DragGhostProps {
  type: EmailComponentType;
  /** 复合组件名称（若有，则显示为复合组件幽灵） */
  compositeName?: string;
  /** 自訂標籤（如預覽區拖動時顯示組件 displayName） */
  customLabel?: string;
}

export default function DragGhost({ type, compositeName, customLabel }: DragGhostProps) {
  const label = customLabel ?? compositeName ?? TYPE_LABELS[type];
  return (
    <div className={styles.ghost}>
      <span className={styles.icon}>
        {compositeName ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="6" height="6" rx="1" />
            <rect x="9" y="1" width="6" height="6" rx="1" />
            <rect x="1" y="9" width="6" height="6" rx="1" />
            <rect x="9" y="9" width="6" height="6" rx="1" />
          </svg>
        ) : (
          TYPE_ICONS[type]
        )}
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
