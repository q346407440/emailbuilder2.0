import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { RgbaColorPicker as ReactColorfulRgba } from 'react-colorful';
import styles from './RgbaColorPicker.module.css';

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface RgbaColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** 紧凑模式：仅显示色块按钮，不显示文字输入与 alpha 标签（适用于工具栏嵌入） */
  compact?: boolean;
  /** 紧凑行高：色块与输入框更小，用于属性面板减少垂直占用 */
  dense?: boolean;
  /** 色块按钮 mousedown 回调（用于工具栏在失焦前保存选取范围） */
  onSwatchMouseDown?: () => void;
  /** 弹窗关闭回调（用于工具栏清除 faux-sel） */
  onPopoverClose?: () => void;
  /** 置灰不可编辑（如 App Store / Google Play 徽章时颜色固定） */
  disabled?: boolean;
}

/* ─── 工具函数：CSS 颜色字串 ↔ RgbaColor ─── */

function cssToRgba(css: string): RgbaColor {
  const s = css.trim().toLowerCase();

  // rgba(r, g, b, a)
  const rgbaMatch = s.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+))?\s*\)$/
  );
  if (rgbaMatch) {
    return {
      r: clamp(Number(rgbaMatch[1]), 0, 255),
      g: clamp(Number(rgbaMatch[2]), 0, 255),
      b: clamp(Number(rgbaMatch[3]), 0, 255),
      a: rgbaMatch[4] !== undefined ? clamp(Number(rgbaMatch[4]), 0, 1) : 1,
    };
  }

  // #RRGGBBAA 或 #RRGGBB 或 #RGBA 或 #RGB
  const hexMatch = s.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
    if (hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: Math.round((parseInt(hex[3] + hex[3], 16) / 255) * 100) / 100,
      };
    }
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
  }

  // transparent 关键字
  if (s === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

/** 始終輸出 rgba(r,g,b,a) 字串，供展示與對外傳值統一使用 */
function rgbaToRgbaString(c: RgbaColor): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${roundAlpha(c.a)})`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundAlpha(a: number): number {
  return Math.round(a * 100) / 100;
}

/* ─── 浮窗定位常量 ─── */

const POPOVER_WIDTH = 220;
const POPOVER_EST_HEIGHT = 270; // 饱和度 140 + 滑条 + 信息栏 + padding
const GAP = 8; // 浮窗与触发元素的间距
const VIEWPORT_PADDING = 8; // 与视口边缘的安全距离

interface PopoverPosition {
  top: number;
  left: number;
  /** 上方弹出还是下方弹出，用于选择动画方向 */
  placement: 'below' | 'above';
}

/**
 * 根据触发元素的位置和视口大小，计算浮窗的最佳展示位置。
 * 优先下方、左对齐；空间不足时翻转方向。
 */
function computePopoverPosition(triggerRect: DOMRect): PopoverPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // ── 垂直方向 ──
  const spaceBelow = vh - triggerRect.bottom - GAP;
  const spaceAbove = triggerRect.top - GAP;
  const placeBelow = spaceBelow >= POPOVER_EST_HEIGHT + VIEWPORT_PADDING
    || spaceBelow >= spaceAbove; // 即使都不够，也优先下方（除非上方明显更大）

  let top: number;
  let placement: 'below' | 'above';

  if (placeBelow) {
    top = triggerRect.bottom + GAP;
    placement = 'below';
  } else {
    top = triggerRect.top - GAP - POPOVER_EST_HEIGHT;
    placement = 'above';
  }

  // 确保不超出视口顶部/底部
  top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - POPOVER_EST_HEIGHT - VIEWPORT_PADDING));

  // ── 水平方向 ──
  let left = triggerRect.left;

  // 如果右侧溢出，向左偏移
  if (left + POPOVER_WIDTH > vw - VIEWPORT_PADDING) {
    left = vw - POPOVER_WIDTH - VIEWPORT_PADDING;
  }
  // 如果左侧溢出，推回来
  if (left < VIEWPORT_PADDING) {
    left = VIEWPORT_PADDING;
  }

  return { top, left, placement };
}

/* ─── 组件 ─── */

export default function RgbaColorPicker({ value, onChange, compact, dense, onSwatchMouseDown, onPopoverClose, disabled = false }: RgbaColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [textValue, setTextValue] = useState(value);
  // 拖動時的本地顏色狀態：作為 ReactColorfulRgba 唯一資料來源，
  // 避免 value 在 round-trip 後格式略變導致選色點「回彈」
  const [localColor, setLocalColor] = useState<RgbaColor>(() => cssToRgba(value));
  const popoverRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);

  // 浮層關閉時才從外部 value 同步 localColor，避免拖動中途被外部更新打斷
  useEffect(() => {
    if (!open) {
      setLocalColor(cssToRgba(value));
      setTextValue(rgbaToRgbaString(cssToRgba(value)));
    }
  }, [value, open]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  // 计算并更新浮窗位置
  const updatePosition = useCallback(() => {
    if (!open || !swatchRef.current) {
      setPopoverPos(null);
      return;
    }
    const rect = swatchRef.current.getBoundingClientRect();
    setPopoverPos(computePopoverPosition(rect));
  }, [open]);

  // 打开时立刻计算位置
  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  // 监听滚动 / resize，实时更新位置或关闭
  useEffect(() => {
    if (!open) return;

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    // 监听所有可能的滚动容器（捕获阶段，以便捕获任何子容器的 scroll）
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [open, updatePosition]);

  // 点击外部时关闭 popover
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        swatchRef.current &&
        !swatchRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        onPopoverClose?.();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onPopoverClose]);

  const handlePickerChange = useCallback(
    (color: RgbaColor) => {
      setLocalColor(color); // 立即更新本地狀態，確保拖動流暢不回彈
      const rgbaStr = rgbaToRgbaString(color);
      setTextValue(rgbaStr);
      onChange(rgbaStr);
    },
    [onChange]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setTextValue(v);
    },
    []
  );

  const handleTextBlur = useCallback(() => {
    const parsed = cssToRgba(textValue);
    const rgbaStr = rgbaToRgbaString(parsed);
    setTextValue(rgbaStr);
    onChange(rgbaStr);
  }, [textValue, onChange]);

  const handleTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        (e.target as HTMLInputElement).blur();
      }
    },
    []
  );

  const displayAlpha = roundAlpha(localColor.a);

  const swatchButton = (
    <button
      ref={swatchRef}
      type="button"
      className={`${styles.swatch} ${compact ? styles.swatchCompact : ''} ${dense ? styles.swatchDense : ''} ${disabled ? styles.swatchDisabled : ''}`}
      onClick={() => {
        if (disabled) return;
        const willOpen = !open;
        setOpen(willOpen);
        if (!willOpen) onPopoverClose?.();
      }}
      onMouseDown={disabled ? undefined : onSwatchMouseDown}
      disabled={disabled}
      aria-label="选择颜色"
    >
      <span className={styles.swatchCheckerboard} />
      <span
        className={styles.swatchColor}
        style={{ backgroundColor: value || 'transparent' }}
      />
    </button>
  );

  // compact 模式：直接返回色块按钮，不包裹 wrapper div，
  // 避免中间层影响 flex 布局高度对齐。portal 弹窗仍通过 createPortal 挂到 body。
  if (compact) {
    return (
      <>
        {swatchButton}
        {open && popoverPos && createPortal(
          <div
            ref={popoverRef}
            className={`${styles.popover} ${popoverPos.placement === 'above' ? styles.popoverAbove : styles.popoverBelow}`}
            style={{ top: popoverPos.top, left: popoverPos.left }}
            data-rgba-picker-portal
          >
            <ReactColorfulRgba color={localColor} onChange={handlePickerChange} />
            <div className={styles.popoverInfo}>
              <span className={styles.popoverPreview}>
                <span className={styles.swatchCheckerboard} />
                <span className={styles.swatchColor} style={{ backgroundColor: value || 'transparent' }} />
              </span>
              <input
                type="text"
                className={styles.popoverValueInput}
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onBlur={handleTextBlur}
                onKeyDown={handleTextKeyDown}
                placeholder="rgba(0, 0, 0, 1)"
                aria-label="颜色值 (RGBA)"
              />
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div className={`${styles.wrapper} ${disabled ? styles.wrapperDisabled : ''}`}>
      <div className={`${styles.row} ${dense ? styles.rowDense : ''}`}>
        {swatchButton}

        {/* 文字输入 */}
        <input
          type="text"
          className={styles.textInput}
          value={textValue}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
          placeholder="rgba(0, 0, 0, 1)"
          disabled={disabled}
        />

        {/* Alpha 数值显示 */}
        <span className={styles.alphaLabel}>
          {Math.round(displayAlpha * 100)}%
        </span>
      </div>

      {/* Popover 颜色选择器 — 通过 Portal 渲染到 body，避免被父容器 overflow 裁剪 */}
      {open && popoverPos && createPortal(
        <div
          ref={popoverRef}
          className={`${styles.popover} ${popoverPos.placement === 'above' ? styles.popoverAbove : styles.popoverBelow}`}
          style={{
            top: popoverPos.top,
            left: popoverPos.left,
          }}
          data-rgba-picker-portal
        >
          <ReactColorfulRgba
            color={localColor}
            onChange={handlePickerChange}
          />
          <div className={styles.popoverInfo}>
            <span className={styles.popoverPreview}>
              <span className={styles.swatchCheckerboard} />
              <span
                className={styles.swatchColor}
                style={{ backgroundColor: value || 'transparent' }}
              />
            </span>
            <input
              type="text"
              className={styles.popoverValueInput}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={handleTextBlur}
              onKeyDown={handleTextKeyDown}
              placeholder="rgba(0, 0, 0, 1)"
              aria-label="颜色值 (RGBA)"
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
