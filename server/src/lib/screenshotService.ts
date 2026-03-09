/**
 * 基于真实 Chrome（puppeteer-core）的截图服务。
 *
 * 企业级加固：
 *  1. p-limit 并发排队：最多 SCREENSHOT_CONCURRENCY 个 Page 同时截图，超出时排队等待，
 *     避免高峰期同时开启大量 Page 耗尽内存。
 *  2. Browser 自动重启：crash 后检测到 browser.connected === false，
 *     下次调用时自动重新 launch，无需重启 Node 进程。
 *  3. Chrome 路径优先读取环境变量 CHROME_EXECUTABLE_PATH，未设置时自动检测常见路径。
 */
import puppeteer, { type Browser } from 'puppeteer-core';
import pLimit from 'p-limit';
import fs from 'fs';

const CHROME_PATHS = [
  process.env.CHROME_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean) as string[];

function findChromePath(): string {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    '找不到 Chrome 可执行文件。请设置环境变量 CHROME_EXECUTABLE_PATH 指向 Chrome/Chromium。'
  );
}

const concurrency = parseInt(process.env.SCREENSHOT_CONCURRENCY ?? '3', 10) || 3;
const limit = pLimit(concurrency);

let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: findChromePath(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      if (!browser.connected) {
        browserPromise = null;
      } else {
        return browser;
      }
    } catch {
      browserPromise = null;
    }
  }

  browserPromise = launchBrowser().catch((err) => {
    browserPromise = null;
    throw err;
  });

  return browserPromise;
}

/** 关闭单例浏览器（进程退出时调用） */
export async function closeScreenshotBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch {
      // ignore
    }
    browserPromise = null;
  }
}

/** 判断是否为浏览器连接已断开的错误 */
function isBrowserDeadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Connection closed') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Protocol error') ||
    msg.includes('browser has disconnected')
  );
}

async function _doScreenshot(html: string, width: number): Promise<Buffer> {
  const browser = await getBrowser();

  const page = await browser.newPage().catch((err) => {
    if (isBrowserDeadError(err)) browserPromise = null;
    throw err;
  });

  try {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 20000 });
    // 重置浏览器默认 body margin（8px），避免截图四边出现多余留白
    await page.addStyleTag({ content: 'body{margin:0;padding:0;}' });
    await page.evaluate(() =>
      Promise.all(
        Array.from(document.images).map(
          (img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((res) => {
                  img.onload = () => res();
                  img.onerror = () => res();
                })
        )
      )
    );

    // 以最外层 table（centering wrapper）的实际渲染尺寸为准裁切截图，
    // 避免 fullPage:true 将视口空白区域（height:800 的剩余部分）一并截入。
    const outerTable = await page.$('table');
    if (outerTable) {
      const box = await outerTable.boundingBox();
      if (box && box.height > 0) {
        const screenshot = await page.screenshot({
          type: 'png',
          clip: {
            x: 0,
            y: 0,
            width: Math.ceil(box.width),
            height: Math.ceil(box.height),
          },
        });
        return Buffer.from(screenshot);
      }
    }

    // 若 table 未找到或 boundingBox 无效，fallback 使用 fullPage
    const screenshot = await page.screenshot({ type: 'png', fullPage: true });
    return Buffer.from(screenshot);
  } catch (err) {
    if (isBrowserDeadError(err)) browserPromise = null;
    throw err;
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * 将 HTML 字符串渲染为 PNG buffer。
 * 通过 p-limit 排队，最多 SCREENSHOT_CONCURRENCY（默认 3）个并发，超出时等待。
 *
 * @param html   完整 HTML（含 <!DOCTYPE html> 头）
 * @param width  视口宽度，默认 700（留左右 padding，内容 600px）
 */
export async function screenshotHtml(html: string, width = 700): Promise<Buffer> {
  return limit(() => _doScreenshot(html, width));
}
