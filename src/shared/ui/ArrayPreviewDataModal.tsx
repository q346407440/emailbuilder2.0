import { useState } from 'react';
import Modal, { ModalFooter } from './Modal';
import type { CustomVariableDefinition } from '../types/emailTemplate';
import styles from './ArrayPreviewDataModal.module.css';

// ─── 数组预览数据编辑器 ────────────────────────────────────────────────────────

function ArrayPreviewEditor({
  variable,
  items,
  onSetItems,
}: {
  variable: CustomVariableDefinition;
  items: Record<string, string>[];
  onSetItems: (items: Record<string, string>[]) => void;
}) {
  const [jsonError, setJsonError] = useState('');
  const schema = variable.itemSchema ?? [];

  const updateField = (itemIndex: number, fieldKey: string, value: string) => {
    onSetItems(items.map((item, i) =>
      i === itemIndex ? { ...item, [fieldKey]: value } : item
    ));
  };

  const addItem = () => {
    const empty: Record<string, string> = {};
    schema.forEach((f) => { empty[f.key] = ''; });
    onSetItems([...items, empty]);
  };

  const removeItem = (index: number) => {
    onSetItems(items.filter((_, i) => i !== index));
  };

  const handleJsonPaste = (raw: string) => {
    try {
      const parsed = JSON.parse(raw.trim()) as unknown;
      if (!Array.isArray(parsed)) throw new Error('需要 JSON 数组');
      const normalized = (parsed as Record<string, unknown>[]).map((obj) => {
        const row: Record<string, string> = {};
        schema.forEach((f) => { row[f.key] = String(obj[f.key] ?? ''); });
        return row;
      });
      onSetItems(normalized);
      setJsonError('');
    } catch (e) {
      setJsonError(`解析失败：${(e as Error).message}`);
    }
  };

  if (schema.length === 0) {
    return (
      <div className={styles.schemaEmpty}>
        该列表变量尚未定义字段。请先在「变量」面板中编辑变量，添加字段（如 label、value）后再配置预览数据。
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <span className={styles.toolbarCount}>{items.length} 组数据</span>
        <label className={styles.jsonPasteLabel} title="粘贴 JSON 数组覆盖当前数据">
          从 JSON 粘贴
          <textarea
            className={styles.jsonPasteInput}
            rows={1}
            placeholder='[{"label":"示例",...}]'
            onBlur={(e) => {
              if (e.target.value.trim()) {
                handleJsonPaste(e.target.value);
                e.target.value = '';
              }
            }}
          />
        </label>
      </div>
      {jsonError && <p className={styles.jsonError}>{jsonError}</p>}

      {/* 字段列标题 */}
      <div className={styles.fieldHeader}>
        {schema.map((f) => (
          <span key={f.key} className={styles.fieldHeaderCell}>{f.label || f.key}</span>
        ))}
        <span className={styles.fieldHeaderAction} />
      </div>

      {/* 数据行 */}
      {items.length === 0 ? (
        <p className={styles.emptyHint}>暂无数据，点击「添加一组」</p>
      ) : (
        <div className={styles.itemList}>
          {items.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <span className={styles.itemIndex}>{i + 1}</span>
              <div className={styles.itemFields}>
                {schema.map((field) => (
                  <input
                    key={field.key}
                    type={field.contentType === 'text' ? 'text' : 'url'}
                    className={styles.itemInput}
                    placeholder={
                      field.contentType === 'image' ? 'https://...' :
                      field.contentType === 'link'  ? 'https://...' :
                      field.label || field.key
                    }
                    value={item[field.key] ?? ''}
                    onChange={(e) => updateField(i, field.key, e.target.value)}
                  />
                ))}
              </div>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeItem(i)}
                title="删除此行"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className={styles.addBtn} onClick={addItem}>
        + 添加一组
      </button>
    </div>
  );
}

// ─── 弹窗 ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  variable: CustomVariableDefinition;
  items: Record<string, string>[];
  onSetItems: (items: Record<string, string>[]) => void;
}

export default function ArrayPreviewDataModal({ open, onClose, variable, items, onSetItems }: Props) {
  return (
    <Modal
      open={open}
      title={`配置预览数据 · ${variable.label}`}
      onClose={onClose}
      size="large"
      footer={
        <ModalFooter
          onCancel={onClose}
          onConfirm={onClose}
          confirmText="完成"
        />
      }
    >
      <div className={styles.modalBody}>
        <p className={styles.modalDesc}>
          填写多组预览数据，画布中循环区块将按照「画布预览项」设置渲染其中一组。
          发送邮件时使用实际业务数据（通过 API variables 字段传入）。
        </p>
        <ArrayPreviewEditor variable={variable} items={items} onSetItems={onSetItems} />
      </div>
    </Modal>
  );
}
