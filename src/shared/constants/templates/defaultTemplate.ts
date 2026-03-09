/**
 * 内建邮件模板「Your viewed items」—— 基于 On 品牌邮件设计
 * 供 BUILTIN_TEMPLATES 与 seedBuiltinTemplatesIfNeeded 使用，用于补齐缺失的内建模板
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
} from '../../types/email';
import { getDefaultTemplateConfig } from '../emailDefaults';
import { DEFAULT_TEXT_FONT_FAMILY } from '../fontOptions';
import { textHtml } from '../textHtml';

/* ─── 共用常量 ─── */

const noBorder: BorderConfig = {
  mode: 'unified',
  unified: '0px',
  color: '#E0E5EB',
  style: 'solid',
};

/** 快速建立 WrapperStyle，预设透明背景、无边框、水平置中、自适应铺满 */
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

/* ─── 產品卡片工廠 ─── */

function createProductCard(name: string, src = ''): EmailComponent {
  return {
    id: nanoid(),
    type: 'layout',
    wrapperStyle: w({
      padding: { mode: 'separate', top: '0', right: '0', bottom: '16px', left: '0' },
      border: {
        mode: 'unified',
        unified: '1px',
        color: '#E0E5EB',
        style: 'solid',
      },
    }),
    props: {
      gap: '0px',
      direction: 'vertical',
      distribution: 'packed',
    } satisfies LayoutProps,
    children: [
      // 產品圖片
      {
        id: nanoid(),
        type: 'image',
        wrapperStyle: w({
          padding: { mode: 'separate', top: '0', right: '10px', bottom: '0', left: '10px' },
        }),
        props: {
          src,
          alt: name,
          link: '',
          sizeConfig: { mode: 'fixed', width: '240px', height: '160px' },
          borderRadius: { mode: 'unified', unified: '0' },
          layoutMode: false,
          layoutPadding: { mode: 'unified', unified: '0' },
        } satisfies ImageProps,
      },
      // 產品名稱
      {
        id: nanoid(),
        type: 'text',
        wrapperStyle: w({
          padding: { mode: 'separate', top: '10px', right: '0', bottom: '6px', left: '0' },
        }),
        props: {
          content: textHtml(name, { fontSize: '13px', color: '#1A1A1A', fontWeight: '400', lineHeight: '1.4' }),
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        } satisfies TextProps,
      },
      // Check availability 按钮（自适应宽度，卡片内居中）
      {
        id: nanoid(),
        type: 'button',
        wrapperStyle: w({
          widthMode: 'fitContent', heightMode: 'fitContent',
          padding: { mode: 'separate', top: '2px', right: '0', bottom: '0', left: '0' },
        }),
        props: {
          text: 'Check availability',
          buttonStyle: 'outlined',
          backgroundColor: '#FFFFFF',
          textColor: '#1A1A1A',
          borderColor: '#1A1A1A',
          fontSize: '11px',
          fontWeight: '400',
          fontStyle: 'normal',
          textDecoration: 'none',
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          borderRadius: '0',
          padding: { mode: 'separate', top: '6px', right: '16px', bottom: '6px', left: '16px' },
          link: '',
          widthMode: 'fitContent',
        } satisfies ButtonProps,
      },
    ],
  };
}

/* ─── 分类图片工厂（布局模式 + 文字叠加在左下角） ─── */

function createCategoryImage(label: string, src = ''): EmailComponent {
  return {
    id: nanoid(),
    type: 'image',
    wrapperStyle: w({
      contentAlign: { horizontal: 'left', vertical: 'bottom' },
    }),
    props: {
      src,
      alt: label,
      link: '',
      sizeConfig: { mode: 'fill' },
      borderRadius: { mode: 'unified', unified: '4px' },
      layoutMode: true,
      layoutPadding: { mode: 'separate', top: '0', right: '0', bottom: '12px', left: '12px' },
    } satisfies ImageProps,
    children: [
      {
        id: nanoid(),
        type: 'text',
        wrapperStyle: w({
          widthMode: 'fitContent', heightMode: 'fitContent',
          contentAlign: { horizontal: 'left', vertical: 'top' },
          padding: { mode: 'unified', unified: '0' },
        }),
        props: {
          content: textHtml(`**${label}**`, { fontSize: '14px', color: '#FFFFFF', fontWeight: '400', lineHeight: '1.3' }),
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        } satisfies TextProps,
      },
    ],
  };
}

/* ─── Unsplash 圖片 URL ─── */

/** 构建 Unsplash 图片 URL，指定宽度与裁切 */
const unsplash = (id: string, w: number, h: number) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

/* 產品圖片 */
const HERO_IMG     = unsplash('photo-1585063395665-b8ad4acbb9af', 480, 320); // 黑色跑鞋
const SHOE_BLACK   = unsplash('photo-1585063395665-b8ad4acbb9af', 260, 180); // Cloud 黑
const SHOE_ORANGE  = unsplash('photo-1491553895911-0055eca6402d', 260, 180); // Cloud 橘
const SHOE_WHITE_A = unsplash('photo-1606107557195-0e29a4b5b4aa', 260, 180); // Cloudventure 白
const SHOE_WHITE_B = unsplash('photo-1539185441755-769473a23570', 260, 180); // Cloudventure 米
const SHOE_TEAL    = unsplash('photo-1595950653106-6c9ebd614d3a', 260, 180); // Cloudflow 彩
const SHOE_RED     = unsplash('photo-1542291026-7eec264c27ff', 260, 180);    // Cloud 5 紅

/* 分類生活照 */
const CAT_MEN_SHOES     = unsplash('photo-1476480862126-209bfaa8edc8', 280, 190); // 男鞋
const CAT_WOMEN_SHOES   = unsplash('photo-1571019613454-1cb2f99b2d8b', 280, 190); // 女鞋
const CAT_MEN_APPAREL   = unsplash('photo-1517836357463-d25dfeac3438', 280, 190); // 男裝
const CAT_WOMEN_APPAREL = unsplash('photo-1518611012118-696072aa579a', 280, 190); // 女裝

/* ─── 主模板函數 ─── */

export function createDefaultTemplate(): EmailComponent[] {
  return [
    /* ── 1. 品牌 Logo ── */
    {
      id: nanoid(),
      type: 'icon',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '32px', right: '0', bottom: '24px', left: '0' },
      }),
      props: {
        iconType: 'custom',
        sizeMode: 'height',
        customSrc: '/images/on-logo.svg',
        size: '46',
        color: '#1A1A1A',
        link: '',
      } satisfies IconProps,
    },

    /* ── 2. 主标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '60px', bottom: '8px', left: '60px' },
      }),
      props: {
        content: textHtml('**Your viewed items are selling fast**', { fontSize: '22px', color: '#1A1A1A', fontWeight: '400', lineHeight: '1.35' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 3. 副标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '60px', bottom: '24px', left: '60px' },
      }),
      props: {
        content: textHtml('Add them to your cart with free shipping.', { fontSize: '14px', color: '#5C6B7A', fontWeight: '400', lineHeight: '1.5' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 4. 主打產品圖片 ── */
    {
      id: nanoid(),
      type: 'image',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '60px', bottom: '16px', left: '60px' },
      }),
      props: {
        src: HERO_IMG,
        alt: 'Featured Product',
        link: '',
        sizeConfig: { mode: 'fixed', width: '480px', height: '320px' },
        borderRadius: { mode: 'unified', unified: '0' },
        layoutMode: false,
        layoutPadding: { mode: 'unified', unified: '0' },
      } satisfies ImageProps,
    },

    /* ── 5. 產品名稱 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '4px', right: '0', bottom: '10px', left: '0' },
      }),
      props: {
        content: textHtml('**Cloud**', { fontSize: '16px', color: '#1A1A1A', fontWeight: '400', lineHeight: '1.4' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 6. Shop now 按钮（自适应宽度，画布居中） ── */
    {
      id: nanoid(),
      type: 'button',
      wrapperStyle: w({
        widthMode: 'fitContent', heightMode: 'fitContent',
        padding: { mode: 'separate', top: '0', right: '0', bottom: '32px', left: '0' },
      }),
      props: {
        text: 'Shop now',
        buttonStyle: 'outlined',
        backgroundColor: '#FFFFFF',
        textColor: '#1A1A1A',
        borderColor: '#1A1A1A',
        fontSize: '14px',
        fontWeight: '400',
        fontStyle: 'normal',
        textDecoration: 'none',
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        borderRadius: '0',
        padding: { mode: 'separate', top: '10px', right: '36px', bottom: '10px', left: '36px' },
        link: '',
        widthMode: 'fitContent',
      } satisfies ButtonProps,
    },

    /* ── 7. 分隔線 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '40px', bottom: '0', left: '40px' },
      }),
      props: {
        dividerStyle: 'line',
        color: '#E0E5EB',
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 8. 「Your recently viewed products」标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '28px', right: '0', bottom: '20px', left: '0' },
      }),
      props: {
        content: textHtml('**Your recently viewed products**', { fontSize: '18px', color: '#1A1A1A', fontWeight: '400', lineHeight: '1.3' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 9. 產品網格 2×3 ── */
    {
      id: nanoid(),
      type: 'grid',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '20px', bottom: '0', left: '20px' },
      }),
      props: {
        columnsPerRow: 2,
        slots: 6,
        gap: '12px',
      } satisfies GridProps,
      children: [
        createProductCard('Cloud', SHOE_BLACK),
        createProductCard('Cloud', SHOE_ORANGE),
        createProductCard('Cloudventure', SHOE_WHITE_A),
        createProductCard('Cloudventure', SHOE_WHITE_B),
        createProductCard('Cloudflow', SHOE_TEAL),
        createProductCard('Cloud 5', SHOE_RED),
      ],
    },

    /* ── 10. 分隔線 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '12px', right: '40px', bottom: '0', left: '40px' },
      }),
      props: {
        dividerStyle: 'line',
        color: '#E0E5EB',
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 11. 「Shop by category」标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '28px', right: '0', bottom: '20px', left: '0' },
      }),
      props: {
        content: textHtml('**Shop by category**', { fontSize: '18px', color: '#1A1A1A', fontWeight: '400', lineHeight: '1.3' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 12. 分类图片网格 2×2（布局模式图片 + 文字叠加） ── */
    {
      id: nanoid(),
      type: 'grid',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '0', right: '20px', bottom: '24px', left: '20px' },
      }),
      props: {
        columnsPerRow: 2,
        slots: 4,
        gap: '8px',
      } satisfies GridProps,
      children: [
        createCategoryImage('Men\'s shoes', CAT_MEN_SHOES),
        createCategoryImage('Women\'s shoes', CAT_WOMEN_SHOES),
        createCategoryImage('Men\'s apparel', CAT_MEN_APPAREL),
        createCategoryImage('Women\'s apparel', CAT_WOMEN_APPAREL),
      ],
    },

    /* ── 13. FREE STANDARD SHIPPING（设计图：细浅灰边框包围） ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '24px', right: '24px', bottom: '16px', left: '24px' },
        border: {
          mode: 'unified',
          unified: '1px',
          color: '#E0E5EB',
          style: 'solid',
        },
      }),
      props: {
        content: textHtml('**FREE STANDARD SHIPPING**', { fontSize: '11px', color: '#1A1A1A', fontWeight: '400', lineHeight: '1.5' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 14. 底部品牌 Logo ── */
    {
      id: nanoid(),
      type: 'icon',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '12px', right: '0', bottom: '12px', left: '0' },
      }),
      props: {
        iconType: 'custom',
        sizeMode: 'height',
        customSrc: '/images/on-logo.svg',
        size: '36',
        color: '#1A1A1A',
        link: '',
      } satisfies IconProps,
    },

    /* ── 15. 社交图标 (3个，自适应宽度，画布居中) ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        widthMode: 'fitContent', heightMode: 'fitContent',
        padding: { mode: 'separate', top: '4px', right: '0', bottom: '4px', left: '0' },
        contentAlign: { horizontal: 'center', vertical: 'center' },
      }),
      props: {
        gap: '12px',
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
            customSrc: '/images/icon-facebook.svg',
            size: '28',
            color: '#1A1A1A',
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
            customSrc: '/images/icon-instagram.svg',
            size: '28',
            color: '#1A1A1A',
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
            size: '28',
            color: '#1A1A1A',
            link: '',
          } satisfies IconProps,
        },
      ],
    },

    /* ── 16. VIEW IN BROWSER / UNSUBSCRIBE（設計圖） ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '16px', right: '0', bottom: '4px', left: '0' },
      }),
      props: {
        content: textHtml('**VIEW IN BROWSER**\n**UNSUBSCRIBE**', { fontSize: '10px', color: '#8A949C', fontWeight: '400', lineHeight: '2' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 17. 版权信息 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '8px', right: '0', bottom: '4px', left: '0' },
      }),
      props: {
        content: textHtml('© 2022', { fontSize: '10px', color: '#8A949C', fontWeight: '400', lineHeight: '1.5' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 18. 免責聲明 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: { mode: 'separate', top: '4px', right: '60px', bottom: '24px', left: '60px' },
      }),
      props: {
        content: textHtml('*Free standard shipping applies only to orders above $35.*', { fontSize: '10px', color: '#8A949C', fontWeight: '400', lineHeight: '1.5' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },
  ];
}

/* ─── 预设画布配置（与 emailDefaults.getDefaultTemplateConfig 一致） ─── */

export const defaultEmailTemplateConfig: TemplateConfig = getDefaultTemplateConfig();
