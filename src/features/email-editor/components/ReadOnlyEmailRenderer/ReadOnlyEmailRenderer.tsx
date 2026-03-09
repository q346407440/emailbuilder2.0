import { forwardRef } from 'react';
import type { EmailComponent, TemplateConfig } from '@shared/types/email';
import { renderEmailComponent } from '@email-components/renderEmailComponent';
import {
  spacingConfigToCSS,
  borderRadiusConfigToCSS,
  contentAlignToCSS,
  borderConfigToCSS,
} from '@shared/utils/styleHelpers';
import { getTemplateDistributionFallback } from '@shared/constants/emailDefaults';
import { DEFAULT_TEXT_FONT_FAMILY } from '@shared/constants/fontOptions';

interface ReadOnlyEmailRendererProps {
  components: EmailComponent[];
  templateConfig: TemplateConfig;
}

/**
 * 只渲染（不可編輯）版的郵件內容。結構與 Canvas 完全一致，
 * 以確保 prepareEmailHtml 能正確轉換為郵件安全 HTML。
 * 用於模板預覽頁取得與編輯器一致的 HTML 輸出。
 */
const ReadOnlyEmailRenderer = forwardRef<HTMLDivElement, ReadOnlyEmailRendererProps>(
  ({ components, templateConfig }, ref) => {
    const alignCSS = contentAlignToCSS(templateConfig.contentAlign);
    const { contentDistribution, contentGap } = getTemplateDistributionFallback(templateConfig);

    const backgroundType = templateConfig.backgroundType || 'color';

    const canvasStyle: React.CSSProperties = {
      width: templateConfig.width,
      fontFamily: templateConfig.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
      padding: spacingConfigToCSS(templateConfig.padding),
      borderRadius: borderRadiusConfigToCSS(templateConfig.borderRadius),
      ...alignCSS,
      ...borderConfigToCSS(templateConfig.border),
    };

    if (backgroundType === 'image' && templateConfig.backgroundImage) {
      canvasStyle.backgroundImage = `url(${templateConfig.backgroundImage})`;
      canvasStyle.backgroundSize = 'cover';
      canvasStyle.backgroundPosition = 'center';
      canvasStyle.backgroundRepeat = 'no-repeat';
    } else {
      canvasStyle.backgroundColor = templateConfig.backgroundColor || '#FFFFFF';
    }

    const listStyle: React.CSSProperties = {
      ...alignCSS,
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: contentDistribution === 'spaceBetween' ? '0px' : contentGap,
      justifyContent:
        contentDistribution === 'spaceBetween' ? 'space-between' : alignCSS.justifyContent,
      margin: 0,
      padding: 0,
      listStyle: 'none',
    };

    return (
      <div ref={ref} style={canvasStyle}>
        <ul style={listStyle}>
          {components.map((comp) => (
            <li
              key={comp.id}
              data-component-id={comp.id}
              style={{ position: 'relative' }}
            >
              <div style={{ position: 'relative' }}>
                {renderEmailComponent(comp, null, () => {})}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
);

ReadOnlyEmailRenderer.displayName = 'ReadOnlyEmailRenderer';

export default ReadOnlyEmailRenderer;
