import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import type { SchemaField } from '@shared/utils/parseJsonSchema';
import { getArrayItemFields } from '@shared/utils/parseJsonSchema';
import styles from './FieldMappingPanel.module.css';

interface Props {
  /** 模板声明的自定义变量列表 */
  templateVariables: CustomVariableDefinition[];
  /** 从外部 JSON 解析出的字段列表 */
  sourceFields: SchemaField[];
  /** 当前映射关系：模板变量 key → 外部字段路径 */
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
}

const CONTENT_TYPE_BADGE: Record<string, string> = {
  text: '文本',
  number: '数字',
  image: '图片',
  link: '链接',
  array: '数组',
};

/** 根据变量类型过滤可选字段 */
function getCompatibleFields(fields: SchemaField[], contentType: string): SchemaField[] {
  if (contentType === 'array') {
    return fields.filter((f) => f.type === 'array');
  }
  if (contentType === 'image') {
    return fields.filter((f) => f.type === 'string' && !f.isArrayItem);
  }
  if (contentType === 'link') {
    return fields.filter((f) => f.type === 'string' && !f.isArrayItem);
  }
  // text / number：标量字段
  return fields.filter((f) => (f.type === 'string' || f.type === 'number') && !f.isArrayItem);
}

export default function FieldMappingPanel({ templateVariables, sourceFields, mapping, onChange }: Props) {
  if (templateVariables.length === 0) {
    return (
      <div className={styles.empty}>
        <p>此模板没有自定义变量，无需配置映射。</p>
      </div>
    );
  }

  const handleChange = (varKey: string, fieldPath: string) => {
    onChange({ ...mapping, [varKey]: fieldPath });
  };

  const handleItemFieldChange = (varKey: string, itemFieldKey: string, fieldPath: string) => {
    const mappingKey = `${varKey}.${itemFieldKey}`;
    onChange({ ...mapping, [mappingKey]: fieldPath });
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerLeft}>模板变量</span>
        <span className={styles.headerRight}>外部数据字段</span>
      </div>

      {templateVariables.map((v) => {
        const compatibleFields = getCompatibleFields(sourceFields, v.contentType);
        const currentValue = mapping[v.key] ?? '';

        return (
          <div key={v.key} className={styles.varBlock}>
            {/* 变量行 */}
            <div className={styles.varRow}>
              <div className={styles.varInfo}>
                <span className={styles.varLabel}>{v.label}</span>
                <span className={styles.varKey}>{v.key}</span>
                <span className={styles.badge}>{CONTENT_TYPE_BADGE[v.contentType] ?? v.contentType}</span>
              </div>
              <div className={styles.fieldSelect}>
                <select
                  className={styles.select}
                  value={currentValue}
                  onChange={(e) => handleChange(v.key, e.target.value)}
                >
                  <option value="">— 不映射 —</option>
                  {compatibleFields.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.path}
                      {f.exampleValue ? ` (${f.exampleValue})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 数组类型：展开子字段映射 */}
            {v.contentType === 'array' && currentValue && v.itemSchema && v.itemSchema.length > 0 && (
              <div className={styles.itemFields}>
                <div className={styles.itemFieldsTitle}>数组项字段映射</div>
                {v.itemSchema.map((itemField) => {
                  const itemMappingKey = `${v.key}.${itemField.key}`;
                  const currentItemValue = mapping[itemMappingKey] ?? '';
                  const arrayItemFields = getArrayItemFields(sourceFields, currentValue);
                  const compatibleItemFields = arrayItemFields.filter((f) => {
                    if (itemField.contentType === 'image') return f.type === 'string';
                    if (itemField.contentType === 'link') return f.type === 'string';
                    return f.type === 'string' || f.type === 'number';
                  });

                  return (
                    <div key={itemField.key} className={styles.itemFieldRow}>
                      <div className={styles.itemFieldInfo}>
                        <span className={styles.itemFieldLabel}>{itemField.label}</span>
                        <span className={styles.varKey}>item.{itemField.key}</span>
                        <span className={styles.badge}>{CONTENT_TYPE_BADGE[itemField.contentType]}</span>
                      </div>
                      <div className={styles.fieldSelect}>
                        <select
                          className={styles.select}
                          value={currentItemValue}
                          onChange={(e) => handleItemFieldChange(v.key, itemField.key, e.target.value)}
                        >
                          <option value="">— 不映射 —</option>
                          {compatibleItemFields.map((f) => {
                            const subPath = f.path.replace(`${currentValue}[].`, '');
                            return (
                              <option key={f.path} value={f.path}>
                                {subPath}
                                {f.exampleValue ? ` (${f.exampleValue})` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
