import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import type { ProjectListItem } from '@shared/api/serverApi';
import styles from '@features/template-management/components/TemplateCard/TemplateCard.module.css';

interface Props {
  project: ProjectListItem;
  onDelete?: (id: string) => void;
  onPublish?: (id: string) => void;
}

function formatUpdatedAt(ts: number | string): string {
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (Number.isNaN(n)) return '—';
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return '—';
  const datePart = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timePart = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${datePart} ${timePart} 更新`;
}

export default function ProjectCard({ project, onDelete, onPublish }: Props) {
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
    const menuHeight = 120;
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
    navigate(`/projects/edit/${project.id}`);
  };

  const handlePublish = () => {
    closeMenu();
    onPublish?.(project.id);
  };

  const handleDelete = () => {
    closeMenu();
    onDelete?.(project.id);
  };

  const previewUrl = project.previewUrl;
  const showPlaceholder = !previewUrl || previewLoadFailed || !imageLoaded;

  const handleCardClick = () => {
    if (menuOpen) {
      closeMenu();
      return;
    }
    navigate(`/projects/edit/${project.id}`);
  };

  return (
    <div className={styles.card} onClick={handleCardClick}>
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
            alt={project.title}
            className={`${styles.previewImg} ${!imageLoaded ? styles.previewImgHidden : ''}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setPreviewLoadFailed(true)}
          />
        )}
        <div className={styles.hoverOverlay} onClick={(e) => e.stopPropagation()}>
          <div className={styles.overlayRow}>
            <button type="button" className={styles.actionBtn} onClick={handleEdit}>
              编辑
            </button>
            {onPublish && (
              <button type="button" className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} onClick={handlePublish}>
                发布为模板
              </button>
            )}
          </div>
        </div>
      </div>
      <div className={styles.info}>
        <div className={styles.titleRow}>
          <span className={styles.title} title={project.title}>{project.title}</span>
          <button
            ref={btnRef}
            type="button"
            className={styles.moreBtn}
            onClick={openMenu}
            aria-label={`更多操作：${project.title}`}
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
          <span className={styles.date}>{formatUpdatedAt(project.updatedAt)}</span>
        </div>
      </div>
      {menuOpen &&
        createPortal(
          <>
            <div className={styles.menuBackdrop} onClick={closeMenu} />
            <div className={styles.menu} style={{ top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
              <button type="button" className={styles.menuItem} onClick={handleEdit}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                编辑
              </button>
              {onPublish && (
                <button type="button" className={styles.menuItem} onClick={handlePublish}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                  发布为模板
                </button>
              )}
              <div className={styles.menuDivider} />
              <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={handleDelete}>
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

export function ProjectCardSkeleton() {
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
