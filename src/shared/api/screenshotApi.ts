/**
 * 基于后端 Puppeteer（真实 Chrome）的截图 API。
 * 接受 email-safe HTML 字符串，返回 PNG data URL。
 * 结果与浏览器截图一致，替代 html-to-image（canvas 方案）。
 */
import { getAuthToken } from './authToken';

function getBaseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  if (import.meta.env.DEV) return 'http://localhost:3001';
  return '';
}

/**
 * 将 HTML 发送到后端，用真实 Chrome 渲染并返回 PNG data URL。
 * @param html  完整 HTML 字符串（由 prepareEmailHtml 生成）
 * @param width 视口宽度（与画布内容宽度一致时截图无左右留白，默认 600）
 * @returns PNG data URL，失败时返回 null
 */
export async function screenshotEmailHtml(
  html: string,
  width = 600
): Promise<string | null> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const resp = await fetch(`${getBaseUrl()}/api/screenshot`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ html, width }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error('[screenshotApi] server error:', err);
      return null;
    }
    const blob = await resp.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('[screenshotApi] fetch error:', err);
    return null;
  }
}
