import type { GridProps } from '@shared/types/email';
import FormField from './FormField';
import PxInput from './PxInput';
import ConfigSection from './ConfigSection';
import styles from './Editors.module.css';

interface GridPropsEditorProps {
  props: GridProps;
  onChange: (updates: Record<string, unknown>) => void;
}

export default function GridPropsEditor({ props, onChange }: GridPropsEditorProps) {
  return (
    <ConfigSection
      title="网格设置"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <FormField
        label="每行列数"
        type="number"
        value={props.columnsPerRow}
        onChange={(v) => onChange({ columnsPerRow: Number(v) })}
        min={1}
        max={6}
      />
      <FormField
        label="插槽总数"
        type="number"
        value={props.slots}
        onChange={(v) => onChange({ slots: Number(v) })}
        min={1}
        max={36}
      />
      <div className={styles.fieldFullWidth}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="grid-gap">间距</label>
          <PxInput
            id="grid-gap"
            value={props.gap || '0'}
            onChange={(v) => onChange({ gap: v })}
            placeholder="0"
          />
        </div>
      </div>
    </ConfigSection>
  );
}
