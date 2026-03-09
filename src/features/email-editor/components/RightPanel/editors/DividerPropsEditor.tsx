import type { DividerProps } from '@shared/types/email';
import FormField from './FormField';
import PxInput from './PxInput';
import ConfigSection from './ConfigSection';
import styles from './Editors.module.css';

interface DividerPropsEditorProps {
  props: DividerProps;
  onChange: (updates: Record<string, unknown>) => void;
}

export default function DividerPropsEditor({ props, onChange }: DividerPropsEditorProps) {
  return (
    <ConfigSection
      title="分割线样式"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <FormField
        label="样式"
        type="select"
        value={props.dividerStyle}
        onChange={(v) => onChange({ dividerStyle: v })}
        options={[
          { value: 'line', label: '分割线' },
          { value: 'block', label: '颜色块' },
        ]}
      />
      <FormField
        label="颜色"
        type="color"
        value={props.color}
        onChange={(v) => onChange({ color: v })}
      />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="divider-height">高度</label>
        <PxInput
          id="divider-height"
          value={props.height || '1px'}
          onChange={(v) => onChange({ height: v })}
          placeholder="1"
        />
      </div>
      <FormField
        label="宽度"
        type="text"
        value={props.width}
        onChange={(v) => onChange({ width: v })}
        placeholder="例如 100% 或 80%"
      />
    </ConfigSection>
  );
}
