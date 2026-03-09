import type { EmailComponent } from '@shared/types/email';
import type { TemplateConfig } from '@shared/types/email';
import { DEFAULT_TEXT_FONT_FAMILY } from '@shared/constants/fontOptions';
import { renderEmailComponent } from '@email-components/renderEmailComponent';
import styles from './ComponentDragGhost.module.css';

interface ComponentDragGhostProps {
  component: EmailComponent;
  templateConfig: TemplateConfig;
}

/**
 * 拖動時與被拖動組件外觀一致的虛影（用於預覽區從拖動圖標觸發的拖拽）。
 * 使用與畫布相同的寬度與字體，渲染組件副本並加上透明度與陰影。
 */
export default function ComponentDragGhost({ component, templateConfig }: ComponentDragGhostProps) {
  const canvasWidth = templateConfig.width || '600px';

  const wrapperStyle: React.CSSProperties = {
    width: canvasWidth,
    fontFamily: templateConfig.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
  };

  return (
    <div className={styles.wrapper} style={wrapperStyle}>
      <div className={styles.blockContent}>
        {renderEmailComponent(component, null, () => {})}
      </div>
    </div>
  );
}
