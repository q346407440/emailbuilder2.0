import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './ImageLightbox.module.css';

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.05;
const ZOOM_DEFAULT = 0.5;

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt = '预览', onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const scrollWrapRef = useRef<HTMLDivElement>(null);
  const prevZoomRef = useRef(ZOOM_DEFAULT);
  const scrollBeforeZoomRef = useRef<{ scrollLeft: number; scrollTop: number; w: number; h: number } | null>(null);

  useEffect(() => {
    overlayRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useLayoutEffect(() => {
    if (!imageSize || !scrollWrapRef.current) return;
    const wrap = scrollWrapRef.current;
    const prevZoom = prevZoomRef.current;
    const snap = scrollBeforeZoomRef.current;
    scrollBeforeZoomRef.current = null;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const centerX = snap ? snap.scrollLeft + snap.w / 2 : w / 2;
    const centerY = snap ? snap.scrollTop + snap.h / 2 : h / 2;
    const imageCenterX = centerX / prevZoom;
    const imageCenterY = centerY / prevZoom;
    const newScrollLeft = imageCenterX * zoom - w / 2;
    const newScrollTop = imageCenterY * zoom - h / 2;
    wrap.scrollLeft = Math.max(0, Math.min(newScrollLeft, wrap.scrollWidth - w));
    wrap.scrollTop = Math.max(0, Math.min(newScrollTop, wrap.scrollHeight - h));
    prevZoomRef.current = zoom;
  }, [zoom, imageSize]);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (img && img.naturalWidth && img.naturalHeight) {
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      prevZoomRef.current = ZOOM_DEFAULT;
    }
  }, []);

  const ready = !!imageSize;

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="预览放大"
      tabIndex={-1}
    >
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        <div ref={scrollWrapRef} className={styles.scrollWrap}>
          <div
            className={styles.imageWrap}
            style={
              imageSize
                ? { width: imageSize.w * zoom, height: imageSize.h * zoom }
                : undefined
            }
          >
            <img
              ref={imgRef}
              src={src}
              alt={alt}
              className={styles.image}
              onLoad={handleImageLoad}
              draggable={false}
              style={{
                ...(!ready ? { position: 'absolute', visibility: 'hidden' } : undefined),
              }}
            />
          </div>
        </div>
      </div>
      <div className={styles.toolbar} onClick={(e) => e.stopPropagation()}>
        <span className={styles.zoomLabel}>缩放</span>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => {
            const wrap = scrollWrapRef.current;
            if (wrap) {
              scrollBeforeZoomRef.current = {
                scrollLeft: wrap.scrollLeft,
                scrollTop: wrap.scrollTop,
                w: wrap.clientWidth,
                h: wrap.clientHeight,
              };
            }
            setZoom(Number(e.target.value));
          }}
          className={styles.zoomSlider}
          aria-label="缩放比例"
        />
        <button type="button" className={styles.zoomReset} onClick={() => setZoom(ZOOM_DEFAULT)}>
          {Math.round(zoom * 100)}%
        </button>
      </div>
    </div>
  );
}
