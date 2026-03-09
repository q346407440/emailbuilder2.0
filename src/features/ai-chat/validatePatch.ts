/**
 * 在将 LLM 生成的 patch 应用到画布之前，对其进行校验。
 *
 * 校验分两类行为：
 * - Hard error：字段类型/枚举值明显错误 → 整个 patch 拒绝应用，返回错误列表
 * - Strip：编辑器不支持的 CSS 属性（margin、position 等）→ 静默移除，patch 仍可应用
 */

export interface PatchValidationResult {
  /** 是否通过校验（有 hard error 时为 false） */
  valid: boolean;
  /** hard error 列表（导致 patch 拒绝应用） */
  errors: string[];
  /** 被静默移除的字段名列表（不阻断应用） */
  strippedFields: string[];
  /** 去除禁止字段后的干净 patch（仅在 valid=true 时才应使用） */
  cleanedPatch: Record<string, unknown>;
}

const VALID_SIZE_MODES = new Set(['fitContent', 'fill', 'fixed']);

/**
 * 编辑器不支持、LLM 容易写错的 wrapperStyle 字段。
 * 遇到这些字段时静默移除（strip），不阻断整个 patch。
 */
const FORBIDDEN_WRAPPER_FIELDS = new Set([
  'margin',
  'position',
  'transform',
  'translateY',
  'zIndex',
  'top',
  'left',
  'right',
  'bottom',
  'display',
  'overflow',
  'flexDirection',
  'flexWrap',
  'alignItems',
  'justifyContent',
  'textAlign',
  'letterSpacing',
  'textTransform',
]);

/** 校验 wrapperStyle patch */
export function validateWrapperStylePatch(patch: Record<string, unknown>): PatchValidationResult {
  const errors: string[] = [];
  const strippedFields: string[] = [];
  const cleanedPatch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_WRAPPER_FIELDS.has(key)) {
      strippedFields.push(key);
      continue;
    }

    if (key === 'widthMode') {
      if (typeof value !== 'string' || !VALID_SIZE_MODES.has(value)) {
        errors.push(`wrapperStyle.widthMode 值 "${value}" 无效，必须是 "fitContent" | "fill" | "fixed"`);
        continue;
      }
    }

    if (key === 'heightMode') {
      if (typeof value !== 'string' || !VALID_SIZE_MODES.has(value)) {
        errors.push(`wrapperStyle.heightMode 值 "${value}" 无效，必须是 "fitContent" | "fill" | "fixed"`);
        continue;
      }
    }

    if (key === 'contentAlign' && value !== null && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.horizontal !== 'string' || typeof obj.vertical !== 'string') {
        errors.push(
          `wrapperStyle.contentAlign 格式错误，必须是 { horizontal: "left"|"center"|"right", vertical: "top"|"center"|"bottom" }`
        );
        continue;
      }
    }

    cleanedPatch[key] = value;
  }

  return { valid: errors.length === 0, errors, strippedFields, cleanedPatch };
}

const VALID_LAYOUT_CONTENT_ALIGNS = new Set(['left', 'center', 'right']);
const VALID_IMAGE_SIZE_MODES = new Set(['auto', 'fill', 'fixed']);

/** 校验组件 props patch（根据组件类型做针对性校验） */
export function validatePropsPatch(
  componentType: string,
  patch: Record<string, unknown>
): PatchValidationResult {
  const errors: string[] = [];
  const strippedFields: string[] = [];
  const cleanedPatch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (componentType === 'image') {
      if (key === 'layoutContentAlign') {
        if (typeof value === 'string') {
          if (!VALID_LAYOUT_CONTENT_ALIGNS.has(value)) {
            errors.push(
              `props.layoutContentAlign 值 "${value}" 无效，必须是字符串 "left" | "center" | "right"`
            );
            continue;
          }
        } else if (value !== null && typeof value === 'object') {
          const obj = value as Record<string, unknown>;
          const hasCharIndices = Object.keys(obj).some((k) => /^\d+$/.test(k));
          if (hasCharIndices) {
            // LLM 将字符串 "right" 拆分成了 {0:"r",1:"i",...} 的对象
            errors.push(
              `props.layoutContentAlign 格式错误：不能是字符串分解后的对象，必须是 "left" | "center" | "right" 字符串`
            );
            continue;
          }
          // 合法的 {horizontal, vertical} 对象结构也允许
          if (typeof obj.horizontal !== 'string' || typeof obj.vertical !== 'string') {
            errors.push(
              `props.layoutContentAlign 对象格式错误，必须有 horizontal 和 vertical 字符串字段`
            );
            continue;
          }
        }
      }

      if (key === 'layoutPadding' && value !== null && typeof value === 'object') {
        errors.push(`props.layoutPadding 必须是字符串（如 "16px" 或 "24px 32px"），不能是对象`);
        continue;
      }

      if (key === 'sizeConfig' && value !== null && typeof value === 'object') {
        const sc = value as Record<string, unknown>;
        if (sc.mode !== undefined && !VALID_IMAGE_SIZE_MODES.has(sc.mode as string)) {
          errors.push(
            `props.sizeConfig.mode 值 "${sc.mode}" 无效，必须是 "auto" | "fill" | "fixed"`
          );
          continue;
        }
      }
    }

    if (componentType === 'button') {
      if (key === 'widthMode') {
        if (typeof value !== 'string' || !VALID_SIZE_MODES.has(value)) {
          errors.push(
            `props.widthMode（button）值 "${value}" 无效，必须是 "fitContent" | "fill" | "fixed"`
          );
          continue;
        }
      }
    }

    cleanedPatch[key] = value;
  }

  return { valid: errors.length === 0, errors, strippedFields, cleanedPatch };
}
