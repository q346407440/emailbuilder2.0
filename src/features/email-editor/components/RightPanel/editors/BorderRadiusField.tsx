import { useState } from 'react';
import type { BorderRadiusConfig } from '@shared/types/email';
import PxInput from './PxInput';
import styles from './Editors.module.css';

interface BorderRadiusFieldProps {
  value: BorderRadiusConfig;
  onChange: (value: BorderRadiusConfig) => void;
  /** 表单项标签，默认「圆角」 */
  label?: string;
}

export default function BorderRadiusField({ value, onChange, label = '圆角' }: BorderRadiusFieldProps) {
  const [mode, setMode] = useState<'unified' | 'separate'>(value.mode || 'unified');

  const handleModeToggle = () => {
    const newMode = mode === 'unified' ? 'separate' : 'unified';
    setMode(newMode);
    
    if (newMode === 'unified') {
      onChange({ mode: 'unified', unified: value.unified || '0' });
    } else {
      onChange({
        mode: 'separate',
        topLeft: value.topLeft || '0',
        topRight: value.topRight || '0',
        bottomRight: value.bottomRight || '0',
        bottomLeft: value.bottomLeft || '0',
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
            placeholder="0"
            aria-label="圆角"
          />
        ) : (
          <div className={styles.radiusGrid}>
            <PxInput
              small
              value={value.topLeft || '0'}
              onChange={(v) => onChange({ ...value, mode: 'separate', topLeft: v })}
              placeholder="0"
              aria-label="左上角"
            />
            <PxInput
              small
              value={value.bottomLeft || '0'}
              onChange={(v) => onChange({ ...value, mode: 'separate', bottomLeft: v })}
              placeholder="0"
              aria-label="左下角"
            />
            <PxInput
              small
              value={value.bottomRight || '0'}
              onChange={(v) => onChange({ ...value, mode: 'separate', bottomRight: v })}
              placeholder="0"
              aria-label="右下角"
            />
            <PxInput
              small
              value={value.topRight || '0'}
              onChange={(v) => onChange({ ...value, mode: 'separate', topRight: v })}
              placeholder="0"
              aria-label="右上角"
            />
          </div>
        )}
      </div>
    </div>
  );
}
