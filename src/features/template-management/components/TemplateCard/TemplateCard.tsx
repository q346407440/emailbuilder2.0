import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import type { TemplateCatalogItem } from '@shared/storage/templateStorage';
import styles from './TemplateCard.module.css';

interface Props {
  template: TemplateCatalogItem;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  /** 基于此模板新建工程（仅模板库「我的模板/公共模板」时传入） */
  onForkToProject?: (id: string) => void;
}

/** 后端 BIGINT 可能以字符串返回，需先转为数字再格式化。返回「YYYY/MM/DD HH:mm:ss 更新」或无效时 "—" */
function formatUpdatedAt(ts: number | string): string {
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (Number.isNaN(n)) return '—';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timePart = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${datePart} ${timePart} 更新`;
}

export default function TemplateCard({ template, onDelete, onDuplicate, onForkToProject }: Props) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuWidth = 140;
    const menuHeight = 160;
    const gap = 4;
    const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
    const top =
      rect.bottom + gap + menuHeight <= window.innerHeight
        ? rect.bottom + gap
        : rect.top - menuHeight - gap;
    setMenuPos({ top, left });
    setMenuOpen(true);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  const handleEdit = () => {
    closeMenu();
    navigate(`/templates/edit/${template.id}`);
  };

  const handlePreview = () => {
    closeMenu();
    navigate(`/templates/preview/${template.id}`);
  };

  const handleDetail = () => {
    closeMenu();
    navigate(`/templates/detail/${template.id}`);
  };

  const handleDuplicate = async () => {
    closeMenu();
    onDuplicate?.(template.id);
  };

  const handleForkToProject = () => {
    closeMenu();
    onForkToProject?.(template.id);
  };

  const handleDelete = () => {
    closeMenu();
    onDelete?.(template.id);
  };

  const previewUrl = template.previewUrl;
  useEffect(() => {
    setImageLoaded(false);
    setPreviewLoadFailed(false);
  }, [previewUrl]);

  const showPlaceholder = !previewUrl || previewLoadFailed || !imageLoaded;

  const handleCardClick = () => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    navigate(`/templates/edit/${template.id}`);
  };

  return (
    <div className={styles.card} onClick={handleCardClick}>
      {/* Preview area: 占位始终垫底，图片仅在 onLoad 成功后显示，避免裂图闪一下 */}
      <div className={styles.preview}>
        {showPlaceholder && (
          <div className={styles.previewEmpty}>
            <svg className={styles.previewEmptyIcon} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span className={styles.previewEmptyText}>暂无预览图</span>
          </div>
        )}
        {previewUrl && !previewLoadFailed && (
          <img
            src={previewUrl}
            alt={template.title}
            className={`${styles.previewImg} ${!imageLoaded ? styles.previewImgHidden : ''}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setPreviewLoadFailed(true)}
          />
        )}
        {/* Hover overlay with action buttons */}
        <div className={styles.hoverOverlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.overlayRow}>
            <button type="button" className={styles.actionBtn} onClick={handleEdit}>
              编辑
            </button>
            <button type="button" className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} onClick={handlePreview}>
              预览
            </button>
          </div>
          <button type="button" className={styles.actionBtnTertiary} onClick={handleDetail}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            接入配置
          </button>
        </div>
      </div>

      {/* Card info */}
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <span className={styles.title} title={template.title}>{template.title}</span>
          <button
            ref={btnRef}
            type="button"
            className={styles.moreBtn}
            onClick={openMenu}
            title="更多操作"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>
        </div>

        <div className={styles.dateRow}>
          <span className={styles.date}>{formatUpdatedAt(template.updatedAt)}</span>
          {template.requiredVariableKeys.length > 0 && (
            <span className={styles.tag} title="此模板包含变量，可在编辑或预览中查看">含变量</span>
          )}
        </div>
      </div>

      {/* Context menu portal */}
      {menuOpen &&
        createPortal(
          <>
            <div className={styles.menuBackdrop} onClick={closeMenu} />
            <div
              className={styles.menu}
              style={{ top: menuPos.top, left: menuPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className={styles.menuItem} onClick={handleEdit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                编辑
              </button>
              <button type="button" className={styles.menuItem} onClick={handlePreview}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                预览
              </button>
              <button type="button" className={styles.menuItem} onClick={handleDetail}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                接入配置
              </button>
              {onForkToProject && (
              <button type="button" className={styles.menuItem} onClick={handleForkToProject}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="M12 18v-6M9 15l3 3 3-3" />
                </svg>
                基于此模板新建工程
              </button>
            )}
              <button type="button" className={styles.menuItem} onClick={handleDuplicate}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                复制
              </button>
              <div className={styles.menuDivider} />
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={handleDelete}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
                删除
              </button>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

export function TemplateCardSkeleton() {
  return (
    <div className={styles.cardSkeleton}>
      <div className={styles.previewSkeleton} />
      <div className={styles.infoSkeleton}>
        <div className={styles.skeletonLine} style={{ width: '70%', height: 14 }} />
        <div className={styles.skeletonLine} style={{ width: '40%', height: 11 }} />
      </div>
    </div>
  );
}
