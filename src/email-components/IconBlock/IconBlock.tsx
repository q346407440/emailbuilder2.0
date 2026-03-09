import { memo, useEffect, useState } from 'react';
import type { EmailComponent, IconProps, SystemIconType } from '@shared/types/email';
import { isIconProps } from '@shared/types/email';
import ComponentWrapper from '../components/ComponentWrapper/ComponentWrapper';
import styles from './IconBlock.module.css';

interface IconBlockProps {
  component: EmailComponent;
  selected?: boolean;
  onSelect?: () => void;
}

const ICON_MAP: Partial<Record<SystemIconType, (size: string, color: string, sizeMode: 'width' | 'height') => React.ReactNode>> = {
  mail: (size, color, sizeMode) => {
    const sizeAttr = sizeMode === 'width' ? { width: size } : { height: size };
    return (
      <svg {...sizeAttr} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 4L12 13 2 4" />
      </svg>
    );
  },
  phone: (size, color, sizeMode) => {
    const sizeAttr = sizeMode === 'width' ? { width: size } : { height: size };
    return (
      <svg {...sizeAttr} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
      </svg>
    );
  },
  location: (size, color, sizeMode) => {
    const sizeAttr = sizeMode === 'width' ? { width: size } : { height: size };
    return (
      <svg {...sizeAttr} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    );
  },
  link: (size, color, sizeMode) => {
    const sizeAttr = sizeMode === 'width' ? { width: size } : { height: size };
    return (
      <svg {...sizeAttr} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    );
  },
  star: (size, color, sizeMode) => {
    const sizeAttr = sizeMode === 'width' ? { width: size } : { height: size };
    return (
      <svg {...sizeAttr} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  },
  heart: (size, color, sizeMode) => {
    const sizeAttr = sizeMode === 'width' ? { width: size } : { height: size };
    return (
      <svg {...sizeAttr} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    );
  },
  check: (size, color, sizeMode) => {
    const sizeAttr = sizeMode === 'width' ? { width: size } : { height: size };
    return (
      <svg {...sizeAttr} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  },
  'arrow-right': (size, color, sizeMode) => {
    const sizeAttr = sizeMode === 'width' ? { width: size } : { height: size };
    return (
      <svg {...sizeAttr} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16l4-4-4-4" />
        <path d="M8 12h8" />
      </svg>
    );
  },
};

/** 社交媒体系统图标 → 项目预置文件路径 */
const SOCIAL_ICON_PATHS: Partial<Record<SystemIconType, string>> = {
  instagram: '/images/icon-instagram.svg',
  tiktok: '/images/icon-tiktok.svg',
  youtube: '/images/icon-youtube.svg',
  facebook: '/images/icon-facebook.svg',
  twitter: '/images/icon-twitter.svg',
};

const SVG_DATA_URL_PREFIX = 'data:image/svg+xml';
const SVG_DATA_URL_BASE64 = 'data:image/svg+xml;base64,';

function isSvgDataUrl(src: string): boolean {
  return src.startsWith(SVG_DATA_URL_PREFIX);
}

/** LLM 有时直接输出原始 SVG 字符串（以 <svg 开头），此时内联渲染 */
function isRawSvgString(src: string): boolean {
  return src.trimStart().toLowerCase().startsWith('<svg');
}

/** 是否為可拉取為內聯 SVG 的 URL（相對路徑或 http(s)） */
function isSvgUrl(src: string): boolean {
  return (
    !isSvgDataUrl(src) &&
    !isRawSvgString(src) &&
    (src.startsWith('/') || src.startsWith('./') || src.startsWith('http://') || src.startsWith('https://'))
  );
}

function getSvgStringFromDataUrl(dataUrl: string): string | null {
  try {
    if (dataUrl.startsWith(SVG_DATA_URL_BASE64)) {
      return decodeURIComponent(escape(atob(dataUrl.slice(SVG_DATA_URL_BASE64.length))));
    }
    if (dataUrl.startsWith(SVG_DATA_URL_PREFIX + ',')) {
      return decodeURIComponent(dataUrl.slice((SVG_DATA_URL_PREFIX + ',').length));
    }
  } catch {
    return null;
  }
  return null;
}

const FILL_STROKE_NONE = /^(none|transparent)$/i;
const WHITE_COLORS = /^(#fff(fff)?|white|rgb\s*\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\s*\(\s*255\s*,\s*255\s*,\s*255\s*,\s*[0-9.]+\s*\))$/i;

/** 僅替換「深色」fill/stroke 為 currentColor，保留 none/transparent/白色 */
function shouldReplaceWithCurrentColor(value: string): boolean {
  const v = value.trim();
  if (v.length === 0) return false;
  if (FILL_STROKE_NONE.test(v)) return false;
  if (WHITE_COLORS.test(v)) return false;
  return true;
}

/** 移除 script 與 on* 事件，僅將「有顏色的」fill/stroke 替換為 currentColor，保留 none 不變 */
function sanitizeAndInjectCurrentColor(svgString: string): string {
  let s = svgString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+=["'][^"']*["']/gi, '');
  s = s.replace(/\bfill=(["'])([^"']*)\1/gi, (_, quote, val) =>
    shouldReplaceWithCurrentColor(val) ? 'fill="currentColor"' : `fill=${quote}${val}${quote}`
  );
  s = s.replace(/\bstroke=(["'])([^"']*)\1/gi, (_, quote, val) =>
    shouldReplaceWithCurrentColor(val) ? 'stroke="currentColor"' : `stroke=${quote}${val}${quote}`
  );
  if (!/\bfill\s*=/i.test(s)) {
    s = s.replace(/<svg(\s[^>]*)?>/i, (m) => m.replace(/>\s*$/, ' fill="currentColor">'));
  }
  return s;
}

/** App Store / Google Play 標準徽章（黑底白字、圓角、左圖右文） */
function StoreBadge({
  storeType,
  link,
  heightPx,
}: {
  storeType: 'app-store' | 'google-play';
  link: string;
  heightPx: string;
}) {
  const h = parseInt(heightPx.replace(/\D/g, ''), 10) || 40;
  const logoSize = Math.round(h * 0.7);
  const fontSize = Math.max(10, Math.round(h * 0.38));
  const content = (
    <div className={styles.storeBadge} style={{ height: `${h}px`, fontSize: `${fontSize}px` }}>
      {storeType === 'app-store' && (
        <>
          <span className={styles.storeBadgeLogo} style={{ width: logoSize, height: logoSize }}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
          </span>
          <span className={styles.storeBadgeText}>
            <span className={styles.storeBadgeLine1}>Download on the</span>
            <span className={styles.storeBadgeLine2}>App Store</span>
          </span>
        </>
      )}
      {storeType === 'google-play' && (
        <>
          <span className={styles.storeBadgeLogo} style={{ width: logoSize, height: logoSize }}>
            <svg viewBox="0 0 24 24">
              <path fill="#00C853" d="M3.2 2.4L13.4 12 3.2 21.6a1.2 1.2 0 0 0 .2.6l9.4-9.4-9.4-9.4a1.2 1.2 0 0 0-.2.6z" />
              <path fill="#00B0FF" d="M13.4 12L3.2 2.4a1.2 1.2 0 0 1 1.4-.2l9.2 5.4-1.6 1.6-1.8 1.8z" />
              <path fill="#FFD600" d="M13.4 12l-1.8-1.8 1.6-1.6 9.2 5.4a1.2 1.2 0 0 1 .2 1.7l-8.2 8.2z" />
              <path fill="#FF1744" d="M3.2 21.6l10.2-9.6 1.8 1.8-9.2 5.4a1.2 1.2 0 0 1-1.8-.6z" />
            </svg>
          </span>
          <span className={styles.storeBadgeText}>
            <span className={styles.storeBadgeLine1}>GET IT ON</span>
            <span className={styles.storeBadgeLine2}>Google Play</span>
          </span>
        </>
      )}
    </div>
  );
  if (link) {
    return (
      <a href={link} className={styles.storeBadgeLink} onClick={(e) => e.preventDefault()}>
        {content}
      </a>
    );
  }
  return content;
}

/** 自定義圖標無來源時的佔位 — 使用 2×2 網格表示「圖標」概念 */
function CustomPlaceholder({ size }: { size: string }) {
  const s = parseInt(size, 10) || 32;
  const iconSize = Math.round(s * 0.4);
  return (
    <div
      className={styles.customPlaceholder}
      style={{ width: s, height: s }}
    >
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    </div>
  );
}

/** 依 URL 拉取 SVG 字串並注入 currentColor，供內聯渲染改色使用 */
function useFetchedSvg(url: string | undefined): string | null {
  const [state, setState] = useState<{ url: string; content: string | null } | null>(null);
  const isSvg = typeof url === 'string' && isSvgUrl(url);

  useEffect(() => {
    if (!url || !isSvg) return;
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        const trimmed = text.trimStart().toLowerCase();
        if (trimmed.startsWith('<svg')) {
          setState({ url, content: sanitizeAndInjectCurrentColor(text) });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ url, content: null });
      });
    return () => {
      cancelled = true;
    };
  }, [url, isSvg]);

  if (!url || !isSvg) return null;
  if (state?.url === url) return state.content;
  return null;
}

function IconBlock({ component, selected, onSelect }: IconBlockProps) {
  const iconProps = component.type === 'icon' && isIconProps(component.props)
    ? (component.props as IconProps)
    : null;
  const customSrcForFetch = iconProps?.iconType === 'custom' ? iconProps.customSrc : undefined;
  const socialPath = iconProps ? SOCIAL_ICON_PATHS[iconProps.iconType as SystemIconType] : undefined;
  const fetchedSvg = useFetchedSvg(customSrcForFetch ?? socialPath);

  if (component.type !== 'icon' || !isIconProps(component.props)) return null;
  const props = component.props as IconProps;

  let iconElement: React.ReactNode = null;

  const sizeNum = parseInt(String(props.size).replace(/\D/g, ''), 10) || 32;
  const sizePx = `${sizeNum}px`;
  const sizeStyle = props.sizeMode === 'width' ? { width: sizePx } : { height: sizePx };

  if (props.iconType === 'app-store' || props.iconType === 'google-play') {
    iconElement = (
      <StoreBadge
        storeType={props.iconType}
        link={props.link}
        heightPx={sizePx}
      />
    );
  } else if (props.iconType === 'custom') {
    if (props.customSrc) {
      if (isRawSvgString(props.customSrc)) {
        const safeSvg = sanitizeAndInjectCurrentColor(props.customSrc);
        iconElement = (
          <span
            className={`${styles.customInlineSvg} ${props.sizeMode === 'height' ? styles.sizeByHeight : ''}`}
            style={{ color: props.color, ...sizeStyle }}
            dangerouslySetInnerHTML={{ __html: safeSvg }}
          />
        );
      } else if (isSvgDataUrl(props.customSrc)) {
        const svgString = getSvgStringFromDataUrl(props.customSrc);
        if (svgString) {
          const safeSvg = sanitizeAndInjectCurrentColor(svgString);
          iconElement = (
            <span
              className={`${styles.customInlineSvg} ${props.sizeMode === 'height' ? styles.sizeByHeight : ''}`}
              style={{ color: props.color, ...sizeStyle }}
              dangerouslySetInnerHTML={{ __html: safeSvg }}
            />
          );
        } else {
          iconElement = (
            <img
              src={props.customSrc}
              alt="icon"
              style={sizeStyle}
              className={styles.customImg}
            />
          );
        }
      } else if (isSvgUrl(props.customSrc) && fetchedSvg) {
        iconElement = (
          <span
            className={`${styles.customInlineSvg} ${props.sizeMode === 'height' ? styles.sizeByHeight : ''}`}
            style={{ color: props.color, ...sizeStyle }}
            dangerouslySetInnerHTML={{ __html: fetchedSvg }}
          />
        );
      } else {
        iconElement = (
          <img
            src={props.customSrc}
            alt="icon"
            style={sizeStyle}
            className={styles.customImg}
          />
        );
      }
    } else {
      iconElement = <CustomPlaceholder size={props.size} />;
    }
  } else if (SOCIAL_ICON_PATHS[props.iconType as SystemIconType]) {
    const path = SOCIAL_ICON_PATHS[props.iconType as SystemIconType]!;
    if (fetchedSvg) {
      iconElement = (
        <span
          className={`${styles.customInlineSvg} ${props.sizeMode === 'height' ? styles.sizeByHeight : ''}`}
          style={{ color: props.color, ...sizeStyle }}
          dangerouslySetInnerHTML={{ __html: fetchedSvg }}
        />
      );
    } else {
      iconElement = (
        <img src={path} alt={props.iconType} style={sizeStyle} className={styles.customImg} />
      );
    }
  } else {
    const renderIcon = ICON_MAP[props.iconType];
    iconElement = typeof renderIcon === 'function' ? renderIcon(sizePx, props.color, props.sizeMode) : null;
  }

  return (
    <ComponentWrapper
      wrapperStyle={component.wrapperStyle}
      onClick={onSelect}
      selected={selected}
      componentId={component.id}
    >
      <div className={styles.iconWrap} style={{ display: 'inline-flex' }}>
        {(props.iconType === 'app-store' || props.iconType === 'google-play')
          ? iconElement
          : props.link
            ? (
                <a href={props.link} onClick={(e) => e.preventDefault()}>
                  {iconElement}
                </a>
              )
            : iconElement}
      </div>
    </ComponentWrapper>
  );
}

export default memo(IconBlock, (prev, next) => {
  return prev.component === next.component && prev.selected === next.selected;
});
