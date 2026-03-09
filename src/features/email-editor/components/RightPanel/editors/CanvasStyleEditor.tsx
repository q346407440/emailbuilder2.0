import { useEffect } from 'react';
import type { CanvasConfig } from '@shared/types/email';
import BackgroundField from './BackgroundField';
import SpacingField from './SpacingField';
import BorderField from './BorderField';
import BorderRadiusField from './BorderRadiusField';
import FormField from './FormField';
import PxInput from './PxInput';
import AlignPairSection from './AlignPairSection';
import ConfigSection from './ConfigSection';
import { FONT_OPTIONS, DEFAULT_TEXT_FONT_FAMILY } from '@shared/constants/fontOptions';
import { getTemplateDistributionFallback } from '@shared/constants/emailDefaults';
import styles from './Editors.module.css';

interface CanvasStyleEditorProps {
  canvasConfig: CanvasConfig;
  onChange: (updates: Partial<CanvasConfig>) => void;
}

export default function CanvasStyleEditor({ canvasConfig, onChange }: CanvasStyleEditorProps) {
  const backgroundType = canvasConfig.backgroundType || 'color';

  const contentAlign = canvasConfig.contentAlign;
  const { contentDistribution, contentGap: defaultContentGap } = getTemplateDistributionFallback(canvasConfig);
  const isAutoGap = contentDistribution === 'spaceBetween';

  return (
    <ConfigSection
      title="画布样式"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <AlignPairSection
        horizontal={contentAlign.horizontal}
        vertical={contentAlign.vertical}
        onHorizontalChange={(horizontal) => onChange({ contentAlign: { ...contentAlign, horizontal } })}
        onVerticalChange={(vertical) => onChange({ contentAlign: { ...contentAlign, vertical } })}
        horizontalLabel="画布水平对齐"
        verticalLabel="画布垂直对齐"
        fullWidth
      />

      <FormField
        label="间距模式"
        type="select"
        value={contentDistribution}
        onChange={(v) => onChange({ contentDistribution: v as CanvasConfig['contentDistribution'] })}
        options={[
          { value: 'packed', label: '自定义间距' },
          { value: 'spaceBetween', label: '均分（Auto）' },
        ]}
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor="canvas-content-gap">画布间距</label>
        {isAutoGap ? (
          <div className={`${styles.pxInputWrap} ${styles.pxInputWrapDisabled}`}>
            <input
              type="text"
              className={styles.pxInput}
              value="Auto"
              aria-label="canvas-content-gap-auto"
              disabled
            />
          </div>
        ) : (
          <PxInput
            id="canvas-content-gap"
            value={canvasConfig.contentGap ?? defaultContentGap}
            onChange={(v) => onChange({ contentGap: v })}
            placeholder="0"
          />
        )}
      </div>

      <BackgroundField
        label="背景填充"
        backgroundType={backgroundType}
        backgroundColor={canvasConfig.backgroundColor}
        backgroundImage={canvasConfig.backgroundImage}
        onTypeChange={(type) => onChange({ backgroundType: type })}
        onColorChange={(color) => onChange({ backgroundColor: color })}
        onImageChange={(image) => onChange({ backgroundImage: image })}
      />

      <SpacingField
        label="内边距"
        value={canvasConfig.padding}
        onChange={(padding) => onChange({ padding })}
        placeholder="0"
      />

      <BorderField
        value={canvasConfig.border}
        onChange={(border) => onChange({ border })}
      />

      <BorderRadiusField
        value={canvasConfig.borderRadius}
        onChange={(borderRadius) => onChange({ borderRadius })}
      />
    </ConfigSection>
  );
}

// 画布特有配置（宽度、字体），与「画布样式」拆成两个 configSection，间距与组件配置的「容器样式」一致
export function CanvasSpecificEditor({
  canvasConfig,
  onChange,
}: {
  canvasConfig: CanvasConfig;
  onChange: (updates: Partial<CanvasConfig>) => void;
}) {
  // 未設置全局字體時寫入預設 Source Sans 3，保證顯示與保存一致
  useEffect(() => {
    if (canvasConfig.fontFamily == null || canvasConfig.fontFamily.trim() === '') {
      onChange({ fontFamily: DEFAULT_TEXT_FONT_FAMILY });
    }
  }, [canvasConfig.fontFamily, onChange]);

  return (
    <ConfigSection
      title="画布配置"
      contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
    >
      <FormField
        label="画布宽度"
        type="select"
        value={canvasConfig.width}
        onChange={(v) => onChange({ width: v })}
        options={[
          { value: '560px', label: '560px（紧凑）' },
          { value: '600px', label: '600px（标准）' },
        ]}
      />
      <FormField
        label="全局字体"
        type="select"
        value={canvasConfig.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY}
        onChange={(v) => onChange({ fontFamily: v })}
        options={FONT_OPTIONS}
      />

      <div className={styles.fieldFullWidth}>
        <FormField
          label="页面背景色（外层）"
          type="color"
          value={canvasConfig.outerBackgroundColor}
          onChange={(color) => onChange({ outerBackgroundColor: color })}
          helpText="用于整封邮件最外层（100% 区域）底色，不影响画布内容区背景填充。"
        />
      </div>
    </ConfigSection>
  );
}
