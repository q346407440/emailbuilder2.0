import type { ImageSizeConfig } from '@shared/types/email';
import PxInput from './PxInput';
import styles from './Editors.module.css';
import sizeStyles from './ImageSizeEditor.module.css';

interface ImageSizeEditorProps {
  config: ImageSizeConfig;
  onChange: (updates: Partial<ImageSizeConfig>) => void;
  currentImageDimensions?: { width: number; height: number }; // 当前图片的原始尺寸
}

// 预设快捷比例
const QUICK_RATIOS = [
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '2:1', ratio: 2 },
];

export default function ImageSizeEditor({ 
  config, 
  onChange, 
  currentImageDimensions 
}: ImageSizeEditorProps) {
  // 处理宽度改变（锁定比例时同步改高度）；PxInput 始终传 "Npx"
  const handleWidthChange = (newWidth: string) => {
    if (config.lockAspectRatio && newWidth) {
      const currentW = parseFloat(config.width || '300');
      const currentH = parseFloat(config.height || '200');
      const ratio = currentH / currentW;
      const newW = parseFloat(newWidth.replace(/[^0-9.]/g, ''));
      if (!isNaN(newW) && !isNaN(ratio)) {
        const newH = Math.round(newW * ratio);
        onChange({ width: newWidth, height: `${newH}px` });
      } else {
        onChange({ width: newWidth });
      }
    } else {
      onChange({ width: newWidth });
    }
  };

  // 处理高度改变（锁定比例时同步改宽度）
  const handleHeightChange = (newHeight: string) => {
    if (config.lockAspectRatio && newHeight) {
      const currentW = parseFloat(config.width || '300');
      const currentH = parseFloat(config.height || '200');
      const ratio = currentW / currentH;
      const newH = parseFloat(newHeight.replace(/[^0-9.]/g, ''));
      if (!isNaN(newH) && !isNaN(ratio)) {
        const newW = Math.round(newH * ratio);
        onChange({ height: newHeight, width: `${newW}px` });
      } else {
        onChange({ height: newHeight });
      }
    } else {
      onChange({ height: newHeight });
    }
  };

  // 套用快捷比例
  const applyQuickRatio = (ratio: number) => {
    const currentW = parseFloat(config.width || '300');
    if (!isNaN(currentW)) {
      const newH = Math.round(currentW / ratio);
      onChange({ height: `${newH}px`, lockAspectRatio: true });
    }
  };

  return (
    <div className={sizeStyles.sizeEditor}>
      {/* 展示模式选择：1. 原图尺寸 2. 铺满容器 3. 固定尺寸 */}
      <div className={sizeStyles.modeSelector}>
        <button
          type="button"
          className={`${sizeStyles.modeBtn} ${config.mode === 'original' ? sizeStyles.active : ''}`}
          onClick={() => onChange({ mode: 'original' })}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="3" y="5" width="10" height="6" stroke="currentColor" strokeWidth="1.5" rx="1" />
          </svg>
          原图尺寸
        </button>
        <button
          type="button"
          className={`${sizeStyles.modeBtn} ${config.mode === 'fill' ? sizeStyles.active : ''}`}
          onClick={() => onChange({ mode: 'fill' })}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="4" width="14" height="8" stroke="currentColor" strokeWidth="1.5" rx="1" />
            <path d="M1 8H0M16 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          铺满容器
        </button>
        <button
          type="button"
          className={`${sizeStyles.modeBtn} ${config.mode === 'fixed' ? sizeStyles.active : ''}`}
          onClick={() => onChange({ mode: 'fixed' })}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="4" width="12" height="8" stroke="currentColor" strokeWidth="1.5" rx="1" />
            <path d="M6 4V2M10 4V2M6 14V12M10 14V12M2 8H0M16 8H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          固定尺寸
        </button>
      </div>

      {/* 原图尺寸模式：仅最大宽高，超出可视区域时等比缩放 */}
      {config.mode === 'original' && (
        <div className={sizeStyles.originalModeContent}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="image-max-width">最大宽度</label>
            <PxInput
              id="image-max-width"
              optional
              value={config.maxWidth ?? ''}
              onChange={(v) => onChange({ maxWidth: v })}
              placeholder="留空不限制"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="image-max-height">最大高度</label>
            <PxInput
              id="image-max-height"
              optional
              value={config.maxHeight ?? ''}
              onChange={(v) => onChange({ maxHeight: v })}
              placeholder="留空不限制"
            />
          </div>
          {currentImageDimensions && (
            <div className={sizeStyles.dimensionHint}>
              原图尺寸：{currentImageDimensions.width} × {currentImageDimensions.height}
            </div>
          )}
        </div>
      )}

      {/* 铺满容器模式：固定填满裁切 (cover)，无额外配置 */}
      {config.mode === 'fill' && (
        <div className={sizeStyles.fillModeContent}>
          <p className={sizeStyles.fillModeHint}>以填满裁切形式铺满整个容器</p>
        </div>
      )}

      {/* 固定尺寸模式：等比缩放裁切铺满（cover） */}
      {config.mode === 'fixed' && (
        <div className={sizeStyles.fixedModeContent}>
          <p className={sizeStyles.fillModeHint}>等比缩放裁切铺满容器（短边铺满，长边裁切）</p>
          {/* 宽高输入 */}
          <div className={sizeStyles.dimensionRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="image-fixed-width">宽度</label>
              <PxInput
                id="image-fixed-width"
                value={config.width || '300px'}
                onChange={handleWidthChange}
                placeholder="300"
              />
            </div>
            <button
              type="button"
              className={`${sizeStyles.lockBtn} ${config.lockAspectRatio ? sizeStyles.locked : ''}`}
              onClick={() => onChange({ lockAspectRatio: !config.lockAspectRatio })}
              title={config.lockAspectRatio ? '解锁比例' : '锁定比例'}
            >
              {config.lockAspectRatio ? (
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
            <div className={styles.field}>
              <label className={styles.label} htmlFor="image-fixed-height">高度</label>
              <PxInput
                id="image-fixed-height"
                value={config.height || '200px'}
                onChange={handleHeightChange}
                placeholder="200"
              />
            </div>
          </div>

          {/* 快捷比例 */}
          <div className={sizeStyles.quickRatios}>
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
