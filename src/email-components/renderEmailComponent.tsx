import type { EmailComponent } from '@shared/types/email';
import LayoutBlock from './LayoutBlock/LayoutBlock';
import GridBlock from './GridBlock/GridBlock';
import TextBlock from './TextBlock/TextBlock';
import ImageBlock from './ImageBlock/ImageBlock';
import DividerBlock from './DividerBlock/DividerBlock';
import ButtonBlock from './ButtonBlock/ButtonBlock';
import IconBlock from './IconBlock/IconBlock';

export function renderEmailComponent(
  component: EmailComponent,
  selectedId: string | null,
  onSelectId: (id: string) => void
): React.ReactNode {
  const selected = component.id === selectedId;
  const handleSelect = () => onSelectId(component.id);
  switch (component.type) {
    case 'layout':
      return (
        <LayoutBlock
          component={component}
          selectedId={selectedId}
          selected={selected}
          onSelectId={onSelectId}
          onSelect={handleSelect}
        />
      );
    case 'grid':
      return (
        <GridBlock
          component={component}
          selectedId={selectedId}
          selected={selected}
          onSelectId={onSelectId}
          onSelect={handleSelect}
        />
      );
    case 'text':
      return (
        <TextBlock
          component={component}
          selected={selected}
          onSelect={handleSelect}
        />
      );
    case 'image':
      return (
        <ImageBlock
          component={component}
          selected={selected}
          onSelect={handleSelect}
          selectedId={selectedId}
          onSelectId={onSelectId}
        />
      );
    case 'divider':
      return (
        <DividerBlock
          component={component}
          selected={selected}
          onSelect={handleSelect}
        />
      );
    case 'button':
      return (
        <ButtonBlock
          component={component}
          selected={selected}
          onSelect={handleSelect}
        />
      );
    case 'icon':
      return (
        <IconBlock
          component={component}
          selected={selected}
          onSelect={handleSelect}
        />
      );
    default:
      return null;
  }
}
