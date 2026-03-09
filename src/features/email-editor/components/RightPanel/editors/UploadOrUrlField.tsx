import { useRef } from 'react';
import styles from './Editors.module.css';

interface UploadOrUrlFieldProps {
  value: string;
  onChange: (value: string) => void;
  uploadButtonLabel: string;
  placeholder: string;
  accept: string;
  disabled?: boolean;
}

export default function UploadOrUrlField({
  value,
  onChange,
  uploadButtonLabel,
  placeholder,
  accept,
  disabled = false,
}: UploadOrUrlFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      onChange((event.target?.result as string) || '');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className={styles.imageFieldGroup}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={disabled}
      />
      <button
        type="button"
        className={styles.uploadButton}
        onClick={() => !disabled && fileInputRef.current?.click()}
        disabled={disabled}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 10v2.667A1.333 1.333 0 0112.667 14H3.333A1.333 1.333 0 012 12.667V10" />
          <path d="M11.333 5.333L8 2 4.667 5.333" />
          <path d="M8 2v8" />
        </svg>
        {uploadButtonLabel}
      </button>
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
