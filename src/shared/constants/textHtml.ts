/** 将文案转为富文本 HTML（支持 **粗体**、*斜体*、换行），可选内联样式。用于默认模板等静态 text 内容。 */
export function textHtml(
  content: string,
  style?: { fontSize?: string; color?: string; fontWeight?: string; lineHeight?: string }
): string {
  const styleStr = style
    ? ` style="${[
        style.fontSize && `font-size:${style.fontSize}`,
        style.color && `color:${style.color}`,
        style.fontWeight && `font-weight:${style.fontWeight}`,
        style.lineHeight && `line-height:${style.lineHeight}`,
      ]
        .filter(Boolean)
        .join(';')}"`
    : '';
  const html = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
  return `<p${styleStr}>${html || ' '}</p>`;
}
