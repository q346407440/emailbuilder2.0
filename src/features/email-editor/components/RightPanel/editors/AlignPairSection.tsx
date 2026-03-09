import type { ReactNode } from 'react';
import type { ContentAlignConfig } from '@shared/types/email';
import HorizontalAlignField from './HorizontalAlignField';
import VerticalAlignField from './VerticalAlignField';
import ConfigSection from './ConfigSection';
import styles from './Editors.module.css';

interface AlignPairSectionProps {
  horizontal: ContentAlignConfig['horizontal'];
  vertical: ContentAlignConfig['vertical'];
  onHorizontalChange: (value: ContentAlignConfig['horizontal']) => void;
  onVerticalChange: (value: ContentAlignConfig['vertical']) => void;
  horizontalLabel?: string;
  verticalLabel?: string;
  title?: string;
  children?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  contentClassName?: string;
}

function AlignPairContent({
  horizontal,
  vertical,
  onHorizontalChange,
  onVerticalChange,
  horizontalLabel,
  verticalLabel,
  children,
  fullWidth,
}: Omit<AlignPairSectionProps, 'title'>) {
  return (
    <>
      <div className={`${fullWidth ? styles.fieldFullWidth : ''} ${styles.alignPairRow}`.trim()}>
        <div>
          <HorizontalAlignField
            value={horizontal}
            onChange={onHorizontalChange}
            label={horizontalLabel}
          />
        </div>
        <div>
          <VerticalAlignField
            value={vertical}
            onChange={onVerticalChange}
            label={verticalLabel}
          />
        </div>
      </div>
      {children}
    </>
  );
}

export default function AlignPairSection(props: AlignPairSectionProps) {
  const {
    title,
    children,
    horizontal,
    vertical,
    onHorizontalChange,
    onVerticalChange,
    horizontalLabel = '水平对齐',
    verticalLabel = '垂直对齐',
    fullWidth = true,
    className,
    contentClassName,
  } = props;

  const content = (
    <AlignPairContent
      horizontal={horizontal}
      vertical={vertical}
      onHorizontalChange={onHorizontalChange}
      onVerticalChange={onVerticalChange}
      horizontalLabel={horizontalLabel}
      verticalLabel={verticalLabel}
      children={children}
      fullWidth={fullWidth}
    />
  );

  if (!title) {
    return content;
  }

  return (
    <ConfigSection
      title={title}
      className={className}
      contentClassName={contentClassName ?? styles.configSectionContentStack}
    >
      {content}
    </ConfigSection>
  );
}
