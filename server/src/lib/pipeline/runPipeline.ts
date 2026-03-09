/**
 * 管线编排器：Step1~Step2.6 + Step3（工程展开）→ 完整 EmailComponent 树。
 * Step4 (视觉校验) 留给 ReAct check round。
 */

import { callLlmCollect, type LlmMessage } from '../llm/llmClient.js';
import type { LlmLogContext } from '../llm/llmRequestLogger.js';
import { logLlmFlowEvent } from '../llm/llmRequestLogger.js';
import { resolveDesignTokens } from './resolveTokens.js';
import {
  expandToFull,
  buildCanvasConfig,
  safeParseJson,
  type ExpandedEmailComponent,
  type ExpandedCanvasConfig,
} from './expandToFull.js';
import {
  buildGroundingPrompt,
  buildTokenPrompt,
  buildIconExtractionPrompt,
  buildTextExtractionPrompt,
  buildSectionStructurePrompt,
} from './prompts.js';
import { searchWithCache } from './pexelsClient.js';
import { normalizeSpacing } from './normalizeSpacing.js';
import type {
  GroundingSection,
  LlmTokenOutput,
  ResolvedTokens,
  CompactComponent,
  PipelineCallbacks,
  PipelineStepName,
  ExtractedIcon,
  ExtractedRegionText,
  SearchedImage,
} from './types.js';
import { formatStepResultForDisplay } from './formatStepResult.js';

interface PipelineLogMeta {
  conversationId?: string;
  assistantMessageId?: string;
  runId?: string;
  reactTurn?: number;
}

function sanitizeSectionCompactTree(
  node: CompactComponent,
  section: GroundingSection,
  searchedImages: SearchedImage[],
  extractedIcons: ExtractedIcon[],
): CompactComponent | null {
  const sectionImage = searchedImages.find((img) => img.regionId === section.id);
  const validIconRefIds = new Set(extractedIcons.map((ic) => ic.id));

  const walk = (current: CompactComponent): CompactComponent | null => {
    const nextProps =
      current.props && typeof current.props === 'object'
        ? { ...current.props }
        : undefined;
    const nextWrapper =
      current.wrapper && typeof current.wrapper === 'object'
        ? { ...current.wrapper }
        : undefined;

    // 加固 1：custom icon 的 $icon 引用若未被提取，阻止其原样落地成破图 URL
    if (current.type === 'icon' && nextProps) {
      const iconType = nextProps.iconType;
      const customSrc = nextProps.customSrc;
      if (iconType === 'custom' && typeof customSrc === 'string' && customSrc.startsWith('$icon.')) {
        const refId = customSrc.slice('$icon.'.length);
        if (!validIconRefIds.has(refId)) {
          delete nextProps.customSrc;
          console.warn(
            `[pipeline] section ${section.id} (${section.region}): unresolved icon ref "${customSrc}", fallback to custom placeholder`,
          );
        }
      }
    }

    // 加固 2：空 image.src 不落地；有同区配图可补则补，没有就直接丢弃空图片节点
    if (current.type === 'image') {
      const rawSrc = typeof nextProps?.src === 'string' ? nextProps.src.trim() : '';
      if (!rawSrc) {
        if (sectionImage?.url) {
          if (nextProps) {
            nextProps.src = sectionImage.url;
            if (!nextProps.alt && sectionImage.alt) nextProps.alt = sectionImage.alt;
          }
        } else {
          console.warn(
            `[pipeline] section ${section.id} (${section.region}): drop image with empty src (no section image context)`,
          );
          return null;
        }
      }
    }

    let nextChildren: CompactComponent[] | undefined;
    let hasChildrenField = false;
    if (Array.isArray(current.children)) {
      hasChildrenField = true;
      nextChildren = current.children
        .map((child) => walk(child))
        .filter((child): child is CompactComponent => child !== null);
    }

    const nextNode: CompactComponent = {
      ...current,
      ...(nextProps ? { props: nextProps } : {}),
      ...(nextWrapper ? { wrapper: nextWrapper } : {}),
    };

    if (hasChildrenField) {
      if (nextChildren && nextChildren.length > 0) {
        nextNode.children = nextChildren;
      } else {
        delete nextNode.children;
      }
    }

    return nextNode;
  };

  return walk(node);
}

// ── 重试包装 ─────────────────────────────────────────────────────────

async function runStepWithRetry<T>(
  stepFn: () => Promise<T | null>,
  fallback: T,
  maxRetries: number = 1,
): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await stepFn();
      if (result !== null) return result;
      // stepFn 返回 null（非异常）也算一次失败，记录警告并重试
      console.warn(`[pipeline] step attempt ${i + 1} returned null${i < maxRetries ? ', retrying…' : ', giving up'}`);
    } catch (err) {
      console.error(`[pipeline] step attempt ${i + 1} threw:`, err);
    }
  }
  return fallback;
}

// ── 构建图片消息 ─────────────────────────────────────────────────────

function buildImageMessages(
  imageDataUrls: string[],
  textContent?: string,
): LlmMessage[] {
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  for (const url of imageDataUrls) {
    parts.push({ type: 'image_url', image_url: { url } });
  }
  if (textContent) {
    parts.push({ type: 'text', text: textContent });
  }
  return [{ role: 'user', content: parts as LlmMessage['content'] }];
}

function makeLogCtx(
  userMessage: string,
  meta: PipelineLogMeta | undefined,
  includeSystemPrompt: boolean,
): LlmLogContext {
  return {
    reactRound: meta?.reactTurn ?? 0,
    isUserMessage: false,
    userMessage,
    includeSystemPrompt,
    conversationId: meta?.conversationId,
    assistantMessageId: meta?.assistantMessageId,
    runId: meta?.runId,
  };
}

// ── Step 1: Grounding ────────────────────────────────────────────────

async function runGrounding(
  imageDataUrls: string[],
  meta?: PipelineLogMeta,
  signal?: AbortSignal,
): Promise<GroundingSection[] | null> {
  const systemPrompt = buildGroundingPrompt();
  const messages = buildImageMessages(imageDataUrls);

  const raw = await callLlmCollect(
    'pipeline',
    messages,
    systemPrompt,
    signal,
    makeLogCtx('[pipeline] Step 1: Grounding', meta, true),
  );
  const parsed = safeParseJson<GroundingSection[]>(raw);

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  return parsed.slice(0, 12).map((item, i) => ({
    id: item.id || `s${i + 1}`,
    region: item.region || `区域${i + 1}`,
    components: item.components || '',
    layoutHints: item.layoutHints,
    hints: item.hints,
    hasImage: item.hasImage,
    imageQuery: item.imageQuery,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    hasOverlay: item.hasOverlay,
    overlayAlign: item.overlayAlign,
    overlayItems: item.overlayItems,
  }));
}

// ── Step 2: Token 提取 ───────────────────────────────────────────────

async function runTokenExtraction(
  imageDataUrls: string[],
  sections: GroundingSection[],
  meta?: PipelineLogMeta,
  signal?: AbortSignal,
): Promise<ResolvedTokens | null> {
  const systemPrompt = buildTokenPrompt(sections);
  const messages = buildImageMessages(imageDataUrls);

  const raw = await callLlmCollect(
    'pipeline',
    messages,
    systemPrompt,
    signal,
    makeLogCtx('[pipeline] Step 2: Token Extraction', meta, false),
  );
  const parsed = safeParseJson<LlmTokenOutput>(raw);

  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.colorPreset) return null;

  return resolveDesignTokens(parsed);
}

// ── Step 2.5: Icon Extraction ─────────────────────────────────────────

async function runIconExtraction(
  imageDataUrls: string[],
  sections: GroundingSection[],
  meta?: PipelineLogMeta,
  signal?: AbortSignal,
): Promise<ExtractedIcon[]> {
  const systemPrompt = buildIconExtractionPrompt(sections);
  const messages = buildImageMessages(imageDataUrls);

  const raw = await callLlmCollect(
    'pipeline',
    messages,
    systemPrompt,
    signal,
    makeLogCtx('[pipeline] Step 2.5: Icon Extraction', meta, false),
  );
  const parsed = safeParseJson<ExtractedIcon[]>(raw);

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (ic) =>
      typeof ic.id === 'string' &&
      typeof ic.label === 'string' &&
      (
        typeof ic.systemIconType === 'string' ||
        (typeof ic.svgDataUrl === 'string' && ic.svgDataUrl.startsWith('data:image/svg+xml'))
      ),
  );
}

// ── Step 2.6: Text Extraction ─────────────────────────────────────────

async function runTextExtraction(
  imageDataUrls: string[],
  sections: GroundingSection[],
  meta?: PipelineLogMeta,
  signal?: AbortSignal,
): Promise<ExtractedRegionText[]> {
  const systemPrompt = buildTextExtractionPrompt(sections);
  const messages = buildImageMessages(imageDataUrls);

  const raw = await callLlmCollect(
    'pipeline',
    messages,
    systemPrompt,
    signal,
    makeLogCtx('[pipeline] Step 2.6: Text Extraction', meta, false),
  );
  const parsed = safeParseJson<ExtractedRegionText[]>(raw);

  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (rt) =>
      typeof rt.regionId === 'string' &&
      Array.isArray(rt.texts) &&
      rt.texts.every((t) => typeof t === 'string'),
  );
}

// ── Step 2.7: 图片搜索（Pexels） ─────────────────────────────────────

async function runImageSearch(
  sections: GroundingSection[],
  signal?: AbortSignal,
): Promise<SearchedImage[]> {
  const imageSections = sections.filter((s) => s.hasImage && s.imageQuery);
  if (imageSections.length === 0) return [];

  const results: SearchedImage[] = [];

  await Promise.all(
    imageSections.map(async (section) => {
      if (signal?.aborted) return;
      const query = section.imageQuery!;
      const targetWidth = section.imageWidth ?? 600;
      const targetHeight = section.imageHeight ?? 400;

      const orientation: 'landscape' | 'portrait' | 'square' =
        targetWidth > targetHeight ? 'landscape' : targetWidth < targetHeight ? 'portrait' : 'square';

      const result = await searchWithCache(query, targetWidth, orientation);
      if (!result) return;

      results.push({
        regionId: section.id,
        query,
        url: result.url,
        alt: result.alt,
        width: targetWidth,
        height: targetHeight,
      });
    }),
  );

  return results;
}

// ── Step 3: 结构生成（并行分区） ────────────────────────────────────

/** 生成单个区域的组件树。输出裸 CompactComponent（无 canvas / 外层包裹）。 */
async function runSectionStructureGeneration(
  imageDataUrls: string[],
  section: GroundingSection,
  tokens: ResolvedTokens,
  extractedIcons: ExtractedIcon[],
  extractedTexts: ExtractedRegionText[],
  searchedImages: SearchedImage[],
  meta?: PipelineLogMeta,
  signal?: AbortSignal,
): Promise<ExpandedEmailComponent | null> {
  const systemPrompt = buildSectionStructurePrompt(section, tokens, extractedIcons, extractedTexts, searchedImages);
  const messages = buildImageMessages(imageDataUrls);

  const raw = await callLlmCollect(
    'pipeline',
    messages,
    systemPrompt,
    signal,
    makeLogCtx(`[pipeline] Step 3: Section ${section.id} (${section.region})`, meta, false),
  );

  const parsed = safeParseJson<CompactComponent>(raw);
  if (!parsed) {
    console.warn(
      `[pipeline] section ${section.id} (${section.region}): JSON parse failed. Raw output (first 300 chars): ${raw.slice(0, 300)}`,
    );
    return null;
  }

  // 格式兼容层：LLM 可能惯性输出旧格式 { component: {...} } 或数组 [{...}]
  let compact: CompactComponent | null = parsed;
  if (!('type' in parsed)) {
    const envelope = parsed as Record<string, unknown>;
    if (envelope.component && typeof envelope.component === 'object') {
      console.warn(`[pipeline] section ${section.id} (${section.region}): detected legacy envelope format { component: {...} }, unwrapping`);
      compact = envelope.component as CompactComponent;
    } else if (Array.isArray(envelope)) {
      console.warn(`[pipeline] section ${section.id} (${section.region}): detected array output, wrapping in vertical layout`);
      compact = { type: 'layout', props: { direction: 'vertical', gap: '0' }, children: envelope as CompactComponent[] };
    } else {
      console.warn(
        `[pipeline] section ${section.id} (${section.region}): unrecognized format (no "type" field, no "component" key, not array). Keys: ${Object.keys(envelope).join(', ')}`,
      );
      compact = null;
    }
  }

  if (!compact) return null;

  const sanitizedCompact = sanitizeSectionCompactTree(compact, section, searchedImages, extractedIcons);
  if (!sanitizedCompact) {
    console.warn(
      `[pipeline] section ${section.id} (${section.region}): sanitized compact tree became null`,
    );
    return null;
  }

  const expanded = expandToFull(sanitizedCompact, tokens, extractedIcons);
  if (!expanded) {
    console.warn(
      `[pipeline] section ${section.id} (${section.region}): expandToFull returned null (invalid type or exceeded MAX_NODES). compact.type=${sanitizedCompact.type}`,
    );
  }
  return expanded;
}

// ── 管线主入口 ───────────────────────────────────────────────────────

export interface PipelineResult {
  ok: true;
  components: ExpandedEmailComponent[];
  canvasConfig: ExpandedCanvasConfig;
  designTokens: ResolvedTokens;
  /** 供验证管线使用的中间数据 */
  sections: GroundingSection[];
  extractedTexts: ExtractedRegionText[];
  extractedIcons: ExtractedIcon[];
  searchedImages: SearchedImage[];
}

export interface PipelineError {
  ok: false;
  error: string;
}

const DEFAULT_SECTIONS: GroundingSection[] = [
  { id: 's1', region: '整体', components: '完整邮件' },
];

function logStep(
  step: PipelineStepName,
  detail: Record<string, unknown>,
  meta: PipelineLogMeta | undefined,
) {
  logLlmFlowEvent({
    event: 'pipeline.step.completed',
    context: {
      reactRound: meta?.reactTurn ?? 0,
      isUserMessage: false,
      conversationId: meta?.conversationId,
      assistantMessageId: meta?.assistantMessageId,
      runId: meta?.runId,
    },
    detail: { step, ...detail },
  });
}

export async function runImageToTemplatePipeline(
  imageDataUrls: string[],
  callbacks: PipelineCallbacks,
  meta?: PipelineLogMeta,
  signal?: AbortSignal,
): Promise<PipelineResult | PipelineError> {
  try {
    if (imageDataUrls.length === 0) {
      return { ok: false, error: '未提供设计图' };
    }
    logLlmFlowEvent({
      event: 'pipeline.run.started',
      context: {
        reactRound: meta?.reactTurn ?? 0,
        isUserMessage: false,
        conversationId: meta?.conversationId,
        assistantMessageId: meta?.assistantMessageId,
        runId: meta?.runId,
      },
      detail: { imageCount: imageDataUrls.length },
    });

    // Step 1: Grounding
    callbacks.onStepStart('grounding');
    const sections = await runStepWithRetry(
      () => runGrounding(imageDataUrls, meta, signal),
      DEFAULT_SECTIONS,
    );
    callbacks.onStepComplete('grounding');
    callbacks.onStepResult?.('grounding', formatStepResultForDisplay('grounding', JSON.stringify(sections)));
    console.log(`[pipeline] grounding: ${sections.length} sections`);
    logStep('grounding', { sections: sections.length }, meta);

    // Steps 2 / 2.5 / 2.6 / 2.7：并行执行（全部仅依赖 sections，彼此无依赖）
    const defaultTokens = resolveDesignTokens({
      colorPreset: 'corporate-blue',
      spacingPreset: 'standard',
      typographyPreset: 'standard',
    });
    // 步骤展示顺序：分析设计图区域(已完) → 搜索配图 → 提取设计风格 → 提取图标 → 提取文案（按此顺序通知前端）
    callbacks.onStepStart('image_search');
    callbacks.onStepStart('tokens');
    callbacks.onStepStart('icon_extraction');
    callbacks.onStepStart('text_extraction');

    const [tokens, extractedIcons, extractedTexts, searchedImages] = await Promise.all([

      // Step 2: Token 提取
      runStepWithRetry(
        () => runTokenExtraction(imageDataUrls, sections, meta, signal),
        defaultTokens,
      ).then((result) => {
        callbacks.onStepComplete('tokens');
        callbacks.onStepResult?.('tokens', formatStepResultForDisplay('tokens', JSON.stringify(result)));
        console.log('[pipeline] tokens resolved');
        logStep('tokens', {}, meta);
        return result;
      }),

      // Step 2.5: Icon Extraction
      runIconExtraction(imageDataUrls, sections, meta, signal)
        .catch((err) => {
          console.warn('[pipeline] icon extraction failed, continuing without icons:', err);
          return [] as ExtractedIcon[];
        })
        .then((result) => {
          callbacks.onStepComplete('icon_extraction');
          callbacks.onStepResult?.(
            'icon_extraction',
            result.length > 0
              ? formatStepResultForDisplay('icon_extraction', JSON.stringify(result))
              : '（未提取到图标）',
          );
          console.log(`[pipeline] icon extraction: ${result.length} icons`);
          logStep('icon_extraction', { iconCount: result.length }, meta);
          return result;
        }),

      // Step 2.6: Text Extraction
      runTextExtraction(imageDataUrls, sections, meta, signal)
        .catch((err) => {
          console.warn('[pipeline] text extraction failed, continuing without texts:', err);
          return [] as ExtractedRegionText[];
        })
        .then((result) => {
          callbacks.onStepComplete('text_extraction');
          callbacks.onStepResult?.(
            'text_extraction',
            result.length > 0
              ? formatStepResultForDisplay('text_extraction', JSON.stringify(result))
              : '（未提取到文案）',
          );
          console.log(`[pipeline] text extraction: ${result.length} regions`);
          logStep('text_extraction', { regionCount: result.length }, meta);
          return result;
        }),

      // Step 2.7: Image Search（Pexels）
      runImageSearch(sections, signal)
        .catch((err) => {
          console.warn('[pipeline] image search failed, continuing without real images:', err);
          return [] as SearchedImage[];
        })
        .then((result) => {
          callbacks.onStepComplete('image_search');
          if (result.length > 0) {
            const imageList = result.map((img) => `  [${img.regionId}] ${img.query} → ${img.url}`).join('\n');
            callbacks.onStepResult?.('image_search', `已搜索到 ${result.length} 张图片：\n${imageList}`);
          } else {
            callbacks.onStepResult?.('image_search', '（未找到匹配的 Pexels 图片，图片 src 将留空，ReAct 阶段可用 searchPexelsImage 补充）');
          }
          console.log(`[pipeline] image search: ${result.length} images`);
          logStep('image_search', { imageCount: result.length }, meta);
          return result;
        }),
    ]);

    // Step 3: 并行分区结构生成（每个 section 独立 LLM call）
    logLlmFlowEvent({
      event: 'pipeline.step.started',
      context: {
        reactRound: meta?.reactTurn ?? 0,
        isUserMessage: false,
        conversationId: meta?.conversationId,
        assistantMessageId: meta?.assistantMessageId,
        runId: meta?.runId,
      },
      detail: { step: 'structure', sectionCount: sections.length },
    });

    // 同时触发所有区域的 started 事件
    sections.forEach((s) =>
      callbacks.onStepStart(`structure_${s.id}`, `生成区域：${s.region}`),
    );

    // 并行生成所有区域
    const sectionResults = await Promise.all(
      sections.map(async (section) => {
        const comp = await runStepWithRetry(
          () =>
            runSectionStructureGeneration(
              imageDataUrls,
              section,
              tokens,
              extractedIcons,
              extractedTexts,
              searchedImages,
              meta,
              signal,
            ),
          null,
          1,
        );
        const stepLabel = `生成区域：${section.region}`;
        callbacks.onStepComplete(`structure_${section.id}`, stepLabel);
        logLlmFlowEvent({
          event: 'pipeline.step.completed',
          context: {
            reactRound: meta?.reactTurn ?? 0,
            isUserMessage: false,
            conversationId: meta?.conversationId,
            assistantMessageId: meta?.assistantMessageId,
            runId: meta?.runId,
          },
          detail: { step: `structure_${section.id}`, sectionRegion: section.region, ok: comp !== null },
        });
        return comp;
      }),
    );

    // 任何区域失败则整体报错（与原有行为一致）
    if (sectionResults.some((r) => r === null)) {
      const failedSections = sections
        .filter((_, i) => sectionResults[i] === null)
        .map((s) => `${s.id}(${s.region})`)
        .join(', ');
      console.error(`[pipeline] structure generation failed for sections: ${failedSections}`);
      return { ok: false, error: '结构生成失败：部分区域生成失败（已重试）' };
    }

    console.log(`[pipeline] structure generated (${sections.length} sections in parallel)`);
    logStep('structure', { sectionCount: sections.length }, meta);

    const components = normalizeSpacing(sectionResults as ExpandedEmailComponent[]);

    // canvas config 直接由 tokens 推导，无需额外 LLM call
    const canvas = buildCanvasConfig(undefined, tokens);

    const output: PipelineResult = {
      ok: true,
      components,
      canvasConfig: canvas,
      designTokens: tokens,
      sections,
      extractedTexts,
      extractedIcons,
      searchedImages,
    };
    logLlmFlowEvent({
      event: 'pipeline.run.completed',
      context: {
        reactRound: meta?.reactTurn ?? 0,
        isUserMessage: false,
        conversationId: meta?.conversationId,
        assistantMessageId: meta?.assistantMessageId,
        runId: meta?.runId,
      },
      detail: {
        componentCount: components.length,
        iconCount: extractedIcons.length,
        textRegionCount: extractedTexts.length,
      },
    });
    return output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误';
    console.error('[pipeline] fatal error:', err);
    logLlmFlowEvent({
      event: 'pipeline.run.failed',
      context: {
        reactRound: meta?.reactTurn ?? 0,
        isUserMessage: false,
        conversationId: meta?.conversationId,
        assistantMessageId: meta?.assistantMessageId,
        runId: meta?.runId,
      },
      detail: { message: msg },
    });
    return { ok: false, error: `管线执行失败：${msg}` };
  }
}
