import type { ContentAlignConfig } from '@shared/types/email';
import styles from './Editors.module.css';
import alignStyles from './AlignmentField.module.css';

type Vertical = ContentAlignConfig['vertical'];

const OPTIONS: Vertical[] = ['top', 'center', 'bottom'];
const LABELS: Record<Vertical, string> = {
  top: '顶部对齐',
  center: '垂直居中',
  bottom: '底部对齐',
};

interface VerticalAlignFieldProps {
  value: Vertical;
  onChange: (value: Vertical) => void;
  label?: string;
}

/** 顶 / 中 / 底 三选一，用于文本等内容在容器内的垂直对齐 */
export default function VerticalAlignField({ value, onChange, label = '垂直对齐' }: VerticalAlignFieldProps) {
  return (
    <div className={alignStyles.alignmentField}>
      <div className={alignStyles.alignmentLabelRow}>
        <label className={styles.label}>{label}</label>
      </div>
      <div className={alignStyles.horizontalRow} role="group" aria-label={label}>
        {OPTIONS.map((v) => {
          const isActive = value === v;
          return (
            <button
              key={v}
              type="button"
              className={`${alignStyles.cell} ${alignStyles.cellHorizontal} ${isActive ? alignStyles.cellActive : ''}`}
              onClick={() => onChange(v)}
              title={LABELS[v]}
              aria-pressed={isActive}
              aria-label={LABELS[v]}
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
                {v === 'top' && (
                  <>
                    <path d="M12 4v10" />
                    <path d="M8 8l4-4 4 4" />
                    <path d="M6 20h12" />
                  </>
                )}
                {v === 'center' && (
                  <>
                    <path d="M12 5v14" />
                    <path d="M8 9l4-4 4 4" />
                    <path d="M8 15l4 4 4-4" />
                  </>
                )}
                {v === 'bottom' && (
                  <>
                    <path d="M12 10v10" />
                    <path d="M8 16l4 4 4-4" />
                    <path d="M6 4h12" />
                  </>
                )}
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
