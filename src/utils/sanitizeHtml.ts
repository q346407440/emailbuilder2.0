/**
 * 最小化 HTML 消毒：移除富文本中可能被濫用的腳本與事件，降低 XSS 風險。
 * 用於 TextBlock 等來自編輯器或存儲的 HTML；不依賴 DOMPurify，僅做必要剝離。
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return html;
  let s = html;
  // 移除 <script>...</script> 及其內容
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // 移除元素上的 on* 事件屬性（如 onerror, onclick）
  s = s.replace(/\s+on\w+=["'][^"']*["']/gi, '');
  s = s.replace(/\s+on\w+=\s*[^\s>]+/gi, '');
  // 將 href 中的 javascript: 置為空，避免執行
  s = s.replace(/\bhref\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, 'href="#"');
  return s;
}
