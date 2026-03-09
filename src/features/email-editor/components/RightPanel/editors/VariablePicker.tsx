import { useState, useMemo } from 'react';
import { getAllVariables, getArrayVariables } from '@shared/constants/variableSchema';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import type { VariableContentType } from '@shared/constants/variableSchema';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import VariablePickerModal from './VariablePickerModal';
import styles from './VariablePicker.module.css';

interface Props {
  value: string;
  onChange: (key: string) => void;
  customVariables?: CustomVariableDefinition[];
  placeholder?: string;
  contentType?: VariableContentType;
}

export default function VariablePicker({
  value,
  onChange,
  customVariables,
  placeholder = '— 点击选择变量 —',
  contentType,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const addCustomVariable = useEmailStore((s) => s.addCustomVariable);

  const allVars = useMemo(
    () => contentType === 'array'
      ? (getArrayVariables(customVariables) ?? []).map((v) => ({ key: v.key, label: v.label }))
      : getAllVariables(customVariables),
    [contentType, customVariables],
  );
  const selectedItem = useMemo(() => allVars.find((v) => v.key === value), [allVars, value]);

  return (
    <>
      <button
        type="button"
        className={styles.field}
        data-has-value={!!selectedItem}
        onClick={() => setModalOpen(true)}
        title={selectedItem ? `${selectedItem.key}  ${selectedItem.label}` : placeholder}
      >
        {selectedItem ? (
          <>
            <span className={styles.fieldKey}>{selectedItem.key}</span>
            <span className={styles.fieldLabel}>{selectedItem.label}</span>
          </>
        ) : (
          <span className={styles.fieldPlaceholder}>{placeholder}</span>
        )}
        <svg
          width="12" height="12" viewBox="0 0 12 12"
          fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
          className={styles.fieldIcon} aria-hidden
        >
          <path d="M2 4.5l4-3.5 4 3.5" />
          <path d="M2 7.5l4 3.5 4-3.5" />
        </svg>
      </button>

      <VariablePickerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedKey={value}
        onSelect={onChange}
        customVariables={customVariables ?? []}
        contentType={contentType}
        onAddCustomVariable={addCustomVariable}
      />
    </>
  );
}
