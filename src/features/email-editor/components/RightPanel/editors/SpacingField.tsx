import { useMemo } from 'react';
import type { SpacingConfig } from '@shared/types/email';
import PxInput from './PxInput';
import styles from './Editors.module.css';

interface SpacingFieldProps {
  label: string;
  value: SpacingConfig;
  onChange: (value: SpacingConfig) => void;
  placeholder?: string;
}

export default function SpacingField({ label, value, onChange, placeholder = '0' }: SpacingFieldProps) {
  const mode = useMemo(() => value.mode || 'unified', [value.mode]);

  const handleModeToggle = () => {
    const newMode = mode === 'unified' ? 'separate' : 'unified';
    
    if (newMode === 'unified') {
      onChange({ mode: 'unified', unified: value.unified || placeholder });
    } else {
      onChange({
        mode: 'separate',
        top: value.top || placeholder,
        right: value.right || placeholder,
        bottom: value.bottom || placeholder,
        left: value.left || placeholder,
      });
    }
  };

  return (
    <div className={styles.spacingField}>
      <div className={styles.spacingHeader}>
        <label className={styles.label}>{label}</label>
        <button
          type="button"
          className={styles.modeToggle}
          onClick={handleModeToggle}
          title={mode === 'unified' ? '切换到分别配置' : '切换到统一配置'}
        >
          {mode === 'unified' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v12M2 8h12" />
            </svg>
          )}
        </button>
      </div>

      <div className={styles.spacingFieldContent}>
        {mode === 'unified' ? (
          <PxInput
            small
            value={value.unified || '0'}
            onChange={(v) => onChange({ ...value, mode: 'unified', unified: v })}
            placeholder={placeholder}
            aria-label={label}
          />
        ) : (
          <div className={styles.spacingGrid}>
            {[
              { key: 'top' as const, label: '上', value: value.top ?? '0' },
              { key: 'left' as const, label: '左', value: value.left ?? '0' },
              { key: 'bottom' as const, label: '下', value: value.bottom ?? '0' },
              { key: 'right' as const, label: '右', value: value.right ?? '0' },
            ].map(({ key, label, value: v }) => (
              <div key={key} className={styles.spacingCell}>
                <span className={styles.spacingCellLabel}>{label}</span>
                <PxInput
                  small
                  value={v}
                  onChange={(val) =>
                    onChange({
                      mode: 'separate',
                      top: key === 'top' ? val : value.top ?? '0',
                      right: key === 'right' ? val : value.right ?? '0',
                      bottom: key === 'bottom' ? val : value.bottom ?? '0',
                      left: key === 'left' ? val : value.left ?? '0',
                    })
                  }
                  placeholder="0"
                  aria-label={label}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
