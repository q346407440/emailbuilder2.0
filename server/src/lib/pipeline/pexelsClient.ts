/**
 * Pexels 图片搜索客户端 + 本地图片库三级搜索入口。
 * 文档：https://www.pexels.com/api/documentation/#photos-search
 *
 * 搜索策略（searchWithCache）：
 *   1. Pexels API 优先：有结果则写入本地库（含关键词合并）+ 异步验证 → 返回 URL
 *   2. 本地库精确匹配：Pexels 无结果/额度耗尽时，按关键词查本地库
 *   3. 随机兜底：getRandomAvailableImage，避免图片空缺
 */

import {
  upsertImageLibraryEntry,
  findImageInLibrary,
  markImageStatus,
  getRandomAvailableImage,
} from '../../db/index.js';

export interface PexelsPhoto {
  id: number;
  /** 原图宽度（px） */
  width: number;
  /** 原图高度（px） */
  height: number;
  /** 图片描述 / alt text */
  alt: string;
  src: {
    /** 原图（超大） */
    original: string;
    /** 宽 940px */
    large: string;
    /** 宽 1280px */
    large2x: string;
    /** 宽 350px */
    medium: string;
    /** 宽 130px */
    small: string;
    /** 宽 800px，已裁剪 */
    landscape: string;
    /** 高 200px，已裁剪 */
    tiny: string;
  };
  photographer: string;
}

export interface PexelsSearchResult {
  photos: PexelsPhoto[];
  total_results: number;
}

/**
 * 根据关键词搜索 Pexels 图片，返回最多 perPage 张。
 */
export async function searchPexels(
  query: string,
  options: {
    perPage?: number;
    orientation?: 'landscape' | 'portrait' | 'square';
  } = {},
): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn('[pexels] PEXELS_API_KEY not set, skipping search');
    return [];
  }

  const { perPage = 3, orientation } = options;
  const params = new URLSearchParams({
    query,
    per_page: String(perPage),
    ...(orientation ? { orientation } : {}),
  });

  try {
    const res = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[pexels] search failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = (await res.json()) as PexelsSearchResult;
    return data.photos ?? [];
  } catch (err) {
    console.warn('[pexels] search error:', err);
    return [];
  }
}

/**
 * 根据目标尺寸从 Pexels 图片源中挑选最合适的 src URL。
 * 偏好与目标宽度接近的档位，避免浪费带宽。
 */
export function pickPexelsSrc(
  photo: PexelsPhoto,
  targetWidth: number,
): string {
  if (targetWidth >= 1200) return photo.src.large2x;
  if (targetWidth >= 600) return photo.src.large;
  if (targetWidth >= 350) return photo.src.medium;
  return photo.src.small;
}

/**
 * 一步搜索并返回最佳匹配图片的 URL（空结果时返回 undefined）。
 */
export async function searchPexelsBest(
  query: string,
  targetWidth: number,
  orientation?: 'landscape' | 'portrait' | 'square',
): Promise<{ url: string; alt: string; photographer: string } | undefined> {
  const photos = await searchPexels(query, { perPage: 1, orientation });
  if (photos.length === 0) return undefined;
  const photo = photos[0];
  return {
    url: pickPexelsSrc(photo, targetWidth),
    alt: photo.alt || query,
    photographer: photo.photographer,
  };
}

// ── 本地库 + Pexels 三级搜索入口 ─────────────────────────────────────

/**
 * 将搜索 query 拆分为小写关键词数组（按空格/连字符分词，去重）。
 */
export function parseKeywords(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[\s\-_,]+/).filter((w) => w.length > 1))];
}

/**
 * 推断图片方向（landscape / portrait / square）。
 */
function inferOrientation(width: number, height: number): 'landscape' | 'portrait' | 'square' {
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

/**
 * 异步验证图片 URL 可访问性，并更新数据库状态。
 * 不阻塞调用方（fire-and-forget）。
 */
async function verifyAndMarkImage(dbId: number, url: string): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10_000),
    });
    await markImageStatus(dbId, res.ok ? 'available' : 'unavailable');
  } catch {
    await markImageStatus(dbId, 'unavailable').catch(() => {/* ignore */});
  }
}

export interface ImageSearchResult {
  url: string;
  alt: string;
  photographer?: string;
  fromCache?: boolean;
}

/**
 * 三级图片搜索主入口，供 pipeline 和 ReAct searchPexelsImage 工具共用。
 *
 * 策略：
 *   1. Pexels API 优先：有结果则写入本地库（含关键词合并）+ 异步验证 → 返回 URL
 *   2. 本地库精确匹配兜底：Pexels 无结果或报错时，查本地库（关键词交集）
 *   3. 随机兜底：本地库也查不到，随机取一张可用图
 *
 * 设计目标：优先消耗 Pexels 配额以持续积累本地库；
 * 只有 Pexels 额度耗尽 / 返回空结果时，才依赖本地库。
 */
export async function searchWithCache(
  query: string,
  targetWidth: number,
  orientation?: 'landscape' | 'portrait' | 'square',
): Promise<ImageSearchResult | undefined> {
  const keywords = parseKeywords(query);

  // Step 1：Pexels API 优先
  const photos = await searchPexels(query, { perPage: 3, orientation });
  if (photos.length > 0) {
    const photo = photos[0];
    const url = pickPexelsSrc(photo, targetWidth);
    const photoOrientation = inferOrientation(photo.width, photo.height);

    // 写入本地库（含关键词合并），然后异步验证
    try {
      const dbId = await upsertImageLibraryEntry(
        {
          pexels_photo_id: photo.id,
          url,
          alt: photo.alt || query,
          photographer: photo.photographer,
          orientation: photoOrientation,
        },
        keywords,
      );
      // fire-and-forget，不阻塞返回
      verifyAndMarkImage(dbId, url).catch((e) => console.warn('[pexels] verify error:', e));
    } catch (err) {
      console.warn('[pexels] upsert to local library failed:', err);
    }

    return { url, alt: photo.alt || query, photographer: photo.photographer };
  }

  // Step 2：本地库精确匹配（Pexels 无结果 / 额度耗尽时的第一道兜底）
  console.warn(`[pexels] API returned no results for "${query}", falling back to local library`);
  try {
    const cached = await findImageInLibrary(keywords, orientation);
    if (cached) {
      console.log(`[pexels] local library hit for "${query}" → ${cached.url}`);
      return { url: cached.url, alt: cached.alt, photographer: cached.photographer, fromCache: true };
    }
  } catch (err) {
    console.warn('[pexels] local library search failed:', err);
  }

  // Step 3：随机兜底
  console.warn(`[pexels] local library also missed for "${query}", falling back to random image`);
  try {
    const fallback = await getRandomAvailableImage(orientation);
    if (fallback) {
      console.log(`[pexels] fallback random image → ${fallback.url}`);
      return { url: fallback.url, alt: fallback.alt, photographer: fallback.photographer, fromCache: true };
    }
  } catch (err) {
    console.warn('[pexels] random fallback failed:', err);
  }

  return undefined;
}
