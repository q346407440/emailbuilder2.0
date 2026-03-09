/**
 * 将编辑器画布 DOM 转换为 email-safe HTML。
 * 用于「发送邮件」等场景，解决：
 *  1. 移除编辑器专属元素（拖放区、插入区、空插槽提示）
 *  2. 移除编辑器专属属性（data-selected, data-component-id, role, tabindex 等）
 *  3. 图片布局模式（叠加层）：position:absolute 不被 Gmail 支持 → 改用 background-image
 *  4. inline SVG → 转 <img src="data:image/svg+xml;...">（Gmail 不支持 inline SVG）
 *  5. 图片加 HTML width/height 属性
 *  6. 替换 CSS 变量（var(--xxx)）、fit-content 等不相容写法
 *  7. flex/grid 布局转 HTML table（邮件客户端不支持 flex/grid）
 *  8. 强制垂直堆叠 + 剩余 flex 转 block
 *
 * Gmail 不显示任何 SVG（含 data:image/svg+xml 与 .svg 链接），需使用 prepareEmailHtmlAsync
 * 在导出时将 SVG 转为 PNG，发送邮件时请用异步版本。
 */

export function prepareEmailHtml(
  canvasEl: HTMLElement,
  options?: { outerBackgroundColor?: string; contentWidthPx?: number; sampleData?: Record<string, string> }
): string {
  const clone = canvasEl.cloneNode(true) as HTMLElement;
  if (options?.sampleData) applyVisibilityConditions(clone, options.sampleData);
  runSyncSteps(clone);
  const contentWidth = options?.contentWidthPx
    ? `${options.contentWidthPx}px`
    : clone.style.width || '600px';
  const outerBackgroundColor = options?.outerBackgroundColor || '#E8ECF1';
  const canvasBackgroundColor = clone.style.backgroundColor || '#FFFFFF';
  return wrapInCenteringWrapper(clone.outerHTML, contentWidth, outerBackgroundColor, canvasBackgroundColor);
}

/** 发送邮件时使用：与 prepareEmailHtml 相同，但会将所有 SVG 图片转为 PNG，确保 Gmail 可显示。 */
export async function prepareEmailHtmlAsync(
  canvasEl: HTMLElement,
  options?: { outerBackgroundColor?: string; sampleData?: Record<string, string> }
): Promise<string> {
  const clone = canvasEl.cloneNode(true) as HTMLElement;
  if (options?.sampleData) applyVisibilityConditions(clone, options.sampleData);
  runSyncSteps(clone);
  await convertSvgImagesToPng(clone);
  const contentWidth = clone.style.width || '600px';
  const outerBackgroundColor = options?.outerBackgroundColor || '#E8ECF1';
  const canvasBackgroundColor = clone.style.backgroundColor || '#FFFFFF';
  return wrapInCenteringWrapper(clone.outerHTML, contentWidth, outerBackgroundColor, canvasBackgroundColor);
}

/**
 * 根据 sampleData 评估每个组件的 visibilityCondition，将不满足条件的 li 从 DOM 中移除。
 * 必须在 runSyncSteps 之前调用，此时 data-visibility-condition 属性还在。
 */
function applyVisibilityConditions(
  clone: HTMLElement,
  sampleData: Record<string, string>,
): void {
  clone.querySelectorAll<HTMLElement>('[data-visibility-condition]').forEach((el) => {
    const raw = el.getAttribute('data-visibility-condition');
    if (!raw) return;
    try {
      const condition = JSON.parse(raw) as { variableKey: string; operator: string; value?: string };
      if (!condition.variableKey) return;
      const val = sampleData[condition.variableKey] ?? '';
      let visible = true;
      switch (condition.operator) {
        case 'eq':         visible = val === (condition.value ?? ''); break;
        case 'neq':        visible = val !== (condition.value ?? ''); break;
        case 'isEmpty':    visible = val === ''; break;
        case 'isNotEmpty': visible = val !== ''; break;
      }
      if (!visible) el.remove();
    } catch {
      /* 解析失败时跳过，保留该组件 */
    }
  });
}

function runSyncSteps(clone: HTMLElement): void {
  removeEditorElements(clone);
  removeEditorAttributes(clone);
  transformImageLayoutMode(clone);
  convertInlineSvgs(clone);
  fixImages(clone);
  fixCssCompatibility(clone);
  convertFlexGridToTables(clone);
  ensureVerticalStack(clone);
  cleanEmptyClasses(clone);
}

/** 用双层 table 嵌套将整封邮件在客户端视窗中居中（业界標準做法） */
function wrapInCenteringWrapper(
  innerHtml: string,
  contentWidth: string,
  outerBackgroundColor: string,
  canvasBackgroundColor: string
): string {
  const widthNum = parseInt(contentWidth) || 600;
  return (
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" ' +
    `style="margin:0;padding:0;width:100%;min-width:100%;background-color:${outerBackgroundColor};">` +
    '<tr>' +
    '<td align="center" valign="top" style="padding:0;">' +
    `<table width="${widthNum}" cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" ` +
    `style="width:${widthNum}px;max-width:${widthNum}px;margin:0 auto;table-layout:fixed;">` +
    '<tr>' +
    `<td align="left" valign="top" style="padding:0;background-color:${canvasBackgroundColor};overflow:hidden;">` +
    innerHtml +
    '</td>' +
    '</tr>' +
    '</table>' +
    '</td>' +
    '</tr>' +
    '</table>'
  );
}

/* ====== SVG → PNG（Gmail 不支持 SVG） ====== */
function isSvgImageSrc(src: string): boolean {
  if (!src || !src.trim()) return false;
  if (src.startsWith('data:image/svg+xml')) return true;
  try {
    const pathname = src.startsWith('http') ? new URL(src).pathname : src;
    return pathname.toLowerCase().endsWith('.svg');
  } catch {
    return src.toLowerCase().endsWith('.svg');
  }
}

function resolveSvgLoadUrl(src: string): string {
  if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) return src;
  if (typeof window === 'undefined') return src;
  const path = src.startsWith('./') ? src.slice(1) : src;
  return path.startsWith('/') ? `${window.location.origin}${path}` : `${window.location.origin}/${path}`;
}

/** 高清倍率：以 3x 渲染确保在 Retina 屏与邮件客户端中清晰 */
const SVG_PNG_SCALE = 3;

function svgSrcToPngDataUrl(
  svgSrc: string,
  widthAttr: string | null,
  heightAttr: string | null
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const displayW = widthAttr ? parseInt(widthAttr, 10) : img.naturalWidth;
        const displayH = heightAttr ? parseInt(heightAttr, 10) : img.naturalHeight;
        const w = displayW || img.naturalWidth || 32;
        const h = displayH || img.naturalHeight || 32;
        const canvas = document.createElement('canvas');
        canvas.width = w * SVG_PNG_SCALE;
        canvas.height = h * SVG_PNG_SCALE;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = svgSrc;
  });
}

async function convertSvgImagesToPng(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
  const svgImgs = imgs.filter((img) => isSvgImageSrc(img.getAttribute('src') || ''));
  await Promise.all(
    svgImgs.map(async (img) => {
      const src = img.getAttribute('src') || '';
      const loadUrl = resolveSvgLoadUrl(src);
      const wAttr = img.getAttribute('width');
      const hAttr = img.getAttribute('height');
      const pngDataUrl = await svgSrcToPngDataUrl(loadUrl, wAttr, hAttr);
      if (pngDataUrl) {
        img.setAttribute('src', pngDataUrl);
        // PNG 实际像素为 displaySize × SVG_PNG_SCALE，
        // 须用 HTML width/height 锁定原始显示尺寸，避免邮件客户端按实际像素放大
        if (wAttr) img.setAttribute('width', wAttr);
        if (hAttr) img.setAttribute('height', hAttr);
      }
    })
  );
}

/* ====== 1. 移除编辑器专属元素 ====== */
function removeEditorElements(root: HTMLElement) {
  // DropZone（画布拖放区）
  root.querySelectorAll('[class*="dropZone"], [class*="DropZone"]').forEach((el) => el.remove());
  // InsertZone（布局插入区）
  root.querySelectorAll('[class*="insertZone"], [class*="InsertZone"]').forEach((el) => el.remove());
  // 空插槽提示（emptyLayout, emptySlot, slotPlaceholder, slotIcon）
  root.querySelectorAll('[class*="emptyLayout"], [class*="emptySlot"], [class*="EmptySlot"]').forEach((el) => el.remove());
  // 空状态覆盖层提示（overlayLayerEmpty 整个 div 若为空且有占位圖標則移除占位圖標）
  root.querySelectorAll('[class*="overlayLayerEmpty"]').forEach((el) => {
    // 只移除里面的占位 svg，保留 div 本身
    el.querySelectorAll('svg').forEach((svg) => svg.remove());
  });
}

/* ====== 2. 移除编辑器专属属性 ====== */
function removeEditorAttributes(root: HTMLElement) {
  const attrs = ['data-selected', 'data-component-id', 'data-drag-hover', 'data-over', 'data-dragging', 'data-visibility-condition', 'role', 'tabindex', 'aria-label', 'aria-pressed', 'aria-expanded'];
  root.querySelectorAll('*').forEach((el) => {
    attrs.forEach((a) => el.removeAttribute(a));
  });
  // root 本身也清理
  attrs.forEach((a) => root.removeAttribute(a));
}

/* ====== 3. 图片布局模式 → background-image ====== */
/**
 * 与编辑器 ImageBlock 语义一致：容器高度由图片决定，overlay 不撑高。
 * 若未来 layoutPadding 扩展为四边分离（separate），需在此同步将 overlay 的 padding 写入对应的 paddingTop/Right/Bottom/Left。
 */
function transformImageLayoutMode(root: HTMLElement) {
  root.querySelectorAll('[class*="layoutContainer"]').forEach((container) => {
    const el = container as HTMLElement;
    const imageLayer = el.querySelector('[class*="imageLayer"]') as HTMLElement | null;
    const overlayLayer = el.querySelector('[class*="overlayLayer"]') as HTMLElement | null;
    if (!imageLayer || !overlayLayer) return;

    const img = imageLayer.querySelector('img') as HTMLImageElement | null;
    if (!img) return;

    const imgSrc = img.getAttribute('src') || '';
    const hasOverlayChildren = overlayLayer.querySelector(':scope > div') !== null;

    // 读取 <img> 的固定尺寸与 objectFit（在移除图片前）
    const imgW = img.style.width || '';
    const imgH = img.style.height || '';
    const imgObjectFit = img.style.objectFit || '';
    const isFixedSizeImage = imgW.endsWith('px') && imgH.endsWith('px') &&
      imgW !== '100%' && imgH !== '100%' &&
      parseInt(imgW) > 0 && parseInt(imgH) > 0;

    // 根据实际图片比例算出合适的高度（仅非固定尺寸时使用）
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const containerWidth = parseInt(el.style.width || '600') || 600;
    let computedHeight = 300;
    if (naturalW && naturalH) {
      computedHeight = Math.round((containerWidth / naturalW) * naturalH);
    }

    el.style.backgroundImage = `url(${imgSrc})`;
    el.style.backgroundPosition = 'center';
    el.style.backgroundRepeat = 'no-repeat';

    if (isFixedSizeImage) {
      // 固定尺寸图片：保留原始宽高，匹配编辑器中 object-fit: fill 的拉伸行为
      el.style.backgroundSize = imgObjectFit === 'fill' ? '100% 100%' : 'cover';
      el.style.width = imgW;
      el.style.height = imgH;
      el.style.maxWidth = '100%';
    } else {
      el.style.backgroundSize = 'cover';
      el.style.width = '100%';
      // 高度始终由图片比例决定（minHeight），保底避免容器塌陷。
      // 不再依賴叠加层高度（旧的 isFillLayoutMode 双行为已移除）。
      el.style.minHeight = `${Math.max(computedHeight, 200)}px`;
    }
    el.style.boxSizing = 'border-box';
    el.style.position = 'relative';

    imageLayer.remove();

    // 覆盖层：提前将 flex 对齐转为邮件安全的写法
    const ai = overlayLayer.style.alignItems;
    const jc = overlayLayer.style.justifyContent;

    overlayLayer.style.position = 'relative';
    overlayLayer.style.removeProperty('top');
    overlayLayer.style.removeProperty('right');
    overlayLayer.style.removeProperty('bottom');
    overlayLayer.style.removeProperty('left');
    overlayLayer.style.removeProperty('inset');
    overlayLayer.style.zIndex = '';
    overlayLayer.style.width = '100%';
    overlayLayer.style.boxSizing = 'border-box';

    // 提前移除 flex，手动转为 block + text-align（防止被全局循环覆盖）
    overlayLayer.style.display = 'block';
    overlayLayer.style.removeProperty('flex-wrap');
    overlayLayer.style.removeProperty('align-items');
    overlayLayer.style.removeProperty('justify-content');
    overlayLayer.style.removeProperty('gap');
    overlayLayer.setAttribute('data-email-overlay-root', '1');

    // 水平对齐
    if (ai === 'center') {
      overlayLayer.style.textAlign = 'center';
    } else if (ai === 'flex-end' || ai === 'end') {
      overlayLayer.style.textAlign = 'right';
    } else {
      overlayLayer.style.textAlign = 'left';
    }

    // 垂直对齐：容器高度由图片比例决定（minHeight），覆盖层相对定位後，仅在空状态时补 padding 近似居中
    if (!hasOverlayChildren) {
      if (jc === 'center') {
        if (!overlayLayer.style.paddingTop) overlayLayer.style.paddingTop = '20px';
        if (!overlayLayer.style.paddingBottom) overlayLayer.style.paddingBottom = '20px';
      } else if (jc === 'flex-end' || jc === 'end') {
        overlayLayer.style.paddingTop = '40px';
      }
    }

    // 标记为已处理，防止全局循环再次修改
    overlayLayer.setAttribute('data-email-processed', '1');

    // 覆盖层子元素的 div wrapper：
    // 编辑器中 overlay 为 flex-direction:column，子 div 受 align-items 控制而收缩到内容宽度。
    // 邮件中 flex 不可用，改用 inline-block 保持收缩，由 overlay 的 text-align 控制位置。
    overlayLayer.querySelectorAll(':scope > div').forEach((childDiv) => {
      const htmlChild = childDiv as HTMLElement;
      htmlChild.setAttribute('data-email-processed', '1');
      htmlChild.style.display = 'inline-block';
      htmlChild.style.verticalAlign = 'top';
      htmlChild.style.removeProperty('width');
      if (ai === 'center') {
        htmlChild.style.textAlign = 'center';
      } else if (ai === 'flex-end' || ai === 'end') {
        htmlChild.style.textAlign = 'right';
      }
    });
  });
}

/* ====== 4. inline SVG → <img data:image/svg+xml> ====== */
function convertInlineSvgs(root: HTMLElement) {
  root.querySelectorAll('svg').forEach((svg) => {
    const parent = svg.parentElement;
    if (!parent) return;

    // 序列化 SVG
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svg);

    // 确保有 xmlns
    if (!svgString.includes('xmlns')) {
      svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // 解决 currentColor：继承父元素的 color
    const parentColor = parent.style.color || '#000000';
    svgString = svgString.replace(/currentColor/g, parentColor);

    // 转成 data URL
    const encoded = btoa(unescape(encodeURIComponent(svgString)));
    const dataUrl = `data:image/svg+xml;base64,${encoded}`;

    // 取得尺寸
    const width = svg.getAttribute('width') || '32';
    const height = svg.getAttribute('height') || '32';

    // 建立 <img> 取代 <svg>
    const img = document.createElement('img');
    img.setAttribute('src', dataUrl);
    img.setAttribute('width', width);
    img.setAttribute('height', height);
    img.setAttribute('alt', '');
    img.style.display = 'block';

    // 如果父元素是 span（iconWrap 的 customInlineSvg），保留父元素的尺寸
    if (parent.tagName === 'SPAN') {
      const parentHeight = parent.style.height;
      const parentWidth = parent.style.width;
      if (parentHeight) {
        img.style.height = parentHeight;
        img.style.width = 'auto';
      } else if (parentWidth) {
        img.style.width = parentWidth;
        img.style.height = 'auto';
      }
    }

    svg.replaceWith(img);
  });
}

/* ====== 5. 修正图片 ====== */
function fixImages(root: HTMLElement) {
  root.querySelectorAll('img').forEach((img) => {
    // 加 HTML width/height 属性（email client 依賴這些）
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (naturalW && naturalH && !img.getAttribute('width')) {
      // 尊重 CSS 宽度设定；若 CSS 是 100%，用原图宽度
      const cssW = img.style.width;
      if (cssW === '100%') {
        // 不设 HTML width（让 CSS 100% 生效）
      } else if (cssW && cssW !== 'auto') {
        img.setAttribute('width', parseInt(cssW).toString());
      } else {
        img.setAttribute('width', naturalW.toString());
      }
    }
    if (naturalW && naturalH && !img.getAttribute('height')) {
      const cssH = img.style.height;
      if (cssH === '100%' || cssH === 'auto') {
        // 不设
      } else if (cssH && cssH !== 'auto') {
        img.setAttribute('height', parseInt(cssH).toString());
      }
    }

    // 确保有 alt
    if (!img.getAttribute('alt')) {
      img.setAttribute('alt', '');
    }

    // 确保 display: block
    if (!img.style.display) {
      img.style.display = 'block';
    }
  });
}

/* ====== 6. CSS 相容性修正 ====== */
function fixCssCompatibility(root: HTMLElement) {
  root.querySelectorAll('*').forEach((el) => {
    const htmlEl = el as HTMLElement;
    const style = htmlEl.style;
    if (!style) return;

    // 替换 fit-content：改为 auto + inline-block（等价收缩宽度，兼容 Gmail）
    if (style.width === 'fit-content') {
      style.width = 'auto';
      // 只在元素原本未指定 display 或为 block 时改为 inline-block
      // 以保留「收缩宽度」语义，避免被拉成整行导致移动端左偏。
      if (!style.display || style.display === 'block') {
        style.display = 'inline-block';
      }
    }

    // 替换 inset → top/right/bottom/left（Gmail 不支持 shorthand inset）
    // 注意：Chrome 在 computedStyle 会展开 inset，但 DOM style 可能还是 inset
    // cloneNode 後 style 应已展开为 top/right/bottom/left

    // 移除 CSS 变量引用（Gmail 不支持）
    // 主要是 --canvas-bg
    const styleText = htmlEl.getAttribute('style') || '';
    if (styleText.includes('var(')) {
      const replaced = styleText.replace(/var\(--[^)]+\)/g, (match) => {
        // 常見映射
        if (match.includes('--canvas-bg')) return '#FFFFFF';
        if (match.includes('--accent')) return '#1976D2';
        if (match.includes('--border')) return '#E0E5EB';
        if (match.includes('--text-primary')) return '#1A1A1A';
        if (match.includes('--text-secondary')) return '#5C6B7A';
        if (match.includes('--text-muted')) return '#8A949C';
        if (match.includes('--bg-base')) return '#F5F7FA';
        if (match.includes('--bg-panel')) return '#FFFFFF';
        if (match.includes('--success')) return '#16a34a';
        return '#000000';
      });
      htmlEl.setAttribute('style', replaced);
    }

    // 移除 --canvas-bg 自定义属性设定
    if (styleText.includes('--canvas-bg')) {
      const cleaned = styleText.replace(/--canvas-bg:\s*[^;]+;?/g, '');
      htmlEl.setAttribute('style', cleaned);
    }
  });

  // 处理根元素
  const rootStyle = root.getAttribute('style') || '';
  if (rootStyle.includes('--canvas-bg')) {
    const bgMatch = rootStyle.match(/--canvas-bg:\s*([^;]+)/);
    const bgColor = bgMatch ? bgMatch[1].trim() : '#FFFFFF';
    // 先移除 CSS 变量，再回填真正背景色，避免 setAttribute 覆盖掉背景色
    root.style.removeProperty('--canvas-bg');
    root.style.backgroundColor = bgColor;
  }
}

/* ====== 7. 将 flex/grid 布局转为 HTML table（邮件客户端不支持 flex/grid） ====== */
function convertFlexGridToTables(root: HTMLElement) {
  // 7a. 水平 flex 布局（Layout horizontal）→ table
  // 識別：display:flex + flex-direction:row + 无 flex 属性（排除 cellWrapper，cellWrapper 有 flex:1 1 0%）
  const flexRowContainers = Array.from(root.querySelectorAll('*'))
    .filter((el) => {
      const s = (el as HTMLElement).style;
      return s.display === 'flex' && s.flexDirection === 'row' && !s.flex;
    })
    .reverse() as HTMLElement[];

  flexRowContainers.forEach(flexRowToTable);

  // 7b. CSS Grid 布局（GridBlock）→ table
  const gridContainers = Array.from(root.querySelectorAll('*'))
    .filter((el) => (el as HTMLElement).style.display === 'grid')
    .reverse() as HTMLElement[];

  gridContainers.forEach(gridToTable);
}

/** 将水平 flex 容器转为 <table><tr><td>…</td>…</tr></table> */
function flexRowToTable(container: HTMLElement) {
  const gap = parseInt(container.style.gap || '0') || 0;
  const cellWrappers = Array.from(container.children).filter(
    (el) => el instanceof HTMLElement
  ) as HTMLElement[];
  if (cellWrappers.length === 0) return;

  // 如果原始容器是 auto 宽（fit-content 已被转成 auto），table 不應撑滿 100%
  const isAutoWidth = container.style.width === 'auto' || !container.style.width || container.style.width === '';
  const table = isAutoWidth ? createAutoWidthTable() : createEmailTable();
  if (container.style.minHeight) table.style.minHeight = container.style.minHeight;
  copyBoxVisualStyles(container, table);

  const tr = document.createElement('tr');
  const colWidth = isAutoWidth ? undefined : `${Math.round(100 / cellWrappers.length)}%`;

  cellWrappers.forEach((cellWrapper, i) => {
    const td = document.createElement('td');
    if (colWidth) {
      td.setAttribute('width', colWidth);
      td.style.width = colWidth;
    }
    td.style.boxSizing = 'border-box';
    td.style.verticalAlign = 'top';

    // gap → 左右 padding
    if (gap > 0 && cellWrappers.length > 1) {
      const half = Math.round(gap / 2);
      if (i > 0) td.style.paddingLeft = `${half}px`;
      if (i < cellWrappers.length - 1) td.style.paddingRight = `${half}px`;
    }

    // 找 cell div（flex-direction:column 的那一层），提取对齐信息
    const cellDiv = findCellDiv(cellWrapper);
    if (cellDiv) {
      mapFlexAlignToTd(cellDiv, td);
      while (cellDiv.firstChild) td.appendChild(cellDiv.firstChild);
    } else {
      while (cellWrapper.firstChild) td.appendChild(cellWrapper.firstChild);
    }

    tr.appendChild(td);
  });

  table.appendChild(tr);
  container.replaceWith(table);
}

/** 将 CSS Grid 容器转为 <table>（按 columnsPerRow 分行） */
function gridToTable(container: HTMLElement) {
  const gap = parseInt(container.style.gap || '0') || 0;
  const gtc = container.style.gridTemplateColumns || '';

  let colCount = 1;
  const repeatMatch = gtc.match(/repeat\((\d+)/);
  if (repeatMatch) {
    colCount = parseInt(repeatMatch[1]) || 1;
  } else {
    colCount = gtc.split(/\s+/).filter(Boolean).length || 1;
  }

  const children = Array.from(container.children).filter(
    (el) => el instanceof HTMLElement
  ) as HTMLElement[];
  if (children.length === 0) return;

  const table = createEmailTable();
  copyBoxVisualStyles(container, table);

  const colWidth = `${Math.round(100 / colCount)}%`;
  const rowCount = Math.ceil(children.length / colCount);

  for (let row = 0; row < rowCount; row++) {
    const tr = document.createElement('tr');
    for (let col = 0; col < colCount; col++) {
      const idx = row * colCount + col;
      const td = document.createElement('td');
      td.setAttribute('width', colWidth);
      td.style.width = colWidth;
      td.style.boxSizing = 'border-box';
      td.style.verticalAlign = 'top';

      if (gap > 0) {
        const half = Math.round(gap / 2);
        if (col > 0) td.style.paddingLeft = `${half}px`;
        if (col < colCount - 1) td.style.paddingRight = `${half}px`;
        if (row < rowCount - 1) td.style.paddingBottom = `${gap}px`;
      }

      if (idx < children.length) {
        const child = children[idx];
        while (child.firstChild) td.appendChild(child.firstChild);
      }

      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  container.replaceWith(table);
}

/** 建立邮件安全的 table 骨架（width: 100%，撑滿父容器） */
function createEmailTable(): HTMLTableElement {
  const table = document.createElement('table');
  table.setAttribute('width', '100%');
  table.setAttribute('cellpadding', '0');
  table.setAttribute('cellspacing', '0');
  table.setAttribute('border', '0');
  table.setAttribute('role', 'presentation');
  table.style.borderCollapse = 'collapse';
  table.style.tableLayout = 'fixed';
  table.style.width = '100%';
  table.style.boxSizing = 'border-box';
  return table;
}

/** 建立自适应宽度的 table（width: auto，可被父级居中） */
function createAutoWidthTable(): HTMLTableElement {
  const table = document.createElement('table');
  table.setAttribute('align', 'center');
  table.setAttribute('cellpadding', '0');
  table.setAttribute('cellspacing', '0');
  table.setAttribute('border', '0');
  table.setAttribute('role', 'presentation');
  table.style.borderCollapse = 'collapse';
  table.style.boxSizing = 'border-box';
  table.style.marginLeft = 'auto';
  table.style.marginRight = 'auto';
  return table;
}

/** 从 flex 容器复制视觉样式到 table */
function copyBoxVisualStyles(from: HTMLElement, to: HTMLElement) {
  if (from.style.backgroundColor) to.style.backgroundColor = from.style.backgroundColor;
  if (from.style.borderRadius) to.style.borderRadius = from.style.borderRadius;
  if (from.style.border) to.style.border = from.style.border;
  if (from.style.backgroundImage) to.style.backgroundImage = from.style.backgroundImage;
  if (from.style.backgroundSize) to.style.backgroundSize = from.style.backgroundSize;
  if (from.style.backgroundPosition) to.style.backgroundPosition = from.style.backgroundPosition;
  if (from.style.backgroundRepeat) to.style.backgroundRepeat = from.style.backgroundRepeat;
}

/** 在 cellWrapper 中找到 cell div（flex-direction: column） */
function findCellDiv(cellWrapper: HTMLElement): HTMLElement | null {
  for (const ch of Array.from(cellWrapper.children)) {
    if (ch instanceof HTMLElement && ch.style.flexDirection === 'column') return ch;
  }
  return null;
}

/** 将 cell div 的 flex 对齐映射到 td 的 valign + text-align */
function mapFlexAlignToTd(cellDiv: HTMLElement, td: HTMLElement) {
  const jc = cellDiv.style.justifyContent;
  let vAlign: 'top' | 'middle' | 'bottom' = 'top';
  if (jc === 'center') vAlign = 'middle';
  else if (jc === 'flex-end' || jc === 'end') vAlign = 'bottom';
  td.style.verticalAlign = vAlign;
  td.setAttribute('valign', vAlign);

  const ai = cellDiv.style.alignItems;
  let hAlign: 'left' | 'center' | 'right' = 'left';
  if (ai === 'center') hAlign = 'center';
  else if (ai === 'flex-end' || ai === 'end') hAlign = 'right';
  td.style.textAlign = hAlign;
  td.setAttribute('align', hAlign);
}

/* ====== 8. 强制垂直堆叠与邮件安全样式（Gmail 等会移除 flexbox） ====== */
/**
 * 画布 DOM 结构约定：ul > li > div.blockContent > ComponentWrapper。
 * 宽度、对齐等样式必须从 ComponentWrapper（topLevelWrapper）读取，不可从 blockContent 推断。
 * 若画布为 contentDistribution=spaceBetween，移除 flex 后需用其他方式（如 li 的 margin）还原
 * 「首尾贴边、中间均分」的视觉，避免仅刪除 gap/justify-content 导致均分语义丢失。
 */
function ensureVerticalStack(root: HTMLElement) {
  // 根容器：block + 固定宽度 + box-sizing + overflow:hidden（防止子元素溢出白色背景区域）
  root.style.display = 'block';
  root.style.boxSizing = 'border-box';
  root.style.overflow = 'hidden';
  if (!root.style.width) {
    root.style.width = '600px';
  }
  // 清除残留的 flex 属性，避免部分邮件客户端误读
  const ROOT_FLEX_PROPS = ['flex-direction', 'flex-wrap', 'align-items', 'justify-content', 'align-content', 'gap'];
  ROOT_FLEX_PROPS.forEach((p) => root.style.removeProperty(p));

  // 主列表：block + width 100% + box-sizing
  const list = root.querySelector('ul');
  if (list) {
    // 在移除 flex 前，读取画布层級的水平对齐（<ul> 的 align-items 来自 canvas contentAlign）
    const canvasAlignRaw = list.style.alignItems || '';
    let canvasHAlign: 'left' | 'center' | 'right' = 'left';
    if (canvasAlignRaw === 'center') canvasHAlign = 'center';
    else if (canvasAlignRaw === 'flex-end' || canvasAlignRaw === 'end') canvasHAlign = 'right';

    list.style.display = 'block';
    list.style.width = '100%';
    list.style.margin = '0';
    list.style.padding = '0';
    list.style.listStyle = 'none';
    list.style.boxSizing = 'border-box';
    list.style.removeProperty('flex-direction');
    list.style.removeProperty('gap');
    list.style.removeProperty('align-items');
    list.style.removeProperty('justify-content');

    // 列表项（li）：block + width 100% + box-sizing + 显式清除默认 margin/padding
    list.querySelectorAll(':scope > li').forEach((li) => {
      const htmlLi = li as HTMLElement;
      htmlLi.style.display = 'block';
      htmlLi.style.width = '100%';
      htmlLi.style.margin = '0';
      htmlLi.style.padding = '0';
      htmlLi.style.boxSizing = 'border-box';
      htmlLi.style.removeProperty('align-self');

      // 结构约定：li > div.blockContent > ComponentWrapper。宽度/对齐等一律从 ComponentWrapper 读取，勿用 blockContent。
      const blockContent = htmlLi.querySelector(':scope > div');
      const topLevelWrapper = blockContent?.querySelector(':scope > div') as HTMLElement | null;
      if (topLevelWrapper) {
        const wrapper = topLevelWrapper;
        wrapper.style.boxSizing = 'border-box';
        
        // 读取组件自身的水平对齐（alignItems 控制 flex-direction:column 的水平对齐）
        const display = wrapper.style.display;
        const hAlignRaw = wrapper.style.alignItems || '';
        let hAlign: 'left' | 'center' | 'right' = 'left';
        if (hAlignRaw === 'center') hAlign = 'center';
        else if (hAlignRaw === 'flex-end' || hAlignRaw === 'end') hAlign = 'right';
        
        const widthValue = wrapper.style.width || '';
        const isFitContent = widthValue === 'auto' || widthValue === 'fit-content';
        
        if (display === 'flex' || display === 'inline-flex') {
          // fit-content 容器用 inline-block 保持收缩宽度；全宽容器用 block
          wrapper.style.display = isFitContent ? 'inline-block' : 'block';
          const flexProps = ['flex-direction', 'flex-wrap', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 
                            'justify-content', 'align-items', 'align-content', 'gap'];
          flexProps.forEach(p => wrapper.style.removeProperty(p));
        }
        
        // 处理宽度与 margin：避免溢出
        const ml = wrapper.style.marginLeft || '';
        const mr = wrapper.style.marginRight || '';
        const hasHMargin = (parseFloat(ml) || 0) > 0 || (parseFloat(mr) || 0) > 0;
        
        if (widthValue.includes('calc(')) {
          wrapper.style.removeProperty('width');
        } else if (widthValue === '100%' && hasHMargin) {
          wrapper.style.removeProperty('width');
        }
        
        if (isFitContent) {
          // fitContent 容器：由「画布对齐」决定 wrapper 在 li 中的位置
          if (canvasHAlign !== 'left') {
            // 在 li 和 blockContent 上设置 text-align，使 inline-block wrapper 居中
            htmlLi.style.setProperty('text-align', canvasHAlign, 'important');
            if (blockContent instanceof HTMLElement) {
              blockContent.style.setProperty('text-align', canvasHAlign, 'important');
            }
            // 冗余居中层：li 內包一层 div（避免移动端忽略 li 的 text-align）
            const centerDiv = document.createElement('div');
            centerDiv.style.setProperty('text-align', canvasHAlign, 'important');
            centerDiv.style.width = '100%';
            if (blockContent instanceof HTMLElement) {
              htmlLi.insertBefore(centerDiv, blockContent);
              centerDiv.appendChild(blockContent);
            }
            // wrapper 保持 inline-block + text-align:left（内容不继承居中）
            wrapper.style.display = 'inline-block';
            wrapper.style.setProperty('text-align', 'left', 'important');
          }
        } else if (hAlign !== 'left') {
          // 全宽容器：由组件自身 contentAlign 决定内部内容的水平对齐
          // 多层冗余 text-align（wrapper + blockContent + li），不再嵌套 alignment table
          wrapper.style.setProperty('text-align', hAlign, 'important');
          if (blockContent instanceof HTMLElement) {
            blockContent.style.setProperty('text-align', hAlign, 'important');
          }
          htmlLi.style.setProperty('text-align', hAlign, 'important');

          // 冗余居中层（避免移动端覆盖 li 的 text-align）
          const centerDiv = document.createElement('div');
          centerDiv.style.setProperty('text-align', hAlign, 'important');
          centerDiv.style.width = '100%';
          if (blockContent instanceof HTMLElement) {
            htmlLi.insertBefore(centerDiv, blockContent);
            centerDiv.appendChild(blockContent);
          }

          // 對 wrapper 內 display:block 的直接子元素（非全宽、非 table）转为 inline-block，
          // 使其可被 text-align 居中（如 icon 的 <img>）
          Array.from(wrapper.children).forEach((child) => {
            const el = child as HTMLElement;
            if (!el.style) return;
            const tag = el.tagName?.toLowerCase();
            if (tag === 'table') return;
            const w = el.style.width || '';
            if (w === '100%') return;
            const d = el.style.display || '';
            if (d === '' || d === 'block') {
              el.style.display = 'inline-block';
            }
          });
        }
      }
    });
  }

  // 對所有元素：box-sizing + 移除残余 flex（Gmail 会移除後导致乱排）
  const FLEX_PROPS = [
    'flex-direction', 'flex-wrap', 'flex', 'flex-grow', 'flex-shrink',
    'flex-basis', 'justify-content', 'align-items', 'align-content',
    'align-self', 'gap',
  ];

  // 收集需要用 table 实现对齐的 flex 容器（从葉到根，避免 replaceWith 干扰遍历）
  const flexElements: HTMLElement[] = [];
  root.querySelectorAll('*').forEach((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.style.boxSizing = 'border-box';

    if (htmlEl.getAttribute('data-email-processed') === '1') {
      htmlEl.removeAttribute('data-email-processed');
      return;
    }

    if (htmlEl.style.width?.includes('calc(')) {
      htmlEl.style.removeProperty('width');
    }

    const display = htmlEl.style.display;
    if (display === 'flex' || display === 'inline-flex') {
      flexElements.push(htmlEl);
    }
  });

  // 从後往前处理，避免 DOM 替换影響其他元素
  flexElements.reverse().forEach((htmlEl) => {
    const originalDisplay = htmlEl.style.display;
    const ai = htmlEl.style.alignItems || '';
    const jc = htmlEl.style.justifyContent || '';
    const widthVal = htmlEl.style.width || '';
    const insideImageOverlay = !!htmlEl.closest('[data-email-overlay-root="1"]');

    FLEX_PROPS.forEach((p) => htmlEl.style.removeProperty(p));

    // inline-flex 或 fit-content/auto 宽度的元素應該用 inline-block，
    // 這樣父级的 text-align / td align 才能對其生效
    const wasInlineLevel = originalDisplay === 'inline-flex';
    const isContentSized = widthVal === 'auto' || widthVal === 'fit-content' || wasInlineLevel;
    htmlEl.style.display = isContentSized ? 'inline-block' : 'block';

    // 对齐映射（flex-direction: column → alignItems 控制水平对齐）
    let hAlign: 'left' | 'center' | 'right' = 'left';
    if (ai === 'center') hAlign = 'center';
    else if (ai === 'flex-end' || ai === 'end') hAlign = 'right';

    // 垂直对齐映射（justifyContent）
    let vAlign: 'top' | 'middle' | 'bottom' = 'top';
    if (jc === 'center') vAlign = 'middle';
    else if (jc === 'flex-end' || jc === 'end') vAlign = 'bottom';

    // 图片 overlay 內部：保留水平对齐，但禁止垂直 table 包裹（会导致 Gmail PC 拉伸）
    if (insideImageOverlay) {
      vAlign = 'top';
    }

    // 若水平/垂直都为默认，不需要額外处理
    if (hAlign === 'left' && vAlign === 'top') return;

    // 水平对齐：仅对 block（全宽）元素设 text-align
    // inline-block（fitContent）元素不设 text-align：容器已收缩到内容宽度，
    // 设定 text-align: center 在 Gmail PC 端会导致元素异常拉伸/居中
    if (hAlign !== 'left' && !isContentSized) {
      htmlEl.style.setProperty('text-align', hAlign, 'important');
      Array.from(htmlEl.children).forEach((child) => {
        const cel = child as HTMLElement;
        if (!cel.style) return;
        const tag = cel.tagName?.toLowerCase();
        if (tag === 'table') return;
        const w = cel.style.width || '';
        if (w === '100%') return;
        const d = cel.style.display || '';
        if (d === '' || d === 'block') {
          cel.style.display = 'inline-block';
        }
      });
    }

    // 垂直对齐需要 table wrapping（text-align 无法控制垂直）
    // 但对 content-sized（inline-block / fitContent）元素跳過：
    // 否則在 Gmail PC 容易把本該收缩宽度的 overlay 徽章/按钮拉伸为整行。
    if (vAlign !== 'top' && !isContentSized) {
      const alignTable = document.createElement('table');
      alignTable.setAttribute('width', '100%');
      alignTable.setAttribute('cellpadding', '0');
      alignTable.setAttribute('cellspacing', '0');
      alignTable.setAttribute('border', '0');
      alignTable.setAttribute('role', 'presentation');
      alignTable.style.borderCollapse = 'collapse';
      alignTable.style.width = '100%';
      alignTable.style.boxSizing = 'border-box';
      alignTable.style.tableLayout = 'fixed';

      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.setAttribute('align', hAlign);
      td.setAttribute('valign', vAlign);
      td.style.textAlign = hAlign;
      td.style.verticalAlign = vAlign;

      while (htmlEl.firstChild) td.appendChild(htmlEl.firstChild);
      tr.appendChild(td);
      alignTable.appendChild(tr);
      htmlEl.appendChild(alignTable);
    }
  });
}

/* ====== 9. 清理空 class ====== */
function cleanEmptyClasses(root: HTMLElement) {
  root.querySelectorAll('*').forEach((el) => {
    const cls = el.getAttribute('class');
    if (cls !== null) {
      const trimmed = cls.trim();
      if (!trimmed || trimmed === 'undefined') {
        el.removeAttribute('class');
      }
    }
  });
}
