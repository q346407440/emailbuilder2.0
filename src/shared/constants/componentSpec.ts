/**
 * 组件参数规范（可被 API / MCP get_component_spec 返回）
 *
 * 供未来 LLM Agent 查询「各 type 可修改的 props / wrapperStyle 字段」，
 * 与 base-component-spec 对齐，避免重复维护。
 */

export type EmailComponentType =
  | 'layout'
  | 'grid'
  | 'text'
  | 'image'
  | 'divider'
  | 'button'
  | 'icon';

export interface PropFieldSpec {
  key: string;
  description: string;
  example?: string;
}

export interface ComponentTypeSpec {
  type: EmailComponentType;
  props: PropFieldSpec[];
  /** 所有类型共用的 wrapperStyle 字段（仅列名称与说明） */
  wrapperStyleNote: string;
}

const WRAPPER_STYLE_NOTE =
  '所有组件共用 wrapperStyle：widthMode, heightMode, fixedWidth?, fixedHeight?, lockAspectRatio?, backgroundType, backgroundColor, backgroundImage?, padding, margin, border, borderRadius, contentAlign（widthMode/heightMode 各为 fill|fitContent|fixed，类 Figma）';

export const COMPONENT_SPEC: ComponentTypeSpec[] = [
  {
    type: 'layout',
    props: [
      { key: 'gap', description: '子组件间距（带 px）', example: '"12px"' },
      { key: 'direction', description: '排列方向', example: '"horizontal" | "vertical"' },
      { key: 'distribution', description: '主轴分布：packed 使用 gap | spaceBetween 均分（Auto）', example: '"packed" | "spaceBetween"' },
    ],
    wrapperStyleNote: WRAPPER_STYLE_NOTE,
  },
  {
    type: 'grid',
    props: [
      { key: 'columnsPerRow', description: '每行几栏（1-6）', example: '2' },
      { key: 'slots', description: '总插槽数量', example: '4' },
      { key: 'gap', description: '单元格间距', example: '"10px"' },
    ],
    wrapperStyleNote: WRAPPER_STYLE_NOTE,
  },
  {
    type: 'text',
    props: [
      { key: 'content', description: '富文本 HTML', example: '"<p>正文</p>"' },
      { key: 'fontMode', description: '字体模式：inherit 继承画布 | custom 自定义', example: '"inherit"' },
      { key: 'fontFamily', description: '自定义字体（fontMode=custom 时生效）', example: '"\'Source Sans 3\', sans-serif"' },
      { key: 'fontSize', description: '默认字号（整个文本块的 font-size 基准，工具栏可对选区单独覆盖）', example: '"14px"' },
      { key: 'lineHeight', description: '行高（如 "1.5"），未设置时继承画布行高', example: '"1.5"' },
    ],
    wrapperStyleNote: WRAPPER_STYLE_NOTE,
  },
  {
    type: 'image',
    props: [
      { key: 'src', description: '图片 URL', example: '""' },
      { key: 'alt', description: '替代文字', example: '"图片"' },
      { key: 'link', description: '点击跳转地址', example: '""' },
      {
        key: 'sizeConfig',
        description: '尺寸配置：mode=original|fill|fixed；fixed 时 width/height；original 时 maxWidth/maxHeight',
        example: '{ "mode": "original", "maxWidth": "600" }',
      },
      { key: 'borderRadius', description: '图片自身圆角（BorderRadiusConfig）', example: '{ "mode": "unified", "unified": "0" }' },
      { key: 'layoutMode', description: 'true 时图片可作容器有 children', example: 'false' },
      { key: 'layoutContentAlign', description: '布局模式下叠加层内子内容对齐（horizontal+vertical）', example: '{ "horizontal": "left", "vertical": "top" }' },
      { key: 'layoutPadding', description: '布局模式下叠加层内边距（仅 layoutMode=true）', example: '{ "mode": "unified", "unified": "0" }' },
    ],
    wrapperStyleNote: WRAPPER_STYLE_NOTE,
  },
  {
    type: 'divider',
    props: [
      { key: 'dividerStyle', description: 'line 分割线 | block 色块', example: '"line"' },
      { key: 'color', description: '颜色', example: '"#E0E5EB"' },
      { key: 'height', description: '高度（带 px）', example: '"1px"' },
      { key: 'width', description: '宽度（% 或 px）', example: '"100%"' },
    ],
    wrapperStyleNote: WRAPPER_STYLE_NOTE,
  },
  {
    type: 'button',
    props: [
      { key: 'text', description: '按钮文字（纯文本）', example: '"按钮"' },
      { key: 'buttonStyle', description: 'solid 实心 | outlined 描边', example: '"solid"' },
      { key: 'backgroundColor', description: '背景色', example: '"#1976D2"' },
      { key: 'textColor', description: '文字色', example: '"#FFFFFF"' },
      { key: 'borderColor', description: '边框色', example: '"#1976D2"' },
      { key: 'fontSize', description: '字号', example: '"16px"' },
      { key: 'fontWeight', description: '字重：400 正常 | 600 半粗 | 700 粗体', example: '"600"' },
      { key: 'fontStyle', description: '字形：normal | italic', example: '"normal"' },
      { key: 'textDecoration', description: '文字装饰：none | underline | line-through', example: '"none"' },
      { key: 'fontMode', description: '字体模式：inherit 继承画布 | custom 自定义', example: '"inherit"' },
      { key: 'fontFamily', description: '自定义字体（fontMode=custom 时生效）', example: "\"'Source Sans 3', sans-serif\"" },
      { key: 'borderRadius', description: '圆角（简单字符串）', example: '"4px"' },
      { key: 'padding', description: '内边距 SpacingConfig', example: '{ "mode": "separate", "top": "12px", "right": "28px", "bottom": "12px", "left": "28px" }' },
      { key: 'link', description: '跳转链接', example: '""' },
    ],
    wrapperStyleNote: WRAPPER_STYLE_NOTE,
  },
  {
    type: 'icon',
    props: [
      { key: 'iconType', description: '系统图标或 custom', example: '"mail" | "phone" | "location" | "link" | "star" | "heart" | "check" | "arrow-right" | "custom"' },
      { key: 'sizeMode', description: '尺寸限制：width 限制寬 | height 限制高', example: '"height"' },
      { key: 'size', description: '尺寸數值（數字字串，非 px）', example: '"32"' },
      { key: 'color', description: '图标颜色', example: '"#1976D2"' },
      { key: 'link', description: '点击跳转', example: '""' },
      { key: 'customSrc', description: '仅 iconType=custom 时：Data URL 或 SVG URL', example: 'undefined' },
    ],
    wrapperStyleNote: WRAPPER_STYLE_NOTE,
  },
];

/** 依 type 查詢規範（供 API 返回） */
export function getSpecByType(type: EmailComponentType): ComponentTypeSpec | undefined {
  return COMPONENT_SPEC.find((s) => s.type === type);
}
