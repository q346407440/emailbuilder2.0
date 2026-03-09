import { memo, useMemo } from 'react';
import type { EmailComponent, TextProps } from '@shared/types/email';
import { isTextProps } from '@shared/types/email';
import { sanitizeHtml } from '@shared/utils/sanitizeHtml';
import { VARIABLE_SCHEMA_MAP } from '@shared/constants/variableSchema';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import ComponentWrapper from '../components/ComponentWrapper/ComponentWrapper';
import styles from './TextBlock.module.css';

function TextBlock({ component, selected, onSelect }: { component: EmailComponent; selected?: boolean; onSelect?: () => void }) {
  const customVariables = useEmailStore((s) => s.customVariables);

  const labelMap = useMemo(() => {
    const map = new Map<string, string>(
      Array.from(VARIABLE_SCHEMA_MAP.entries()).map(([k, v]) => [k, v.label])
    );
    for (const v of customVariables) {
      map.set(v.key, v.label);
    }
    return map;
  }, [customVariables]);

  if (component.type !== 'text' || !isTextProps(component.props)) return null;
  const props = component.props as TextProps;

  const textAlign = component.wrapperStyle.contentAlign.horizontal;
  const baseStyle: React.CSSProperties = {
    fontFamily: props.fontMode === 'custom' ? props.fontFamily : 'inherit',
    fontSize: props.fontSize || undefined,
    /* 未設置時由 CSS 提供 line-height: 1 預設（見 TextBlock.module.css .text）；
       此處若有用戶明確值，inline style 優先級高於 class rule，自動覆蓋 CSS 預設。 */
    lineHeight: props.lineHeight || undefined,
    textAlign,
    width: 'fit-content',
    maxWidth: '100%',
    margin: 0,
    overflowWrap: 'break-word',
  };

  const content = props.content?.trim() || '';
  // 交替匹配：先整體捕獲 HTML tag（含 attribute 值，原樣保留），
  // 再捕獲文字節點中的 {{...}}（替換為 chip）。
  // 這樣 href="mailto:{{var}}" 裡的變量不會被處理，避免破壞 HTML 屬性結構。
  const chippedHtml = (content || '<p>请输入文本内容</p>').replace(
    /(<[^>]*>)|\{\{([\w.]+)\}\}/g,
    (_match, tag: string | undefined, key: string | undefined) => {
      if (tag !== undefined) return tag; // HTML tag 原樣保留
      const label = labelMap.get(key!) ?? (key!.startsWith('item.') ? key!.slice(5) : key!);
      return `<span class="variable-chip"><span class="variable-chip-label">${label}</span></span>`;
    }
  );
  const safeHtml = sanitizeHtml(chippedHtml);

  return (
    <ComponentWrapper
      wrapperStyle={component.wrapperStyle}
      onClick={onSelect}
      selected={selected}
      componentId={component.id}
    >
      <div
        className={styles.text}
        style={baseStyle}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </ComponentWrapper>
  );
}

export default memo(TextBlock, (prev, next) => {
  return prev.component === next.component && prev.selected === next.selected;
});
