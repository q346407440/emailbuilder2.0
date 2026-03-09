import { useState, useCallback } from 'react';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import type { SchemaField } from '@shared/utils/parseJsonSchema';
import { parseJsonSchema } from '@shared/utils/parseJsonSchema';
import type { TemplateEndpoint } from '@shared/api/serverApi';
import FieldMappingPanel from './FieldMappingPanel';
import styles from './EndpointEditor.module.css';

interface Props {
  templateVariables: CustomVariableDefinition[];
  /** 编辑已有接入点时传入，新建时为 undefined */
  initial?: TemplateEndpoint;
  onSave: (data: { name: string; sourceSchema: SchemaField[]; fieldMapping: Record<string, string> }) => Promise<void>;
  onCancel: () => void;
}

type Step = 1 | 2 | 3;

export default function EndpointEditor({ templateVariables, initial, onSave, onCancel }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(initial?.name ?? '');
  const [jsonText, setJsonText] = useState('');
  const [parseError, setParseError] = useState('');
  const [sourceFields, setSourceFields] = useState<SchemaField[]>(
    (initial?.sourceSchema as SchemaField[] | undefined) ?? []
  );
  const [mapping, setMapping] = useState<Record<string, string>>(initial?.fieldMapping ?? {});
  const [saving, setSaving] = useState(false);

  const handleStep1Next = () => {
    if (!name.trim()) return;
    setStep(2);
  };

  const handleParseJson = useCallback(() => {
    if (!jsonText.trim()) {
      setParseError('请粘贴 JSON 示例');
      return;
    }
    const fields = parseJsonSchema(jsonText);
    if (!fields) {
      setParseError('JSON 格式有误，请检查后重试');
      return;
    }
    setParseError('');
    setSourceFields(fields);
    setMapping({});
    setStep(3);
  }, [jsonText]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ name: name.trim(), sourceSchema: sourceFields, fieldMapping: mapping });
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!initial;

  return (
    <div className={styles.editor}>
      {/* 步骤指示器 */}
      <div className={styles.steps}>
        {([1, 2, 3] as Step[]).map((s, idx) => (
          <>
            <div
              key={s}
              className={`${styles.stepItem} ${step === s ? styles.stepActive : ''} ${step > s ? styles.stepDone : ''}`}
            >
              <span className={styles.stepNum}>{step > s ? '✓' : s}</span>
              <span className={styles.stepLabel}>
                {s === 1 ? '命名接入点' : s === 2 ? '粘贴数据示例' : '配置字段映射'}
              </span>
            </div>
            {idx < 2 && (
              <div
                key={`connector-${s}`}
                className={`${styles.stepConnector} ${step > s ? styles.stepConnectorDone : ''}`}
              />
            )}
          </>
        ))}
      </div>

      {/* Step 1：命名 */}
      {step === 1 && (
        <div className={styles.stepContent}>
          <p className={styles.stepDesc}>为这个接入点取一个便于识别的名称，例如「Shoplazza 弃购 Webhook」。</p>
          <label className={styles.fieldLabel}>接入点名称</label>
          <input
            type="text"
            className={styles.input}
            placeholder="例：Shoplazza 弃购 Webhook"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel}>取消</button>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleStep1Next}
              disabled={!name.trim()}
            >
              下一步
            </button>
          </div>
        </div>
      )}

      {/* Step 2：粘贴 JSON */}
      {step === 2 && (
        <div className={styles.stepContent}>
          <p className={styles.stepDesc}>
            粘贴外部系统调用时会传入的 JSON 数据示例。系统将自动解析字段结构，供下一步配置映射使用。
          </p>
          <label className={styles.fieldLabel}>JSON 数据示例</label>
          <textarea
            className={styles.textarea}
            placeholder={'{\n  "code": 200,\n  "data": [\n    { "title": "商品A", "price": "59元" }\n  ],\n  "customer": { "name": "张三" }\n}'}
            value={jsonText}
            onChange={(e) => { setJsonText(e.target.value); setParseError(''); }}
            rows={12}
            spellCheck={false}
          />
          {parseError && <p className={styles.error}>{parseError}</p>}
          {/* 如果是编辑模式且已有 sourceFields，允许跳过重新粘贴 */}
          {isEditing && sourceFields.length > 0 && !jsonText.trim() && (
            <p className={styles.hint}>已有数据示例（{sourceFields.length} 个字段）。可直接跳至映射配置，或重新粘贴覆盖。</p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setStep(1)}>上一步</button>
            {isEditing && sourceFields.length > 0 && !jsonText.trim() && (
              <button type="button" className={styles.secondaryBtn} onClick={() => setStep(3)}>
                跳过，使用已有字段
              </button>
            )}
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleParseJson}
              disabled={!jsonText.trim()}
            >
              解析并继续
            </button>
          </div>
        </div>
      )}

      {/* Step 3：字段映射 */}
      {step === 3 && (
        <div className={styles.stepContent}>
          <p className={styles.stepDesc}>
            为模板的每个变量选择对应的外部数据字段。未映射的变量在渲染时将使用默认值或留空。
          </p>
          {sourceFields.length === 0 ? (
            <p className={styles.hint}>没有可用的外部字段，请返回上一步重新粘贴数据示例。</p>
          ) : (
            <div className={styles.mappingWrap}>
              <FieldMappingPanel
                templateVariables={templateVariables}
                sourceFields={sourceFields}
                mapping={mapping}
                onChange={setMapping}
              />
            </div>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setStep(2)}>上一步</button>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中…' : isEditing ? '保存修改' : '创建接入点'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
