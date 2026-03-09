import styles from './PageSkeleton.module.css';

export default function PageSkeleton() {
  return (
    <div className={styles.root}>
      <div className={styles.header} />
      <div className={styles.body}>
        <div className={styles.block} style={{ width: '60%', height: 24 }} />
        <div className={styles.block} style={{ width: '40%', height: 16 }} />
        <div className={styles.row}>
          <div className={styles.card} />
          <div className={styles.card} />
          <div className={styles.card} />
        </div>
      </div>
    </div>
  );
}
