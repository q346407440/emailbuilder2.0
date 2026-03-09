import { useMemo } from 'react';
import type { BorderConfig } from '@shared/types/email';
import PxInput from './PxInput';
import RgbaColorPicker from './RgbaColorPicker';
import Select from './Select';
import styles from './Editors.module.css';

const BORDER_STYLE_OPTIONS = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
];

interface BorderFieldProps {
  value: BorderConfig;
  onChange: (value: BorderConfig) => void;
}

export default function BorderField({ value, onChange }: BorderFieldProps) {
  const mode = useMemo(() => value.mode || 'unified', [value.mode]);

  const handleModeToggle = () => {
    const newMode = mode === 'unified' ? 'separate' : 'unified';
    if (newMode === 'unified') {
      onChange({ ...value, mode: 'unified', unified: value.unified || '0' });
    } else {
      const w = value.unified || '0';
      onChange({
        ...value,
        mode: 'separate',
        topWidth: value.topWidth || w,
        rightWidth: value.rightWidth || w,
        bottomWidth: value.bottomWidth || w,
        leftWidth: value.leftWidth || w,
      });
    }
  };

  return (
    <div className={styles.borderField}>
      {/* 宽度配置：标题行与配置行间距与 .field 一致 */}
      <div className={styles.spacingField}>
        <div className={styles.spacingHeader}>
          <label className={styles.label}>描边</label>
          <button
            type="button"
            className={styles.modeToggle}
            onClick={handleModeToggle}
            title={mode === 'unified' ? '切换到分别配置' : '切换到统一配置'}
          >
            {mode === 'unified' ? (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
              aria-label="描边宽度"
            />
          ) : (
            <div className={styles.spacingGrid}>
              {[
                { key: 'topWidth' as const, label: '上', val: value.topWidth ?? '0' },
                { key: 'leftWidth' as const, label: '左', val: value.leftWidth ?? '0' },
                { key: 'bottomWidth' as const, label: '下', val: value.bottomWidth ?? '0' },
                { key: 'rightWidth' as const, label: '右', val: value.rightWidth ?? '0' },
              ].map(({ key, label, val }) => (
                <div key={key} className={styles.spacingCell}>
                  <span className={styles.spacingCellLabel}>{label}</span>
                  <PxInput
                    small
                    value={val}
                    onChange={(v) => onChange({ ...value, mode: 'separate', [key]: v })}
                    placeholder="0"
                    aria-label={`${label}描边宽度`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 颜色和样式：两行，控件尺寸与面板内其他输入一致 */}
      <div className={styles.field}>
        <label className={styles.labelSmall}>颜色</label>
        <RgbaColorPicker
          value={value.color}
          onChange={(color) => onChange({ ...value, color })}
          dense
        />
      </div>

      <div className={styles.field}>
        <label className={styles.labelSmall}>样式</label>
        <Select
          value={value.style || 'solid'}
          onChange={(v) => onChange({ ...value, style: v as 'solid' | 'dashed' | 'dotted' })}
          options={BORDER_STYLE_OPTIONS}
          aria-label="描边样式"
        />
      </div>
    </div>
  );
}
