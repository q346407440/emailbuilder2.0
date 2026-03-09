import RgbaColorPicker from './RgbaColorPicker';
import Select from './Select';
import UploadOrUrlField from './UploadOrUrlField';
import styles from './Editors.module.css';

const BACKGROUND_TYPE_OPTIONS = [
  { value: 'color', label: '颜色填充' },
  { value: 'image', label: '图片填充' },
] as const;

interface BackgroundFieldProps {
  label: string;
  backgroundType: 'color' | 'image';
  backgroundColor: string;
  backgroundImage?: string;
  onTypeChange: (type: 'color' | 'image') => void;
  onColorChange: (color: string) => void;
  onImageChange: (image: string) => void;
}

export default function BackgroundField({
  label,
  backgroundType,
  backgroundColor,
  backgroundImage,
  onTypeChange,
  onColorChange,
  onImageChange,
}: BackgroundFieldProps) {
  return (
    <div className={styles.backgroundField}>
      <label className={styles.label}>{label}</label>

      <Select
        value={backgroundType}
        onChange={(v) => onTypeChange(v as 'color' | 'image')}
        options={[...BACKGROUND_TYPE_OPTIONS]}
        aria-label={label}
      />

      {backgroundType === 'color' && (
        <RgbaColorPicker value={backgroundColor} onChange={onColorChange} dense />
      )}

      {backgroundType === 'image' && (
        <UploadOrUrlField
          value={backgroundImage || ''}
          onChange={onImageChange}
          uploadButtonLabel="上传本地图片"
          placeholder="或输入图片 URL"
          accept="image/*"
        />
      )}
    </div>
  );
}
