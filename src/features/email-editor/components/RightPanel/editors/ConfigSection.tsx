import type { ReactNode } from 'react';
import styles from './Editors.module.css';

interface ConfigSectionProps {
  /** 大标题，作为该配置区块的视觉锚点 */
  title: string;
  /** 标题右侧操作位，例如开关、计数或说明动作 */
  headerRight?: ReactNode;
  /** 大标题下的小配置项，各自使用通用组件（如对齐、间距、边框等），由 gap 统一间距 */
  children: ReactNode;
  /** 外层容器附加 class（通常用于区块分隔） */
  className?: string;
  /** 内容容器附加 class，用于 grid / flex 变体 */
  contentClassName?: string;
}

/**
 * 右侧面板「大标题 + 若干小配置」的统一骨架。
 * 容器内边距为 0，仅用 gap 控制标题与配置、配置与配置之间的间距，视觉上不显包裹。
 * 新增配置区块时优先使用此组件，保证与 10.10/10.11 规范一致。
 */
export default function ConfigSection({
  title,
  headerRight,
  children,
  className,
  contentClassName,
}: ConfigSectionProps) {
  return (
    <div className={[styles.configSectionBlock, className].filter(Boolean).join(' ')}>
      <div className={styles.configSectionHeader}>
        <p className={styles.sectionTitle}>{title}</p>
        {headerRight}
      </div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
