import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 弹窗尺寸：default 380px / large 720px */
  size?: 'default' | 'large';
}

export default function Modal({ open, title, onClose, children, footer, size = 'default' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={(e) => {
        // 阻止 React Portal 事件沿 React 组件树冒泡到画布区域，
        // 避免触发 canvasArea 的 click handler 导致取消选中
        e.stopPropagation();
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={`${styles.modal} ${size === 'large' ? styles.modalLarge : ''}`} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ===== 辅助子组件 ===== */

interface ModalInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  onBlur?: () => void;
}

export function ModalInput({ value, onChange, placeholder, autoFocus = true, onSubmit, onBlur }: ModalInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      // 延迟 focus 以确保动画完成
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  return (
    <input
      ref={inputRef}
      className={styles.input}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onSubmit) onSubmit();
      }}
    />
  );
}

interface ModalFooterProps {
  onCancel: () => void;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmDisabled?: boolean;
  danger?: boolean;
}

export function ModalFooter({
  onCancel,
  onConfirm,
  confirmText = '确定',
  cancelText = '取消',
  confirmDisabled = false,
  danger = false,
}: ModalFooterProps) {
  return (
    <>
      <button type="button" className={styles.btnCancel} onClick={onCancel}>
        {cancelText}
      </button>
      <button
        type="button"
        className={`${styles.btnConfirm} ${danger ? styles.btnDanger : ''}`}
        onClick={onConfirm}
        disabled={confirmDisabled}
      >
        {confirmText}
      </button>
    </>
  );
}

export function ConfirmText({ children }: { children: ReactNode }) {
  return <p className={styles.confirmText}>{children}</p>;
}

export function ConfirmHighlight({ children }: { children: ReactNode }) {
  return <span className={styles.confirmHighlight}>{children}</span>;
}
