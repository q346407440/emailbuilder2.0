import { memo } from 'react';
import type { EmailComponent, ButtonProps } from '@shared/types/email';
import { isButtonProps } from '@shared/types/email';
import { spacingConfigToCSS } from '@shared/utils/styleHelpers';
import ComponentWrapper from '../components/ComponentWrapper/ComponentWrapper';
import styles from './ButtonBlock.module.css';

interface ButtonBlockProps {
  component: EmailComponent;
  selected?: boolean;
  onSelect?: () => void;
}

function ButtonBlock({ component, selected, onSelect }: ButtonBlockProps) {
  if (component.type !== 'button' || !isButtonProps(component.props)) return null;
  const props = component.props as ButtonProps;

  const isSolid = props.buttonStyle === 'solid';
  const widthMode = props.widthMode ?? 'fitContent';

  const buttonStyle: React.CSSProperties = {
    display: widthMode === 'fill' ? 'block' : 'inline-block',
    textDecoration: props.textDecoration ?? 'none',
    fontFamily: props.fontMode === 'custom' ? props.fontFamily : 'inherit',
    fontWeight: props.fontWeight ?? '600',
    fontStyle: props.fontStyle ?? 'normal',
    textAlign: 'center',
    boxSizing: 'border-box',
    lineHeight: 1.4,
    backgroundColor: isSolid ? props.backgroundColor : 'rgba(255, 255, 255, 0)',
    color: props.textColor,
    border: isSolid ? 'none' : `2px solid ${props.borderColor}`,
    fontSize: props.fontSize,
    borderRadius: props.borderRadius,
    padding: spacingConfigToCSS(props.padding),
    ...(widthMode === 'fill' && { width: '100%' }),
    ...(widthMode === 'fixed' && { width: props.fixedWidth || 'auto' }),
  };

  const wrapStyle: React.CSSProperties =
    widthMode === 'fill'
      ? { width: '100%' }
      : { width: 'fit-content', maxWidth: '100%' };
  const content = props.text.trim() || '按钮';

  return (
    <ComponentWrapper
      wrapperStyle={component.wrapperStyle}
      onClick={onSelect}
      selected={selected}
      componentId={component.id}
    >
      <div className={styles.buttonWrap} style={wrapStyle}>
        {props.link ? (
          <a
            href={props.link}
            className={styles.button}
            style={buttonStyle}
            onClick={(e) => e.preventDefault()}
          >
            <span className={styles.buttonText}>{content}</span>
          </a>
        ) : (
          <span className={styles.button} style={buttonStyle}>
            <span className={styles.buttonText}>{content}</span>
          </span>
        )}
      </div>
    </ComponentWrapper>
  );
}

export default memo(ButtonBlock, (prev, next) => {
  return prev.component === next.component && prev.selected === next.selected;
});
