/**
 * 服務端模板渲染工具
 * 純 JSON 操作，不依賴 DOM，可在 Node.js 環境直接使用。
 *
 * 功能：
 * 1. expandLoopBlocks — 展開循環區塊（loopBinding）
 * 2. resolveVariableBindings — 解析 variableBindings 並替換 props 中的變量
 * 3. buildEmailHtml — 組裝最終 HTML（簡版，用於 API 發送）
 * 4. getShoplazzaPreviewData — 從已連接的 Shoplazza 店鋪獲取 shop.* / product.* 數據
 */

import * as db from '../db/index.js';
import { decrypt } from './crypto.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RenderVariableData {
  /** 純量變量：key → 字符串值，如 { 'shop.name': 'My Shop', 'user.firstName': 'Alice' } */
  scalars: Record<string, string>;
  /** 數組變量：key → 對象數組，如 { 'products': [{ title: '...', price: '...' }] } */
  arrays: Record<string, Record<string, string>[]>;
}

// ─── Loop block expansion ─────────────────────────────────────────────────────

function setByPath(target: Record<string, unknown>, path: string[], value: string): void {
  if (path.length === 0) return;
  if (path.length === 1) { target[path[0]] = value; return; }
  const [head, ...rest] = path;
  if (!target[head] || typeof target[head] !== 'object') target[head] = {};
  setByPath(target[head] as Record<string, unknown>, rest, value);
}

function injectItemValues(node: Record<string, unknown>, itemValues: Record<string, string>): void {
  const replaceInterpolations = (str: string): string =>
    str.replace(/\{\{item\.([^}]+)\}\}/g, (_, fieldKey: string) =>
      itemValues[fieldKey.trim()] ?? `{{item.${fieldKey}}}`
    );

  const injectPropsInterpolations = (props: Record<string, unknown>): void => {
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string' && v.includes('{{item.')) {
        props[k] = replaceInterpolations(v);
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        injectPropsInterpolations(v as Record<string, unknown>);
      }
    }
  };

  const vb = node.variableBindings as Record<string, string> | undefined;
  const props = (node.props ?? {}) as Record<string, unknown>;
  if (vb) {
    const newVb: Record<string, string> = {};
    for (const [propPath, variableKey] of Object.entries(vb)) {
      if (variableKey.startsWith('item.')) {
        const fieldKey = variableKey.slice(5);
        const value = itemValues[fieldKey];
        if (value !== undefined) {
          const path = propPath.startsWith('props.') ? propPath.split('.').slice(1) : propPath.split('.');
          setByPath(props, path, value);
        }
      } else {
        newVb[propPath] = variableKey;
      }
    }
    node.props = props;
    node.variableBindings = Object.keys(newVb).length > 0 ? newVb : undefined;
  }
  injectPropsInterpolations(props);
  if (Array.isArray(node.children)) {
    for (const child of node.children as Record<string, unknown>[]) {
      injectItemValues(child, itemValues);
    }
  }
}

export function expandLoopBlocks(
  comps: Record<string, unknown>[],
  arrays: Record<string, Record<string, string>[]>
): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  for (const comp of comps) {
    const loopBinding = comp.loopBinding as { variableKey?: string; expandDirection?: string } | undefined;
    if (loopBinding?.variableKey) {
      const items = arrays[loopBinding.variableKey];
      if (!Array.isArray(items) || items.length === 0) continue;

      const expandDirection = loopBinding.expandDirection ?? 'vertical';
      const clones: Record<string, unknown>[] = items.map((itemValues, idx) => {
        const clone = JSON.parse(JSON.stringify(comp)) as Record<string, unknown>;
        delete clone.loopBinding;
        clone.id = `${String(clone.id ?? 'loop')}-item${idx}`;
        injectItemValues(clone, itemValues);
        return clone;
      });

      if (expandDirection === 'horizontal') {
        const compWS = (comp.wrapperStyle ?? {}) as Record<string, unknown>;
        const compProps = (comp.props ?? {}) as Record<string, unknown>;
        const rowWrapper: Record<string, unknown> = {
          id: `${String(comp.id ?? 'loop')}-hloop-row`,
          type: 'layout',
          wrapperStyle: {
            widthMode: compWS.widthMode ?? 'fill',
            heightMode: 'fitContent',
            backgroundType: 'color',
            backgroundColor: 'rgba(0,0,0,0)',
            padding: { mode: 'unified', unified: '0px' },
            margin: { mode: 'unified', unified: '0px' },
            border: { mode: 'unified', top: false, right: false, bottom: false, left: false, unified: '1px', color: '#E0E5EB', style: 'solid' },
            borderRadius: { mode: 'unified', unified: '0px' },
            contentAlign: { horizontal: 'left', vertical: 'top' },
          },
          props: {
            direction: 'horizontal',
            gap: compProps.gap ?? '0px',
            distribution: compProps.distribution ?? 'packed',
          },
          children: clones,
        };
        result.push(rowWrapper);
      } else {
        result.push(...clones);
      }
    } else {
      const expanded: Record<string, unknown> = Array.isArray(comp.children)
        ? { ...comp, children: expandLoopBlocks(comp.children as Record<string, unknown>[], arrays) }
        : comp;
      result.push(expanded);
    }
  }
  return result;
}

// ─── Variable binding resolution ──────────────────────────────────────────────

const CONTENT_PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;
const PRODUCT_VAR_TO_SNAPSHOT_KEY: Record<string, string> = {
  'product.imageUrl': 'imageUrl',
  'product.title': 'title',
  'product.price': 'price',
  'product.compareAtPrice': 'compareAtPrice',
  'product.url': 'url',
};

function getBoundValue(
  node: Record<string, unknown>,
  variableKey: string,
  scalars: Record<string, string>
): string {
  const previewSource = node.variablePreviewSource;
  if (
    variableKey.startsWith('product.') &&
    previewSource &&
    typeof previewSource === 'object' &&
    (previewSource as Record<string, unknown>).type === 'product'
  ) {
    const snapshot = (previewSource as Record<string, unknown>).snapshot;
    if (snapshot && typeof snapshot === 'object') {
      const snapshotKey = PRODUCT_VAR_TO_SNAPSHOT_KEY[variableKey];
      if (snapshotKey) {
        const value = (snapshot as Record<string, unknown>)[snapshotKey];
        if (typeof value === 'string' && value) return value;
      }
    }
  }
  return scalars[variableKey] ?? '';
}

export function resolveVariableBindings(
  components: Record<string, unknown>[],
  scalars: Record<string, string>
): Record<string, unknown>[] {
  return components.map((comp) => resolveNode(comp, scalars));
}

function resolveNode(
  node: Record<string, unknown>,
  scalars: Record<string, string>
): Record<string, unknown> {
  const vb = node.variableBindings as Record<string, string> | undefined;
  let props = (node.props ?? {}) as Record<string, unknown>;

  if (vb) {
    props = { ...props };
    for (const [propPath, variableKey] of Object.entries(vb)) {
      if (variableKey.startsWith('item.')) continue; // 已由 expandLoopBlocks 處理
      const value = getBoundValue(node, variableKey, scalars);
      if (value) {
        const path = propPath.startsWith('props.') ? propPath.split('.').slice(1) : propPath.split('.');
        setByPath(props, path, value);
      }
    }
  }

  // 替換 props.content / props.text 中的 {{key}} 插值
  for (const contentField of ['content', 'text'] as const) {
    if (typeof props[contentField] === 'string') {
      props[contentField] = (props[contentField] as string).replace(
        CONTENT_PLACEHOLDER_REGEX,
        (_, key: string) => {
          const k = key?.trim();
          if (!k) return '{{}}';
          return getBoundValue(node, k, scalars) || `{{${k}}}`;
        }
      );
    }
  }

  const children = Array.isArray(node.children)
    ? resolveVariableBindings(node.children as Record<string, unknown>[], scalars)
    : node.children;

  return { ...node, props, ...(children !== node.children ? { children } : {}) };
}

// ─── Build flat scalars from arrays (products[0].title style) ─────────────────

export function buildFlatScalars(
  scalars: Record<string, string>,
  arrays: Record<string, Record<string, string>[]>
): Record<string, string> {
  const flat: Record<string, string> = { ...scalars };
  for (const [varKey, items] of Object.entries(arrays)) {
    items.forEach((item, index) => {
      for (const [fieldKey, fieldValue] of Object.entries(item)) {
        flat[`${varKey}[${index}].${fieldKey}`] = fieldValue;
      }
    });
  }
  return flat;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

/**
 * 從組件樹中提取並組裝郵件 HTML（簡版，用於 API 發送和 render 接口）。
 * 注意：這是純文本提取版本，不走 prepareEmailHtml 的 DOM 轉換管線。
 * 如需完整郵件格式（table 佈局、flex 轉換等），應在前端使用 prepareEmailHtml。
 */
export function buildEmailHtml(
  components: Record<string, unknown>[],
  config: Record<string, unknown>,
  title: string,
  scalars: Record<string, string>,
  /** 是否在底部附加变量调试摘要（仅用于预览/测试渲染，发送时应为 false） */
  showVariablesSummary = false
): string {
  const bgColor = String(config.outerBackgroundColor ?? '#f5f7fa');
  const contentBg = String(config.backgroundColor ?? '#ffffff');
  const width = String(config.width ?? '600px');

  const htmlParts: string[] = [];

  function traverse(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const type = String(obj.type ?? '');
    const props = (obj.props ?? {}) as Record<string, unknown>;

    if (type === 'text') {
      const content = String(props.content ?? '');
      if (content) {
        htmlParts.push(`<div style="padding:8px;font-family:Arial,sans-serif">${content}</div>`);
      }
    } else if (type === 'button') {
      const text = String(props.text ?? '');
      const url = String(props.url ?? '#');
      const bg = String(props.backgroundColor ?? '#1976D2');
      const color = String(props.color ?? '#ffffff');
      if (text) {
        htmlParts.push(
          `<div style="padding:8px;text-align:center">` +
          `<a href="${url}" style="display:inline-block;padding:10px 20px;background:${bg};color:${color};text-decoration:none;border-radius:4px;font-family:Arial,sans-serif">${text}</a>` +
          `</div>`
        );
      }
    } else if (type === 'image') {
      const src = String(props.src ?? '');
      const alt = String(props.alt ?? '');
      if (src) {
        htmlParts.push(`<div style="padding:8px"><img src="${src}" alt="${alt}" style="max-width:100%;height:auto;display:block" /></div>`);
      }
    } else if (type === 'divider') {
      htmlParts.push(`<div style="padding:4px 8px"><hr style="border:none;border-top:1px solid #E0E5EB;margin:0" /></div>`);
    }

    if (Array.isArray(obj.children)) obj.children.forEach(traverse);
  }

  components.forEach(traverse);

  const variablesSummary = showVariablesSummary
    ? Object.entries(scalars)
        .filter(([, v]) => v)
        .map(([k, v]) => `<code style="font-size:11px;color:#8A949C">${k}: ${v}</code>`)
        .join(' · ')
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0; padding:0; background:${bgColor}; font-family:Arial,sans-serif; }
  .container { max-width:${width}; margin:0 auto; background:${contentBg}; }
</style>
</head>
<body>
<div class="container">
  <div style="padding:16px">
    <h2 style="font-family:Arial,sans-serif;color:#1976D2;margin:0 0 12px;font-size:18px">${title}</h2>
    ${htmlParts.join('\n') || '<p style="color:#aaa;padding:8px">此模板暫無可預覽的內容組件</p>'}
  </div>
  ${variablesSummary ? `<div style="padding:12px 16px;background:#f9f9f9;border-top:1px solid #eee;font-size:12px;color:#aaa;text-align:center">${variablesSummary}</div>` : ''}
</div>
</body>
</html>`;
}

// ─── Shoplazza data injection ─────────────────────────────────────────────────

/**
 * 根據 shopIntegrationId 獲取 Shoplazza 店鋪的 shop.* / product.* 數據。
 * 返回可直接合併到 scalars 的 key→value 映射。
 */
export async function getShoplazzaPreviewData(
  shopIntegrationId: string
): Promise<Record<string, string>> {
  const row = await db.getShopIntegrationById(shopIntegrationId);
  if (!row) return {};

  let token: string;
  try {
    token = decrypt(row.access_token);
  } catch {
    token = Buffer.from(row.access_token, 'base64').toString();
  }

  const domain = row.shop_domain;
  const preview: Record<string, string> = {};

  // 1. 獲取店鋪基本信息
  try {
    const shopRes = await fetch(`https://${domain}/openapi/2025-06/shop`, {
      headers: { accept: 'application/json', 'access-token': token },
    });
    if (shopRes.ok) {
      const body = (await shopRes.json()) as { data?: Record<string, unknown> };
      const d = body.data ?? {};
      if (d.name) preview['shop.name'] = String(d.name);
      const rawDomain = String(d.domain ?? d.root_url ?? d.system_domain ?? domain);
      preview['shop.homeUrl'] = rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}`;
      const icon = d.icon as Record<string, unknown> | undefined;
      if (icon?.src && typeof icon.src === 'string') preview['shop.logoUrl'] = icon.src;
    }
  } catch {
    // 非致命，繼續
  }

  // 2. 獲取第一個商品
  try {
    const { fetchShoplazzaProducts } = await import('./shoplazza.js');
    const { products } = await fetchShoplazzaProducts(domain, token, { limit: 1 });
    if (products.length > 0) {
      const p = products[0];
      if (p.title) preview['product.title'] = p.title;
      if (p.imageUrl) preview['product.imageUrl'] = p.imageUrl;
      if (p.price) preview['product.price'] = `¥${p.price}`;
      if (p.compareAtPrice) preview['product.compareAtPrice'] = `¥${p.compareAtPrice}`;
      const shopUrl = preview['shop.homeUrl'] || `https://${domain}`;
      if (p.url)
        preview['product.url'] = p.url.startsWith('http') ? p.url : `${shopUrl}${p.url}`;
      else if (p.handle)
        preview['product.url'] = `${shopUrl}/products/${p.handle}`;
    }
  } catch {
    // 非致命，繼續
  }

  return preview;
}

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * 渲染模板：展開循環區塊 + 解析變量綁定 + 組裝 HTML。
 */
export function renderTemplate(
  template: {
    components: unknown[];
    config: unknown;
    title: string;
  },
  data: RenderVariableData,
  options: { showVariablesSummary?: boolean } = {}
): string {
  const rawComponents = Array.isArray(template.components) ? template.components as Record<string, unknown>[] : [];
  const config = (template.config ?? {}) as Record<string, unknown>;

  // 1. 展開循環區塊
  const expanded = expandLoopBlocks(rawComponents, data.arrays);

  // 2. 構建扁平化 scalars（包含 arrays[0].field 風格的 key）
  const flatScalars = buildFlatScalars(data.scalars, data.arrays);

  // 3. 解析 variableBindings
  const resolved = resolveVariableBindings(expanded, flatScalars);

  // 4. 組裝 HTML（發送時不附加調試摘要）
  return buildEmailHtml(resolved, config, template.title, flatScalars, options.showVariablesSummary ?? false);
}
