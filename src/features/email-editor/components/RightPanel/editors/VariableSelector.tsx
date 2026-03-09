import type { VariableContentType } from '@shared/constants/variableSchema';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import VariablePickerModal from './VariablePickerModal';
import type { VariablePickerModalProps } from './VariablePickerModal';

export { getVariableLabel } from '@shared/constants/variableSchema';

export interface VariableSelectorProps {
  open: boolean;
  onClose: () => void;
  contentType: VariableContentType;
  onSelect: (variableKey: string) => void;
  customVariables?: CustomVariableDefinition[];
  /** 若当前组件在循环区块内，传入循环上下文以在选择器中展示 item.* 字段 */
  loopContext?: VariablePickerModalProps['loopContext'];
}

export default function VariableSelector({
  open,
  onClose,
  contentType,
  onSelect,
  customVariables,
  loopContext,
}: VariableSelectorProps) {
  const addCustomVariable = useEmailStore((s) => s.addCustomVariable);

  return (
    <VariablePickerModal
      open={open}
      onClose={onClose}
      onSelect={onSelect}
      customVariables={customVariables ?? []}
      contentType={contentType}
      onAddCustomVariable={addCustomVariable}
      loopContext={loopContext}
    />
  );
}
