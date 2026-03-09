import { useCallback, useRef, useState } from 'react';
import styles from './Editors.module.css';

/** 从 "8px" 或 "8" 中解析出数字字符串，用于展示 */
function parsePxDisplay(value: string | undefined): string {
  if (value == null || value === '') return '';
  return value.replace(/[^0-9.]/g, '');
}

interface PxInputProps {
  value: string;           // 如 "8px" 或 "0"
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
  id?: string;             // 用于 label 关联
  min?: number;
  /** 小尺寸，用于网格内与 inputSmall 一致 */
  small?: boolean;
  disabled?: boolean;
  /** 为 true 时允许为空，onChange('') 表示未设置（如最大宽高留空不限制） */
  optional?: boolean;
  /** 为 true 时只在 blur 或 Enter 时才调用 onChange（类 Figma 行为） */
  commitOnBlur?: boolean;
}

/** 仅输入数字，右侧固定显示 px，内部存储为 "Npx" */
export default function PxInput({
  value,
  onChange,
  onFocus,
  onBlur,
  className = '',
  placeholder = '0',
  'aria-label': ariaLabel,
  id,
  min = 0,
  small = false,
  disabled = false,
  optional = false,
  commitOnBlur = false,
}: PxInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(() => (value == null || value === '' ? '' : parsePxDisplay(value)));
  const [isEditing, setIsEditing] = useState(false);
  const wrapClass = `${styles.pxInputWrap} ${small ? styles.pxInputWrapSmall : ''} ${disabled ? styles.pxInputWrapDisabled : ''} ${className}`.trim();
  const displayValue = isEditing ? local : (value == null || value === '' ? '' : parsePxDisplay(value));

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const allowed = raw.replace(/[^0-9.]/g, '');
      setLocal(allowed);
      if (commitOnBlur) return; // commitOnBlur 模式：只更新 local，blur 時才通知父層
      if (optional && allowed === '') {
        onChange('');
        return;
      }
      if (allowed !== '' && !allowed.endsWith('.')) {
        const num = parseFloat(allowed);
        if (!Number.isNaN(num) && num >= 0) {
          onChange(`${num}px`);
        }
      }
    },
    [onChange, optional, commitOnBlur]
  );

  const handleBlur = useCallback(() => {
    if (local === '' || local === '.') {
      if (optional) {
        onChange('');
        setLocal('');
        setIsEditing(false);
        onBlur?.();
      } else {
        setLocal('0');
        onChange('0');
        setIsEditing(false);
        onBlur?.();
      }
      return;
    }
    const n = parseFloat(local);
    if (Number.isNaN(n) || n < min) {
      const v = min === 0 && optional ? '' : `${min}px`;
      onChange(v);
      setLocal(optional && v === '' ? '' : String(min));
      setIsEditing(false);
      onBlur?.();
    } else {
      onChange(`${n}px`);
      setLocal(String(n));
      setIsEditing(false);
      onBlur?.();
    }
  }, [local, onChange, min, optional, onBlur]);

  return (
    <div className={wrapClass}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className={styles.pxInput}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={() => {
          setIsEditing(true);
          setLocal(value == null || value === '' ? '' : parsePxDisplay(value));
          onFocus?.();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            inputRef.current?.blur(); // 觸發 blur → 走 handleBlur → 通知父層
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        id={id}
        disabled={disabled}
      />
      <span className={styles.pxSuffix} aria-hidden>px</span>
    </div>
  );
}
