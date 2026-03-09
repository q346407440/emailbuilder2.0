import type { ContentAlignConfig } from '@shared/types/email';
import styles from './Editors.module.css';
import alignStyles from './AlignmentField.module.css';

type Horizontal = ContentAlignConfig['horizontal'];
type Vertical = ContentAlignConfig['vertical'];

const HORIZONTALS: Horizontal[] = ['left', 'center', 'right'];
const VERTICALS: Vertical[] = ['top', 'center', 'bottom'];

interface AlignmentFieldProps {
  value: ContentAlignConfig;
  onChange: (value: ContentAlignConfig) => void;
}

/** 单个对齐格子的图标：3×3 中 (hIndex, vIndex) 为高亮 */
function AlignmentIcon({ hIndex, vIndex, active }: { hIndex: number; vIndex: number; active: boolean }) {
  return (
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
      <rect x="2" y="2" width="20" height="20" rx="2" className={alignStyles.iconOutline} />
      <rect
        x={4 + hIndex * 6}
        y={4 + vIndex * 6}
        width="4"
        height="4"
        rx="0.5"
        className={active ? alignStyles.iconFillActive : alignStyles.iconFill}
      />
    </svg>
  );
}

export default function AlignmentField({ value, onChange }: AlignmentFieldProps) {
  return (
    <div className={alignStyles.alignmentField}>
      <label className={styles.label}>对齐方式</label>
      <div className={alignStyles.grid} role="group" aria-label="对齐方式">
        {VERTICALS.map((vertical, vIndex) =>
          HORIZONTALS.map((horizontal, hIndex) => {
            const isActive = value.horizontal === horizontal && value.vertical === vertical;
            return (
              <button
                key={`${horizontal}-${vertical}`}
                type="button"
                className={`${alignStyles.cell} ${isActive ? alignStyles.cellActive : ''}`}
                onClick={() => onChange({ horizontal, vertical })}
                title={
                  {
                    left: '左',
                    center: '中',
                    right: '右',
                  }[horizontal] +
                  {
                    top: '上',
                    center: '中',
                    bottom: '下',
                  }[vertical]
                }
                aria-pressed={isActive}
                aria-label={`${horizontal} ${vertical}`}
              >
                <AlignmentIcon hIndex={hIndex} vIndex={vIndex} active={isActive} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
