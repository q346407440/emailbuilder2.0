/**
 * alo 弃购挽留邮件模板 — Low Stock Alert
 * 借鉴管线 Token 设计系统，将视觉参数抽象为常量
 */
import { nanoid } from 'nanoid';
import type {
  EmailComponent,
  WrapperStyle,
  TemplateConfig,
  TextProps,
  ImageProps,
  ButtonProps,
  DividerProps,
  LayoutProps,
  GridProps,
  IconProps,
  BorderConfig,
} from '../types/email';
import { DEFAULT_TEXT_FONT_FAMILY } from './fontOptions';
import { textHtml } from './textHtml';

/* ═══════════════════════════════════════════════════
   Design Tokens（alo 弃购挽留主题）
   ═══════════════════════════════════════════════════ */

const COLORS = {
  primary: '#000000',
  heading: '#000000',
  body: '#1A1A1A',
  muted: '#999999',
  accent: '#000000',
  mutedBg: '#F5F5F5',
  border: '#E0E5EB',
  footerText: '#999999',
  footerLink: '#1976D2',
};

const SPACING = {
  section: '32px',
  element: '16px',
  tight: '8px',
};

const TYPO = {
  h1:      { fontSize: '26px', fontWeight: '700' as const },
  h2:      { fontSize: '13px', fontWeight: '400' as const },
  body:    { fontSize: '15px', fontWeight: '400' as const },
  caption: { fontSize: '13px', fontWeight: '400' as const },
  button:  { fontSize: '14px', fontWeight: '700' as const },
  label:   { fontSize: '10px', fontWeight: '700' as const },
  footer:  { fontSize: '10px', fontWeight: '400' as const },
};

/* ═══════════════════════════════════════════════════
   SVG Data URL 常量
   ═══════════════════════════════════════════════════ */

const svg = (s: string) => `data:image/svg+xml,${encodeURIComponent(s)}`;

const ALO_LOGO = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 48"><text x="50" y="40" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="46" font-weight="900" fill="#000">alo</text></svg>`
);

const SHIPPING_ICON = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="14" width="24" height="16" rx="2"/><path d="M28 22h6l6 6v4H28"/><circle cx="13" cy="32" r="3"/><circle cx="36" cy="32" r="3"/><line x1="4" y1="20" x2="11" y2="20"/><line x1="4" y1="25" x2="9" y2="25"/></svg>`
);

const RETURNS_ICON = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 16L6 24l8 8"/><path d="M6 24h28a8 8 0 000-16H22"/></svg>`
);

const AFTERPAY_ICON = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 14l8 10-8 10"/><path d="M10 14l8 10-8 10"/></svg>`
);

const ALO_APP_ICON = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#000"/><text x="24" y="30" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="18" font-weight="900" fill="#FFF">alo</text></svg>`
);

const ALO_WELLNESS_ICON = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><text x="28" y="26" text-anchor="middle" font-family="Arial Black,sans-serif" font-size="22" font-weight="900" fill="#000">alo</text><text x="28" y="38" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" font-weight="700" fill="#000" letter-spacing="1">WELLNESS</text><text x="28" y="48" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" font-weight="700" fill="#000" letter-spacing="1">CLUB</text></svg>`
);

const LOCATION_ICON = svg(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 48" fill="#000"><path d="M16 0C7.2 0 0 7.2 0 16c0 12 16 32 16 32s16-20 16-32C32 7.2 24.8 0 16 0zm0 22c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"/></svg>`
);

/* ═══════════════════════════════════════════════════
   Unsplash 占位图
   ═══════════════════════════════════════════════════ */

const PRODUCT_IMG = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=450&fit=crop&auto=format&q=80';

/* ═══════════════════════════════════════════════════
   共用常量与辅助函数
   ═══════════════════════════════════════════════════ */

const noBorder: BorderConfig = {
  mode: 'unified',
  unified: '0px', color: COLORS.border, style: 'solid',
};

function w(overrides: Partial<WrapperStyle> = {}): WrapperStyle {
  return {
    widthMode: 'fill',
    heightMode: 'fitContent',
    backgroundType: 'color',
    backgroundColor: 'rgba(255, 255, 255, 0)',
    padding: { mode: 'unified', unified: '0' },
    margin: { mode: 'unified', unified: '0' },
    border: { ...noBorder },
    borderRadius: { mode: 'unified', unified: '0' },
    contentAlign: { horizontal: 'center', vertical: 'top' },
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════
   工厂函数：服务特色列（icon + label）
   ═══════════════════════════════════════════════════ */

function createServiceColumn(iconSrc: string, label: string): EmailComponent {
  return {
    id: nanoid(),
    type: 'layout',
    wrapperStyle: w({
      padding: { mode: 'separate', top: '0', right: '4px', bottom: '0', left: '4px' },
    }),
    props: {
      gap: SPACING.tight,
      direction: 'vertical',
      distribution: 'packed',
    } satisfies LayoutProps,
    children: [
      {
        id: nanoid(),
        type: 'icon',
        wrapperStyle: w({ padding: { mode: 'unified', unified: '0' } }),
        props: {
          iconType: 'custom',
          sizeMode: 'height',
          customSrc: iconSrc,
          size: '28',
          color: COLORS.primary,
          link: '',
        } satisfies IconProps,
      },
      {
        id: nanoid(),
        type: 'text',
        wrapperStyle: w({ padding: { mode: 'unified', unified: '0' } }),
        props: {
          content: textHtml(`**${label}**`, { fontSize: TYPO.label.fontSize, color: COLORS.body, fontWeight: TYPO.label.fontWeight, lineHeight: '1.4' }),
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        } satisfies TextProps,
      },
    ],
  };
}

/* 品牌功能列（icon + label），图标更大 */
function createBrandColumn(iconSrc: string, label: string): EmailComponent {
  return {
    id: nanoid(),
    type: 'layout',
    wrapperStyle: w({
      padding: { mode: 'separate', top: '0', right: '4px', bottom: '0', left: '4px' },
    }),
    props: {
      gap: SPACING.tight,
      direction: 'vertical',
      distribution: 'packed',
    } satisfies LayoutProps,
    children: [
      {
        id: nanoid(),
        type: 'icon',
        wrapperStyle: w({ padding: { mode: 'unified', unified: '0' } }),
        props: {
          iconType: 'custom',
          sizeMode: 'height',
          customSrc: iconSrc,
          size: '40',
          color: COLORS.primary,
          link: '',
        } satisfies IconProps,
      },
      {
        id: nanoid(),
        type: 'text',
        wrapperStyle: w({ padding: { mode: 'unified', unified: '0' } }),
        props: {
          content: textHtml(`**${label}**`, { fontSize: TYPO.label.fontSize, color: COLORS.body, fontWeight: TYPO.label.fontWeight, lineHeight: '1.3' }),
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        } satisfies TextProps,
      },
    ],
  };
}

/* ═══════════════════════════════════════════════════
   主模板函数
   ═══════════════════════════════════════════════════ */

export function createAloAbandonedCartTemplate(): EmailComponent[] {
  return [
    /* ── 1. alo Logo ── */
    {
      id: nanoid(),
      type: 'icon',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '32px', right: '0', bottom: SPACING.element, left: '0' },
      }),
      props: {
        iconType: 'custom',
        sizeMode: 'height',
        customSrc: ALO_LOGO,
        size: '40',
        color: COLORS.primary,
        link: '',
      } satisfies IconProps,
    },

    /* ── 2. 副标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '40px', bottom: '4px', left: '40px' },
      }),
      props: {
        content: textHtml('GOING, GOING, ALMOST GONE', { fontSize: TYPO.h2.fontSize, color: COLORS.muted, fontWeight: TYPO.h2.fontWeight, lineHeight: '1.4' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 3. 主标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '40px', bottom: SPACING.element, left: '40px' },
      }),
      props: {
        content: textHtml('**LOW STOCK ALERT**', { fontSize: TYPO.h1.fontSize, color: COLORS.heading, fontWeight: TYPO.h1.fontWeight, lineHeight: '1.2' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 4. 产品图片 ── */
    {
      id: nanoid(),
      type: 'image',
      wrapperStyle: w({
        padding: { mode: 'unified', unified: '0' },
      }),
      props: {
        src: PRODUCT_IMG,
        alt: 'Supernatural Sweater Cardigan',
        link: '',
        sizeConfig: { mode: 'fill' },
        borderRadius: { mode: 'unified', unified: '0' },
        layoutMode: false,
        layoutPadding: { mode: 'unified', unified: '0' },
      } satisfies ImageProps,
    },

    /* ── 5. "6 LEFT" ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: SPACING.element, right: '0', bottom: SPACING.element, left: '0' },
      }),
      props: {
        content: textHtml('6 LEFT', { fontSize: TYPO.caption.fontSize, color: COLORS.body, fontWeight: TYPO.caption.fontWeight, lineHeight: '1.4' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 6. 描述文字 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '40px', bottom: '24px', left: '40px' },
      }),
      props: {
        content: textHtml('The Supernatural Sweater Cardigan in your bag is going fast. Get to your cart now before it sells out.', { fontSize: TYPO.body.fontSize, color: COLORS.body, fontWeight: TYPO.body.fontWeight, lineHeight: '1.6' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 7. CHECKOUT NOW 按钮 ── */
    {
      id: nanoid(),
      type: 'button',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '24px', bottom: '0', left: '24px' },
      }),
      props: {
        text: 'CHECKOUT NOW',
        buttonStyle: 'solid',
        backgroundColor: COLORS.accent,
        textColor: '#FFFFFF',
        borderColor: COLORS.accent,
        ...TYPO.button,
        fontStyle: 'normal',
        textDecoration: 'none',
        fontMode: 'inherit',
        fontFamily: '',
        borderRadius: '0',
        padding: { mode: 'separate', top: '16px', right: '0', bottom: '16px', left: '0' },
        widthMode: 'fill',
        link: '',
      } satisfies ButtonProps,
    },

    /* ── 8. 分割线 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w({
        padding: { mode: 'separate', top: SPACING.section, right: '20px', bottom: '0', left: '20px' },
      }),
      props: {
        dividerStyle: 'line',
        color: COLORS.border,
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 9. 服务特色区（3列） ── */
    {
      id: nanoid(),
      type: 'grid',
      wrapperStyle: w({
        backgroundColor: COLORS.mutedBg,
        padding: { mode: 'separate', top: '24px', right: '12px', bottom: '24px', left: '12px' },
      }),
      props: {
        columnsPerRow: 3,
        slots: 3,
        gap: '0px',
      } satisfies GridProps,
      children: [
        createServiceColumn(SHIPPING_ICON, 'FAST & FREE\nSHIPPING'),
        createServiceColumn(RETURNS_ICON, 'FREE RETURNS\n& EXCHANGES'),
        createServiceColumn(AFTERPAY_ICON, 'PAY LATER\nWITH AFTERPAY'),
      ],
    },

    /* ── 10. 分割线 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '20px', bottom: '0', left: '20px' },
      }),
      props: {
        dividerStyle: 'line',
        color: COLORS.border,
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 11. 社交媒体图标行 ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        widthMode: 'fitContent',
        padding: { mode: 'separate', top: '24px', right: '0', bottom: '24px', left: '0' },
      }),
      props: {
        gap: '20px',
        direction: 'horizontal',
        distribution: 'packed',
      } satisfies LayoutProps,
      children: [
        {
          id: nanoid(),
          type: 'icon',
          wrapperStyle: w({ padding: { mode: 'unified', unified: '2px' } }),
          props: {
            iconType: 'custom',
            sizeMode: 'height',
            customSrc: '/images/icon-instagram.svg',
            size: '32',
            color: COLORS.primary,
            link: '',
          } satisfies IconProps,
        },
        {
          id: nanoid(),
          type: 'icon',
          wrapperStyle: w({ padding: { mode: 'unified', unified: '2px' } }),
          props: {
            iconType: 'custom',
            sizeMode: 'height',
            customSrc: '/images/icon-tiktok.svg',
            size: '32',
            color: COLORS.primary,
            link: '',
          } satisfies IconProps,
        },
        {
          id: nanoid(),
          type: 'icon',
          wrapperStyle: w({ padding: { mode: 'unified', unified: '2px' } }),
          props: {
            iconType: 'custom',
            sizeMode: 'height',
            customSrc: '/images/icon-youtube.svg',
            size: '32',
            color: COLORS.primary,
            link: '',
          } satisfies IconProps,
        },
        {
          id: nanoid(),
          type: 'icon',
          wrapperStyle: w({ padding: { mode: 'unified', unified: '2px' } }),
          props: {
            iconType: 'custom',
            sizeMode: 'height',
            customSrc: '/images/icon-facebook.svg',
            size: '32',
            color: COLORS.primary,
            link: '',
          } satisfies IconProps,
        },
      ],
    },

    /* ── 12. 分割线 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '20px', bottom: '0', left: '20px' },
      }),
      props: {
        dividerStyle: 'line',
        color: COLORS.border,
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 13. 品牌功能区（3列） ── */
    {
      id: nanoid(),
      type: 'grid',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '24px', right: '12px', bottom: '24px', left: '12px' },
      }),
      props: {
        columnsPerRow: 3,
        slots: 3,
        gap: '0px',
      } satisfies GridProps,
      children: [
        createBrandColumn(ALO_APP_ICON, 'SHOP THE APP'),
        createBrandColumn(ALO_WELLNESS_ICON, 'MOVE AT HOME'),
        createBrandColumn(LOCATION_ICON, 'FIND A STORE'),
      ],
    },

    /* ── 14. 页脚 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: SPACING.element, right: '40px', bottom: SPACING.section, left: '40px' },
      }),
      props: {
        content: textHtml(
          'Copyright © 2025 Alo, LLC. All rights reserved.\nYou are receiving this email because you opted in at one of our Alo Yoga properties.\nOur mailing address is:\n6670 Flotilla St Commerce, CA 90040\n[View in Browser]()\n[Unsubscribe]()',
          { fontSize: TYPO.footer.fontSize, color: COLORS.footerText, fontWeight: TYPO.footer.fontWeight, lineHeight: '1.8' }
        ),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },
  ];
}

/* ═══════════════════════════════════════════════════
   画布配置
   ═══════════════════════════════════════════════════ */

export const aloAbandonedCartTemplateConfig: TemplateConfig = {
  outerBackgroundColor: '#FFFFFF',
  backgroundType: 'color',
  backgroundColor: '#FFFFFF',
  padding: { mode: 'unified', unified: '0' },
  margin: { mode: 'unified', unified: '0' },
  border: { ...noBorder },
  borderRadius: { mode: 'unified', unified: '0' },
  contentAlign: { horizontal: 'center', vertical: 'top' },
  contentDistribution: 'packed',
  contentGap: '0px',
  width: '600px',
  fontFamily: "Arial, Helvetica, sans-serif",
};
