import styles from './LeftContentPanel.module.css';

interface LeftPanelSubTabItem<T extends string> {
  id: T;
  label: string;
}

interface LeftPanelSubTabsProps<T extends string> {
  items: readonly LeftPanelSubTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

export default function LeftPanelSubTabs<T extends string>({
  items,
  value,
  onChange,
}: LeftPanelSubTabsProps<T>) {
  return (
    <div className={styles.subTabBar} role="tablist" aria-orientation="horizontal">
      {items.map((item) => {
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`${styles.subTab} ${isActive ? styles.subTabActive : ''}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
