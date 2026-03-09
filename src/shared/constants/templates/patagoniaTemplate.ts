/**
 * Patagonia 戶外食品郵件模板 —— 「Never Hike on an Empty Stomach」
 * 还原 Patagonia Provisions 风格的户外食品推广邮件
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
  IconProps,
  BorderConfig,
} from '../../types/email';
import { DEFAULT_TEXT_FONT_FAMILY } from '../fontOptions';
import { textHtml } from '../textHtml';

/* ─── 共用常量 ─── */

const noBorder: BorderConfig = {
  mode: 'unified',
  unified: '0px',
  color: '#E0E5EB',
  style: 'solid',
};

/** 快速建立 WrapperStyle */
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

/* ─── Patagonia 品牌色 ─── */
const PATAGONIA_TEAL = '#004F42';
const PATAGONIA_DARK = '#1A1A1A';
const PATAGONIA_WHITE = '#FFFFFF';
const PATAGONIA_GRAY = '#666666';
const PATAGONIA_LIGHT_BG = '#F5F3EF';

/* ─── Unsplash 圖片 URL ─── */

const unsplash = (id: string, w: number, h: number) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&auto=format&q=80`;

/* 主圖與產品圖 */
const HERO_IMG = unsplash('photo-1528605248644-14dd04022da1', 600, 400);
const CHILE_MANGO_IMG = unsplash('photo-1587049352851-8d4e89133924', 280, 280);
const VENISON_IMG = unsplash('photo-1585325701165-351af916e581', 280, 280);
const BUFFALO_IMG = unsplash('photo-1551024601-bec78aea704b', 280, 280);
const TRAIL_BOOK_IMG = unsplash('photo-1544947950-fa07a98d237f', 300, 340);
const BURRITO_IMG = unsplash('photo-1584208632869-05fa2b2a5934', 460, 320);

/* ─── 產品行工廠（含折扣徽章） ─── */

/** 产品图片（带折扣徽章覆盖） */
function createProductImage(
  alt: string,
  src: string,
  badge: string
): EmailComponent {
  return {
    id: nanoid(),
    type: 'image',
    wrapperStyle: w({
      contentAlign: { horizontal: 'left', vertical: 'top' },
    }),
    props: {
      src,
      alt,
      link: '',
      sizeConfig: { mode: 'fill' },
      borderRadius: { mode: 'unified', unified: '8px' },
      layoutMode: true,
      layoutPadding: {
        mode: 'separate',
        top: '10px',
        right: '10px',
        bottom: '10px',
        left: '10px',
      },
    } satisfies ImageProps,
    children: [
      {
        id: nanoid(),
        type: 'text',
        wrapperStyle: w({
          widthMode: 'fitContent', heightMode: 'fitContent',
          backgroundColor: PATAGONIA_DARK,
          padding: {
            mode: 'separate',
            top: '4px',
            right: '12px',
            bottom: '4px',
            left: '12px',
          },
          borderRadius: { mode: 'unified', unified: '3px' },
        }),
        props: {
          content: textHtml(`**${badge}**`, { fontSize: '11px', color: PATAGONIA_WHITE, fontWeight: '400', lineHeight: '1.4' }),
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        } satisfies TextProps,
      },
    ],
  };
}

/** 产品信息列（名称 + 购买按钮） */
function createProductInfo(name: string): EmailComponent {
  return {
    id: nanoid(),
    type: 'layout',
    wrapperStyle: w({
      contentAlign: { horizontal: 'center', vertical: 'center' },
      padding: {
        mode: 'separate',
        top: '20px',
        right: '16px',
        bottom: '20px',
        left: '16px',
      },
    }),
    props: {
      gap: '12px',
      direction: 'vertical',
      distribution: 'packed',
    } satisfies LayoutProps,
    children: [
      {
        id: nanoid(),
        type: 'text',
        wrapperStyle: w(),
        props: {
          content: textHtml(`**${name}**`, { fontSize: '18px', color: PATAGONIA_DARK, fontWeight: '400', lineHeight: '1.4' }),
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        } satisfies TextProps,
      },
      {
        id: nanoid(),
        type: 'button',
        wrapperStyle: w({ widthMode: 'fitContent' }),
        props: {
          text: `Shop ${name}`,
          buttonStyle: 'solid',
          backgroundColor: PATAGONIA_DARK,
          textColor: PATAGONIA_WHITE,
          borderColor: PATAGONIA_DARK,
          fontSize: '12px',
          fontWeight: '400',
          fontStyle: 'normal',
          textDecoration: 'none',
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          borderRadius: '4px',
          padding: { mode: 'separate', top: '8px', right: '20px', bottom: '8px', left: '20px' },
          widthMode: 'fitContent',
          link: '',
        } satisfies ButtonProps,
      },
    ],
  };
}

/** 产品行（图片在左、信息在右） */
function createProductRowImageLeft(
  name: string,
  src: string,
  badge: string
): EmailComponent {
  return {
    id: nanoid(),
    type: 'layout',
    wrapperStyle: w({
      padding: {
        mode: 'separate',
        top: '6px',
        right: '24px',
        bottom: '6px',
        left: '24px',
      },
    }),
    props: {
      gap: '12px',
      direction: 'horizontal',
      distribution: 'packed',
    } satisfies LayoutProps,
    children: [createProductImage(name, src, badge), createProductInfo(name)],
  };
}

/** 产品行（信息在左、图片在右） */
function createProductRowImageRight(
  name: string,
  src: string,
  badge: string
): EmailComponent {
  return {
    id: nanoid(),
    type: 'layout',
    wrapperStyle: w({
      padding: {
        mode: 'separate',
        top: '6px',
        right: '24px',
        bottom: '6px',
        left: '24px',
      },
    }),
    props: {
      gap: '12px',
      direction: 'horizontal',
      distribution: 'packed',
    } satisfies LayoutProps,
    children: [createProductInfo(name), createProductImage(name, src, badge)],
  };
}

/* ─── 主模板函數 ─── */

export function createPatagoniaTemplate(): EmailComponent[] {
  return [
    /* ── 1. Patagonia Logo ── */
    {
      id: nanoid(),
      type: 'icon',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '24px',
          right: '0',
          bottom: '12px',
          left: '0',
        },
      }),
      props: {
        iconType: 'custom',
        sizeMode: 'height',
        customSrc: '/images/patagonia-logo.svg',
        size: '60',
        color: PATAGONIA_DARK,
        link: '',
      } satisfies IconProps,
    },

    /* ── 2. 導航文字 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '0',
          right: '0',
          bottom: '16px',
          left: '0',
        },
      }),
      props: {
        content: textHtml('Shop    Why Food?    Recipes', { fontSize: '13px', color: PATAGONIA_DARK, fontWeight: '400', lineHeight: '1.5' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 3. FREE SHIPPING 橫幅 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        backgroundColor: PATAGONIA_TEAL,
        padding: {
          mode: 'separate',
          top: '10px',
          right: '20px',
          bottom: '10px',
          left: '20px',
        },
      }),
      props: {
        content: textHtml('**FREE SHIPPING ON ALL ORDERS OVER $99**', { fontSize: '11px', color: PATAGONIA_WHITE, fontWeight: '400', lineHeight: '1.5' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 4. Hero 大圖（戶外用餐場景） ── */
    {
      id: nanoid(),
      type: 'image',
      wrapperStyle: w(),
      props: {
        src: HERO_IMG,
        alt: 'People enjoying trail food outdoors',
        link: '',
        sizeConfig: { mode: 'fill' },
        borderRadius: { mode: 'unified', unified: '0' },
        layoutMode: false,
        layoutPadding: { mode: 'unified', unified: '0' },
      } satisfies ImageProps,
    },

    /* ── 5. 主标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '32px',
          right: '40px',
          bottom: '12px',
          left: '40px',
        },
      }),
      props: {
        content: textHtml('**Never Hike on an Empty Stomach**', { fontSize: '26px', color: PATAGONIA_DARK, fontWeight: '400', lineHeight: '1.3' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 6. 副标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '0',
          right: '50px',
          bottom: '24px',
          left: '50px',
        },
      }),
      props: {
        content: textHtml(
          'Hungry to get out on the trail this spring? Stock up during our limited time sale to fuel your springtime explorations.',
          { fontSize: '14px', color: PATAGONIA_GRAY, fontWeight: '400', lineHeight: '1.6' }
        ),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 7. Shop Trail Food 按钮 ── */
    {
      id: nanoid(),
      type: 'button',
      wrapperStyle: w({
        widthMode: 'fitContent', heightMode: 'fitContent',
        padding: {
          mode: 'separate',
          top: '0',
          right: '0',
          bottom: '32px',
          left: '0',
        },
      }),
      props: {
        text: 'Shop Trail Food',
        buttonStyle: 'solid',
        backgroundColor: PATAGONIA_DARK,
        textColor: PATAGONIA_WHITE,
        borderColor: PATAGONIA_DARK,
        fontSize: '14px',
        fontWeight: '400',
        fontStyle: 'normal',
        textDecoration: 'none',
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        borderRadius: '4px',
        padding: { mode: 'separate', top: '12px', right: '32px', bottom: '12px', left: '32px' },
        widthMode: 'fitContent',
        link: '',
      } satisfies ButtonProps,
    },

    /* ── 8. 產品行 1：Chile Mango（圖左、信息右） ── */
    createProductRowImageLeft('Chile Mango', CHILE_MANGO_IMG, '30% OFF'),

    /* ── 9. 產品行 2：Venison Links（信息左、圖右） ── */
    createProductRowImageRight('Venison Links', VENISON_IMG, '30% OFF'),

    /* ── 10. 產品行 3：Buffalo Links（圖左、信息右） ── */
    createProductRowImageLeft('Buffalo Links', BUFFALO_IMG, '80% OFF'),

    /* ── 11. Trail Ready 专区（两栏：深色背景+产品图） ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '20px',
          right: '0',
          bottom: '0',
          left: '0',
        },
      }),
      props: {
        gap: '0px',
        direction: 'horizontal',
        distribution: 'packed',
      } satisfies LayoutProps,
      children: [
        /* 左侧：深色背景 + Trail Ready 文字 + 按钮 */
        {
          id: nanoid(),
          type: 'layout',
          wrapperStyle: w({
            backgroundColor: PATAGONIA_TEAL,
            contentAlign: { horizontal: 'center', vertical: 'center' },
            padding: {
              mode: 'separate',
              top: '40px',
              right: '24px',
              bottom: '40px',
              left: '24px',
            },
          }),
          props: {
            gap: '16px',
            direction: 'vertical',
            distribution: 'packed',
          } satisfies LayoutProps,
          children: [
            {
              id: nanoid(),
              type: 'text',
              wrapperStyle: w(),
              props: {
                content: textHtml('**Trail Ready**', { fontSize: '28px', color: '#E85D3A', fontWeight: '400', lineHeight: '1.2' }),
                fontMode: 'inherit',
                fontFamily: DEFAULT_TEXT_FONT_FAMILY,
              } satisfies TextProps,
            },
            {
              id: nanoid(),
              type: 'button',
              wrapperStyle: w({ widthMode: 'fitContent' }),
              props: {
                text: 'Shop Meals + Snacks',
                buttonStyle: 'outlined',
                backgroundColor: 'rgba(255,255,255,0)',
                textColor: PATAGONIA_WHITE,
                borderColor: PATAGONIA_WHITE,
                fontSize: '11px',
                fontWeight: '400',
                fontStyle: 'normal',
                textDecoration: 'none',
                fontMode: 'inherit',
                fontFamily: DEFAULT_TEXT_FONT_FAMILY,
                borderRadius: '3px',
                padding: { mode: 'separate', top: '8px', right: '18px', bottom: '8px', left: '18px' },
                widthMode: 'fitContent',
                link: '',
              } satisfies ButtonProps,
            },
          ],
        },
        /* 右侧：产品图片 */
        {
          id: nanoid(),
          type: 'image',
          wrapperStyle: w(),
          props: {
            src: TRAIL_BOOK_IMG,
            alt: 'Trail food products',
            link: '',
            sizeConfig: { mode: 'fill' },
            borderRadius: { mode: 'unified', unified: '0' },
            layoutMode: false,
            layoutPadding: { mode: 'unified', unified: '0' },
          } satisfies ImageProps,
        },
      ],
    },

    /* ── 12. 間距分隔 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
      }),
      props: {
        dividerStyle: 'block',
        color: 'rgba(255,255,255,0)',
        height: '4px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 13. Need Recipe Ideas 区块（浅底色背景） ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        backgroundColor: PATAGONIA_LIGHT_BG,
        padding: {
          mode: 'separate',
          top: '32px',
          right: '40px',
          bottom: '32px',
          left: '40px',
        },
      }),
      props: {
        gap: '0px',
        direction: 'vertical',
        distribution: 'packed',
      } satisfies LayoutProps,
      children: [
        /* 標題 */
        {
          id: nanoid(),
          type: 'text',
          wrapperStyle: w({
            padding: {
              mode: 'separate',
              top: '0',
              right: '0',
              bottom: '20px',
              left: '0',
            },
          }),
          props: {
            content: textHtml('**Need Recipe Ideas?**', { fontSize: '24px', color: PATAGONIA_DARK, fontWeight: '400', lineHeight: '1.3' }),
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          } satisfies TextProps,
        },
        /* 墨西哥捲餅圖 */
        {
          id: nanoid(),
          type: 'image',
          wrapperStyle: w({
            padding: {
              mode: 'separate',
              top: '0',
              right: '0',
              bottom: '20px',
              left: '0',
            },
          }),
          props: {
            src: BURRITO_IMG,
            alt: 'Hearty breakfast burrito',
            link: '',
            sizeConfig: { mode: 'fill' },
            borderRadius: { mode: 'unified', unified: '8px' },
            layoutMode: false,
            layoutPadding: { mode: 'unified', unified: '0' },
          } satisfies ImageProps,
        },
        /* 描述文字 */
        {
          id: nanoid(),
          type: 'text',
          wrapperStyle: w({
            padding: {
              mode: 'separate',
              top: '0',
              right: '0',
              bottom: '20px',
              left: '0',
            },
          }),
          props: {
            content: textHtml(
              'We can get you out of a camping food rut with our guide to delicious camp-friendly meals. Like this hearty breakfast burrito stuffed with our Venison Links.',
              { fontSize: '14px', color: PATAGONIA_GRAY, fontWeight: '400', lineHeight: '1.6' }
            ),
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          } satisfies TextProps,
        },
        /* Explore Camping Recipes 按鈕 */
        {
          id: nanoid(),
          type: 'button',
          wrapperStyle: w({ widthMode: 'fitContent' }),
          props: {
            text: 'Explore Camping Recipes',
            buttonStyle: 'solid',
            backgroundColor: PATAGONIA_TEAL,
            textColor: PATAGONIA_WHITE,
            borderColor: PATAGONIA_TEAL,
            fontSize: '13px',
            fontWeight: '400',
            fontStyle: 'normal',
            textDecoration: 'none',
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
            borderRadius: '4px',
            padding: { mode: 'separate', top: '12px', right: '28px', bottom: '12px', left: '28px' },
            widthMode: 'fitContent',
            link: '',
          } satisfies ButtonProps,
        },
      ],
    },

    /* ── 14. 免責聲明（成分說明） ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '20px',
          right: '30px',
          bottom: '20px',
          left: '30px',
        },
      }),
      props: {
        content: textHtml(
          '*Ingredients: Pork, Blackberry, grits, Blueberries, Thai Brownies, Sri Lankan curry, drizzle*',
          { fontSize: '9px', color: '#8A949C', fontWeight: '400', lineHeight: '1.5' }
        ),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 15. 底部免責小字 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '0',
          right: '30px',
          bottom: '16px',
          left: '30px',
        },
      }),
      props: {
        content: textHtml(
          '*Processing is providing food safely, using the best ingredients available in our recipes, only GMO-free.*',
          { fontSize: '9px', color: '#8A949C', fontWeight: '400', lineHeight: '1.5' }
        ),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 16. 分隔線 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '0',
          right: '40px',
          bottom: '0',
          left: '40px',
        },
      }),
      props: {
        dividerStyle: 'line',
        color: '#E0E5EB',
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 17. 底部 Patagonia Logo（小） ── */
    {
      id: nanoid(),
      type: 'icon',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '24px',
          right: '0',
          bottom: '8px',
          left: '0',
        },
      }),
      props: {
        iconType: 'custom',
        sizeMode: 'height',
        customSrc: '/images/patagonia-logo.svg',
        size: '40',
        color: PATAGONIA_DARK,
        link: '',
      } satisfies IconProps,
    },

    /* ── 18. Visit Us ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '8px',
          right: '0',
          bottom: '8px',
          left: '0',
        },
      }),
      props: {
        content: textHtml('**Visit Us**', { fontSize: '12px', color: PATAGONIA_DARK, fontWeight: '400', lineHeight: '1.5' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 19. 社交图标（3个） ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        widthMode: 'fitContent', heightMode: 'fitContent',
        padding: {
          mode: 'separate',
          top: '4px',
          right: '0',
          bottom: '12px',
          left: '0',
        },
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
            customSrc: '/images/icon-twitter.svg',
            size: '28',
            color: PATAGONIA_DARK,
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
            color: PATAGONIA_DARK,
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
            color: PATAGONIA_DARK,
            link: '',
          } satisfies IconProps,
        },
      ],
    },

    /* ── 20. Contact Us | Unsubscribe ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '4px',
          right: '0',
          bottom: '12px',
          left: '0',
        },
      }),
      props: {
        content: textHtml('Contact Us | Unsubscribe', { fontSize: '11px', color: '#8A949C', fontWeight: '400', lineHeight: '1.5' }),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 21. 促销免运说明 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '4px',
          right: '40px',
          bottom: '4px',
          left: '40px',
        },
      }),
      props: {
        content: textHtml(
          '**\\*Promotion Free Shipping details:**\nFree standard shipping applies to orders over $99 after discounts and before taxes. Offer valid only for shipments within the United States only. Offer good on first-come, first-served basis and is subject to availability with United States only. Offer valid at time of purchase only. No rain checks.',
          { fontSize: '9px', color: '#8A949C', fontWeight: '400', lineHeight: '1.6' }
        ),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 22. 地址与版权 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        padding: {
          mode: 'separate',
          top: '12px',
          right: '40px',
          bottom: '24px',
          left: '40px',
        },
      }),
      props: {
        content: textHtml(
          'This email was sent to hello@patagonia.email\n259 W Santa Clara St, Ventura, CA 93001\n©2025 Patagonia, Inc.',
          { fontSize: '9px', color: '#8A949C', fontWeight: '400', lineHeight: '1.8' }
        ),
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },
  ];
}

/* ─── 预设画布配置 ─── */

export const patagoniaEmailTemplateConfig: TemplateConfig = {
  outerBackgroundColor: '#E8ECF1',
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
  fontFamily: "'Georgia', 'Times New Roman', serif",
};
