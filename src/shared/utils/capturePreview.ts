/**
 * 统一截图工具：真实 DOM 元素 → prepareEmailHtml → 后端 Puppeteer → PNG data URL。
 *
 * 宽度规则：
 * - 仅「整体赋值预览图片」「保存模板」使用画布宽度（由调用方传入 width）。
 * - 组件相关截图（保存复合组件、携带到 AI、Agent getComponentPreview、批量组件缩略图）
 *   不传 width，以 el.scrollWidth 为准，即组件自身尺寸。
 */
import { prepareEmailHtml } from './prepareEmailHtml';
import { screenshotEmailHtml } from '@shared/api/screenshotApi';

export interface CapturePreviewOptions {
  /** 视口宽度（px）；仅整体预览/保存模板时传入（画布宽度）；组件截图不传，用 el 自身尺寸 */
  width?: number;
  /** 邮件外层背景色，预设 '#FFFFFF' */
  backgroundColor?: string;
  /** 截图前呼叫以清除选中态（清除后等一帧让 DOM 更新） */
  clearSelectionFn?: () => void;
  /** 最大重试次数，预设 3 */
  retries?: number;
}

/**
 * 对真实 DOM 元素截图，返回 PNG data URL。
 *
 * @param el   目标 HTMLElement（画布节点或离屏预览容器中的节点）
 * @param opts 可选配置
 * @returns    PNG data URL（`data:image/png;base64,...`），失败时返回 null
 */
export async function captureElementPreview(
  el: HTMLElement,
  opts?: CapturePreviewOptions
): Promise<string | null> {
  const {
    width,
    backgroundColor = '#FFFFFF',
    clearSelectionFn,
    retries = 3,
  } = opts ?? {};

  if (clearSelectionFn) {
    clearSelectionFn();
    await new Promise((r) => setTimeout(r, 120));
  }

  const contentWidth =
    width ??
    Math.max(320, Math.round(el.scrollWidth) || 600);
  const html = prepareEmailHtml(el, { outerBackgroundColor: backgroundColor, contentWidthPx: contentWidth });

  for (let attempt = 1; attempt <= retries; attempt++) {
    const dataUrl = await screenshotEmailHtml(html, contentWidth);
    if (dataUrl) return dataUrl;
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 120 * attempt));
    }
  }

  return null;
}
