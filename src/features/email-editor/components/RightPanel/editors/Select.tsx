import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './Editors.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** 触发按钮上的 aria-label */
  'aria-label'?: string;
  /** 触发按钮额外 class（如控制宽度） */
  className?: string;
  /** 与 Editors.module.css 中 .field 搭配时的输入控件宽度，默认 100% */
  fullWidth?: boolean;
}

/**
 * 公共下拉组件：触发器浅底圆角边框、展开后面板白底、选中项企业蓝底+白字+勾选。
 * 全项目下拉统一使用此组件以保持样式一致（见 public-components.mdc）。
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  'aria-label': ariaLabel,
  className,
  fullWidth = true,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder ?? '';

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPosition(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 4;
    const maxHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openDown = spaceBelow >= maxHeight || spaceBelow >= rect.top;
    setMenuPosition({
      top: openDown ? rect.bottom + gap : rect.top - maxHeight - gap,
      left: rect.left,
      width: rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const menu = document.getElementById('shared-select-menu');
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div className={`${styles.selectWrap} ${fullWidth ? styles.selectWrapFullWidth : ''} ${open ? styles.selectWrapOpen : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.selectTrigger} ${className ?? ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={styles.selectLabel}>{displayLabel || '\u00A0'}</span>
        <svg className={styles.selectChevron} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && menuPosition &&
        createPortal(
          <div
            id="shared-select-menu"
            className={styles.selectMenu}
            role="listbox"
            aria-label={ariaLabel ? `${ariaLabel} 选项` : undefined}
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              minWidth: menuPosition.width,
            }}
          >
            {options.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? `${styles.selectItem} ${styles.selectItemSelected}` : styles.selectItem}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                  {isSelected && (
                    <svg className={styles.selectCheck} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
