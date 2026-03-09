import { memo } from 'react';
import type { EmailComponent, DividerProps } from '@shared/types/email';
import { isDividerProps } from '@shared/types/email';
import ComponentWrapper from '../components/ComponentWrapper/ComponentWrapper';
import styles from './DividerBlock.module.css';

interface DividerBlockProps {
  component: EmailComponent;
  selected?: boolean;
  onSelect?: () => void;
}

function DividerBlock({ component, selected, onSelect }: DividerBlockProps) {
  if (component.type !== 'divider' || !isDividerProps(component.props)) return null;
  const props = component.props as DividerProps;

  return (
    <ComponentWrapper
      wrapperStyle={component.wrapperStyle}
      onClick={onSelect}
      selected={selected}
      componentId={component.id}
    >
      {props.dividerStyle === 'line' ? (
        <hr
          className={styles.dividerLine}
          style={{
            border: 'none',
            borderTopStyle: 'solid',
            borderTopColor: props.color,
            borderTopWidth: props.height,
            width: props.width,
            margin: 0,
          }}
        />
      ) : (
        <div
          className={styles.dividerBlock}
          style={{
            backgroundColor: props.color,
            height: props.height,
            width: props.width,
            margin: 0,
          }}
        />
      )}
    </ComponentWrapper>
  );
}

export default memo(DividerBlock, (prev, next) => {
  return prev.component === next.component && prev.selected === next.selected;
});
