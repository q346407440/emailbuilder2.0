import type { BorderConfig, ComponentRules, EmailComponent } from '../types/email';
type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

/**
 * 将 arrayPreviewData 扁平化为 Record<string, string>，
 * 供 resolveVariableValues 使用（固定索引绑定场景）。
 *
 * 例：arrayPreviewData["products"] = [{ title: "商品A", imageUrl: "..." }]
 * → previewData["products[0].title"] = "商品A"
 */
export function flattenArrayPreviewData(
  arrayPreviewData: Record<string, Record<string, string>[]>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [varKey, items] of Object.entries(arrayPreviewData)) {
    items.forEach((item, index) => {
      for (const [fieldKey, fieldValue] of Object.entries(item)) {
        result[`${varKey}[${index}].${fieldKey}`] = fieldValue;
      }
    });
  }
  return result;
}

/**
 * 深克隆组件（使用原生 structuredClone，比 JSON 序列化快 3–5x）
 */
function deepCloneComponent(comp: EmailComponent): EmailComponent {
  return structuredClone(comp) as EmailComponent;
}

/**
 * 将单个循环区块组件替换为一个已注入 item.* 值的克隆。
 * loopBinding 字段在克隆中被移除，避免递归展开。
 */
function cloneWithItemValues(
  comp: EmailComponent,
  itemValues: Record<string, string>
): EmailComponent {
  const clone = deepCloneComponent(comp) as EmailComponentWithRules;
  delete clone.loopBinding;
  return injectItemValues(clone, itemValues);
}

/**
 * 递归将 variableBindings 中 item.* key 的值注入到
 * previewData 上（实际上是重写 variableBindings 以便后续 resolveVariableValues 能识别）。
 * 通过将 item.* → 具体值的映射写入 variableBindings 的 value，
 * 或者直接替换 props（更简单：直接修改组件树的 variableBindings，把 item.xxx → _item_resolved_xxx，
 * 然后 resolveVariableValues 收到的 previewData 里有 _item_resolved_xxx = value）
 *
 * 实际上最简单的做法：将 item.* 替换成一个运行时唯一 key，然后在 previewData 里提供该 key 的值。
 * 但更直接的做法：直接在这里把 item.* 对应的 props 直接写入组件，绕过 variableBindings。
 */
/** 替换字符串中所有 {{item.fieldKey}} 占位符 */
function replaceItemInterpolations(
  str: string,
  itemValues: Record<string, string>
): string {
  return str.replace(/\{\{item\.([^}]+)\}\}/g, (_, fieldKey: string) => {
    return itemValues[fieldKey.trim()] ?? `{{item.${fieldKey}}}`;
  });
}

/** 递归地对对象所有字符串字段替换 {{item.*}} */
function injectItemInterpolations(
  obj: Record<string, unknown>,
  itemValues: Record<string, string>
): { changed: boolean; result: Record<string, unknown> } {
  let changed = false;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.includes('{{item.')) {
      const replaced = replaceItemInterpolations(v, itemValues);
      result[k] = replaced;
      if (replaced !== v) changed = true;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = injectItemInterpolations(v as Record<string, unknown>, itemValues);
      result[k] = nested.result;
      if (nested.changed) changed = true;
    } else {
      result[k] = v;
    }
  }
  return { changed, result };
}

function injectItemValues(
  comp: EmailComponent,
  itemValues: Record<string, string>
): EmailComponent {
  const compWithRules = comp as EmailComponentWithRules;
  const vb = compWithRules.variableBindings;
  let newProps = comp.props as unknown as Record<string, unknown>;
  let propsChanged = false;

  // 1. 处理 variableBindings 中的 item.* 绑定
  let newVb: Record<string, string> | undefined;
  if (vb) {
    newVb = {};
    newProps = { ...newProps };

    for (const [propPath, variableKey] of Object.entries(vb)) {
      if (variableKey.startsWith('item.')) {
        const fieldKey = variableKey.slice(5);
        const value = itemValues[fieldKey];
        if (value !== undefined) {
          const path = propPath.startsWith('props.') ? propPath.split('.').slice(1) : propPath.split('.');
          setByPath(newProps, path, value);
          propsChanged = true;
        }
      } else {
        newVb[propPath] = variableKey;
      }
    }
  }

  // 2. 处理 props 字符串字段中的 {{item.*}} 插值（如文本 content）
  const interpolated = injectItemInterpolations(newProps, itemValues);
  if (interpolated.changed) {
    newProps = interpolated.result;
    propsChanged = true;
  }

  const children = comp.children?.map((child) => injectItemValues(child, itemValues));
  const vbResult = newVb !== undefined
    ? (Object.keys(newVb).length > 0 ? newVb : undefined)
    : compWithRules.variableBindings;

  const nextComp: EmailComponentWithRules = {
    ...compWithRules,
    props: (propsChanged ? newProps : comp.props) as EmailComponent['props'],
    variableBindings: vbResult,
    ...(children ? { children } : {}),
  };
  return nextComp as EmailComponent;
}

function setByPath(target: Record<string, unknown>, path: string[], value: string): void {
  if (path.length === 0) return;
  if (path.length === 1) {
    target[path[0]] = value;
    return;
  }
  const [head, ...rest] = path;
  let cursor = target[head];
  if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
    target[head] = {};
    cursor = target[head];
  }
  setByPath(cursor as Record<string, unknown>, rest, value);
}

/**
 * 将 N 个列克隆包裹进横向父容器，用于横向循环的 export 与 preview 展开。
 * 父容器继承原循环组件的 widthMode 与列间距，其余样式重置为透明/无边框。
 */
function buildHorizontalRowWrapper(
  templateComp: EmailComponent,
  columns: EmailComponent[]
): EmailComponent {
  const tws = templateComp.wrapperStyle as unknown as Record<string, unknown>;
  const tProps = templateComp.props as unknown as Record<string, unknown>;
  return {
    id: templateComp.id,
    type: 'layout',
    wrapperStyle: {
      widthMode: (tws?.widthMode as string) ?? 'fill',
      heightMode: 'fitContent',
      backgroundType: (tws?.backgroundType as string) ?? 'color',
      backgroundColor: (tws?.backgroundColor as string) ?? 'rgba(0,0,0,0)',
      padding: (tws?.padding as Record<string, unknown>) ?? { mode: 'unified', unified: '0px' },
      margin: (tws?.margin as Record<string, unknown>) ?? { mode: 'unified', unified: '0px' },
      border: (tws?.border as BorderConfig) ?? {
        mode: 'all',
        topWidth: '0px',
        rightWidth: '0px',
        bottomWidth: '0px',
        leftWidth: '0px',
        color: '#E0E5EB',
        style: 'solid',
      },
      borderRadius: (tws?.borderRadius as Record<string, unknown>) ?? { mode: 'unified', unified: '0px' },
      contentAlign: (tws?.contentAlign as Record<string, unknown>) ?? { horizontal: 'left', vertical: 'top' },
    } as unknown as EmailComponent['wrapperStyle'],
    props: {
      direction: 'horizontal',
      gap: (tProps?.gap as string) ?? '0px',
      distribution: (tProps?.distribution as string) ?? 'packed',
    } as unknown as EmailComponent['props'],
    children: columns,
  };
}

/**
 * 画布预览模式：
 * - vertical 循环：只展示 previewIndex 那一项（不展开 N 次）。
 * - horizontal 循环：展示所有可用样本项作为列（直观呈现多列效果）。
 * 若数组数据为空，展示组件原有的 fallback（保留 loopBinding 以显示徽章）。
 */
export function expandLoopBlocksForPreview(
  components: EmailComponent[],
  arrayPreviewData: Record<string, Record<string, string>[]>
): EmailComponent[] {
  return components.flatMap((comp) => {
    // 先递归处理子组件（非循环区块）
    const compWithRules = comp as EmailComponentWithRules;
    if (!compWithRules.loopBinding) {
      const children = comp.children
        ? expandLoopBlocksForPreview(comp.children, arrayPreviewData)
        : comp.children;
      if (children === comp.children) return [comp];
      return [{ ...comp, children }];
    }

    const { variableKey, previewIndex = 0, expandDirection = 'vertical' } = compWithRules.loopBinding;
    const items = arrayPreviewData[variableKey];

    if (!items || items.length === 0) {
      // 无样本数据：展示原组件（保留 loopBinding 以便徽章显示）
      return [comp];
    }

    if (expandDirection === 'horizontal') {
      // 横向：将所有样本项展示为多列（让编辑者直观看到最终多列效果）
      // column 是循环组件本身的克隆（含注入值），但外层行容器已继承 padding，故 column 的 padding 清零
      const columns = items.map((itemValues, idx) => {
        const clone = cloneWithItemValues(deepCloneComponent(comp), itemValues);
        return {
          ...clone,
          id: `${comp.id}-hpreview-col-${idx}`,
          wrapperStyle: {
            ...clone.wrapperStyle,
            padding: { mode: 'unified' as const, unified: '0px' },
          },
        };
      });
      const row = buildHorizontalRowWrapper(comp, columns);
      // 将 loopBinding 挂在行容器上，画布据此渲染徽章
      return [{ ...(row as EmailComponentWithRules), loopBinding: compWithRules.loopBinding } as EmailComponent];
    }

    // 纵向（默认）：只展示 previewIndex 那一项
    const index = Math.min(previewIndex, items.length - 1);
    const itemValues = items[index];
    const clone = deepCloneComponent(comp);
    const injected = injectItemValues(clone, itemValues);
    // 恢复 loopBinding（injectItemValues 不处理顶层 loopBinding）
    return [{ ...(injected as EmailComponentWithRules), loopBinding: compWithRules.loopBinding } as EmailComponent];
  });
}

/**
 * 导出/发信模式：
 * - vertical 循环：展开为 N 个克隆，纵向堆叠（flatMap）。
 * - horizontal 循环：N 个克隆作为等宽列，包裹在横向父容器中（返回 1 个元素）。
 * 数组为空时整块不输出。
 */
export function expandLoopBlocksForExport(
  components: EmailComponent[],
  arrayValues: Record<string, Record<string, string>[]>
): EmailComponent[] {
  return components.flatMap((comp) => {
    const compWithRules = comp as EmailComponentWithRules;
    if (!compWithRules.loopBinding) {
      const children = comp.children
        ? expandLoopBlocksForExport(comp.children, arrayValues)
        : comp.children;
      if (children === comp.children) return [comp];
      return [{ ...comp, children }];
    }

    const { variableKey, expandDirection = 'vertical' } = compWithRules.loopBinding;
    const items = arrayValues[variableKey];

    if (!Array.isArray(items) || items.length === 0) {
      return []; // 数组为空：不输出该区块
    }

    const clones = items.map((itemValues, idx) => {
      const clone = cloneWithItemValues(comp, itemValues);
      return { ...clone, id: `${comp.id}-item${idx}` };
    });

    if (expandDirection === 'horizontal') {
      // 横向：N 列包裹在一个横向行容器里（1 个输出节点）；列的 padding 清零，由行容器统一继承
      const colsNoPadding = clones.map((c) => ({
        ...c,
        wrapperStyle: {
          ...c.wrapperStyle,
          padding: { mode: 'unified' as const, unified: '0px' },
        },
      }));
      return [buildHorizontalRowWrapper(comp, colsNoPadding)];
    }

    // 纵向（默认）：N 个兄弟节点
    return clones;
  });
}
