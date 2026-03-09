/**
 * 組件參數規範（與前端 src/constants/componentSpec.ts 對齊）
 * 供 GET /api/component-spec 返回。
 */

const WRAPPER_STYLE_NOTE =
  '所有組件共用 wrapperStyle：widthMode, heightMode, fixedWidth?, fixedHeight?, lockAspectRatio?, backgroundType, backgroundColor, backgroundImage?, padding, margin, border, borderRadius, contentAlign（widthMode/heightMode 各為 fill|fitContent|fixed）';

export const COMPONENT_SPEC = [
  { type: 'layout', props: [{ key: 'gap' }, { key: 'direction' }], wrapperStyleNote: WRAPPER_STYLE_NOTE },
  { type: 'grid', props: [{ key: 'columnsPerRow' }, { key: 'slots' }, { key: 'gap' }], wrapperStyleNote: WRAPPER_STYLE_NOTE },
  { type: 'text', props: [{ key: 'content' }, { key: 'fontMode' }, { key: 'fontFamily' }, { key: 'fontSize' }, { key: 'lineHeight' }], wrapperStyleNote: WRAPPER_STYLE_NOTE },
  { type: 'image', props: [{ key: 'src' }, { key: 'alt' }, { key: 'link' }, { key: 'sizeConfig' }, { key: 'borderRadius' }, { key: 'layoutMode' }, { key: 'layoutContentAlign' }, { key: 'layoutPadding' }], wrapperStyleNote: WRAPPER_STYLE_NOTE },
  { type: 'divider', props: [{ key: 'dividerStyle' }, { key: 'color' }, { key: 'height' }, { key: 'width' }], wrapperStyleNote: WRAPPER_STYLE_NOTE },
  { type: 'button', props: [{ key: 'text' }, { key: 'buttonStyle' }, { key: 'backgroundColor' }, { key: 'textColor' }, { key: 'borderColor' }, { key: 'fontSize' }, { key: 'fontWeight' }, { key: 'fontStyle' }, { key: 'textDecoration' }, { key: 'fontMode' }, { key: 'fontFamily' }, { key: 'borderRadius' }, { key: 'padding' }, { key: 'widthMode' }, { key: 'fixedWidth' }, { key: 'link' }], wrapperStyleNote: WRAPPER_STYLE_NOTE },
  { type: 'icon', props: [{ key: 'iconType' }, { key: 'sizeMode' }, { key: 'size' }, { key: 'color' }, { key: 'link' }, { key: 'customSrc' }], wrapperStyleNote: WRAPPER_STYLE_NOTE },
] as const;

export function getSpecByType(type: string): (typeof COMPONENT_SPEC)[number] | undefined {
  return COMPONENT_SPEC.find((s) => s.type === type);
}
