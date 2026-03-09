/**
 * 管线提示词模板（Step1~Step2.6 + Step3 + Step4）。
 */

import type {
  GroundingSection,
  ResolvedTokens,
  ExtractedIcon,
  ExtractedRegionText,
  SearchedImage,
} from './types.js';

// ── IMAGE_REFERENCE / ICON_REFERENCE（与 llmClient 一致） ────────────

export const IMAGE_REFERENCE = `## 图片规则

图片 src 只要为**可访问的 URL**（http 或 https）即可，不限制图床。禁止留空。

若当前上下文中未提供图片 URL，**不要输出 image 组件**（避免空图占位落地）。`;

export const ICON_REFERENCE = `## 图标规则

**图标颜色（必须注意）**：icon 组件的 props.color 必须与设计图中该图标的颜色一致，填 hex（如 #1A1A1A、#000000）。不要忽略或随意设成黑色。

**系统内置图标**（仅当设计图中的图标与下列**造型完全一致**时使用 iconType，无需 customSrc）：

通用图标：mail（邮箱）、phone（电话）、location（定位）、link（链接）、star（星星）、heart（爱心）、check（勾选）、arrow-right（箭头）
社交媒体：instagram、tiktok、youtube、facebook、twitter

**若设计图图标与上述任一项不符**（例如卡车、礼盒、退货、配送、自定义形状等），**禁止**用相近的 systemIconType 替代，必须使用 \`iconType: "custom"\` 并在 \`customSrc\` 中提供 **URL 编码的 SVG Data URL**：
- 格式：\`data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E...%3C/svg%3E\`
- SVG 中使用 \`currentColor\` 使图标颜色可通过 props.color 控制
- 文字类 Logo 可用 SVG 内 \`<text>\` 标签绘制`;

// ── Step 1: Grounding ────────────────────────────────────────────────

export function buildGroundingPrompt(): string {
  return `你是邮件模板分析助手。仔细观察这张邮件设计图，按从上到下的视觉顺序列出所有区域。

输出格式（JSON 数组）：
[
  {
    "id": "s1",
    "region": "简短区域名",
    "components": "包含的组件描述",
    "layoutHints": {
      "fullWidth": true,
      "align": "center",
      "gapAbove": "32px",
      "gapBelow": "0"
    },
    "hints": {
      "heading": { "fontSize": "28px", "fontWeight": "700", "color": "#1A1A1A" },
      "body": { "fontSize": "14px", "fontWeight": "400", "color": "#5C6B7A" },
      "bgColor": "#F5F5F5"
    },
    "hasImage": true,
    "imageQuery": "outdoor hiking family",
    "imageWidth": 600,
    "imageHeight": 400,
    "hasOverlay": true,
    "overlayAlign": "left",
    "overlayItems": "大标题 + 按钮"
  }
]

字段说明：
- id：区域序号，s1/s2/s3...
- region：区域名称（2-6字）
- components：包含的元素类型和数量的简短描述
- layoutHints.fullWidth：该区域容器是否全宽（100%）；false = 内容自适应宽度收缩
- layoutHints.align：区域内部主要对齐方向（left / center / right）
- layoutHints.gapAbove：该区域与上方区域之间的视觉间距（px），仅在有明显间距时填写
- layoutHints.gapBelow：该区域与下方区域之间的视觉间距（px），仅在有明显间距时填写
- hints：该区域可见文字的视觉参数估值（只写观察到的，不确定的可省略）
- hints.bgColor：该区域背景色（非白色时填写）
- hasImage：该区域是否包含需要用真实图片填充的图片组件（true/false）
- imageQuery：若 hasImage=true，描述该图片主题的英文关键词（2-4词，贴合图片内容），用于 Pexels 搜索
- imageWidth / imageHeight：图片的建议尺寸（px），根据区域大小估算
- hasOverlay：该区域图片上是否有文字/标签/按钮叠加显示在图片之上（如 Banner 标题、折扣徽章 "10% OFF"、产品标签等）
- overlayAlign：叠加内容在图片中的位置（left / center / right）——仅 hasOverlay=true 时填写
- overlayItems：叠加内容的简短描述（如"大标题 + 按钮"、"折扣徽章"）——仅 hasOverlay=true 时填写

规则：
- 按从上到下的顺序
- 水平并排的多个元素算同一个区域
- layoutHints 和 hints 字段在不确定时可省略
- 特别注意背景色变化：如果某个区域有浅灰色背景（如 #F5F5F5），在 hints 中标注 bgColor
- 注意文字颜色层次：标题通常黑色（#000000），辅助说明/副标题通常灰色（#999999）
- 含图片区域务必填写 hasImage: true 和 imageQuery（英文）、imageWidth、imageHeight
- 产品图、Banner 图、头图等均视为需要图片；纯文字/按钮/图标区域 hasImage 留空或填 false
- **重要**：若图片上有任何叠加文字/按钮/标签（含折扣徽章），必须填写 hasOverlay: true、overlayAlign、overlayItems
- 区块之间有明显空白间距时，填写 gapAbove / gapBelow（估算 px 值），无明显间距时省略
- 只输出 JSON 数组，不要输出其他文字`;
}

// ── Step 2: Token 提取 ───────────────────────────────────────────────

export function buildTokenPrompt(sections: GroundingSection[]): string {
  return `你是邮件设计分析助手。观察这张邮件图，选择最匹配的设计预设。

可选调色板：corporate-blue / elegant-dark / warm-commerce / fresh-green / soft-purple / minimal-mono
可选间距：compact / standard / spacious / generous
可选字号：standard / large / compact

输出格式（JSON 对象）：
{
  "colorPreset": "预设名",
  "colorOverrides": { "字段名": "#实际色值" },
  "spacingPreset": "预设名",
  "typographyPreset": "预设名",
  "canvasBg": "画布外层背景色",
  "contentBg": "内容区域背景色"
}

规则：
- colorPreset 必须从 6 个预设中选一个最接近的
- colorOverrides：**关键色位（primary / heading / body / accent / border）务必覆盖**；颜色按图中实际值填写 hex，不要因为"差不多"就省略
- 如果预设完全匹配，colorOverrides 为空对象 {}
- canvasBg 是最外层背景色（邮件两侧的底色）
- contentBg 是内容区域的底色
- 只输出 JSON 对象，不要输出其他文字

颜色观察要求：
- 请仔细观察图片中**每种文字的实际颜色**，不要默认所有文字都是黑色
- 特别注意：副标题/辅助说明/页脚文字通常是浅灰色（如 #999999、#888888），body 色应设为该灰色值，而非纯黑
- colorOverrides 中 body 字段代表正文/辅助/页脚文字颜色，heading 代表标题颜色（通常为黑色），两者往往不同
- colorOverrides 中应写出所有与预设不同的颜色，不要限制数量
- 按钮背景色、按钮边框色也请仔细观察，不要默认为蓝色
- 如果按钮是黑色底白色字，primary 应为 #000000 或实际深色值

区域分析结果：
${JSON.stringify(sections, null, 2)}`;
}

// ── Step 2.5: Icon Extraction ─────────────────────────────────────────

export function buildIconExtractionPrompt(sections: GroundingSection[]): string {
  return `你是邮件图标提取助手。仔细观察这张邮件设计图，识别所有需要用图标表达的视觉元素。

## 图标颜色（必须输出）
每个图标需记录设计图中的**实际颜色**，输出 colorHex 字段（hex，如 "#000000"、"#1A1A1A"），供结构生成阶段设置 icon.props.color。图标颜色必须与设计图一致，不可忽略。

## 项目支持的系统图标（仅造型完全一致时才用 systemIconType）

**仅当设计图中该图标的造型与下列任一项完全一致时**，输出 systemIconType，不提取 SVG：
- 通用：mail、phone、location、link、star、heart、check、arrow-right
- 社交：instagram、tiktok、youtube、facebook、twitter

**若设计图中的图标与上述任一项在造型上明显不符**（例如卡车、礼盒、退货、配送、勾选、自定义形状等），**禁止**选用相近的 systemIconType，必须输出 svgDataUrl 自定义 SVG：
- 单色线条图标：使用 currentColor 的 SVG Data URL（URL 编码）
- 文字类 Logo：可用 SVG 内 \`<text>\` 标签绘制

任务：
1. 找出图中所有图标
2. 判断是否与上述系统图标**造型一一对应**；是则输出 systemIconType + colorHex，否则输出 svgDataUrl + colorHex
3. 为每个图标分配简短英文 ID（如 icon_instagram、icon_shipping、icon_returns）

输出格式（JSON 数组）：
[
  {
    "id": "icon_instagram",
    "label": "Instagram 图标",
    "systemIconType": "instagram",
    "colorHex": "#000000"
  },
  {
    "id": "icon_shipping",
    "label": "快递/配送图标",
    "svgDataUrl": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E...%3C/svg%3E",
    "colorHex": "#1A1A1A"
  }
]

SVG 规则（仅适用于非系统图标）：
- viewBox 固定为 "0 0 24 24"
- 必须使用 currentColor 作为 stroke 或 fill，不要写死颜色
- SVG 必须 URL 编码（空格→%20，<→%3C，>→%3E，"→%22，#→%23）
- 只输出单色线条图标，不要输出多色或复杂渐变 SVG
- 多色 logo（如品牌标志）不适合作为 icon，跳过不输出

如果图中没有任何图标，输出空数组 []。

区域参考（辅助定位图标所在区域）：
${JSON.stringify(sections, null, 2)}

只输出 JSON 数组，不要输出其他文字。`;
}

// ── Step 2.6: Text Extraction ─────────────────────────────────────────

export function buildTextExtractionPrompt(sections: GroundingSection[]): string {
  return `你是邮件文本提取助手。仔细观察这张邮件设计图，逐字读取所有可见文字。

任务：
1. 按区域（对应 Grounding 的 id）分组，逐字读取该区域内所有可见文字
2. 保持原始语言（英文就输出英文，中文就输出中文），不要翻译
3. 每段独立文字（标题/段落/按钮文字/标签等）单独作为一个字符串

输出格式（JSON 数组）：
[
  { "regionId": "s1", "texts": ["LOGO TEXT"] },
  { "regionId": "s2", "texts": ["主标题文字", "副标题说明"] },
  { "regionId": "s6", "texts": ["CHECKOUT NOW"] }
]

规则：
- regionId 对应下方区域分析的 id 字段
- 只包含有文字内容的区域，纯图片区域可省略
- texts 数组中每个字符串对应一段视觉上独立的文字
- 换行的段落可合并为一个字符串（用换行符分隔）或拆为多个字符串
- 不要改写、翻译、补全或猜测看不清楚的文字
- 看不清楚的文字用 "[unclear]" 标记
- 只输出 JSON 数组，不要输出其他文字

区域分析（用于对应 regionId）：
${JSON.stringify(sections, null, 2)}`;
}

// ── Step 3: 结构生成 ─────────────────────────────────────────────────

function buildIconContextSection(icons: ExtractedIcon[]): string {
  if (icons.length === 0) return ICON_REFERENCE;

  const systemIcons = icons.filter((ic) => ic.systemIconType);
  const customIcons = icons.filter((ic) => !ic.systemIconType && ic.svgDataUrl);

  const sections: string[] = [];

  if (systemIcons.length > 0) {
    const list = systemIcons
      .map((ic) => {
        const colorPart = ic.colorHex ? `, "color": "${ic.colorHex}"` : '';
        return `  { "id": "${ic.id}", "label": "${ic.label}", "iconType": "${ic.systemIconType}"${colorPart} }`;
      })
      .join(',\n');
    sections.push(`系统内置图标（直接用 iconType，无需 customSrc；color 与设计图一致）：\n[\n${list}\n]`);
  }

  if (customIcons.length > 0) {
    const list = customIcons
      .map((ic) => {
        const colorPart = ic.colorHex ? `, "color": "${ic.colorHex}"` : '';
        return `  { "id": "${ic.id}", "label": "${ic.label}", "ref": "$icon.${ic.id}"${colorPart} }`;
      })
      .join(',\n');
    sections.push(`自定义图标（iconType: "custom"，customSrc 填 $icon.xxx 引用；color 与设计图一致）：\n[\n${list}\n]`);
  }

  return `## 图标上下文（Step2.5 已提取，直接引用，禁止重新生成 SVG）

${sections.join('\n\n')}

注意：系统图标只需设置 iconType（如 "instagram"），不要写 customSrc；自定义图标用 $icon.xxx 引用，不要现场写 SVG Data URL。**每个 icon 的 props.color 必须与上述或设计图一致（hex）。**`;
}

function buildImageContextSection(images: SearchedImage[]): string {
  if (images.length === 0) return '';
  const list = images
    .map(
      (img) =>
        `  { "regionId": "${img.regionId}", "url": "${img.url}", "alt": "${img.alt}", "width": ${img.width}, "height": ${img.height} }`,
    )
    .join(',\n');
  return `## 图片上下文（Step2.7 已搜索到可访问图片，按 regionId 使用）
以下图片 URL 按区域 regionId 对应 Grounding 区域，可直接使用；也可使用任意可访问的 http(s) URL：
[\n${list}\n]

注意：
- image 组件的 src 从上方取对应 regionId 的 url，或使用任意可访问的图片 URL；禁止留空
- alt 直接复用上方 alt 字段
- 若某区域有多张图片，按需复用最近语义匹配的 URL

`;
}

function buildTextContextSection(texts: ExtractedRegionText[]): string {
  if (texts.length === 0) return '';
  const list = texts
    .map((rt) => `  { "regionId": "${rt.regionId}", "texts": ${JSON.stringify(rt.texts)} }`)
    .join(',\n');
  return `## 文本上下文（Step2.6 已提取，原样填用，禁止翻译或改写）
以下是从设计图中逐字读取的文案，按区域 regionId 对应 Grounding 区域：
[\n${list}\n]

注意：text 组件的 content 必须为 HTML。直接取用上方对应 regionId 的 texts 时用 <p>...</p> 包装；字号/颜色/粗体等写在 HTML 内（如 <span style="font-size:16px;color:#FFF"> 或 <strong>），不得输出 props.fontSize、props.color、props.fontWeight、props.lineHeight。

`;
}

export function buildStructurePrompt(
  sections: GroundingSection[],
  tokens: ResolvedTokens,
  extractedIcons: ExtractedIcon[] = [],
  extractedTexts: ExtractedRegionText[] = [],
  searchedImages: SearchedImage[] = [],
): string {
  const hasTextCtx = extractedTexts.length > 0;
  const hasImageCtx = searchedImages.length > 0;
  const iconSection = buildIconContextSection(extractedIcons);
  const textSection = buildTextContextSection(extractedTexts);
  const imageSection = buildImageContextSection(searchedImages);

  return `你是邮件模板结构生成助手。根据区域分析和设计 Token，输出组件树。

## Compact 格式
- 只写 type（必填）和非默认的 props/wrapper
- 不写的字段 = 使用该组件类型的默认值
- 颜色用 $colors.xxx 引用，间距用 $spacing.xxx 引用，字号用 $typo.xxx 引用
- children 用于 layout/grid 的子组件

## 可用 Token
颜色：$colors.primary / heading / body / accent / mutedBg / cardBg / border
间距：$spacing.section / element / tight
字号：$typo.h1 / h2 / body / caption

## 各组件类型 props（只列必要字段，其余有默认值）
- layout: direction("horizontal"|"vertical"), gap
- grid: columnsPerRow, gap（slots 自动根据 children 数量计算）
- text: content（HTML，如 "<p>标题</p>" 或带 inline style 的 <span>），可选 fontMode、fontFamily
- image: src（从图片上下文取对应 regionId 的 url，或任意可访问的 http(s) URL；无上下文时不要输出 image 组件）, alt
- button: text, backgroundColor, textColor
- divider: (通常全默认即可)
- icon: iconType, color, size

## image 图文叠层

**触发场景（只要满足其一，必须在 image 下写 children）**：
1. Banner/Hero 图片上有标题文字或按钮覆盖
2. 产品图上有折扣徽章（如 "10% OFF"）、角标、价格标签等覆盖
3. 任何图片上有文字或交互元素从视觉上叠加在图片之上

**做法**：直接在 image 组件的 children 中写入叠加内容，**无需写 layoutMode: true**（系统自动检测 children 并启用）。

image props（叠层模式相关）：
- layoutContentAlign：叠加内容在图片中的对齐，取 grounding 的 overlayAlign（"left" | "center" | "right" 字符串，**禁止**输出对象格式）
- layoutPadding：叠加区域内边距，字符串（如 "32px" 或 "24px 32px"，**禁止**输出对象格式）；默认 "24px"

compact 示例 1（Banner 图 + 左侧标题+按钮叠加）：
{
  "type": "image",
  "props": { "src": "https://images.pexels.com/photos/1234567/pexels-photo-1234567.jpeg?auto=compress&cs=tinysrgb&w=1200&h=400&fit=crop", "layoutContentAlign": "left", "layoutPadding": "32px" },
  "children": [
    { "type": "text", "props": { "content": "<p style='font-size:26px;color:#FFFFFF'>Summer Collection</p>" } },
    { "type": "button", "props": { "text": "SHOP NOW" } }
  ]
}

compact 示例 2（产品图右上角有折扣徽章）：
{
  "type": "image",
  "props": { "src": "https://images.pexels.com/photos/9876543/pexels-photo-9876543.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop", "layoutContentAlign": "right", "layoutPadding": "8px" },
  "children": [
    { "type": "text", "props": { "content": "<p style='font-size:12px;font-weight:700;color:#FFFFFF'>10% OFF</p>" }, "wrapper": { "bg": "#FF4500", "padding": "4px 8px", "borderRadius": "4px", "widthMode": "fitContent" } }
  ]
}

**叠层子组件 wrapper 规则**：
- 徽章/标签/角标等小型叠加元素的 wrapper **必须**设 'widthMode: "fitContent"'，使有色背景只覆盖文字内容宽度，**不**撑满整张图片。
- Banner 大面积叠加内容（如标题 + 按钮的 layout 容器）不需要设 widthMode。

**禁止**将文字/按钮与图片并列放在同一 layout 中模拟叠层——叠加效果**只能**通过在 image 的 children 中写入内容来实现。

## 容器 wrapper 常用字段（全部可省略=默认值）
- padding: 支持直接 px 值（如 "32px 0 16px 0"）或 "$spacing.section"，或 "10px 20px"
- bg: 背景色
- borderRadius: "8px"
- contentAlign: "center"（控制容器内部内容对齐；可选 left/center/right；不影响容器自身在父级中的位置）
- widthMode: "fitContent"（需要收缩宽度时使用）

## 组件限制（必须遵守）
- button 有 'widthMode' 属性控制宽度：'fitContent'（默认，按内容收缩）、'fill'（撑满父容器，同时建议将 wrapper.widthMode 也设为 "fill"）、'fixed'（固定像素宽度，用 'fixedWidth' 指定，如 "200px"）。
- icon 的 custom SVG 经过 currentColor 注入，非白色 fill/stroke 会被替换为当前颜色；多色 logo 不适合直接作为 custom icon。
- **icon 颜色**：每个 icon 的 props.color 必须与设计图/图标上下文中该图标的颜色一致（hex）；若上下文中给出了 color，必须使用，不可忽略或随意设为黑色。
- **系统图标仅在一一匹配时使用**：仅当图标上下文中明确标注了 systemIconType 且与设计图造型一致时使用该 iconType；若为自定义图标（ref 为 $icon.xxx），必须设 iconType: "custom" 与 customSrc，禁止用其他 systemIconType 替代。
- contentAlign 控制容器内部内容对齐，不是容器本身在父级中的位置（左/中/右排布由父级 layout 的 direction 控制）。
- **text 的 content 必须为 HTML**（如 <p>文字</p> 或带样式的 <span>）；字号/颜色等写在 HTML 内，禁止使用 props.fontSize、props.color、props.fontWeight、props.lineHeight。
- letter-spacing、text-transform、position、top、left、right、bottom、transform、translateY 等 CSS 属性在编辑器中**完全无效**，不要输出。图文叠层**只能**通过在 image 的 children 中写入内容来实现（无需写 layoutMode: true）。

## 输出格式
{
  "canvas": { "bg": "$colors.canvasBg", "contentBg": "$colors.contentBg", "width": "600px" },
  "component": {
    "type": "layout",
    "props": { "direction": "vertical", "gap": "0" },
    "children": [...]
  }
}

${hasImageCtx ? imageSection : IMAGE_REFERENCE}

${iconSection}

${textSection}## 重要约束（必须遵守）
- 品牌 Logo **必须**使用 icon(custom) + SVG Data URL 实现（用 \`<text>\` 标签绘制文字 Logo），**禁止**用 text 组件（大字号文字会折行）或 image 组件
- 图片组件默认已是 fill 模式（铺满宽度），不需要显式指定 sizeConfig（除非需要 original 或 fixed 模式）
- 按钮默认已是**黑底白字、无圆角**（borderRadius: 0）；仅当设计图中按钮样式不同于默认时才需要显式指定
- 按钮宽度通过 props.widthMode 控制（"fitContent" / "fill" / "fixed"），**不存在 width 属性**；按钮视觉大小由 padding 撑开；全宽按钮设 widthMode: "fill"，同时将 wrapper.widthMode 也设为 "fill"
- 文本组件默认**无背景色、无内边距**；仅当需要背景色或额外内边距时才设置 wrapper.bg / wrapper.padding
- 嵌套层级不要超过 3 层（如 grid > layout > [icon, text]），**禁止** grid 嵌套 grid
- 社交媒体图标**直接使用内置 iconType**（无需 customSrc），**禁止**重新生成 SVG：
  - Instagram: \`{ "iconType": "instagram" }\`
  - TikTok: \`{ "iconType": "tiktok" }\`
  - YouTube: \`{ "iconType": "youtube" }\`
  - Facebook: \`{ "iconType": "facebook" }\`
  - Twitter/X: \`{ "iconType": "twitter" }\`
- 社交媒体图标行的父容器 layout 使用 wrapper.widthMode = "fitContent"，使图标行居中收紧，不要撑满全宽
- **水平 layout（direction:horizontal）的文本/图标/按钮子组件，wrapper.widthMode 必须设为 "fitContent"**，让各子项按内容自然收缩，避免等分宽度导致文字换行；只有明确需要等宽分配（如两列等宽格式）时才用 "fill"
- wrapper 中只能使用有效字段（padding/bg/borderRadius/contentAlign/widthMode/heightMode/border），**禁止**写 borderTop/borderBottom 等 CSS 字符串
- **禁止**在 wrapper 中写 margin；组件之间的间距由父容器（layout/grid）的 gap 属性控制，不通过子组件的 margin 实现

## 字号与颜色参考
- 主标题：24-32px（bold 700）
- 副标题/辅助说明：12-14px（通常是**灰色** $colors.body 而非黑色）
- 正文/描述：14-16px（regular 400，通常是灰色或深灰）
- 按钮文字：14-16px
- 标签/功能图标文字：10-12px（通常 bold 700 大写）
- 页脚/版权：10-12px（灰色 $colors.body）
- 如果不确定，宁可偏小（邮件阅读场景字号普遍偏小）

## 页脚优化规则
- 页脚版权/地址/链接等信息应合并为 **1 个** text 组件，用 \\n 换行，链接用 Markdown 格式 [文字](url)
- 页脚文字颜色使用灰色 $colors.body，不要用黑色

## 区块间距规则（必须遵守）
- **根容器 gap**：根据相邻区域的 gapAbove / gapBelow，将较大的那个值设为根 layout 的 gap（如区域 s2 的 gapAbove="24px"，则根 layout gap 应包含约 24px 的间距；若各区域间距不一致，在各区域外层用 wrapper.padding 补充）
- **区域内部间距**：若区域内部有明显的元素间空白（如标题与按钮之间留有空隙），在直接父 layout 的 gap 中体现（如 "12px"、"16px"）
- **不要都设 gap: 0**：如果设计图各区块之间有明显的视觉间距，必须反映到 gap 或 wrapper.padding 中，不能全部写 0
- **禁止 padding 叠加**：若父 layout 已有 gap，其子 layout 如果没有背景色和边框（纯透明占位容器），则 wrapper.padding 必须设为 0；间距已由父 gap 控制，子容器不要再加 padding，否则会产生 gap + padding + padding 的三重叠加

## 规则
- 整体用一个 layout(direction:vertical) 作为根容器包裹所有区域，**根 layout 的 gap 根据区域分析的 gapAbove/gapBelow 估算**，不要一律写 0
- 水平排列用 layout(direction:horizontal) 或 grid 包裹
- ${hasImageCtx ? '图片 src 从图片上下文中取对应 regionId 的 url，或使用任意可访问的 http(s) URL；禁止留空' : '未提供图片上下文时，不要输出 image 组件（禁止输出 src 为空的图片）'}
- ${hasTextCtx ? '文案直接从文本上下文取用，原样填入，不要翻译或改写' : '文案贴合邮件图的语义，尽量与图中文字一致，不要自行翻译或改写语种'}
- 对照区域分析的 layoutHints 判断各区域全宽/自适应，对应设置 wrapper.widthMode
- **若 grounding 中有 hasOverlay: true，该区域图片必须在 children 中写入叠加内容**（系统自动开启叠层模式）；layoutContentAlign 取对应区域的 overlayAlign 字段
- 参考区域分析的 hints 字段设置字号/颜色，可与 Token 结合微调
- 按从上到下的顺序，对照区域分析逐个生成
- 只输出 JSON 对象，不要输出其他文字

当前设计 Token 实际值（供参考，输出时仍用 $xxx 引用）：
- 颜色：${JSON.stringify(tokens.colors)}
- 间距：${JSON.stringify(tokens.spacing)}
- 字号：${JSON.stringify(tokens.typography)}

区域分析（含布局约束与视觉参数估值）：
${JSON.stringify(sections, null, 2)}`;
}

/** 构建单区域结构生成提示词（用于并行分区生成）。
 * 与 buildStructurePrompt 规范保持一致，但只针对单个 section，输出裸 CompactComponent（无 canvas / 外层包裹）。
 */
export function buildSectionStructurePrompt(
  section: GroundingSection,
  tokens: ResolvedTokens,
  extractedIcons: ExtractedIcon[] = [],
  extractedTexts: ExtractedRegionText[] = [],
  searchedImages: SearchedImage[] = [],
): string {
  const hasTextCtx = extractedTexts.length > 0;
  const hasImageCtx = searchedImages.length > 0;

  // 只传入与本区域相关的上下文（图标全局共享）
  const sectionTexts = extractedTexts.filter((t) => t.regionId === section.id);
  const sectionImages = searchedImages.filter((img) => img.regionId === section.id);
  const iconSection = buildIconContextSection(extractedIcons);
  const textSection = buildTextContextSection(sectionTexts);
  const imageSection = buildImageContextSection(sectionImages);

  return `你是邮件模板结构生成助手。根据区域分析和设计 Token，为当前区域输出组件树。

## 当前任务
只生成区域 **${section.id}（${section.region}）** 的组件结构，不生成其他区域。

## Compact 格式
- 只写 type（必填）和非默认的 props/wrapper
- 不写的字段 = 使用该组件类型的默认值
- 颜色用 $colors.xxx 引用，间距用 $spacing.xxx 引用，字号用 $typo.xxx 引用
- children 用于 layout/grid 的子组件

## 可用 Token
颜色：$colors.primary / heading / body / accent / mutedBg / cardBg / border
间距：$spacing.section / element / tight
字号：$typo.h1 / h2 / body / caption

## 各组件类型 props（只列必要字段，其余有默认值）
- layout: direction("horizontal"|"vertical"), gap
- grid: columnsPerRow, gap（slots 自动根据 children 数量计算）
- text: content（HTML，如 "<p>标题</p>" 或带 inline style 的 <span>），可选 fontMode、fontFamily
- image: src（从图片上下文取对应 regionId 的 url，或任意可访问的 http(s) URL；无上下文时不要输出 image 组件）, alt
- button: text, backgroundColor, textColor
- divider: (通常全默认即可)
- icon: iconType, color, size

## image 图文叠层

**触发场景（只要满足其一，必须在 image 下写 children）**：
1. Banner/Hero 图片上有标题文字或按钮覆盖
2. 产品图上有折扣徽章（如 "10% OFF"）、角标、价格标签等覆盖
3. 任何图片上有文字或交互元素从视觉上叠加在图片之上

**做法**：直接在 image 组件的 children 中写入叠加内容，**无需写 layoutMode: true**（系统自动检测 children 并启用）。

image props（叠层模式相关）：
- layoutContentAlign：叠加内容在图片中的对齐，取 grounding 的 overlayAlign（"left" | "center" | "right" 字符串，**禁止**输出对象格式）
- layoutPadding：叠加区域内边距，字符串（如 "32px" 或 "24px 32px"，**禁止**输出对象格式）；默认 "24px"

compact 示例 1（Banner 图 + 左侧标题+按钮叠加）：
{
  "type": "image",
  "props": { "src": "https://images.pexels.com/photos/1234567/pexels-photo-1234567.jpeg?auto=compress&cs=tinysrgb&w=1200&h=400&fit=crop", "layoutContentAlign": "left", "layoutPadding": "32px" },
  "children": [
    { "type": "text", "props": { "content": "<p style='font-size:26px;color:#FFFFFF'>Summer Collection</p>" } },
    { "type": "button", "props": { "text": "SHOP NOW" } }
  ]
}

compact 示例 2（产品图右上角有折扣徽章）：
{
  "type": "image",
  "props": { "src": "https://images.pexels.com/photos/9876543/pexels-photo-9876543.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop", "layoutContentAlign": "right", "layoutPadding": "8px" },
  "children": [
    { "type": "text", "props": { "content": "<p style='font-size:12px;font-weight:700;color:#FFFFFF'>10% OFF</p>" }, "wrapper": { "bg": "#FF4500", "padding": "4px 8px", "borderRadius": "4px", "widthMode": "fitContent" } }
  ]
}

**叠层子组件 wrapper 规则**：
- 徽章/标签/角标等小型叠加元素的 wrapper **必须**设 'widthMode: "fitContent"'，使有色背景只覆盖文字内容宽度，**不**撑满整张图片。
- Banner 大面积叠加内容（如标题 + 按钮的 layout 容器）不需要设 widthMode。

**禁止**将文字/按钮与图片并列放在同一 layout 中模拟叠层——叠加效果**只能**通过在 image 的 children 中写入内容来实现。

## 容器 wrapper 常用字段（全部可省略=默认值）
- padding: 支持直接 px 值（如 "32px 0 16px 0"）或 "$spacing.section"，或 "10px 20px"
- bg: 背景色
- borderRadius: "8px"
- contentAlign: "center"（控制容器内部内容对齐；可选 left/center/right；不影响容器自身在父级中的位置）
- widthMode: "fitContent"（需要收缩宽度时使用）

## 组件限制（必须遵守）
- button 有 'widthMode' 属性控制宽度：'fitContent'（默认，按内容收缩）、'fill'（撑满父容器，同时建议将 wrapper.widthMode 也设为 "fill"）、'fixed'（固定像素宽度，用 'fixedWidth' 指定，如 "200px"）。
- icon 的 custom SVG 经过 currentColor 注入，非白色 fill/stroke 会被替换为当前颜色；多色 logo 不适合直接作为 custom icon。
- **icon 颜色**：每个 icon 的 props.color 必须与设计图/图标上下文中该图标的颜色一致（hex）；若上下文中给出了 color，必须使用，不可忽略或随意设为黑色。
- **系统图标仅在一一匹配时使用**：仅当图标上下文中明确标注了 systemIconType 且与设计图造型一致时使用该 iconType；若为自定义图标（ref 为 $icon.xxx），必须设 iconType: "custom" 与 customSrc，禁止用其他 systemIconType 替代。
- contentAlign 控制容器内部内容对齐，不是容器本身在父级中的位置（左/中/右排布由父级 layout 的 direction 控制）。
- **text 的 content 必须为 HTML**（如 <p>文字</p> 或带样式的 <span>）；字号/颜色等写在 HTML 内，禁止使用 props.fontSize、props.color、props.fontWeight、props.lineHeight。
- letter-spacing、text-transform、position、top、left、right、bottom、transform、translateY 等 CSS 属性在编辑器中**完全无效**，不要输出。图文叠层**只能**通过在 image 的 children 中写入内容来实现（无需写 layoutMode: true）。

${hasImageCtx && sectionImages.length > 0 ? imageSection : IMAGE_REFERENCE}

${iconSection}

${textSection}## 重要约束（必须遵守）
- 品牌 Logo **必须**使用 icon(custom) + SVG Data URL 实现（用 \`<text>\` 标签绘制文字 Logo），**禁止**用 text 组件（大字号文字会折行）或 image 组件
- 图片组件默认已是 fill 模式（铺满宽度），不需要显式指定 sizeConfig（除非需要 original 或 fixed 模式）
- 按钮默认已是**黑底白字、无圆角**（borderRadius: 0）；仅当设计图中按钮样式不同于默认时才需要显式指定
- 按钮宽度通过 props.widthMode 控制（"fitContent" / "fill" / "fixed"），**不存在 width 属性**；按钮视觉大小由 padding 撑开；全宽按钮设 widthMode: "fill"，同时将 wrapper.widthMode 也设为 "fill"
- 文本组件默认**无背景色、无内边距**；仅当需要背景色或额外内边距时才设置 wrapper.bg / wrapper.padding
- 嵌套层级不要超过 3 层（如 grid > layout > [icon, text]），**禁止** grid 嵌套 grid
- 社交媒体图标**直接使用内置 iconType**（无需 customSrc），**禁止**重新生成 SVG：
  - Instagram: \`{ "iconType": "instagram" }\`
  - TikTok: \`{ "iconType": "tiktok" }\`
  - YouTube: \`{ "iconType": "youtube" }\`
  - Facebook: \`{ "iconType": "facebook" }\`
  - Twitter/X: \`{ "iconType": "twitter" }\`
- 社交媒体图标行的父容器 layout 使用 wrapper.widthMode = "fitContent"，使图标行居中收紧，不要撑满全宽
- **水平 layout（direction:horizontal）的文本/图标/按钮子组件，wrapper.widthMode 必须设为 "fitContent"**，让各子项按内容自然收缩，避免等分宽度导致文字换行；只有明确需要等宽分配（如两列等宽格式）时才用 "fill"
- wrapper 中只能使用有效字段（padding/bg/borderRadius/contentAlign/widthMode/heightMode/border），**禁止**写 borderTop/borderBottom 等 CSS 字符串
- **禁止**在 wrapper 中写 margin；组件之间的间距由父容器（layout/grid）的 gap 属性控制，不通过子组件的 margin 实现

## 字号与颜色参考
- 主标题：24-32px（bold 700）
- 副标题/辅助说明：12-14px（通常是**灰色** $colors.body 而非黑色）
- 正文/描述：14-16px（regular 400，通常是灰色或深灰）
- 按钮文字：14-16px
- 标签/功能图标文字：10-12px（通常 bold 700 大写）
- 页脚/版权：10-12px（灰色 $colors.body）
- 如果不确定，宁可偏小（邮件阅读场景字号普遍偏小）

## 页脚优化规则
- 页脚版权/地址/链接等信息应合并为 **1 个** text 组件，用 \\n 换行，链接用 Markdown 格式 [文字](url)
- 页脚文字颜色使用灰色 $colors.body，不要用黑色

## 区块间距规则（必须遵守）
- 本区域**没有父级 layout 提供 gap**，区域上下外间距必须通过本区域根组件的 **wrapper.padding（top/bottom）** 来设置
- 参考设计图中本区域与相邻区域之间的视觉间距设置 wrapper.padding；若上方无间距则 padding-top 可为 "0"
- **区域内部间距**：若区域内部有明显的元素间空白（如标题与按钮之间留有空隙），在直接父 layout 的 gap 中体现（如 "12px"、"16px"）
- **不要把内部 gap 设为 0**：如果区域内各元素之间有明显视觉间距，必须反映到 gap 中
- **禁止 padding 叠加**：若 layout 已有 gap，其子 layout 如果没有背景色和边框（纯透明占位容器），wrapper.padding 必须设为 0；间距已由父 gap 控制，否则产生三重叠加

## 规则
- 水平排列用 layout(direction:horizontal) 或 grid 包裹
- ${hasImageCtx && sectionImages.length > 0 ? '图片 src 从图片上下文中取对应 regionId 的 url，或使用任意可访问的 http(s) URL；禁止留空' : '未提供图片上下文时，不要输出 image 组件（禁止输出 src 为空的图片）'}
- ${hasTextCtx && sectionTexts.length > 0 ? '文案直接从文本上下文取用，原样填入，不要翻译或改写' : '文案贴合邮件图的语义，尽量与图中文字一致，不要自行翻译或改写语种'}
- 对照区域分析的 layoutHints 判断全宽/自适应，对应设置 wrapper.widthMode
- **若 grounding 中有 hasOverlay: true，该区域图片必须在 children 中写入叠加内容**（系统自动开启叠层模式）；layoutContentAlign 取对应区域的 overlayAlign 字段
- 参考区域分析的 hints 字段设置字号/颜色，可与 Token 结合微调

## 输出格式（严格遵守）
- 只输出本区域（${section.id}: ${section.region}）的**单个根组件 JSON 对象**
- 直接以 { 开头，以 } 结尾，不要包裹 markdown 代码块
- **禁止**输出 { "component": ... } 或 { "canvas": ... } 包装层，直接输出组件本身
- **禁止**输出数组 [ ... ]
- **禁止**输出其他任何文字或注释

正确格式示例：{ "type": "layout", "props": { "direction": "vertical", "gap": "16px" }, "wrapper": { "padding": "24px 0 0 0" }, "children": [ ... ] }

错误格式（禁止）：
- { "component": { "type": "layout", ... } }  ← 有外层包装
- { "canvas": {...}, "component": {...} }       ← 带 canvas 字段
- [ { "type": "layout", ... } ]                 ← 数组格式

当前设计 Token 实际值（供参考，输出时仍用 $xxx 引用）：
- 颜色：${JSON.stringify(tokens.colors)}
- 间距：${JSON.stringify(tokens.spacing)}
- 字号：${JSON.stringify(tokens.typography)}

当前区域分析（含布局约束与视觉参数估值）：
${JSON.stringify(section, null, 2)}`;
}

// ── Step 4: 视觉校验 ────────────────────────────────────────────────

/**
 * Step 4 提示词：原图 vs 预览截图对比，输出定向修正指令。
 * componentPathMap 可选：key 为 "children[n]" 路径，value 为简短描述。
 */
export function buildReviewPrompt(
  componentPathMap?: Record<string, string>,
): string {
  const pathRef = componentPathMap
    ? `\n\n组件树路径参考：\n${Object.entries(componentPathMap).map(([p, d]) => `- ${p}: ${d}`).join('\n')}`
    : '';

  return `你是邮件模板视觉检查助手。对比目标设计图和当前还原结果，找出视觉差异并输出修正指令。

输出格式（JSON 数组）：
[
  {
    "path": "组件路径，如 children[2] 或 children[4].children[0]",
    "issue": "差异描述",
    "fix": { "props 或 wrapper 的修正字段" }
  }
]

规则：
- 只列出有明显视觉差异的地方，细微差异（±2px）忽略
- path 指从根组件开始的 children 索引路径
- fix 中只写需要修改的字段，格式同 compact
- 如果还原已经足够好，输出空数组 []
- 最多列 8 条修正，优先处理最明显的差异
- 只输出 JSON 数组，不要输出其他文字${pathRef}`;
}

/**
 * 管线完成后注入 ReAct check round 的提示。
 * 引导 LLM 调用 captureCanvasPreview 截图对比并微调。
 */
export function buildPipelineCheckRoundPrompt(): string {
  return `模板已通过管线从设计图一次性生成完毕（含完整组件树）。请按以下顺序校验并微调：

**第一步（必须）：感知现状**
同时调用以下两个工具，先了解画布当前状态，再做任何修改：
1. 调用 captureCanvasPreview 截取当前画布预览图
2. 调用 getTemplateState 获取当前完整组件列表和 ID

**第二步：对比分析**
将截图与用户原始设计图对比，重点检查：
- 颜色/字号/间距是否偏差
- 布局结构是否正确（水平/垂直排列）
- 文字内容是否准确

**第三步（仅当必要）：局部微调**
- 仅允许使用 updateTemplateComponent 修改**已存在的**组件属性（必须先用 getTemplateState 获取真实 ID）
- **严禁** addComponentToTemplate —— 组件树已完整，不需要补充结构
- **严禁** clearTemplateOrSubtree —— 不允许清空
- 每轮只改一个区块，每次只做一种操作（样式调整 or 内容修正，不混合）

**第四步：评估是否结束**
如果视觉已足够接近原始设计图（细节偏差可接受），直接告知用户已完成，不要继续操作。`;
}
