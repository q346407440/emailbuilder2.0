/**
 * Token 解析：预设 + overrides 合并、$ 引用替换。
 */

import type {
  LlmTokenOutput,
  ResolvedTokens,
  ColorTokens,
  ColorPresetName,
  SpacingPresetName,
  TypographyPresetName,
} from './types.js';
import {
  COLOR_PRESETS,
  SPACING_PRESETS,
  TYPOGRAPHY_PRESETS,
} from './presets.js';

// ── 色值校验 ─────────────────────────────────────────────────────────

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA_RE = /^rgba?\(\s*\d+/;

export function isValidColor(str: unknown): str is string {
  if (typeof str !== 'string') return false;
  return HEX_RE.test(str) || RGBA_RE.test(str);
}

// ── 预设 + overrides → ResolvedTokens ────────────────────────────────

export function resolveDesignTokens(llmOutput: LlmTokenOutput): ResolvedTokens {
  const baseColors =
    COLOR_PRESETS[llmOutput.colorPreset as ColorPresetName] ??
    COLOR_PRESETS['corporate-blue'];

  const spacing =
    SPACING_PRESETS[llmOutput.spacingPreset as SpacingPresetName] ??
    SPACING_PRESETS['standard'];

  const typography =
    TYPOGRAPHY_PRESETS[llmOutput.typographyPreset as TypographyPresetName] ??
    TYPOGRAPHY_PRESETS['standard'];

  const colors: ColorTokens = { ...baseColors };
  if (llmOutput.colorOverrides) {
    for (const [key, value] of Object.entries(llmOutput.colorOverrides)) {
      if (key in colors && isValidColor(value)) {
        (colors as unknown as Record<string, string>)[key] = value;
      }
    }
  }

  const canvasBg = isValidColor(llmOutput.canvasBg) ? llmOutput.canvasBg : '#F5F7FA';
  const contentBg = isValidColor(llmOutput.contentBg) ? llmOutput.contentBg : '#FFFFFF';

  return { colors, spacing, typography, canvasBg, contentBg };
}

// ── $ 引用解析 ───────────────────────────────────────────────────────

function resolveTokenPath(
  path: string,
  tokens: ResolvedTokens
): unknown {
  const parts = path.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = tokens;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * 递归遍历对象，将以 `$` 开头的字符串值替换为对应的 Token 值。
 * `$typo.xxx` 引用不在此函数处理——留给 expandToFull 展开。
 */
export function resolveTokenRefs(
  obj: Record<string, unknown>,
  tokens: ResolvedTokens
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      if (key === '$typo') {
        result[key] = value;
        continue;
      }
      const resolved = resolveTokenPath(value.slice(1), tokens);
      result[key] = resolved !== undefined ? resolved : value;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? resolveTokenRefs(item as Record<string, unknown>, tokens)
          : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = resolveTokenRefs(value as Record<string, unknown>, tokens);
    } else {
      result[key] = value;
    }
  }

  return result;
}
