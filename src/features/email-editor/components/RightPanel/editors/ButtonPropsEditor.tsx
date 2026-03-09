import type { ButtonProps, SpacingConfig } from '@shared/types/email';
import FormField from './FormField';
import UrlInputField from './UrlInputField';
import PxInput from './PxInput';
import SpacingField from './SpacingField';
import BindableFieldRow from './BindableFieldRow';
import ConfigSection from './ConfigSection';
import { FONT_OPTIONS } from '@shared/constants/fontOptions';
import styles from './Editors.module.css';

const WIDTH_MODE_OPTIONS = [
  { value: 'fitContent', label: '包裹内容' },
  { value: 'fill', label: '撑满容器' },
  { value: 'fixed', label: '固定宽度' },
];

// ===== 内容配置段 =====

interface ButtonContentSectionProps {
  props: ButtonProps;
  onChange: (updates: Record<string, unknown>) => void;
  variableBindings?: Record<string, string>;
  onBindVariable?: (propPath: string) => void;
  onUnbindVariable?: (propPath: string) => void;
  getVariableLabel?: (key: string) => string;
}

export function ButtonContentSection({
  props,
  onChange,
  variableBindings,
  onBindVariable,
  onUnbindVariable,
  getVariableLabel,
}: ButtonContentSectionProps) {
  const textBoundKey = variableBindings?.['props.text'];
  const linkBoundKey = variableBindings?.['props.link'];

  return (
    <ConfigSection
      title="按钮内容"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      {/* 按钮文字 */}
      <BindableFieldRow
        label="按钮文字"
        boundKey={textBoundKey}
        getVariableLabel={getVariableLabel}
        onBind={() => onBindVariable?.('props.text')}
        onUnbind={() => onUnbindVariable?.('props.text')}
      >
        <input
          type="text"
          className={styles.input}
          value={props.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="输入按钮文字"
          disabled={!!textBoundKey}
        />
      </BindableFieldRow>

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

interface ButtonStyleSectionProps {
  props: ButtonProps;
  onChange: (updates: Record<string, unknown>) => void;
}

export function ButtonStyleSection({ props, onChange }: ButtonStyleSectionProps) {
  const isSolid = props.buttonStyle === 'solid';

  return (
    <ConfigSection
      title="按钮样式"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <div className={styles.textStyleField}>
        <label className={styles.label}>文字样式</label>
        <div className={styles.textStyleRow}>
          <button
            type="button"
            className={`${styles.textStyleBtn} ${(props.fontWeight ?? '600') !== '400' ? styles.textStyleBtnActive : ''}`}
            title="粗体"
            aria-pressed={(props.fontWeight ?? '600') !== '400'}
            onClick={() => onChange({ fontWeight: (props.fontWeight ?? '600') !== '400' ? '400' : '700' })}
            style={{ fontWeight: 700 }}
          >
            B
          </button>
          <button
            type="button"
            className={`${styles.textStyleBtn} ${(props.fontStyle ?? 'normal') === 'italic' ? styles.textStyleBtnActive : ''}`}
            title="斜体"
            aria-pressed={(props.fontStyle ?? 'normal') === 'italic'}
            onClick={() => onChange({ fontStyle: (props.fontStyle ?? 'normal') === 'italic' ? 'normal' : 'italic' })}
            style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}
          >
            I
          </button>
          <button
            type="button"
            className={`${styles.textStyleBtn} ${(props.textDecoration ?? 'none') === 'underline' ? styles.textStyleBtnActive : ''}`}
            title="下划线"
            aria-pressed={(props.textDecoration ?? 'none') === 'underline'}
            onClick={() => onChange({ textDecoration: (props.textDecoration ?? 'none') === 'underline' ? 'none' : 'underline' })}
            style={{ textDecoration: 'underline' }}
          >
            U
          </button>
          <button
            type="button"
            className={`${styles.textStyleBtn} ${(props.textDecoration ?? 'none') === 'line-through' ? styles.textStyleBtnActive : ''}`}
            title="删除线"
            aria-pressed={(props.textDecoration ?? 'none') === 'line-through'}
            onClick={() => onChange({ textDecoration: (props.textDecoration ?? 'none') === 'line-through' ? 'none' : 'line-through' })}
            style={{ textDecoration: 'line-through' }}
          >
            S
          </button>
        </div>
      </div>
      <FormField
        label="按钮样式"
        type="select"
        value={props.buttonStyle}
        onChange={(v) => onChange({ buttonStyle: v })}
        options={[
          { value: 'solid', label: '实心' },
          { value: 'outlined', label: '线框' },
        ]}
      />
      <FormField
        label="按钮宽度"
        type="select"
        value={props.widthMode ?? 'fitContent'}
        onChange={(v) => onChange({ widthMode: v })}
        options={WIDTH_MODE_OPTIONS}
      />
      {(props.widthMode ?? 'fitContent') === 'fixed' && (
        <div className={styles.field}>
          <label className={styles.label} htmlFor="button-fixed-width">固定宽度</label>
          <PxInput
            id="button-fixed-width"
            value={props.fixedWidth || '200px'}
            onChange={(v) => onChange({ fixedWidth: v })}
            placeholder="200"
          />
        </div>
      )}
      {isSolid ? (
        <FormField
          label="背景色"
          type="color"
          value={props.backgroundColor}
          onChange={(v) => onChange({ backgroundColor: v })}
        />
      ) : (
        <FormField
          label="边框色"
          type="color"
          value={props.borderColor}
          onChange={(v) => onChange({ borderColor: v })}
        />
      )}
      <FormField
        label="文字色"
        type="color"
        value={props.textColor}
        onChange={(v) => onChange({ textColor: v })}
      />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="button-font-size">字号</label>
        <PxInput
          id="button-font-size"
          value={props.fontSize || '16px'}
          onChange={(v) => onChange({ fontSize: v })}
          placeholder="16"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="button-border-radius">圆角</label>
        <PxInput
          id="button-border-radius"
          value={props.borderRadius || '4px'}
          onChange={(v) => onChange({ borderRadius: v })}
          placeholder="4"
        />
      </div>
      <FormField
        label="字体模式"
        type="select"
        value={props.fontMode}
        onChange={(v) => onChange({ fontMode: v })}
        options={[
          { value: 'inherit', label: '继承画布字体' },
          { value: 'custom', label: '自定义字体' },
        ]}
      />
      {props.fontMode === 'custom' && (
        <FormField
          label="自定义字体"
          type="select"
          value={props.fontFamily}
          onChange={(v) => onChange({ fontFamily: v })}
          options={FONT_OPTIONS}
        />
      )}
      <div className={styles.fieldFullWidth}>
        <SpacingField
          label="内距"
          value={props.padding}
          onChange={(v: SpacingConfig) => onChange({ padding: v })}
          placeholder="0"
        />
      </div>
    </ConfigSection>
  );
}
