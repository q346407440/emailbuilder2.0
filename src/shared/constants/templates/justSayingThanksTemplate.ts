/**
 * Guitar Center "Just Saying Thanks" 优惠券邮件模板
 * 还原 Guitar Center 感谢订阅 + 15% OFF 优惠券邮件设计
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
  GridProps,
  BorderConfig,
} from '../../types/email';
import { DEFAULT_TEXT_FONT_FAMILY } from '../fontOptions';
import { textHtml } from '../textHtml';

/* ─── 共用辅助 ─── */

const noBorder: BorderConfig = {
  mode: 'unified',
  unified: '0px',
  color: '#E0E5EB',
  style: 'solid',
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

/* ─── Guitar Center 品牌色 ─── */
const GC_RED = '#CC0000';
const GC_HERO_DARK = '#1B4D5E';
const GC_WHITE = '#FFFFFF';
const GC_BLACK = '#1A1A1A';

/* ─── 图片 URL ─── */
const GC_LOGO_URL =
  'https://upload.wikimedia.org/wikipedia/en/thumb/6/6e/Guitar_Center_Logo.svg/200px-Guitar_Center_Logo.svg.png';
const KEYBOARD_IMG =
  'https://images.unsplash.com/photo-1593814681464-eef5af2b0628?w=600&h=340&fit=crop&auto=format&q=80';
const BARCODE_IMG =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/UPC-A-036000291452.svg/320px-UPC-A-036000291452.svg.png';
const APPSTORE_IMG =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Download_on_the_App_Store_Badge.svg/180px-Download_on_the_App_Store_Badge.svg.png';
const GOOGLEPLAY_IMG =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Google_Play_Store_badge_EN.svg/200px-Google_Play_Store_badge_EN.svg.png';

/* ─── 画布配置 ─── */
export const justSayingThanksTemplateConfig: TemplateConfig = {
  outerBackgroundColor: '#EEEEEE',
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
  fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
};

/* ─── 服务图标项工厂 ─── */
function createServiceItem(
  iconType: 'star' | 'check' | 'heart' | 'link',
  label: string
): EmailComponent {
  return {
    id: nanoid(),
    type: 'layout',
    wrapperStyle: w({
      padding: { mode: 'separate', top: '12px', right: '4px', bottom: '12px', left: '4px' },
      contentAlign: { horizontal: 'center', vertical: 'top' },
    }),
    props: {
      gap: '6px',
      direction: 'vertical',
      distribution: 'packed',
    } satisfies LayoutProps,
    children: [
      {
        id: nanoid(),
        type: 'icon',
        wrapperStyle: w({ widthMode: 'fitContent', contentAlign: { horizontal: 'center', vertical: 'top' } }),
        props: {
          iconType,
          sizeMode: 'height',
          size: '36',
          color: GC_BLACK,
          link: '',
        } satisfies IconProps,
      },
      {
        id: nanoid(),
        type: 'text',
        wrapperStyle: w({ contentAlign: { horizontal: 'center', vertical: 'top' } }),
        props: {
          content: textHtml(label, { fontSize: '12px', color: GC_BLACK, fontWeight: '400', lineHeight: '1.4' }),
          fontMode: 'inherit',
          fontFamily: DEFAULT_TEXT_FONT_FAMILY,
        } satisfies TextProps,
      },
    ],
  };
}

/* ─── 主模板函数 ─── */

export function createJustSayingThanksTemplate(): EmailComponent[] {
  return [
    /* ── 1. 顶部信息栏 ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        backgroundColor: GC_BLACK,
        padding: { mode: 'separate', top: '7px', right: '16px', bottom: '7px', left: '16px' },
        contentAlign: { horizontal: 'center', vertical: 'center' },
      }),
      props: {
        gap: '0px',
        direction: 'horizontal',
        distribution: 'spaceBetween',
      } satisfies LayoutProps,
      children: [
        {
          id: nanoid(),
          type: 'text',
          wrapperStyle: w({
            widthMode: 'fitContent',
            contentAlign: { horizontal: 'left', vertical: 'top' },
          }),
          props: {
            content: `<p style="font-size:10px;color:#AAAAAA;line-height:1.4">Can't see images? <a href="#" style="color:#AAAAAA">View this online.</a></p>`,
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          } satisfies TextProps,
        },
        {
          id: nanoid(),
          type: 'text',
          wrapperStyle: w({
            widthMode: 'fitContent',
            contentAlign: { horizontal: 'right', vertical: 'top' },
          }),
          props: {
            content: `<p style="font-size:10px;color:#AAAAAA;line-height:1.4">Buy online | in-store | or call 877-687-5403</p>`,
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          } satisfies TextProps,
        },
      ],
    },

    /* ── 2. Guitar Center Logo ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '16px', right: '24px', bottom: '16px', left: '24px' },
        contentAlign: { horizontal: 'center', vertical: 'top' },
      }),
      props: {
        gap: '0px',
        direction: 'vertical',
        distribution: 'packed',
      } satisfies LayoutProps,
      children: [
        {
          id: nanoid(),
          type: 'image',
          wrapperStyle: w({ widthMode: 'fitContent' }),
          props: {
            src: GC_LOGO_URL,
            alt: 'Guitar Center',
            link: '',
            sizeConfig: { mode: 'original', maxWidth: '160px' },
            borderRadius: { mode: 'unified', unified: '0' },
            layoutMode: false,
            layoutPadding: { mode: 'unified', unified: '0' },
          } satisfies ImageProps,
        },
      ],
    },

    /* ── 3. 英雄横幅 — "JUST SAYING THANKS" ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        backgroundColor: GC_HERO_DARK,
        padding: { mode: 'separate', top: '40px', right: '40px', bottom: '0', left: '40px' },
        contentAlign: { horizontal: 'left', vertical: 'top' },
      }),
      props: {
        gap: '0px',
        direction: 'vertical',
        distribution: 'packed',
      } satisfies LayoutProps,
      children: [
        {
          id: nanoid(),
          type: 'text',
          wrapperStyle: w({ contentAlign: { horizontal: 'left', vertical: 'top' } }),
          props: {
            content: `<p style="font-size:52px;color:#FFFFFF;font-weight:800;line-height:1;text-transform:uppercase;letter-spacing:-0.5px">JUST SAYING</p>`,
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          } satisfies TextProps,
        },
        {
          id: nanoid(),
          type: 'text',
          wrapperStyle: w({ contentAlign: { horizontal: 'left', vertical: 'top' } }),
          props: {
            content: `<p style="font-size:80px;color:#FFFFFF;font-weight:800;line-height:0.9;text-transform:uppercase;letter-spacing:-2px">THANKS</p>`,
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          } satisfies TextProps,
        },
      ],
    },

    /* ── 4. 合成器键盘产品图 ── */
    {
      id: nanoid(),
      type: 'image',
      wrapperStyle: w({
        backgroundColor: GC_HERO_DARK,
        padding: { mode: 'unified', unified: '0' },
      }),
      props: {
        src: KEYBOARD_IMG,
        alt: 'Moog Synthesizer Keyboard',
        link: '',
        sizeConfig: { mode: 'fill' },
        borderRadius: { mode: 'unified', unified: '0' },
        layoutMode: false,
        layoutPadding: { mode: 'unified', unified: '0' },
      } satisfies ImageProps,
    },

    /* ── 5. 分割线 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w({ padding: { mode: 'unified', unified: '0' } }),
      props: {
        dividerStyle: 'line',
        color: '#DDDDDD',
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 6. 感谢标题 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '24px', right: '40px', bottom: '8px', left: '40px' },
        contentAlign: { horizontal: 'left', vertical: 'top' },
      }),
      props: {
        content: `<p style="font-size:15px;color:#1A1A1A;font-weight:700;line-height:1.4;text-transform:uppercase">THANK YOU FOR GETTING US UP TO SPEED</p>`,
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 7. 正文段落 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '0', right: '40px', bottom: '24px', left: '40px' },
        contentAlign: { horizontal: 'left', vertical: 'top' },
      }),
      props: {
        content: `<p style="font-size:14px;color:#333333;line-height:1.6"><strong>Now you'll get all the deals and news you want.</strong> Just like we promised, here's your coupon for 15% off a single qualifying*, non-sale item, maximum discount $500 to use now thru 11/18/2023. Some exclusions and limitations apply. You can read up on those below.</p>`,
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 8. 优惠券框 ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '0', right: '40px', bottom: '24px', left: '40px' },
        contentAlign: { horizontal: 'center', vertical: 'top' },
      }),
      props: {
        gap: '0px',
        direction: 'vertical',
        distribution: 'packed',
      } satisfies LayoutProps,
      children: [
        {
          id: nanoid(),
          type: 'layout',
          wrapperStyle: {
            widthMode: 'fill',
            heightMode: 'fitContent',
            backgroundType: 'color',
            backgroundColor: GC_WHITE,
            padding: { mode: 'separate', top: '24px', right: '24px', bottom: '24px', left: '24px' },
            margin: { mode: 'unified', unified: '0' },
            border: {
              mode: 'unified',
              unified: '1.5px',
              color: '#BBBBBB',
              style: 'dashed',
            },
            borderRadius: { mode: 'unified', unified: '0' },
            contentAlign: { horizontal: 'center', vertical: 'top' },
          },
          props: {
            gap: '8px',
            direction: 'vertical',
            distribution: 'packed',
          } satisfies LayoutProps,
          children: [
            /* 15% OFF */
            {
              id: nanoid(),
              type: 'text',
              wrapperStyle: w({ contentAlign: { horizontal: 'center', vertical: 'top' } }),
              props: {
                content: `<p style="font-size:64px;color:#1A1A1A;font-weight:800;line-height:1;text-align:center">15% OFF</p>`,
                fontMode: 'inherit',
                fontFamily: DEFAULT_TEXT_FONT_FAMILY,
              } satisfies TextProps,
            },
            /* 副标题 */
            {
              id: nanoid(),
              type: 'text',
              wrapperStyle: w({ contentAlign: { horizontal: 'center', vertical: 'top' } }),
              props: {
                content: `<p style="font-size:16px;color:#333333;font-weight:400;line-height:1.4;text-align:center">a single qualifying*, non-sale item</p>`,
                fontMode: 'inherit',
                fontFamily: DEFAULT_TEXT_FONT_FAMILY,
              } satisfies TextProps,
            },
            /* 有效期 */
            {
              id: nanoid(),
              type: 'text',
              wrapperStyle: w({ contentAlign: { horizontal: 'center', vertical: 'top' } }),
              props: {
                content: `<p style="font-size:12px;color:#666666;line-height:1.6;text-align:center">Valid thru 11/18/2023<br/>Maximum discount $500.</p>`,
                fontMode: 'inherit',
                fontFamily: DEFAULT_TEXT_FONT_FAMILY,
              } satisfies TextProps,
            },
            /* 优惠码 */
            {
              id: nanoid(),
              type: 'text',
              wrapperStyle: w({
                padding: { mode: 'separate', top: '8px', right: '0', bottom: '4px', left: '0' },
                contentAlign: { horizontal: 'center', vertical: 'top' },
              }),
              props: {
                content: `<p style="font-size:13px;color:#333333;text-align:center">Coupon Code: <strong style="font-size:14px;letter-spacing:1px">r511c0673pxk8</strong></p>`,
                fontMode: 'inherit',
                fontFamily: DEFAULT_TEXT_FONT_FAMILY,
              } satisfies TextProps,
            },
            /* 条形码图片 */
            {
              id: nanoid(),
              type: 'image',
              wrapperStyle: w({
                widthMode: 'fitContent',
                padding: { mode: 'separate', top: '8px', right: '0', bottom: '16px', left: '0' },
                contentAlign: { horizontal: 'center', vertical: 'top' },
              }),
              props: {
                src: BARCODE_IMG,
                alt: 'Coupon barcode',
                link: '',
                sizeConfig: { mode: 'original', maxWidth: '220px' },
                borderRadius: { mode: 'unified', unified: '0' },
                layoutMode: false,
                layoutPadding: { mode: 'unified', unified: '0' },
              } satisfies ImageProps,
            },
            /* Shop Now 按钮 */
            {
              id: nanoid(),
              type: 'button',
              wrapperStyle: w({ widthMode: 'fitContent', contentAlign: { horizontal: 'center', vertical: 'top' } }),
              props: {
                text: 'Shop Now',
                buttonStyle: 'solid',
                backgroundColor: GC_RED,
                textColor: GC_WHITE,
                borderColor: GC_RED,
                fontSize: '16px',
                fontWeight: '600',
                fontStyle: 'normal',
                textDecoration: 'none',
                fontMode: 'inherit',
                fontFamily: DEFAULT_TEXT_FONT_FAMILY,
                borderRadius: '4px',
                padding: { mode: 'separate', top: '12px', right: '36px', bottom: '12px', left: '36px' },
                widthMode: 'fitContent',
                link: '',
              } satisfies ButtonProps,
            },
            /* 免责声明链接 */
            {
              id: nanoid(),
              type: 'text',
              wrapperStyle: w({
                padding: { mode: 'separate', top: '8px', right: '0', bottom: '0', left: '0' },
                contentAlign: { horizontal: 'center', vertical: 'top' },
              }),
              props: {
                content: `<p style="font-size:12px;text-align:center"><a href="#" style="color:#0064BE;text-decoration:underline">* View exclusions and limitations</a></p>`,
                fontMode: 'inherit',
                fontFamily: DEFAULT_TEXT_FONT_FAMILY,
              } satisfies TextProps,
            },
          ],
        },
      ],
    },

    /* ── 9. 结尾文字 ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '0', right: '40px', bottom: '32px', left: '40px' },
        contentAlign: { horizontal: 'left', vertical: 'top' },
      }),
      props: {
        gap: '4px',
        direction: 'vertical',
        distribution: 'packed',
      } satisfies LayoutProps,
      children: [
        {
          id: nanoid(),
          type: 'text',
          wrapperStyle: w({ contentAlign: { horizontal: 'left', vertical: 'top' } }),
          props: {
            content: textHtml('Whatever you decide to save on, we hope you love it.', {
              fontSize: '14px',
              color: '#333333',
              fontWeight: '400',
              lineHeight: '1.6',
            }),
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          } satisfies TextProps,
        },
        {
          id: nanoid(),
          type: 'text',
          wrapperStyle: w({ contentAlign: { horizontal: 'left', vertical: 'top' } }),
          props: {
            content: textHtml('The Guitar Center Team', {
              fontSize: '14px',
              color: '#333333',
              fontWeight: '400',
              lineHeight: '1.6',
            }),
            fontMode: 'inherit',
            fontFamily: DEFAULT_TEXT_FONT_FAMILY,
          } satisfies TextProps,
        },
      ],
    },

    /* ── 10. 分割线 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w(),
      props: {
        dividerStyle: 'line',
        color: '#DDDDDD',
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 11. 服务图标区 (4列 Grid) ── */
    {
      id: nanoid(),
      type: 'grid',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '16px', right: '24px', bottom: '8px', left: '24px' },
      }),
      props: {
        columnsPerRow: 4,
        slots: 4,
        gap: '8px',
      } satisfies GridProps,
      children: [
        createServiceItem('star', 'Lessons'),
        createServiceItem('link', 'Financing'),
        createServiceItem('check', 'Daily Pick'),
        createServiceItem('heart', 'Used Gear'),
      ],
    },

    /* ── 12. App 下载徽章 ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '8px', right: '24px', bottom: '24px', left: '24px' },
        contentAlign: { horizontal: 'center', vertical: 'top' },
      }),
      props: {
        gap: '12px',
        direction: 'horizontal',
        distribution: 'packed',
      } satisfies LayoutProps,
      children: [
        {
          id: nanoid(),
          type: 'image',
          wrapperStyle: w({ widthMode: 'fitContent' }),
          props: {
            src: APPSTORE_IMG,
            alt: 'Download on the App Store',
            link: '',
            sizeConfig: { mode: 'original', maxWidth: '130px' },
            borderRadius: { mode: 'unified', unified: '0' },
            layoutMode: false,
            layoutPadding: { mode: 'unified', unified: '0' },
          } satisfies ImageProps,
        },
        {
          id: nanoid(),
          type: 'image',
          wrapperStyle: w({ widthMode: 'fitContent' }),
          props: {
            src: GOOGLEPLAY_IMG,
            alt: 'Get it on Google Play',
            link: '',
            sizeConfig: { mode: 'original', maxWidth: '150px' },
            borderRadius: { mode: 'unified', unified: '0' },
            layoutMode: false,
            layoutPadding: { mode: 'unified', unified: '0' },
          } satisfies ImageProps,
        },
      ],
    },

    /* ── 13. 分割线 ── */
    {
      id: nanoid(),
      type: 'divider',
      wrapperStyle: w(),
      props: {
        dividerStyle: 'line',
        color: '#DDDDDD',
        height: '1px',
        width: '100%',
      } satisfies DividerProps,
    },

    /* ── 14. 底部链接 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '16px', right: '24px', bottom: '8px', left: '24px' },
        contentAlign: { horizontal: 'center', vertical: 'top' },
      }),
      props: {
        content: `<p style="font-size:12px;color:#555555;text-align:center"><a href="#" style="color:#555555;text-decoration:none">Contact Us</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#" style="color:#555555;text-decoration:none">Privacy Policy</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#" style="color:#555555;text-decoration:none">Email Preferences</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#" style="color:#555555;text-decoration:none">Unsubscribe</a></p>`,
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },

    /* ── 15. 社交媒体图标 ── */
    {
      id: nanoid(),
      type: 'layout',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '8px', right: '24px', bottom: '16px', left: '24px' },
        contentAlign: { horizontal: 'center', vertical: 'top' },
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
          wrapperStyle: w({ widthMode: 'fitContent' }),
          props: {
            iconType: 'facebook',
            sizeMode: 'height',
            size: '26',
            color: GC_BLACK,
            link: '',
          } satisfies IconProps,
        },
        {
          id: nanoid(),
          type: 'icon',
          wrapperStyle: w({ widthMode: 'fitContent' }),
          props: {
            iconType: 'twitter',
            sizeMode: 'height',
            size: '26',
            color: GC_BLACK,
            link: '',
          } satisfies IconProps,
        },
        {
          id: nanoid(),
          type: 'icon',
          wrapperStyle: w({ widthMode: 'fitContent' }),
          props: {
            iconType: 'youtube',
            sizeMode: 'height',
            size: '26',
            color: GC_BLACK,
            link: '',
          } satisfies IconProps,
        },
        {
          id: nanoid(),
          type: 'icon',
          wrapperStyle: w({ widthMode: 'fitContent' }),
          props: {
            iconType: 'instagram',
            sizeMode: 'height',
            size: '26',
            color: GC_BLACK,
            link: '',
          } satisfies IconProps,
        },
      ],
    },

    /* ── 16. 版权声明 ── */
    {
      id: nanoid(),
      type: 'text',
      wrapperStyle: w({
        backgroundColor: GC_WHITE,
        padding: { mode: 'separate', top: '0', right: '24px', bottom: '24px', left: '24px' },
        contentAlign: { horizontal: 'center', vertical: 'top' },
      }),
      props: {
        content: `<p style="font-size:10px;color:#888888;text-align:center;line-height:1.5">© 2023 Guitar Center, Inc., P.O. Box 5111, Thousand Oaks, CA 91359-5111, USA. Call us at 877-687-5403 from 6 a.m. to 8 p.m. PT, Monday through Friday, and from 7 a.m. to 9 p.m. PT, Saturday and Sunday.</p>`,
        fontMode: 'inherit',
        fontFamily: DEFAULT_TEXT_FONT_FAMILY,
      } satisfies TextProps,
    },
  ];
}
