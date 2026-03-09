import type { WrapperStyle } from '@shared/types/email';
import ContainerSizeEditor from './ContainerSizeEditor';
import BackgroundField from './BackgroundField';
import SpacingField from './SpacingField';
import BorderField from './BorderField';
import BorderRadiusField from './BorderRadiusField';
import ConfigSection from './ConfigSection';
import styles from './Editors.module.css';

interface WrapperStyleEditorProps {
  wrapperStyle: WrapperStyle;
  onChange: (updates: Partial<WrapperStyle>) => void;
}

/** 边框与背景区块，用于「样式」Tab，与尺寸/间距（布局）分离 */
export function WrapperBorderBackgroundSection({
  wrapperStyle,
  onChange,
}: WrapperStyleEditorProps) {
  const backgroundType = wrapperStyle.backgroundType || 'color';

  return (
    <div className={styles.sectionWithBlockSpacingTight}>
      <ConfigSection title="边框 & 背景">
        <BackgroundField
          label="背景填充"
          backgroundType={backgroundType}
          backgroundColor={wrapperStyle.backgroundColor}
          backgroundImage={wrapperStyle.backgroundImage}
          onTypeChange={(type) => onChange({ backgroundType: type })}
          onColorChange={(color) => onChange({ backgroundColor: color })}
          onImageChange={(image) => onChange({ backgroundImage: image })}
        />
        <BorderField
          value={wrapperStyle.border}
          onChange={(border) => onChange({ border })}
        />
        <BorderRadiusField
          value={wrapperStyle.borderRadius}
          onChange={(borderRadius) => onChange({ borderRadius })}
        />
      </ConfigSection>
    </div>
  );
}

/** 布局 Tab：仅尺寸 + 间距 */
export default function WrapperStyleEditor({
  wrapperStyle,
  onChange,
}: WrapperStyleEditorProps) {
  return (
    <div className={styles.section}>
      <ConfigSection
        title="尺寸"
        contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
      >
        <ContainerSizeEditor
          widthMode={wrapperStyle.widthMode}
          heightMode={wrapperStyle.heightMode}
          fixedWidth={wrapperStyle.fixedWidth}
          fixedHeight={wrapperStyle.fixedHeight}
          lockAspectRatio={wrapperStyle.lockAspectRatio}
          onChange={onChange}
        />
      </ConfigSection>

      <ConfigSection
        title="间距"
        className={styles.sectionWithBlockSpacing}
        contentClassName={`${styles.sectionGrid} ${styles.sectionGridTight} ${styles.sectionVerticalTight}`}
      >
        <SpacingField
          label="内边距"
          value={wrapperStyle.padding}
          onChange={(padding) => onChange({ padding })}
          placeholder="0"
        />
        <SpacingField
          label="外边距"
          value={wrapperStyle.margin}
          onChange={(margin) => onChange({ margin })}
          placeholder="0"
        />
      </ConfigSection>
    </div>
  );
}
