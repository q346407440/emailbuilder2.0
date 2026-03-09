import type { ContentAlignConfig } from '@shared/types/email';
import styles from './Editors.module.css';
import alignStyles from './AlignmentField.module.css';

type Horizontal = ContentAlignConfig['horizontal'];

const OPTIONS: Horizontal[] = ['left', 'center', 'right'];
const LABELS: Record<Horizontal, string> = { left: '左', center: '中', right: '右' };

interface HorizontalAlignFieldProps {
  value: Horizontal;
  onChange: (value: Horizontal) => void;
  label?: string;
}

/** 左 / 中 / 右 三选一，用于文本、图片、按钮、图标等内容在容器内的水平对齐 */
export default function HorizontalAlignField({ value, onChange, label = '内容对齐' }: HorizontalAlignFieldProps) {
  return (
    <div className={alignStyles.alignmentField}>
      <div className={alignStyles.alignmentLabelRow}>
        <label className={styles.label}>{label}</label>
      </div>
      <div className={alignStyles.horizontalRow} role="group" aria-label={label}>
        {OPTIONS.map((h) => {
          const isActive = value === h;
          return (
            <button
              key={h}
              type="button"
              className={`${alignStyles.cell} ${alignStyles.cellHorizontal} ${isActive ? alignStyles.cellActive : ''}`}
              onClick={() => onChange(h)}
              title={LABELS[h]}
              aria-pressed={isActive}
              aria-label={LABELS[h]}
            >
              <svg
                className={alignStyles.iconSvg}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {h === 'left' && <path d="M4 6h16M4 12h10M4 18h14" />}
                {h === 'center' && <path d="M7 6h10M7 12h10M7 18h10" />}
                {h === 'right' && <path d="M4 6h16M10 12h10M6 18h14" />}
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
