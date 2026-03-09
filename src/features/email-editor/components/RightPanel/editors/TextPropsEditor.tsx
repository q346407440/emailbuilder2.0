import { useRef, useState, useCallback } from 'react';
import type { TextProps } from '@shared/types/email';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import FormField from './FormField';
import PxInput from './PxInput';
import RichTextEditor, { type RichTextEditorHandle } from './RichTextEditor';
import VariableSelector, { type VariableSelectorProps } from './VariableSelector';
import { FONT_OPTIONS } from '@shared/constants/fontOptions';
import ConfigSection from './ConfigSection';
import styles from './Editors.module.css';

interface TextContentSectionProps {
  props: TextProps;
  onChange: (updates: Record<string, unknown>) => void;
  customVariables?: CustomVariableDefinition[];
  loopContext?: VariableSelectorProps['loopContext'];
}

export function TextContentSection({ props, onChange, customVariables, loopContext }: TextContentSectionProps) {
  const richTextRef = useRef<RichTextEditorHandle>(null);
  const [variableSelectorOpen, setVariableSelectorOpen] = useState(false);
  const [hasEditorSelection, setHasEditorSelection] = useState(false);

  const handleInsertVarMouseDown = useCallback(() => {
    richTextRef.current?.saveCurrentSelection();
  }, []);

  return (
    <ConfigSection
      title="文本内容"
      headerRight={
        <button
          type="button"
          className={styles.bindVariableBtn}
          onMouseDown={handleInsertVarMouseDown}
          onClick={() => setVariableSelectorOpen(true)}
        >
          {hasEditorSelection ? '替换为变量' : '插入变量'}
        </button>
      }
    >
      <div className={styles.fieldFullWidth}>
        <RichTextEditor
          ref={richTextRef}
          value={props.content}
          onChange={(html) => onChange({ content: html })}
          placeholder="输入正文…"
          minHeight="140px"
          customVariables={customVariables}
          onSelectionChange={setHasEditorSelection}
        />
      </div>
      <VariableSelector
        open={variableSelectorOpen}
        onClose={() => setVariableSelectorOpen(false)}
        contentType="text"
        customVariables={customVariables}
        loopContext={loopContext}
        onSelect={(key) => {
          richTextRef.current?.insertContentAtCursor(`{{${key}}}`);
          setVariableSelectorOpen(false);
        }}
      />
    </ConfigSection>
  );
}

interface TextStyleSectionProps {
  props: TextProps;
  onChange: (updates: Record<string, unknown>) => void;
}

export function TextStyleSection({ props, onChange }: TextStyleSectionProps) {
  return (
    <ConfigSection
      title="文字样式"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <div className={styles.field}>
        <label className={styles.label}>默认字号</label>
        <PxInput
          value={props.fontSize ?? ''}
          onChange={(v) => onChange({ fontSize: v || undefined })}
          placeholder="继承"
          optional
          small
        />
      </div>
      <FormField
        label="行高"
        type="select"
        value={props.lineHeight ?? 'inherit'}
        onChange={(v) => onChange({ lineHeight: v === 'inherit' ? undefined : v })}
        options={[
          { value: 'inherit', label: '继承' },
          { value: '1.2', label: '紧凑 (1.2)' },
          { value: '1.5', label: '正常 (1.5)' },
          { value: '1.8', label: '宽松 (1.8)' },
          { value: '2', label: '超宽 (2.0)' },
        ]}
      />
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
    </ConfigSection>
  );
}

// 保留默认导出以维持向后兼容（内部组合两段）
interface TextPropsEditorProps {
  props: TextProps;
  onChange: (updates: Record<string, unknown>) => void;
  customVariables?: CustomVariableDefinition[];
}

export default function TextPropsEditor({ props, onChange, customVariables }: TextPropsEditorProps) {
  return (
    <>
      <TextContentSection props={props} onChange={onChange} customVariables={customVariables} />
      <TextStyleSection props={props} onChange={onChange} />
    </>
  );
}
