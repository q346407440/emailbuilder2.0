/**
 * 最小化 HTML 消毒：移除富文本中可能被滥用的脚本与事件，降低 XSS 风险。
 * 用于 TextBlock 等来自编辑器或存储的 HTML；不依赖 DOMPurify，仅做必要剥离。
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return html;
  let s = html;
  // 移除 <script>...</script> 及其内容
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // 移除元素上的 on* 事件属性（如 onerror, onclick）
  s = s.replace(/\s+on\w+=["'][^"']*["']/gi, '');
  s = s.replace(/\s+on\w+=\s*[^\s>]+/gi, '');
  // 将 href 中的 javascript: 置为空，避免执行
  s = s.replace(/\bhref\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, 'href="#"');
  return s;
}
