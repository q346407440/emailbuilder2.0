import type { ImageProps, ImageSizeConfig } from '@shared/types/email';
import UrlInputField from './UrlInputField';
import ImageSizeEditor from './ImageSizeEditor';
import BorderRadiusField from './BorderRadiusField';
import ConfigSection from './ConfigSection';
import BindableFieldRow from './BindableFieldRow';
import UploadOrUrlField from './UploadOrUrlField';
import styles from './Editors.module.css';

// ===== 内容配置段 =====

interface ImageContentSectionProps {
  props: ImageProps;
  onChange: (updates: Record<string, unknown>) => void;
  variableBindings?: Record<string, string>;
  onBindVariable?: (propPath: string) => void;
  onUnbindVariable?: (propPath: string) => void;
  getVariableLabel?: (key: string) => string;
}

export function ImageContentSection({
  props,
  onChange,
  variableBindings,
  onBindVariable,
  onUnbindVariable,
  getVariableLabel,
}: ImageContentSectionProps) {
  const srcBoundKey = variableBindings?.['props.src'];
  const linkBoundKey = variableBindings?.['props.link'];

  return (
    <ConfigSection
      title="图片内容"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      {/* 图片地址 */}
      <BindableFieldRow
        label="图片"
        boundKey={srcBoundKey}
        getVariableLabel={getVariableLabel}
        onBind={() => onBindVariable?.('props.src')}
        onUnbind={() => onUnbindVariable?.('props.src')}
      >
        <UploadOrUrlField
          value={props.src || ''}
          onChange={(src) => onChange({ src })}
          uploadButtonLabel="上传本地图片"
          placeholder="或输入图片 URL"
          accept="image/*"
          disabled={!!srcBoundKey}
        />
      </BindableFieldRow>

      {/* 点击链接 */}
      <BindableFieldRow
        label="点击链接"
        boundKey={linkBoundKey}
        getVariableLabel={getVariableLabel}
        onBind={() => onBindVariable?.('props.link')}
        onUnbind={() => onUnbindVariable?.('props.link')}
      >
        <UrlInputField
          value={props.link}
          onChange={(v) => onChange({ link: v })}
          placeholder="点击图片跳转的 URL"
          disabled={!!linkBoundKey}
        />
      </BindableFieldRow>
    </ConfigSection>
  );
}

// ===== 样式配置段 =====

interface ImageStyleSectionProps {
  props: ImageProps;
  onChange: (updates: Record<string, unknown>) => void;
}

export function ImageStyleSection({ props, onChange }: ImageStyleSectionProps) {
  const sizeConfig = props.sizeConfig;

  const handleSizeConfigChange = (updates: Partial<ImageSizeConfig>) => {
    onChange({ sizeConfig: { ...sizeConfig, ...updates } });
  };

  return (
    <ConfigSection
      title="图片样式"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <div className={styles.fieldFullWidth}>
        <button
          type="button"
          className={`${styles.layoutModeToggle} ${props.layoutMode ? styles.layoutModeToggleActive : ''}`}
          onClick={() => onChange({ layoutMode: !props.layoutMode })}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <path d="M1 6h14" />
            <path d="M6 6v9" />
          </svg>
          <span className={styles.layoutModeToggleText}>布局模式</span>
          <span className={styles.layoutModeToggleBadge}>
            {props.layoutMode ? 'ON' : 'OFF'}
          </span>
        </button>
        {props.layoutMode && (
          <p className={styles.layoutModeHint}>
            图片区域已成为插槽，可从左侧拖入组件叠加到图片上方
          </p>
        )}
      </div>

      <ImageSizeEditor
        config={sizeConfig}
        onChange={handleSizeConfigChange}
      />

      <div className={styles.fieldFullWidth}>
        <BorderRadiusField
          label="图片圆角"
          value={props.borderRadius}
          onChange={(borderRadius) => onChange({ borderRadius })}
        />
      </div>
    </ConfigSection>
  );
}
