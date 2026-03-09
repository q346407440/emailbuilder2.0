import type { IconProps } from '@shared/types/email';
import FormField from './FormField';
import UrlInputField from './UrlInputField';
import BindableFieldRow from './BindableFieldRow';
import ConfigSection from './ConfigSection';
import UploadOrUrlField from './UploadOrUrlField';
import styles from './Editors.module.css';

// ===== 内容配置段 =====

interface IconContentSectionProps {
  props: IconProps;
  onChange: (updates: Record<string, unknown>) => void;
  variableBindings?: Record<string, string>;
  onBindVariable?: (propPath: string) => void;
  onUnbindVariable?: (propPath: string) => void;
  getVariableLabel?: (key: string) => string;
}

export function IconContentSection({
  props,
  onChange,
  variableBindings,
  onBindVariable,
  onUnbindVariable,
  getVariableLabel,
}: IconContentSectionProps) {
  const isCustom = props.iconType === 'custom';
  const customSrcBoundKey = variableBindings?.['props.customSrc'];
  const linkBoundKey = variableBindings?.['props.link'];

  return (
    <ConfigSection
      title="图标内容"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      {/* 图标选择 */}
      <FormField
        label="图标"
        type="select"
        value={props.iconType}
        onChange={(v) => {
          const updates: Record<string, unknown> = { iconType: v };
          if (v === 'custom') {
            updates.customSrc = props.customSrc ?? '';
          } else {
            updates.customSrc = undefined;
          }
          onChange(updates);
        }}
        options={[
          { value: 'mail', label: '邮件' },
          { value: 'phone', label: '电话' },
          { value: 'location', label: '定位' },
          { value: 'link', label: '链接' },
          { value: 'star', label: '星星' },
          { value: 'heart', label: '爱心' },
          { value: 'check', label: '勾选' },
          { value: 'arrow-right', label: '箭头' },
          { value: 'instagram', label: 'Instagram' },
          { value: 'tiktok', label: 'TikTok' },
          { value: 'youtube', label: 'YouTube' },
          { value: 'facebook', label: 'Facebook' },
          { value: 'twitter', label: 'Twitter/X' },
          { value: 'app-store', label: 'App Store' },
          { value: 'google-play', label: 'Google Play' },
          { value: 'custom', label: '自定义上传' },
        ]}
      />

      {/* 自定义图标资源 */}
      {isCustom && (
        <BindableFieldRow
          label="图标文件"
          boundKey={customSrcBoundKey}
          getVariableLabel={getVariableLabel}
          onBind={() => onBindVariable?.('props.customSrc')}
          onUnbind={() => onUnbindVariable?.('props.customSrc')}
        >
          <UploadOrUrlField
            value={props.customSrc || ''}
            onChange={(customSrc) => onChange({ customSrc })}
            uploadButtonLabel="上传图标文件"
            placeholder="或输入图标 URL"
            accept="image/svg+xml,image/png,image/jpeg,image/gif,image/webp"
            disabled={!!customSrcBoundKey}
          />
        </BindableFieldRow>
      )}

      {/* 链接地址 */}
      <BindableFieldRow
        label="链接地址"
        boundKey={linkBoundKey}
        getVariableLabel={getVariableLabel}
        onBind={() => onBindVariable?.('props.link')}
        onUnbind={() => onUnbindVariable?.('props.link')}
      >
        <UrlInputField
          value={props.link}
          onChange={(v) => onChange({ link: v })}
          placeholder="输入跳转地址"
          disabled={!!linkBoundKey}
        />
      </BindableFieldRow>
    </ConfigSection>
  );
}

// ===== 样式配置段 =====

interface IconStyleSectionProps {
  props: IconProps;
  onChange: (updates: Record<string, unknown>) => void;
}

export function IconStyleSection({ props, onChange }: IconStyleSectionProps) {
  return (
    <ConfigSection
      title="图标样式"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <div className={styles.fieldFullWidth}>
        <FormField
          label="颜色"
          type="color"
          value={props.color}
          onChange={(v) => onChange({ color: v })}
          disabled={props.iconType === 'app-store' || props.iconType === 'google-play'}
        />
      </div>
      <div className={styles.fieldFullWidth}>
        <div className={styles.fieldRow}>
          <FormField
            label="尺寸模式"
            type="select"
            value={props.sizeMode}
            onChange={(v) => onChange({ sizeMode: v })}
            options={[
              { value: 'height', label: '限制高度' },
              { value: 'width', label: '限制宽度' },
            ]}
          />
          <FormField
            label={props.sizeMode === 'width' ? '宽度' : '高度'}
            type="text"
            value={props.size}
            onChange={(v) => onChange({ size: v })}
            placeholder="例如 32"
          />
        </div>
      </div>
    </ConfigSection>
  );
}
