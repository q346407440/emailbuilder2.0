import { useMemo } from 'react';
import Select from './Select';
import styles from './Editors.module.css';

const PROTOCOL_OPTIONS = [
  { value: 'https://', label: 'https://' },
  { value: 'http://', label: 'http://' },
];

type UrlProtocol = 'https://' | 'http://';

interface UrlInputFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

function parseUrlValue(rawValue: string): { protocol: UrlProtocol; rest: string } {
  if (rawValue.startsWith('http://')) {
    return { protocol: 'http://', rest: rawValue.slice('http://'.length) };
  }
  if (rawValue.startsWith('https://')) {
    return { protocol: 'https://', rest: rawValue.slice('https://'.length) };
  }
  return { protocol: 'https://', rest: rawValue };
}

export default function UrlInputField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: UrlInputFieldProps) {
  const parsed = useMemo(() => parseUrlValue(value || ''), [value]);
  const protocol = parsed.protocol;
  const rest = parsed.rest;
  const ariaLabelPrefix = label || '链接';

  const handleProtocolChange = (nextProtocol: UrlProtocol) => {
    onChange(rest ? `${nextProtocol}${rest}` : '');
  };

  const handleRestChange = (nextRest: string) => {
    onChange(nextRest ? `${protocol}${nextRest}` : '');
  };

  return (
    <div className={styles.field}>
      {label ? <label className={styles.label}>{label}</label> : null}
      <div className={styles.urlInputGroup}>
        <div className={styles.urlProtocolSelectWrap}>
          <Select
            value={protocol}
            onChange={(v) => handleProtocolChange(v as UrlProtocol)}
            options={PROTOCOL_OPTIONS}
            disabled={disabled}
            fullWidth={false}
            aria-label={`${ariaLabelPrefix}协议`}
          />
        </div>
        <input
          type="text"
          className={`${styles.input} ${styles.urlRestInput}`}
          value={rest}
          onChange={(e) => handleRestChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={`${ariaLabelPrefix}地址`}
        />
      </div>
    </div>
  );
}
