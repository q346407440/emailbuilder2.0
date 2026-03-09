import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  EmailComponent,
  WrapperStyle,
  ContentAlignConfig,
  BorderRadiusConfig,
  SpacingConfig,
  LayoutProps,
  TextProps,
  ImageProps,
  ButtonProps,
  IconProps,
  TemplateConfig,
  DragOverInfo,
  TreeDragOverInfo,
  EmailComponentType,
  ComponentRules,
  RenderingRules,
} from '@shared/types/email';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';
import { isImageProps } from '@shared/types/email';
import { deepCloneWithNewIds, deepCloneWithMapping } from '@shared/utils/cloneComponent';
import type { CompositeComponent } from '@shared/types/composite';
import { normalizeBusinessForm } from '@shared/utils/businessForm';
import { defaultEmailTemplateConfig } from '@shared/constants/templates/defaultTemplate';
import {
  getDefaultTemplateConfig,
  getDefaultWrapperStyle,
  getDefaultLayoutProps,
  getDefaultGridProps,
  getDefaultTextProps,
  getDefaultImageProps,
  getDefaultDividerProps,
  getDefaultButtonProps,
  getDefaultIconProps,
  DEFAULT_CONTENT_ALIGN,
} from '@shared/constants/emailDefaults';
import { DEFAULT_TEXT_FONT_FAMILY } from '@shared/constants/fontOptions';
import { buildDefaultPreviewData } from '@shared/constants/variableSchema';

type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

/** 画布 contentAlign 迁移时的 fallback（与默认一致） */
const CANVAS_CONTENT_ALIGN: ContentAlignConfig = { ...DEFAULT_CONTENT_ALIGN };

const HORIZONTAL_ALIGN_VALUES: ContentAlignConfig['horizontal'][] = ['left', 'center', 'right'];
const VERTICAL_ALIGN_VALUES: ContentAlignConfig['vertical'][] = ['top', 'center', 'bottom'];

function normalizeContentAlign(raw: unknown, fallback: ContentAlignConfig): ContentAlignConfig {
  const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const horizontalRaw = obj.horizontal;
  const verticalRaw = obj.vertical;

  const horizontal = HORIZONTAL_ALIGN_VALUES.includes(horizontalRaw as ContentAlignConfig['horizontal'])
    ? (horizontalRaw as ContentAlignConfig['horizontal'])
    : fallback.horizontal;
  const vertical = VERTICAL_ALIGN_VALUES.includes(verticalRaw as ContentAlignConfig['vertical'])
    ? (verticalRaw as ContentAlignConfig['vertical'])
    : fallback.vertical;

  return { horizontal, vertical };
}

/** 画布配置迁移：补齐 contentAlign / outerBackgroundColor / contentDistribution / contentGap */
export function migrateTemplateConfig(
  config: Omit<TemplateConfig, 'contentAlign' | 'outerBackgroundColor'> & {
    contentAlign?: ContentAlignConfig;
    outerBackgroundColor?: string;
  }
): TemplateConfig {
  const raw = config as unknown as Record<string, unknown>;
  const defaults = getDefaultTemplateConfig();
  return {
    ...defaults,
    ...config,
    width: (typeof raw.width === 'string' && raw.width) || (typeof raw.contentWidth === 'string' && raw.contentWidth as string) || defaults.width,
    outerBackgroundColor: config.outerBackgroundColor || defaults.outerBackgroundColor,
    contentAlign: normalizeContentAlign(config.contentAlign, CANVAS_CONTENT_ALIGN),
    contentDistribution: raw.contentDistribution === 'spaceBetween' ? 'spaceBetween' : defaults.contentDistribution,
    contentGap: typeof raw.contentGap === 'string' && raw.contentGap.trim() ? raw.contentGap : defaults.contentGap,
  };
}

function migrateWrapperStyle(ws: WrapperStyle | Record<string, unknown> | null | undefined): WrapperStyle {
  const def = getDefaultWrapperStyle();
  if (ws == null) return { ...def };
  const base = ws as Record<string, unknown>;
  const sizeMode = base.sizeMode as 'auto' | 'fixed' | undefined;
  const oldWidthMode = base.widthMode as string | undefined;
  const oldHeightMode = base.heightMode as string | undefined;

  let widthMode: WrapperStyle['widthMode'];
  let heightMode: WrapperStyle['heightMode'];
  let fixedWidth: string | undefined;
  let fixedHeight: string | undefined;
  let lockAspectRatio: boolean | undefined;

  if (sizeMode === 'fixed') {
    widthMode = 'fixed';
    heightMode = 'fixed';
    fixedWidth = (base.fixedWidth as string) || '100px';
    fixedHeight = (base.fixedHeight as string) || '100px';
    lockAspectRatio = base.lockAspectRatio as boolean | undefined;
  } else {
    widthMode = (oldWidthMode === 'fitContent' ? 'fitContent' : 'fill') as WrapperStyle['widthMode'];
    heightMode = (oldHeightMode === 'fill' ? 'fill' : 'fitContent') as WrapperStyle['heightMode'];
  }

  const result: WrapperStyle = {
    widthMode,
    heightMode,
    contentAlign: normalizeContentAlign(base.contentAlign, DEFAULT_CONTENT_ALIGN),
    backgroundType: (base.backgroundType as WrapperStyle['backgroundType']) ?? 'color',
    backgroundColor: (base.backgroundColor as string) ?? def.backgroundColor,
    padding: (base.padding as WrapperStyle['padding']) ?? def.padding,
    margin: (base.margin as WrapperStyle['margin']) ?? def.margin,
    border: (base.border as WrapperStyle['border']) ?? def.border,
    borderRadius: (base.borderRadius as WrapperStyle['borderRadius']) ?? def.borderRadius,
  };
  if (fixedWidth != null) result.fixedWidth = fixedWidth;
  if (fixedHeight != null) result.fixedHeight = fixedHeight;
  if (lockAspectRatio != null) result.lockAspectRatio = lockAspectRatio;
  return result;
}

/** 将旧图片组件 props 迁移为新格式：移除 objectFit/width/height/heightBehavior/fixedHeight，仅保留 sizeConfig；确保 layoutMode */
function migrateImageProps(raw: Record<string, unknown>, fallbackAlign: ContentAlignConfig): ImageProps {
  const rawConfig = raw.sizeConfig as Record<string, unknown> | undefined;
  const mode = (rawConfig?.mode as ImageProps['sizeConfig']['mode']) || 'original';
  const width = (rawConfig?.width as string) ?? '300px';
  const height = (rawConfig?.height as string) ?? '200px';
  const sizeConfig: ImageProps['sizeConfig'] = {
    mode,
    width: mode === 'fixed' ? width : undefined,
    height: mode === 'fixed' ? height : undefined,
    lockAspectRatio: rawConfig?.lockAspectRatio as boolean | undefined,
    maxWidth: rawConfig?.maxWidth as string | undefined,
    maxHeight: rawConfig?.maxHeight as string | undefined,
  };
  const rawRadius = raw.borderRadius;
  let borderRadius: BorderRadiusConfig;
  if (typeof rawRadius === 'string') {
    borderRadius = { mode: 'unified', unified: rawRadius || '0' };
  } else if (rawRadius && typeof rawRadius === 'object' && 'mode' in rawRadius) {
    const r = rawRadius as BorderRadiusConfig;
    borderRadius =
      r.mode === 'unified'
        ? { mode: 'unified', unified: r.unified ?? '0' }
        : {
            mode: 'separate',
            topLeft: r.topLeft ?? '0',
            topRight: r.topRight ?? '0',
            bottomRight: r.bottomRight ?? '0',
            bottomLeft: r.bottomLeft ?? '0',
          };
  } else {
    borderRadius = { mode: 'unified', unified: '0' };
  }

  const rawLayoutPadding = raw.layoutPadding;
  let layoutPadding: ImageProps['layoutPadding'];
  if (rawLayoutPadding && typeof rawLayoutPadding === 'object' && 'mode' in rawLayoutPadding) {
    const p = rawLayoutPadding as ImageProps['layoutPadding'];
    layoutPadding =
      p.mode === 'unified'
        ? { mode: 'unified', unified: p.unified ?? '0' }
        : {
            mode: 'separate',
            top: p.top ?? '0',
            right: p.right ?? '0',
            bottom: p.bottom ?? '0',
            left: p.left ?? '0',
          };
  } else {
    layoutPadding = { mode: 'unified', unified: '0' };
  }

  return {
    src: (raw.src as string) ?? '',
    alt: (raw.alt as string) ?? '图片',
    link: (raw.link as string) ?? '',
    sizeConfig,
    borderRadius,
    layoutMode: (raw.layoutMode as boolean) ?? false,
    layoutContentAlign: normalizeContentAlign(raw.layoutContentAlign, fallbackAlign),
    layoutPadding,
  };
}

/** 将旧按钮 padding（string 如 "12px 28px"）迁移为 SpacingConfig */
function migrateButtonPadding(raw: unknown): SpacingConfig {
  // 已经是新格式
  if (raw && typeof raw === 'object' && 'mode' in raw) {
    const p = raw as SpacingConfig;
    return p.mode === 'unified'
      ? { mode: 'unified', unified: p.unified ?? '0' }
      : {
          mode: 'separate',
          top: p.top ?? '0',
          right: p.right ?? '0',
          bottom: p.bottom ?? '0',
          left: p.left ?? '0',
        };
  }
  // 旧格式：string
  if (typeof raw === 'string' && raw.trim()) {
    const parts = raw.trim().split(/\s+/);
    if (parts.length === 1) {
      return { mode: 'unified', unified: parts[0] };
    }
    if (parts.length === 2) {
      // CSS shorthand: "vertical horizontal"
      return { mode: 'separate', top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    }
    if (parts.length === 3) {
      // CSS shorthand: "top horizontal bottom"
      return { mode: 'separate', top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    }
    // 4 values: "top right bottom left"
    return { mode: 'separate', top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  }
  return { mode: 'separate', top: '12px', right: '28px', bottom: '12px', left: '28px' };
}

export function migrateComponent(c: EmailComponent): EmailComponent {
  // 防御：缺失 wrapperStyle 或 children 含空洞时仍可迁移（复合组件可能为旧资料）
  const next: EmailComponent = {
    ...c,
    wrapperStyle: migrateWrapperStyle(c.wrapperStyle),
    children: c.children?.filter((child): child is EmailComponent => child != null)?.map(migrateComponent),
  };
  if (c.type === 'image' && c.props && typeof c.props === 'object') {
    next.props = migrateImageProps(
      c.props as unknown as Record<string, unknown>,
      next.wrapperStyle.contentAlign,
    );
    // 若 layoutMode 为 true，确保 children 为数组（可能为空）
    const migratedImageProps = next.props as ImageProps;
    if (migratedImageProps.layoutMode) {
      next.children = next.children ?? [];
    } else {
      // layoutMode 为 false 时，清空 children（不保留旧数据）
      next.children = undefined;
    }
  }
  if (c.type === 'text' && c.props && typeof c.props === 'object') {
    const raw = c.props as unknown as Record<string, unknown>;
    const oldTextAlign = raw.textAlign as 'left' | 'center' | 'right' | undefined;
    if (oldTextAlign != null) {
      next.wrapperStyle = {
        ...next.wrapperStyle,
        contentAlign: { ...next.wrapperStyle.contentAlign, horizontal: oldTextAlign },
      };
    }
    // 新格式仅 content（HTML）、fontMode、fontFamily；旧键不读入（由迁移脚本提前转换）
    next.props = {
      content: typeof raw.content === 'string' ? raw.content : '',
      fontMode: (raw.fontMode as TextProps['fontMode']) === 'custom' ? 'custom' : 'inherit',
      fontFamily: typeof raw.fontFamily === 'string' && raw.fontFamily.trim()
        ? raw.fontFamily
        : DEFAULT_TEXT_FONT_FAMILY,
    } satisfies TextProps;
    next.wrapperStyle = {
      ...next.wrapperStyle,
      contentAlign: {
        ...next.wrapperStyle.contentAlign,
        vertical: next.wrapperStyle.contentAlign.vertical ?? 'center',
      },
    };
  }
  if (c.type === 'button' && c.props && typeof c.props === 'object') {
    const raw = c.props as unknown as Record<string, unknown>;
    const oldTextAlign = raw.textAlign as ContentAlignConfig['horizontal'] | undefined;
    if (oldTextAlign && HORIZONTAL_ALIGN_VALUES.includes(oldTextAlign)) {
      next.wrapperStyle = {
        ...next.wrapperStyle,
        contentAlign: { ...next.wrapperStyle.contentAlign, horizontal: oldTextAlign },
      };
    }
    next.props = {
      text: (raw.text as string) ?? '按钮',
      buttonStyle: (raw.buttonStyle as ButtonProps['buttonStyle']) ?? 'solid',
      backgroundColor: (raw.backgroundColor as string) ?? '#1976D2',
      textColor: (raw.textColor as string) ?? '#FFFFFF',
      borderColor: (raw.borderColor as string) ?? '#1976D2',
      fontSize: (raw.fontSize as string) ?? '16px',
      fontWeight: (raw.fontWeight as string) ?? '600',
      fontStyle: (raw.fontStyle as ButtonProps['fontStyle']) === 'italic' ? 'italic' : 'normal',
      textDecoration: (['underline', 'line-through'] as const).includes(raw.textDecoration as 'underline' | 'line-through')
        ? (raw.textDecoration as ButtonProps['textDecoration'])
        : 'none',
      fontMode: (raw.fontMode as ButtonProps['fontMode']) === 'custom' ? 'custom' : 'inherit',
      fontFamily: typeof raw.fontFamily === 'string' && raw.fontFamily.trim()
        ? raw.fontFamily
        : DEFAULT_TEXT_FONT_FAMILY,
      borderRadius: (raw.borderRadius as string) ?? '4px',
      padding: migrateButtonPadding(raw.padding),
      widthMode: (raw.widthMode as ButtonProps['widthMode']) === 'fill'
        ? 'fill'
        : (raw.widthMode as ButtonProps['widthMode']) === 'fixed'
          ? 'fixed'
          : 'fitContent',
      fixedWidth: typeof raw.fixedWidth === 'string' ? raw.fixedWidth : undefined,
      link: (raw.link as string) ?? '',
    } satisfies ButtonProps;
  }
  // layout 迁移：移除旧的 columns 字段（新格式不再定义插槽数，自由增长）
  if (c.type === 'layout' && c.props && typeof c.props === 'object') {
    const raw = c.props as unknown as Record<string, unknown>;
    const def = getDefaultLayoutProps();
    next.props = {
      gap: (raw.gap as string) ?? def.gap,
      direction: (raw.direction as LayoutProps['direction']) ?? def.direction,
      distribution: raw.distribution === 'spaceBetween' ? 'spaceBetween' : def.distribution,
    } satisfies LayoutProps;
  }
  if (c.type === 'icon' && c.props && typeof c.props === 'object') {
    const raw = c.props as unknown as Record<string, unknown>;
    const def = getDefaultIconProps();
    next.props = {
      iconType: (raw.iconType as IconProps['iconType']) ?? def.iconType,
      sizeMode: (raw.sizeMode as IconProps['sizeMode']) ?? def.sizeMode,
      // 旧资料曾用 32 作为缺省，保留以维持既有模板视觉一致；新建组件用 getDefaultIconProps().size（24）
      size: (raw.size as string) ?? '32',
      color: (raw.color as string) ?? def.color,
      link: (raw.link as string) ?? def.link,
      customSrc: raw.customSrc as string | undefined,
    } satisfies IconProps;
  }
  return next;
}

function createLayoutComponent(id: string): EmailComponent {
  const defWs = getDefaultWrapperStyle();
  return {
    id,
    type: 'layout',
    wrapperStyle: {
      ...defWs,
      padding: { mode: 'unified', unified: '16px' },
      contentAlign: { ...defWs.contentAlign, vertical: 'center' },
    },
    props: { ...getDefaultLayoutProps() },
    children: [],
  };
}

function createGridComponent(id: string): EmailComponent {
  const defWs = getDefaultWrapperStyle();
  return {
    id,
    type: 'grid',
    wrapperStyle: { ...defWs, padding: { mode: 'unified', unified: '16px' } },
    props: { ...getDefaultGridProps() },
    children: [],
  };
}

function createTextComponent(id: string): EmailComponent {
  const defWs = getDefaultWrapperStyle();
  return {
    id,
    type: 'text',
    wrapperStyle: migrateWrapperStyle({
      contentAlign: { horizontal: 'left', vertical: 'center' },
      backgroundType: 'color',
      backgroundColor: '#FFFFFF',
      padding: { mode: 'unified', unified: '0' },
      margin: { mode: 'unified', unified: '0' },
      border: { ...defWs.border },
      borderRadius: defWs.borderRadius,
    }),
    props: { ...getDefaultTextProps() },
  };
}

function createImageComponent(id: string): EmailComponent {
  const defWs = getDefaultWrapperStyle();
  return {
    id,
    type: 'image',
    wrapperStyle: { ...defWs, padding: { mode: 'unified', unified: '0' } },
    props: { ...getDefaultImageProps() },
  };
}

function createDividerComponent(id: string): EmailComponent {
  const defWs = getDefaultWrapperStyle();
  return {
    id,
    type: 'divider',
    wrapperStyle: migrateWrapperStyle({
      backgroundType: 'color',
      backgroundColor: defWs.backgroundColor,
      padding: { mode: 'separate', top: '10px', right: '0', bottom: '10px', left: '0' },
      margin: defWs.margin,
      border: { ...defWs.border },
      borderRadius: defWs.borderRadius,
    }),
    props: { ...getDefaultDividerProps() },
  };
}

function createButtonComponent(id: string): EmailComponent {
  const defWs = getDefaultWrapperStyle();
  return {
    id,
    type: 'button',
    wrapperStyle: migrateWrapperStyle({
      contentAlign: { ...DEFAULT_CONTENT_ALIGN },
      backgroundType: 'color',
      backgroundColor: defWs.backgroundColor,
      padding: defWs.padding,
      margin: defWs.margin,
      border: { ...defWs.border },
      borderRadius: defWs.borderRadius,
    }),
    props: { ...getDefaultButtonProps() },
  };
}

function createIconComponent(id: string): EmailComponent {
  const defWs = getDefaultWrapperStyle();
  return {
    id,
    type: 'icon',
    wrapperStyle: migrateWrapperStyle({
      widthMode: 'fitContent',
      heightMode: 'fitContent',
      contentAlign: { ...DEFAULT_CONTENT_ALIGN },
      backgroundType: 'color',
      backgroundColor: defWs.backgroundColor,
      padding: { mode: 'unified', unified: '0' },
      margin: defWs.margin,
      border: { ...defWs.border },
      borderRadius: defWs.borderRadius,
    }),
    props: { ...getDefaultIconProps() },
  };
}

// ---- tree helpers ----

function findInTree(
  id: string,
  list: EmailComponent[]
): EmailComponent | null {
  for (const comp of list) {
    if (comp.id === id) return comp;
    if (comp.children?.length) {
      const found = findInTree(id, comp.children);
      if (found) return found;
    }
  }
  return null;
}

function removeFromTree(id: string, list: EmailComponent[]): EmailComponent[] {
  return list
    .filter((c) => c.id !== id)
    .map((c) =>
      c.children
        ? { ...c, children: removeFromTree(id, c.children) }
        : c
    );
}

/** 判断组件是否为容器（可拥有子级）：layout、grid 或（image 且 layoutMode 开启） */
export function isContainerComponent(comp: EmailComponent): boolean {
  if (comp.type === 'layout' || comp.type === 'grid') {
    return true;
  }
  if (comp.type === 'image' && isImageProps(comp.props)) {
    return (comp.props as ImageProps).layoutMode === true;
  }
  return false;
}

function addToParent(
  list: EmailComponent[],
  parentId: string,
  newComp: EmailComponent
): EmailComponent[] {
  return list.map((c) => {
    if (c.id === parentId && isContainerComponent(c)) {
      return { ...c, children: [...(c.children ?? []), newComp] };
    }
    if (c.children) {
      return { ...c, children: addToParent(c.children, parentId, newComp) };
    }
    return c;
  });
}

/** Find all ancestor IDs for a given component id */
export function findAncestorIds(
  targetId: string,
  list: EmailComponent[],
  path: string[] = []
): string[] | null {
  for (const comp of list) {
    if (comp.id === targetId) return path;
    if (comp.children?.length) {
      const result = findAncestorIds(targetId, comp.children, [...path, comp.id]);
      if (result) return result;
    }
  }
  return null;
}

/**
 * 查找 targetId 组件的最近循环区块祖先。
 * 若某个祖先带有 loopBinding，返回那个祖先组件；否则返回 null。
 * （组件自身不算祖先）
 */
export function findNearestLoopAncestor(
  targetId: string,
  list: EmailComponent[]
): EmailComponent | null {
  function search(
    id: string,
    comps: EmailComponent[],
    ancestors: EmailComponent[]
  ): 'not_found' | EmailComponent | null {
    for (const comp of comps) {
      if (comp.id === id) {
        for (let i = ancestors.length - 1; i >= 0; i--) {
          if ((ancestors[i] as EmailComponentWithRules).loopBinding) return ancestors[i];
        }
        return null;
      }
      if (comp.children?.length) {
        const result = search(id, comp.children, [...ancestors, comp]);
        if (result !== 'not_found') return result;
      }
    }
    return 'not_found';
  }
  const result = search(targetId, list, []);
  return result === 'not_found' ? null : result;
}

/** Find the parent list and index for a given component id */
function findParentListAndIndex(
  id: string,
  list: EmailComponent[]
): { parentList: EmailComponent[]; index: number; parentId: string | null } | null {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return { parentList: list, index: i, parentId: null };
  }
  for (const comp of list) {
    if (comp.children?.length) {
      for (let i = 0; i < comp.children.length; i++) {
        if (comp.children[i].id === id) {
          return { parentList: comp.children, index: i, parentId: comp.id };
        }
      }
      const result = findParentListAndIndex(id, comp.children);
      if (result) return result;
    }
  }
  return null;
}

/** Insert a component relative to a target */
function insertRelative(
  list: EmailComponent[],
  targetId: string,
  newComp: EmailComponent,
  position: 'before' | 'after'
): EmailComponent[] {
  const result: EmailComponent[] = [];
  for (const c of list) {
    if (c.id === targetId) {
      if (position === 'before') {
        result.push(newComp, c);
      } else {
        result.push(c, newComp);
      }
    } else {
      if (c.children) {
        result.push({
          ...c,
          children: insertRelative(c.children, targetId, newComp, position),
        });
      } else {
        result.push(c);
      }
    }
  }
  return result;
}

/**
 * 查找某个组件所属的业务复合组件根节点 ID。
 * 如果组件本身就是业务复合根，返回其 ID；
 * 如果组件是业务复合根的后代，返回根的 ID；
 * 否则返回 null。
 */
function findBusinessCompositeRoot(
  targetId: string,
  list: EmailComponent[]
): string | null {
  for (const comp of list) {
    if (comp.compositeInstance?.mode === 'business') {
      // 如果目标就是此根节点
      if (comp.id === targetId) return comp.id;
      // 检查目标是否在此复合根的子树中
      if (comp.children && findInTree(targetId, comp.children)) {
        return comp.id;
      }
    } else {
      // 递归到非业务复合的容器子节点中继续查找
      if (comp.children) {
        const found = findBusinessCompositeRoot(targetId, comp.children);
        if (found) return found;
      }
    }
  }
  return null;
}

const factoryMap: Record<EmailComponentType, (id: string) => EmailComponent> = {
  layout: createLayoutComponent,
  grid: createGridComponent,
  text: createTextComponent,
  image: createImageComponent,
  divider: createDividerComponent,
  button: createButtonComponent,
  icon: createIconComponent,
};

const createComponentFactory = (type: EmailComponentType, preferredId?: string) => {
  const id = typeof preferredId === 'string' && preferredId.length > 0 ? preferredId : nanoid();
  const factory = factoryMap[type];
  return factory(id);
};

// ---- Store interface ----

interface EmailState {
  // existing
  components: EmailComponent[];
  selectedId: string | null;

  // new state
  activeLeftTab: 'template' | 'library' | 'email-templates' | 'my-composites' | 'my-templates';
  templateConfig: TemplateConfig;
  expandedTreeIds: string[];
  dragOverInfo: DragOverInfo | null;
  treeDragOverInfo: TreeDragOverInfo | null;
  isDragging: boolean;
  /**
   * 变量预览数据（key -> 预览值），画布渲染时用于解析 variableBindings 与 {{key}}。
   * 初始化时自动填入标准变量的 demo 默认值，用户可随时修改或清除。
   */
  previewData: Record<string, string>;
  /**
   * 画布变量显示模式：
   * - 'data'：用 previewData 替换变量，展示真实预览效果（默认）。
   * - 'variable'：不替换，{{key}} 保留为可视化 chip 标签，便于检查变量绑定位置。
   */
  canvasPreviewMode: 'data' | 'variable';
  /** 模板级自定义变量定义，随模板保存与载入 */
  customVariables: CustomVariableDefinition[];
  /**
   * 数组类型变量的预览数据（仅编辑态使用，不随模板保存）。
   * key 为变量 key（如 "products"），value 为项目数组（每项为 itemSchema 字段的 string 值映射）。
   */
  arrayPreviewData: Record<string, Record<string, string>[]>;

  /**
   * Layer 4：渲染规则，组件 id → 动态逻辑字段（变量绑定、显示条件、条件分支、循环绑定）。
   * 与 components（Layer 3 纯静态）分开存储，渲染前通过 mergeRulesIntoComponents 合并。
   */
  renderingRules: RenderingRules;

  // existing actions
  addComponent: (type: EmailComponentType, parentId?: string, preferredId?: string) => void;
  removeComponent: (id: string) => void;
  selectComponent: (id: string | null) => void;
  moveComponent: (fromIndex: number, toIndex: number, parentId?: string) => void;
  updateComponent: (id: string, updates: Partial<EmailComponent>) => void;
  updateComponentProps: (id: string, propUpdates: Record<string, unknown>) => void;
  updateComponentWrapperStyle: (id: string, styleUpdates: Partial<WrapperStyle>) => void;
  findComponent: (id: string, list?: EmailComponent[]) => EmailComponent | null;
  /** 组件在当前层级的兄弟信息，用于树状上移/下移按钮的禁用态 */
  getSiblingInfo: (id: string) => { parentId: string | null; index: number; siblingCount: number } | null;

  // new actions
  setActiveLeftTab: (tab: 'template' | 'library' | 'email-templates' | 'my-composites' | 'my-templates') => void;
  /** 载入完整模板（组件树 + 画布配置 + 自定义变量 + 渲染规则），会深拷贝并重新生成 ID */
  loadTemplate: (components: EmailComponent[], config: TemplateConfig, customVariables?: CustomVariableDefinition[], renderingRules?: RenderingRules) => void;
  updateTemplateConfig: (updates: Partial<TemplateConfig>) => void;
  toggleTreeNode: (id: string) => void;
  expandToNode: (id: string) => void;
  setDragOverInfo: (info: DragOverInfo | null) => void;
  setTreeDragOverInfo: (info: TreeDragOverInfo | null) => void;
  setIsDragging: (v: boolean) => void;
  setPreviewData: (data: Record<string, string>) => void;
  setPreviewVariable: (key: string, value: string) => void;
  setCanvasPreviewMode: (mode: 'data' | 'variable') => void;
  /** 设置数组类型变量的全量预览数据项 */
  setArrayPreviewItems: (variableKey: string, items: Record<string, string>[]) => void;

  /** 自定义变量 CRUD */
  addCustomVariable: (variable: CustomVariableDefinition) => void;
  updateCustomVariable: (key: string, updates: Partial<Omit<CustomVariableDefinition, 'key'>>) => void;
  deleteCustomVariable: (key: string) => void;

  /**
   * Layer 4：更新单个组件的渲染规则（patch 合并）。
   * 右侧面板编辑器（LoopBindingEditor、VisibilityConditionEditor 等）通过此 action 写入 Layer 4。
   */
  updateComponentRules: (id: string, patch: Partial<ComponentRules>) => void;

  insertComponent: (type: EmailComponentType, targetId: string, position: 'before' | 'after' | 'inside') => void;
  reorderComponent: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;

  /** 插入完整组件树（用于复合组件），自动深拷贝并重新生成 ID */
  insertFullComponent: (
    component: EmailComponent,
    targetId?: string,
    position?: 'before' | 'after' | 'inside',
    compositeSource?: CompositeComponent
  ) => void;

  /** 将业务模式复合组件切换为原生模式（不可逆） */
  switchToNativeMode: (rootId: string) => void;

  /**
   * 右侧面板聚焦提示：从变量引用列表点击时设置，驱动右侧对应编辑器自动展开并滚动到视口。
   * ts 字段为时间戳，确保相同 section 连续触发也能被 useEffect 捕获。
   */
  rightPanelFocusHint: { section: 'visibility' | 'branches' | 'binding' | 'loop'; ts: number } | null;
  setRightPanelFocusHint: (section: 'visibility' | 'branches' | 'binding' | 'loop') => void;
  clearRightPanelFocusHint: () => void;
}

export const useEmailStore = create<EmailState>((set, get) => ({
  components: [],
  selectedId: null,
  activeLeftTab: 'template',
  templateConfig: migrateTemplateConfig(defaultEmailTemplateConfig),
  expandedTreeIds: [],
  dragOverInfo: null,
  treeDragOverInfo: null,
  isDragging: false,
  previewData: buildDefaultPreviewData(),
  canvasPreviewMode: 'data',
  customVariables: [],
  arrayPreviewData: {},
  renderingRules: {},
  rightPanelFocusHint: null,

  // ---- existing actions ----

  addComponent: (type, parentId, preferredId) => {
    const newComp = createComponentFactory(type, preferredId);

    set((state) => {
      if (parentId) {
        return {
          components: addToParent(state.components, parentId, newComp),
          selectedId: newComp.id,
        };
      }
      return {
        components: [...state.components, newComp],
        selectedId: newComp.id,
      };
    });
  },

  removeComponent: (id) => {
    set((state) => ({
      components: removeFromTree(id, state.components),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },

  selectComponent: (id) => {
    if (id) {
      const state = get();
      // 如果目标组件位于业务复合组件内部，自动选中复合根
      const businessRootId = findBusinessCompositeRoot(id, state.components);
      const resolvedId = businessRootId ?? id;

      // auto-expand ancestors in tree
      const ancestors = findAncestorIds(resolvedId, state.components);
      if (ancestors && ancestors.length > 0) {
        const merged = new Set([...state.expandedTreeIds, ...ancestors]);
        set({ selectedId: resolvedId, expandedTreeIds: Array.from(merged) });
        return;
      }
      set({ selectedId: resolvedId });
      return;
    }
    set({ selectedId: id });
  },

  moveComponent: (fromIndex, toIndex, parentId) => {
    const state = get();
    const list = parentId
      ? (state.findComponent(parentId)?.children ?? state.components)
      : state.components;
    if (!list || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const copied = [...list];
    const [removed] = copied.splice(fromIndex, 1);
    copied.splice(toIndex, 0, removed);

    const setChildren = (
      comps: EmailComponent[],
      targetId: string,
      newChildren: EmailComponent[]
    ): EmailComponent[] =>
      comps.map((c) =>
        c.id === targetId
          ? { ...c, children: newChildren }
          : c.children
            ? { ...c, children: setChildren(c.children, targetId, newChildren) }
            : c
      );

    set((s) =>
      parentId
        ? { components: setChildren(s.components, parentId, copied) }
        : { components: copied }
    );
  },

  updateComponent: (id, updates) => {
    const apply = (comps: EmailComponent[]): EmailComponent[] =>
      comps.map((c) =>
        c.id === id
          ? { ...c, ...updates }
          : c.children
            ? { ...c, children: apply(c.children) }
            : c
      );
    set((state) => ({ components: apply(state.components) }));
  },

  updateComponentProps: (id, propUpdates) => {
    const apply = (comps: EmailComponent[]): EmailComponent[] =>
      comps.map((c) => {
        if (c.id === id) {
          const updated = { ...c, props: { ...c.props, ...propUpdates } as EmailComponent['props'] };
          // 特殊处理：image 的 layoutMode 切换时联动 children
          if (c.type === 'image' && 'layoutMode' in propUpdates) {
            if (propUpdates.layoutMode === true) {
              // 开启布局模式：确保 children 为数组
              updated.children = updated.children ?? [];
              const imgProps = updated.props as ImageProps;
              if (!imgProps.layoutContentAlign) {
                updated.props = {
                  ...imgProps,
                  layoutContentAlign: { ...c.wrapperStyle.contentAlign },
                } as EmailComponent['props'];
              }
            } else if (propUpdates.layoutMode === false) {
              // 关闭布局模式：清空 children，不保留旧数据
              updated.children = undefined;
            }
          }
          return updated;
        }
        return c.children ? { ...c, children: apply(c.children) } : c;
      });
    set((state) => ({ components: apply(state.components) }));
  },

  updateComponentWrapperStyle: (id, styleUpdates) => {
    const apply = (comps: EmailComponent[]): EmailComponent[] =>
      comps.map((c) =>
        c.id === id
          ? { ...c, wrapperStyle: { ...c.wrapperStyle, ...styleUpdates } }
          : c.children
            ? { ...c, children: apply(c.children) }
            : c
      );
    set((state) => ({ components: apply(state.components) }));
  },

  findComponent: (id, list) => {
    return findInTree(id, list ?? get().components);
  },

  getSiblingInfo: (id) => {
    const state = get();
    const result = findParentListAndIndex(id, state.components);
    if (!result) return null;
    return {
      parentId: result.parentId,
      index: result.index,
      siblingCount: result.parentList.length,
    };
  },

  // ---- new actions ----

  setActiveLeftTab: (tab) => {
    set({ activeLeftTab: tab });
  },

  loadTemplate: (components, config, customVariables, renderingRules) => {
    const cloned = components.map((root) => migrateComponent(deepCloneWithNewIds(root)));
    const vars = customVariables ?? [];

    // 将自定义变量的 defaultValue（标量）合并到 previewData 初始值
    const defaultPreviewData: Record<string, string> = buildDefaultPreviewData();
    for (const v of vars) {
      if (v.contentType !== 'array' && v.defaultValue !== undefined && v.defaultValue !== '') {
        defaultPreviewData[v.key] = v.defaultValue;
      }
    }

    // 将自定义变量的 defaultPreviewItems（数组）初始化到 arrayPreviewData
    const defaultArrayPreviewData: Record<string, Record<string, string>[]> = {};
    for (const v of vars) {
      if (v.contentType === 'array' && Array.isArray(v.defaultPreviewItems) && v.defaultPreviewItems.length > 0) {
        defaultArrayPreviewData[v.key] = v.defaultPreviewItems;
      }
    }

    set({
      components: cloned,
      templateConfig: migrateTemplateConfig(config),
      selectedId: null,
      customVariables: vars,
      previewData: defaultPreviewData,
      arrayPreviewData: defaultArrayPreviewData,
      renderingRules: renderingRules ?? {},
    });
  },

  updateTemplateConfig: (updates) => {
    set((state) => ({
      templateConfig: { ...state.templateConfig, ...updates },
    }));
  },

  toggleTreeNode: (id) => {
    set((state) => {
      const ids = state.expandedTreeIds;
      if (ids.includes(id)) {
        return { expandedTreeIds: ids.filter((x) => x !== id) };
      }
      return { expandedTreeIds: [...ids, id] };
    });
  },

  expandToNode: (id) => {
    const state = get();
    const ancestors = findAncestorIds(id, state.components);
    if (ancestors && ancestors.length > 0) {
      const merged = new Set([...state.expandedTreeIds, ...ancestors]);
      set({ expandedTreeIds: Array.from(merged) });
    }
  },

  setDragOverInfo: (info) => {
    const cur = get().dragOverInfo;
    if (
      cur?.targetId === info?.targetId &&
      cur?.position === info?.position
    ) return;
    set({ dragOverInfo: info });
  },

  setTreeDragOverInfo: (info) => {
    const cur = get().treeDragOverInfo;
    if (
      cur?.targetId === info?.targetId &&
      cur?.position === info?.position
    ) return;
    set({ treeDragOverInfo: info });
  },

  setIsDragging: (v) => {
    if (get().isDragging === v) return;
    set({ isDragging: v });
  },

  setPreviewData: (data) => set({ previewData: data }),
  setPreviewVariable: (key, value) => {
    set((state) => ({
      previewData: { ...state.previewData, [key]: value },
    }));
  },
  setCanvasPreviewMode: (mode) => set({ canvasPreviewMode: mode }),
  setArrayPreviewItems: (variableKey, items) => {
    set((state) => ({
      arrayPreviewData: { ...state.arrayPreviewData, [variableKey]: items },
    }));
  },

  addCustomVariable: (variable) => {
    set((state) => {
      if (state.customVariables.some((v) => v.key === variable.key)) return state;
      return { customVariables: [...state.customVariables, variable] };
    });
  },

  updateCustomVariable: (key, updates) => {
    set((state) => ({
      customVariables: state.customVariables.map((v) =>
        v.key === key ? { ...v, ...updates } : v
      ),
    }));
  },

  deleteCustomVariable: (key) => {
    set((state) => ({
      customVariables: state.customVariables.filter((v) => v.key !== key),
    }));
  },

  updateComponentRules: (id, patch) => {
    set((state) => {
      const existing = state.renderingRules[id] ?? {};
      const merged = { ...existing, ...patch };
      // 移除值为 undefined 的字段（表示清除该规则）
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(merged)) {
        if (v !== undefined) cleaned[k] = v;
      }
      return {
        renderingRules: {
          ...state.renderingRules,
          [id]: Object.keys(cleaned).length > 0 ? cleaned as ComponentRules : undefined as unknown as ComponentRules,
        },
      };
    });
  },

  insertComponent: (type, targetId, position) => {
    const newComp = createComponentFactory(type);
    set((state) => {
      if (position === 'inside') {
        return {
          components: addToParent(state.components, targetId, newComp),
          selectedId: newComp.id,
          dragOverInfo: null,
        };
      }
      return {
        components: insertRelative(state.components, targetId, newComp, position),
        selectedId: newComp.id,
        dragOverInfo: null,
      };
    });
  },

  insertFullComponent: (component, targetId, position, compositeSource) => {
    if (!component || typeof component !== 'object' || !('id' in component) || !('type' in component)) {
      throw new Error('insertFullComponent: 无效的组件资料（缺少 id 或 type）');
    }
    let toInsert: EmailComponent;

    if (compositeSource && compositeSource.mode === 'business' && compositeSource.businessForm) {
      const { cloned, pathToIdMap } = deepCloneWithMapping(component, []);
      toInsert = migrateComponent(cloned);
      toInsert.compositeInstance = {
        sourceCompositeId: compositeSource.id,
        mode: 'business',
        businessForm: normalizeBusinessForm(structuredClone(compositeSource.businessForm)),
        pathToIdMap,
      };
    } else if (compositeSource) {
      const { cloned, pathToIdMap } = deepCloneWithMapping(component, []);
      toInsert = migrateComponent(cloned);
      toInsert.compositeInstance = {
        sourceCompositeId: compositeSource.id,
        mode: 'native',
        pathToIdMap,
      };
    } else {
      toInsert = migrateComponent(deepCloneWithNewIds(component));
    }

    set((state) => {
      if (!targetId) {
        return {
          components: [...state.components, toInsert],
          selectedId: toInsert.id,
        };
      }
      if (position === 'inside') {
        return {
          components: addToParent(state.components, targetId, toInsert),
          selectedId: toInsert.id,
          dragOverInfo: null,
        };
      }
      return {
        components: insertRelative(state.components, targetId, toInsert, position || 'after'),
        selectedId: toInsert.id,
        dragOverInfo: null,
      };
    });
  },

  switchToNativeMode: (rootId) => {
    const apply = (comps: EmailComponent[]): EmailComponent[] =>
      comps.map((c) => {
        if (c.id === rootId && c.compositeInstance) {
          // 移除 compositeInstance 或将 mode 设为 native
          const rest = { ...c };
          delete (rest as Partial<EmailComponent>).compositeInstance;
          return rest.children
            ? { ...rest, children: apply(rest.children) } as EmailComponent
            : rest as EmailComponent;
        }
        return c.children ? { ...c, children: apply(c.children) } : c;
      });
    set((state) => ({ components: apply(state.components) }));
  },

  setRightPanelFocusHint: (section) =>
    set({ rightPanelFocusHint: { section, ts: Date.now() } }),
  clearRightPanelFocusHint: () =>
    set({ rightPanelFocusHint: null }),

  reorderComponent: (sourceId, targetId, position) => {
    set((state) => {
      const source = findInTree(sourceId, state.components);
      if (!source) return state;

      // Prevent dropping into own descendants
      const targetAncestors = findAncestorIds(targetId, state.components);
      if (targetAncestors && targetAncestors.includes(sourceId)) return state;
      if (sourceId === targetId) return state;

      // Remove source from current position
      let newTree = removeFromTree(sourceId, state.components);

      // Insert at new position
      if (position === 'inside') {
        newTree = addToParent(newTree, targetId, source);
      } else {
        newTree = insertRelative(newTree, targetId, source, position);
      }

      return {
        components: newTree,
        treeDragOverInfo: null,
      };
    });
  },
}));

// Re-export type for convenience
export type { EmailComponentType } from '@shared/types/email';
