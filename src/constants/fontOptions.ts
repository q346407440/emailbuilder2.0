export interface FontOption {
  value: string;
  label: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { value: "'Source Sans 3', sans-serif", label: 'Source Sans 3' },
  { value: "Arial, Helvetica, sans-serif", label: 'Arial' },
  { value: "Georgia, serif", label: 'Georgia' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
];

export const DEFAULT_TEXT_FONT_FAMILY = FONT_OPTIONS[0].value;
