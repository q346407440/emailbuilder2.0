import type { LayoutProps } from '@shared/types/email';
import FormField from './FormField';
import PxInput from './PxInput';
import ConfigSection from './ConfigSection';
import styles from './Editors.module.css';

interface LayoutPropsEditorProps {
  props: LayoutProps;
  onChange: (updates: Record<string, unknown>) => void;
}

export default function LayoutPropsEditor({ props, onChange }: LayoutPropsEditorProps) {
  const isAutoGap = props.distribution === 'spaceBetween';
  return (
    <ConfigSection
      title="布局设置"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <div className={styles.field}>
        <label className={styles.label} htmlFor="layout-gap">间距</label>
        {isAutoGap ? (
          <div className={`${styles.pxInputWrap} ${styles.pxInputWrapDisabled}`}>
            <input
              type="text"
              className={styles.pxInput}
              value="Auto"
              aria-label="layout-gap-auto"
              disabled
            />
          </div>
        ) : (
          <PxInput
            id="layout-gap"
            value={props.gap || '0'}
            onChange={(v) => onChange({ gap: v })}
            placeholder="0"
          />
        )}
      </div>
      <div className={styles.fieldFullWidth}>
        <FormField
          label="方向"
          type="select"
          value={props.direction}
          onChange={(v) => onChange({ direction: v })}
          options={[
            { value: 'horizontal', label: '水平' },
            { value: 'vertical', label: '垂直' },
          ]}
        />
      </div>
      <div className={styles.fieldFullWidth}>
        <FormField
          label="间距模式"
          type="select"
          value={props.distribution}
          onChange={(v) => onChange({ distribution: v })}
          options={[
            { value: 'packed', label: '自定义间距' },
            { value: 'spaceBetween', label: '均分（Auto）' },
          ]}
        />
      </div>
    </ConfigSection>
  );
}
