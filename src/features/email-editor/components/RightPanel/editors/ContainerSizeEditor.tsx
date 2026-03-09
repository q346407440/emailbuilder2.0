import type { ContainerSizeMode, WrapperStyle } from '@shared/types/email';
import PxInput from './PxInput';
import FormField from './FormField';
import styles from './Editors.module.css';
import sizeStyles from './ContainerSizeEditor.module.css';

// 宽度/高度策略选项（类 Figma：铺满容器 | 根据内容 | 固定尺寸）
const DIMENSION_OPTIONS: { value: ContainerSizeMode; label: string }[] = [
  { value: 'fill', label: '铺满容器' },
  { value: 'fitContent', label: '根据内容' },
  { value: 'fixed', label: '固定尺寸' },
];

// 预设快捷比例（宽高均为 fixed 时可用）
const QUICK_RATIOS = [
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '2:1', ratio: 2 },
];

interface ContainerSizeEditorProps {
  widthMode: ContainerSizeMode;
  heightMode: ContainerSizeMode;
  fixedWidth?: string;
  fixedHeight?: string;
  lockAspectRatio?: boolean;
  onChange: (updates: Partial<WrapperStyle>) => void;
}

export default function ContainerSizeEditor({
  widthMode,
  heightMode,
  fixedWidth,
  fixedHeight,
  lockAspectRatio,
  onChange,
}: ContainerSizeEditorProps) {
  const bothFixed = widthMode === 'fixed' && heightMode === 'fixed';

  const handleWidthChange = (newWidth: string) => {
    if (bothFixed && lockAspectRatio && newWidth) {
      const currentW = parseFloat(fixedWidth || '100');
      const currentH = parseFloat(fixedHeight || '100');
      const ratio = currentH / currentW;
      const newW = parseFloat(newWidth.replace(/[^0-9.]/g, ''));
      if (!isNaN(newW) && !isNaN(ratio)) {
        const newH = Math.round(newW * ratio);
        onChange({ fixedWidth: newWidth, fixedHeight: `${newH}px` });
      } else {
        onChange({ fixedWidth: newWidth });
      }
    } else {
      onChange({ fixedWidth: newWidth });
    }
  };

  const handleHeightChange = (newHeight: string) => {
    if (bothFixed && lockAspectRatio && newHeight) {
      const currentW = parseFloat(fixedWidth || '100');
      const currentH = parseFloat(fixedHeight || '100');
      const ratio = currentW / currentH;
      const newH = parseFloat(newHeight.replace(/[^0-9.]/g, ''));
      if (!isNaN(newH) && !isNaN(ratio)) {
        const newW = Math.round(newH * ratio);
        onChange({ fixedHeight: newHeight, fixedWidth: `${newW}px` });
      } else {
        onChange({ fixedHeight: newHeight });
      }
    } else {
      onChange({ fixedHeight: newHeight });
    }
  };

  const applyQuickRatio = (ratio: number) => {
    const currentW = parseFloat(fixedWidth || '100');
    if (!isNaN(currentW)) {
      const newH = Math.round(currentW / ratio);
      onChange({ fixedHeight: `${newH}px`, lockAspectRatio: true });
    }
  };

  return (
    <div className={sizeStyles.sizeEditor}>
      {/* 宽度与高度一行并排 */}
      <div className={sizeStyles.dimensionsRow}>
        <div className={sizeStyles.dimensionBlock}>
          <FormField
            label="宽度"
            type="select"
            value={widthMode}
            onChange={(v) => {
              const mode = v as ContainerSizeMode;
              const updates: Partial<WrapperStyle> = { widthMode: mode };
              if (mode === 'fixed' && !fixedWidth) updates.fixedWidth = '200px';
              onChange(updates);
            }}
            options={DIMENSION_OPTIONS}
          />
          {widthMode === 'fixed' && (
            <div className={styles.field}>
              <label className={styles.label}>宽度值</label>
              <PxInput
                value={fixedWidth || '200px'}
                onChange={handleWidthChange}
                placeholder="200"
              />
            </div>
          )}
        </div>
        <div className={sizeStyles.dimensionBlock}>
          <FormField
            label="高度"
            type="select"
            value={heightMode}
            onChange={(v) => {
              const mode = v as ContainerSizeMode;
              const updates: Partial<WrapperStyle> = { heightMode: mode };
              if (mode === 'fixed' && !fixedHeight) updates.fixedHeight = '100px';
              onChange(updates);
            }}
            options={DIMENSION_OPTIONS}
          />
          {heightMode === 'fixed' && (
            <div className={styles.field}>
              <label className={styles.label}>高度值</label>
              <PxInput
                value={fixedHeight || '100px'}
                onChange={handleHeightChange}
                placeholder="100"
              />
            </div>
          )}
        </div>
      </div>

      {/* 宽高均为固定时：锁定比例 + 快捷比例 */}
      {bothFixed && (
        <div className={sizeStyles.fixedContent}>
          <div className={sizeStyles.dimensionRow}>
            <button
              type="button"
              className={`${sizeStyles.lockBtn} ${lockAspectRatio ? sizeStyles.locked : ''}`}
              onClick={() => onChange({ lockAspectRatio: !lockAspectRatio })}
              title={lockAspectRatio ? '解锁比例' : '锁定比例'}
            >
              {lockAspectRatio ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="7" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 7V5C6 3.89543 6.89543 3 8 3V3C9.10457 3 10 3.89543 10 5V7" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="7" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6 7V5C6 3.89543 6.89543 3 8 3V3C9.10457 3 10 3.89543 10 5V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="10" cy="5" r="1.5" fill="var(--bg-panel)" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </button>
            <span className={sizeStyles.quickRatiosLabel}>快捷比例</span>
            <div className={sizeStyles.ratioButtons}>
              {QUICK_RATIOS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={sizeStyles.ratioBtn}
                  onClick={() => applyQuickRatio(item.ratio)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
