import type { ReactNode } from 'react';
import styles from './Editors.module.css';

interface BindableFieldRowProps {
  label: string;
  children: ReactNode;
  boundKey?: string;
  getVariableLabel?: (key: string) => string;
  onBind?: () => void;
  onUnbind?: () => void;
  bindButtonLabel?: string;
  fullWidth?: boolean;
  compact?: boolean;
}

export default function BindableFieldRow({
  label,
  children,
  boundKey,
  getVariableLabel,
  onBind,
  onUnbind,
  bindButtonLabel = '绑定变量',
  fullWidth = true,
  compact = true,
}: BindableFieldRowProps) {
  return (
    <div className={`${fullWidth ? styles.fieldFullWidth : ''} ${styles.fieldWithLabelRow}`.trim()}>
      <div className={`${styles.labelRow} ${compact ? styles.labelRowCompact : ''}`.trim()}>
        <label className={styles.label}>{label}</label>
        {boundKey ? (
          <span className={styles.variableBindingTag}>
            {getVariableLabel ? getVariableLabel(boundKey) : boundKey}
            <button
              type="button"
              className={styles.variableBindingUnbindBtn}
              onClick={onUnbind}
            >
              解除
            </button>
          </span>
        ) : onBind ? (
          <button
            type="button"
            className={styles.bindVariableBtn}
            onClick={onBind}
          >
            {bindButtonLabel}
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}
