import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import RgbaColorPicker from './RgbaColorPicker';
import Select from './Select';
import styles from './Editors.module.css';

interface Option {
  value: string;
  label: string;
}

interface FormFieldProps {
  label: string;
  type: 'text' | 'textarea' | 'color' | 'select' | 'number';
  value: string | number;
  onChange: (value: string) => void;
  options?: Option[];
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  helpText?: string;
}

export default function FormField({
  label,
  type,
  value,
  onChange,
  options,
  min,
  max,
  placeholder,
  disabled = false,
  helpText,
}: FormFieldProps) {
  // 对于 number 类型，维护内部临时状态以支持完全删除
  const [tempValue, setTempValue] = useState<string>(() => (type === 'number' ? String(value) : ''));
  const [isEditingNumber, setIsEditingNumber] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const helpWrapRef = useRef<HTMLDivElement | null>(null);
  const helpPopoverRef = useRef<HTMLDivElement | null>(null);
  const [helpPopoverPos, setHelpPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const numberDisplayValue = isEditingNumber ? tempValue : String(value ?? '');
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    onChange(e.target.value);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setTempValue(newValue);
    
    // 如果输入非空，立即向外传递
    if (newValue !== '') {
      onChange(newValue);
    }
  };

  const handleNumberBlur = () => {
    // 失焦时，如果为空则恢复到最小值（或默认值）
    if (tempValue === '' || tempValue === '-') {
      const fallbackValue = min !== undefined ? String(min) : '0';
      setTempValue(fallbackValue);
      onChange(fallbackValue);
      setIsEditingNumber(false);
      return;
    }
    setIsEditingNumber(false);
  };

  const updateHelpPopoverPosition = useCallback(() => {
    if (!helpWrapRef.current || !helpPopoverRef.current) return;
    const triggerRect = helpWrapRef.current.getBoundingClientRect();
    const popoverWidth = 260;
    const viewportPadding = 8;
    const gap = 6;
    const popoverHeight = helpPopoverRef.current?.offsetHeight ?? 120;

    let left = triggerRect.right - popoverWidth;
    if (left < viewportPadding) left = viewportPadding;
    if (left + popoverWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - popoverWidth - viewportPadding;
    }

    let top = triggerRect.bottom + gap;
    if (top + popoverHeight > window.innerHeight - viewportPadding) {
      top = triggerRect.top - popoverHeight - gap;
    }
    if (top < viewportPadding) top = viewportPadding;

    setHelpPopoverPos({ top, left });
  }, []);

  useEffect(() => {
    if (!isHelpOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = !!helpWrapRef.current?.contains(target);
      const clickedPopover = !!helpPopoverRef.current?.contains(target);
      if (!clickedTrigger && !clickedPopover) {
        setIsHelpOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpOpen(false);
      }
    };

    window.addEventListener('resize', updateHelpPopoverPosition);
    window.addEventListener('scroll', updateHelpPopoverPosition, true);
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('resize', updateHelpPopoverPosition);
      window.removeEventListener('scroll', updateHelpPopoverPosition, true);
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isHelpOpen, updateHelpPopoverPosition]);

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label className={styles.label}>{label}</label>
        {helpText ? (
          <div className={styles.labelHelpWrap} ref={helpWrapRef}>
            <button
              type="button"
              className={styles.labelHelpBtn}
              onClick={() => {
                setIsHelpOpen((prev) => {
                  const next = !prev;
                  if (next) {
                    window.setTimeout(() => updateHelpPopoverPosition(), 0);
                  }
                  return next;
                });
              }}
              aria-label={`${label}说明`}
              aria-expanded={isHelpOpen}
            >
              !
            </button>
          </div>
        ) : null}
      </div>
      {helpText && isHelpOpen && helpPopoverPos && createPortal(
        <div
          ref={helpPopoverRef}
          className={styles.labelHelpPopover}
          style={{ top: helpPopoverPos.top, left: helpPopoverPos.left }}
          role="tooltip"
        >
          {helpText}
        </div>,
        document.body
      )}

      {type === 'textarea' && (
        <textarea
          className={styles.textarea}
          value={value ?? ''}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}

      {type === 'select' && options && (
        <Select
          value={String(value ?? '')}
          onChange={onChange}
          options={options}
          disabled={disabled}
          fullWidth
        />
      )}

      {type === 'color' && (
        <RgbaColorPicker
          value={typeof value === 'string' ? value : '#000000'}
          onChange={onChange}
          disabled={disabled}
          dense
        />
      )}

      {type === 'text' && (
        <input
          type="text"
          className={styles.input}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}

      {type === 'number' && (
        <input
          type="number"
          className={`${styles.input} ${styles.numberInput}`}
          value={numberDisplayValue}
          onChange={handleNumberChange}
          onBlur={handleNumberBlur}
          onFocus={() => {
            setIsEditingNumber(true);
            setTempValue(String(value ?? ''));
          }}
          min={min}
          max={max}
          disabled={disabled}
        />
      )}
    </div>
  );
}
