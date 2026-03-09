import styles from './InsertionIndicator.module.css';

interface InsertionIndicatorProps {
  position: 'before' | 'after';
}

export default function InsertionIndicator({ position }: InsertionIndicatorProps) {
  return (
    <div
      className={`${styles.indicator} ${position === 'before' ? styles.indicatorBefore : styles.indicatorAfter}`}
    >
      <span className={styles.dot} />
      <span className={styles.line} />
      <span className={styles.dot} />
    </div>
  );
}
