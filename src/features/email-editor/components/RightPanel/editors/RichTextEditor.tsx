import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { Node as TiptapNode, mergeAttributes, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { TextStyle, Color, FontSize, LineHeight, FontFamily } from '@tiptap/extension-text-style';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import RgbaColorPicker from './RgbaColorPicker';
import PxInput from './PxInput';
import Select from './Select';
import styles from './RichTextEditor.module.css';

/** 字号预设：步长 2px（12–32），再 36、40、48） */
const FONT_SIZE_PRESETS = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 48];
const FONT_SIZE_OPTIONS: { value: string; label: string }[] = [
  ...FONT_SIZE_PRESETS.map((n) => ({ value: `${n}px`, label: `${n}px` })),
  { value: '__custom__', label: '自定义' },
];
const FONT_SIZE_PRESET_SET = new Set(FONT_SIZE_PRESETS.map((n) => `${n}px`));
import {
  VARIABLE_SCHEMA_MAP,
  getAllVariables,
  type VariableSchemaItem,
} from '@shared/constants/variableSchema';
import type { CustomVariableDefinition } from '@shared/types/emailTemplate';

// ─── Variable Chip 節點（inline atom，渲染為藍色 tag）────────────────────────
const VariableChipExtension = TiptapNode.create({
  name: 'variableChip',
  inline: true,
  group: 'inline',
  atom: true,
  marks: '_',

  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-variable-key') ?? '',
      },
      label: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-variable-label') || element.textContent || '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-variable-key]' }];
  },

  renderHTML({ node }) {
    return [
      'span',
      mergeAttributes({
        'data-variable-key': node.attrs.key,
        'data-variable-label': node.attrs.label,
        class: 'variable-chip',
        contenteditable: 'false',
      }),
      ['span', { class: 'variable-chip-label' }, node.attrs.label || `{{${node.attrs.key}}}`],
    ];
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () =>
        this.editor.commands.command(({ tr, state }) => {
          const { selection } = state;
          if (!selection.empty) return false;
          const { anchor } = selection;
          let deleted = false;
          state.doc.nodesBetween(anchor - 1, anchor, (node, pos) => {
            if (node.type.name === this.name) {
              tr.delete(pos, pos + node.nodeSize);
              deleted = true;
            }
          });
          return deleted;
        }),
    };
  },
});

// ─── Variable 格式轉換（DB 存 {{key}}，編輯器用 chip 節點）──────────────────
function convertVariablesToChips(html: string, extraVars?: VariableSchemaItem[]): string {
  // 交替匹配：HTML tag 整體優先捕獲（原樣保留，含 attribute 內的 {{...}}），
  // 再捕獲文字節點中的 {{...}} 替換為 chip。
  // 避免 href="mailto:{{var}}" 這類 attribute 值被錯誤替換成 chip span，破壞 HTML 結構。
  return html.replace(/(<[^>]*>)|\{\{([\w.]+)\}\}/g, (_match, tag: string | undefined, key: string | undefined) => {
    if (tag !== undefined) return tag;
    const extra = extraVars?.find((v) => v.key === key!);
    const item = extra ?? VARIABLE_SCHEMA_MAP.get(key!);
    const label = item?.label ?? key!;
    return `<span data-variable-key="${key}" data-variable-label="${label}" class="variable-chip"><span class="variable-chip-label">${label}</span></span>`;
  });
}

function convertChipsToVariables(html: string): string {
  if (!html || typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('span[data-variable-key]').forEach((el) => {
    const key = el.getAttribute('data-variable-key') ?? '';
    el.replaceWith(`{{${key}}}`);
  });
  return div.innerHTML;
}

// ─── Variable Chip 框選高亮（TextSelection 跨越 chip 時加 class）───────────
const varSelKey = new PluginKey<DecorationSet>('varSel');

const VariableSelectionExtension = Extension.create({
  name: 'variableSelection',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: varSelKey,
        state: {
          init: () => DecorationSet.empty,
          apply(_tr, _, __, newState) {
            const { selection } = newState;
            if (selection.empty) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            newState.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
              if (node.type.name === 'variableChip') {
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: 'variable-chip-in-sel',
                  })
                );
              }
            });
            return decorations.length
              ? DecorationSet.create(newState.doc, decorations)
              : DecorationSet.empty;
          },
        },
        props: {
          decorations(state) {
            return varSelKey.getState(state);
          },
        },
      }),
    ];
  },
});

// ─── Faux Selection（偽選取高亮）──────────────────────────────────────────────
const fauxSelKey = new PluginKey<DecorationSet>('fauxSel');

const FauxSelectionExtension = Extension.create({
  name: 'fauxSelection',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: fauxSelKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(fauxSelKey) as { from: number; to: number } | false | undefined;
            if (meta === undefined) return old.map(tr.mapping, tr.doc);
            if (!meta) return DecorationSet.empty;
            return DecorationSet.create(tr.doc, [
              Decoration.inline(meta.from, meta.to, { class: 'faux-sel' }),
            ]);
          },
        },
        props: {
          decorations(state) {
            return fauxSelKey.getState(state);
          },
        },
      }),
    ];
  },
});

function setFauxSel(editor: Editor, from: number, to: number) {
  editor.view.dispatch(editor.view.state.tr.setMeta(fauxSelKey, { from, to }));
}
function clearFauxSel(editor: Editor) {
  editor.view.dispatch(editor.view.state.tr.setMeta(fauxSelKey, false));
}
// ──────────────────────────────────────────────────────────────────────────────

// FontSize、Color、LineHeight、FontFamily 之外需要透傳的 CSS 屬性
const HANDLED_STYLE_PROPS = new Set([
  'font-size', 'color', 'background-color', 'font-family', 'line-height',
]);

function extractExtraStyles(element: Element): string | null {
  const style = element.getAttribute('style');
  if (!style) return null;
  const passthrough = style
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((part) => {
      const colonIdx = part.indexOf(':');
      if (colonIdx < 0) return false;
      const prop = part.substring(0, colonIdx).trim().toLowerCase();
      return !HANDLED_STYLE_PROPS.has(prop);
    });
  return passthrough.length > 0 ? passthrough.join('; ') : null;
}

const StylePassthrough = Extension.create({
  name: 'stylePassthrough',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          extraStyle: {
            default: null,
            parseHTML: (element: HTMLElement) => extractExtraStyles(element),
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.extraStyle) return {};
              return { style: attributes.extraStyle as string };
            },
          },
        },
      },
    ];
  },
});

function normalizeBlockStylesToSpans(html: string): string {
  if (!html || typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('p[style], li[style]').forEach((el) => {
    const styleAttr = el.getAttribute('style');
    if (!styleAttr) return;
    const span = document.createElement('span');
    span.setAttribute('style', styleAttr);
    span.innerHTML = el.innerHTML;
    el.removeAttribute('style');
    el.innerHTML = '';
    el.appendChild(span);
  });
  return div.innerHTML;
}

const extensions = [
  StarterKit.configure({
    heading: false,
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: false,
    underline: false,
  }),
  Underline,
  Link.configure({ openOnClick: false, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
  TextStyle,
  Color,
  FontSize,
  LineHeight,
  FontFamily,
  StylePassthrough,
  FauxSelectionExtension,
  VariableChipExtension,
  VariableSelectionExtension,
];

function normalizeLinkHref(input: string): string {
  const s = input.trim();
  if (!s) return s;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(s)) return s;
  if (s.startsWith('mailto:') || s.startsWith('tel:') || s.startsWith('#')) return s;
  return `https://${s.replace(/^\/*/, '')}`;
}

// ─── 建議浮窗邏輯 ─────────────────────────────────────────────────────────────
interface SuggestionState {
  query: string;
  from: number;
  matches: VariableSchemaItem[];
  pos: { top: number; left: number };
}

function findSuggestion(editor: Editor, allVariables: VariableSchemaItem[]): Omit<SuggestionState, 'pos'> | null {
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if ($from.parentOffset === 0) return null;

  // textBetween 使用 parent 節點內的 offset，正確取出游標前的純文字
  const textUpToCursor = $from.parent.textBetween(0, $from.parentOffset);
  const match = /([^\s，。！？、\uff01\uff1f\uff0c\u3001\u3002]+)$/.exec(textUpToCursor);
  if (!match || match[1].length < 1) return null;

  const query = match[1];
  const from = $from.pos - query.length;

  const matches = allVariables.filter(
    (v) =>
      v.contentType === 'text' &&
      (v.label.includes(query) || v.key.toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 8);

  if (matches.length === 0) return null;
  return { query, from, matches };
}

function getCursorCoords(editor: Editor): { top: number; left: number } | null {
  try {
    const coords = editor.view.coordsAtPos(editor.state.selection.to);
    return { top: coords.bottom + 6, left: coords.left };
  } catch {
    return null;
  }
}

// ─── 建議浮窗元件 ─────────────────────────────────────────────────────────────
function VariableSuggestionPopup({
  matches,
  selectedIndex,
  pos,
  onSelect,
}: {
  matches: VariableSchemaItem[];
  selectedIndex: number;
  pos: { top: number; left: number };
  onSelect: (item: VariableSchemaItem) => void;
}) {
  const adjustedLeft = Math.min(pos.left, window.innerWidth - 260);
  const adjustedTop =
    pos.top + 200 > window.innerHeight ? pos.top - 200 - 12 : pos.top;

  return createPortal(
    <div
      className={styles.suggestionPopup}
      style={{ top: adjustedTop, left: adjustedLeft }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className={styles.suggestionHeader}>插入变量</div>
      {matches.map((item, i) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.suggestionItem} ${i === selectedIndex ? styles.suggestionItemActive : ''}`}
          onClick={() => onSelect(item)}
        >
          <span className={styles.suggestionLabel}>{item.label}</span>
          <span className={styles.suggestionKey}>{item.key}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}

// ─── SVG 图标 ─────────────────────────────────────────────────────────────────

function IconBold() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <text x="1" y="12" fontFamily="Georgia, serif" fontSize="13" fontWeight="900" fill="currentColor">B</text>
    </svg>
  );
}
function IconItalic() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <text x="3" y="12" fontFamily="Georgia, serif" fontSize="13" fontStyle="italic" fill="currentColor">I</text>
    </svg>
  );
}
function IconUnderline() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <text x="2" y="11" fontFamily="Georgia, serif" fontSize="12" textDecoration="underline" fill="currentColor">U</text>
      <line x1="1" y1="13.5" x2="13" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconStrike() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <text x="2" y="11" fontFamily="Georgia, serif" fontSize="12" fill="currentColor">S</text>
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconBulletList() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="2" cy="4" r="1.2" fill="currentColor" />
      <line x1="5" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2" cy="8" r="1.2" fill="currentColor" />
      <line x1="5" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2" cy="12" r="1.2" fill="currentColor" />
      <line x1="5" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconOrderedList() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <text x="0" y="5.5" fontSize="5" fill="currentColor" fontFamily="sans-serif">1.</text>
      <line x1="6" y1="4" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <text x="0" y="9.5" fontSize="5" fill="currentColor" fontFamily="sans-serif">2.</text>
      <line x1="6" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <text x="0" y="13.5" fontSize="5" fill="currentColor" fontFamily="sans-serif">3.</text>
      <line x1="6" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconLink() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5.5 8.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L6.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.5 5.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5L7.5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconClearFormat() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <text x="1" y="10" fontSize="9" fontFamily="sans-serif" fill="currentColor">T</text>
      <line x1="8" y1="5" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="5" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
// ──────────────────────────────────────────────────────────────────────────────

export interface RichTextEditorHandle {
  insertContentAtCursor: (htmlOrText: string) => void;
  /** 在点击外部按钮（如「插入变量」）的 mousedown 事件中调用，保存当前编辑器选区 */
  saveCurrentSelection: () => void;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
  customVariables?: CustomVariableDefinition[];
  /** 选区变化时回调，用于外部按钮动态更新标签（如「插入变量」↔「替换为变量」） */
  onSelectionChange?: (hasSelection: boolean) => void;
}

function Toolbar({
  editor,
  savedSelectionRef,
}: {
  editor: Editor | null;
  savedSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPopoverPos, setLinkPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const linkBtnRef = useRef<HTMLButtonElement>(null);
  const linkPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!linkOpen || !linkBtnRef.current) {
      setLinkPopoverPos(null);
      return;
    }
    const rect = linkBtnRef.current.getBoundingClientRect();
    setLinkPopoverPos({ top: rect.bottom + 6, left: rect.left });
    setLinkUrl(editor?.getAttributes('link').href ?? '');
  }, [linkOpen, editor]);

  useEffect(() => {
    if (!linkOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (linkPopoverRef.current?.contains(target) || linkBtnRef.current?.contains(target))
        return;
      setLinkOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [linkOpen]);

  if (!editor) return null;

  const currentColor = editor.getAttributes('textStyle').color || '#1A1A1A';
  const hasSelection = !editor.state.selection.empty;

  let currentFontSize = editor.getAttributes('textStyle').fontSize || '';
  if (!currentFontSize && !editor.state.selection.empty) {
    const { from, to } = editor.state.selection;
    let found: string | null = null;
    editor.state.doc.nodesBetween(from, to, (node) => {
      if (found) return false;
      const mark = node.marks.find((m) => m.type.name === 'textStyle');
      const size = mark?.attrs?.fontSize;
      if (size) { found = size; return false; }
      return true;
    });
    if (found) currentFontSize = found;
  }
  if (!currentFontSize && editor.view.dom) {
    try {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const el = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : (container.parentElement as Element);
        if (el && editor.view.dom.contains(el)) {
          const px = window.getComputedStyle(el).fontSize;
          if (px && /^\d+px$/.test(px)) currentFontSize = px;
        }
      }
    } catch { /* ignore */ }
  }

  const saveSelection = () => {
    if (editor && !editor.state.selection.empty) {
      const { from, to } = editor.state.selection;
      savedSelectionRef.current = { from, to };
      setFauxSel(editor, from, to);
    }
  };

  const clearSavedSelection = () => {
    clearFauxSel(editor);
    savedSelectionRef.current = null;
  };

  const fontSizeSelectValue = currentFontSize && FONT_SIZE_PRESET_SET.has(currentFontSize)
    ? currentFontSize
    : '__custom__';

  const applyFontSize = (v: string) => {
    const saved = savedSelectionRef.current;
    if (saved) {
      if (v) editor.chain().setTextSelection(saved).setFontSize(v).run();
      else editor.chain().setTextSelection(saved).unsetFontSize().run();
    } else {
      if (v) editor.chain().setFontSize(v).run();
      else editor.chain().unsetFontSize().run();
    }
  };

  return (
    <div className={styles.toolbar}>
      {/* 字号（2px 步长下拉 + 自定义输入一体）+ 颜色：同一行水平对齐 */}
      <div
        className={styles.fontSizeColorRow}
        onMouseDown={() => {
          if (editor && !editor.state.selection.empty) {
            const { from, to } = editor.state.selection;
            savedSelectionRef.current = { from, to };
            setFauxSel(editor, from, to);
          }
        }}
      >
        <div className={styles.fontSizeWrap}>
          <Select
            value={fontSizeSelectValue}
            onChange={(v) => {
              if (v !== '__custom__') applyFontSize(v);
            }}
            options={FONT_SIZE_OPTIONS}
            fullWidth={false}
            aria-label="字号预设"
          />
          <PxInput
            value={currentFontSize}
            commitOnBlur
            onChange={(v) => {
              if (v) applyFontSize(v);
              else editor.chain().unsetFontSize().run();
            }}
            onBlur={() => {
              clearFauxSel(editor);
              savedSelectionRef.current = null;
            }}
            placeholder="字号"
            small
            optional
            className={styles.fontSizeInput}
          />
        </div>

        {/* 文字颜色（紧凑色块模式，与字号行水平对齐） */}
        <div className={styles.colorWrap} title="文字颜色">
        <RgbaColorPicker
          value={currentColor}
          compact
          onSwatchMouseDown={saveSelection}
          onPopoverClose={clearSavedSelection}
          onChange={(css) => {
            const saved = savedSelectionRef.current;
            if (saved) editor.chain().setTextSelection(saved).setColor(css).run();
            else editor.chain().focus().setColor(css).run();
          }}
        />
        </div>
      </div>

      <div className={styles.sep} />

      <button
        type="button"
        className={`${styles.iconBtn} ${editor.isActive('bold') ? styles.active : ''} ${!hasSelection ? styles.dimmed : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="粗体 (Ctrl+B)"
      >
        <IconBold />
      </button>

      <button
        type="button"
        className={`${styles.iconBtn} ${editor.isActive('italic') ? styles.active : ''} ${!hasSelection ? styles.dimmed : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体 (Ctrl+I)"
      >
        <IconItalic />
      </button>

      <button
        type="button"
        className={`${styles.iconBtn} ${editor.isActive('underline') ? styles.active : ''} ${!hasSelection ? styles.dimmed : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="下划线 (Ctrl+U)"
      >
        <IconUnderline />
      </button>

      <button
        type="button"
        className={`${styles.iconBtn} ${editor.isActive('strike') ? styles.active : ''} ${!hasSelection ? styles.dimmed : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="删除线"
      >
        <IconStrike />
      </button>

      <div className={styles.sep} />

      <button
        type="button"
        className={`${styles.iconBtn} ${editor.isActive('bulletList') ? styles.active : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="无序列表"
      >
        <IconBulletList />
      </button>

      <button
        type="button"
        className={`${styles.iconBtn} ${editor.isActive('orderedList') ? styles.active : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="有序列表"
      >
        <IconOrderedList />
      </button>

      <div className={styles.sep} />

      {/* 链接 */}
      <div className={styles.linkWrap}>
        <button
          ref={linkBtnRef}
          type="button"
          className={`${styles.iconBtn} ${editor.isActive('link') ? styles.active : ''} ${!hasSelection ? styles.dimmed : ''}`}
          onClick={() => setLinkOpen((o) => !o)}
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          title="链接"
          aria-label="链接"
        >
          <IconLink />
        </button>
        {linkOpen &&
          linkPopoverPos &&
          createPortal(
            <div
              ref={linkPopoverRef}
              className={styles.linkPopover}
              style={{ top: linkPopoverPos.top, left: linkPopoverPos.left }}
            >
              <input
                type="url"
                className={styles.linkInput}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const raw = linkUrl.trim();
                    if (raw) editor.chain().focus().setLink({ href: normalizeLinkHref(raw) }).run();
                    else editor.chain().focus().unsetLink().run();
                    setLinkOpen(false);
                    clearSavedSelection();
                  }
                }}
                placeholder="https://..."
                aria-label="链接地址"
                autoFocus
              />
              <div className={styles.linkActions}>
                <button
                  type="button"
                  className={styles.linkBtnPrimary}
                  onClick={() => {
                    const raw = linkUrl.trim();
                    if (raw) editor.chain().focus().setLink({ href: normalizeLinkHref(raw) }).run();
                    else editor.chain().focus().unsetLink().run();
                    setLinkOpen(false);
                    clearSavedSelection();
                  }}
                >
                  确定
                </button>
                <button
                  type="button"
                  className={styles.linkBtnSecondary}
                  onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setLinkOpen(false);
                    clearSavedSelection();
                  }}
                >
                  移除链接
                </button>
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* 清除格式 */}
      <button
        type="button"
        className={`${styles.iconBtn} ${!hasSelection ? styles.dimmed : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        title="清除格式"
      >
        <IconClearFormat />
      </button>
    </div>
  );
}

function RichTextEditorInner(
  { value, onChange, disabled, minHeight = '120px', customVariables, onSelectionChange }: RichTextEditorProps,
  ref: React.Ref<RichTextEditorHandle>
) {
  // 合并标准变量与模板自定义变量，供建议浮窗使用
  const allVariables = useMemo(() => getAllVariables(customVariables), [customVariables]);
  const allVariablesRef = useRef(allVariables);
  allVariablesRef.current = allVariables;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  const [, setSelectionTick] = useState(0);
  const forceSelectionUpdate = useCallback(() => setSelectionTick((t) => t + 1), []);

  // 建議浮窗狀態
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const suggestionRef = useRef<SuggestionState | null>(null);
  suggestionRef.current = suggestion;

  // 用 ref 穩定住 setState，讓 useEditor 閉包直接調用不過期
  const setSuggestionRef = useRef(setSuggestion);
  const setSuggestionIndexRef = useRef(setSuggestionIndex);

  const editor = useEditor({
    extensions,
    content: normalizeBlockStylesToSpans(convertVariablesToChips(value, allVariablesRef.current)),
    editable: !disabled,
    editorProps: {
      attributes: { class: styles.editorInner },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChangeRef.current(convertChipsToVariables(html));

      // 更新建議浮窗（直接在 onUpdate 中處理，避免 useEffect 閉包過期）
      const result = findSuggestion(editor, allVariablesRef.current);
      if (!result) {
        setSuggestionRef.current(null);
        return;
      }
      const pos = getCursorCoords(editor);
      if (!pos) {
        setSuggestionRef.current(null);
        return;
      }
      setSuggestionRef.current({ ...result, pos });
      setSuggestionIndexRef.current(0);
    },
  });

  const insertVariable = useCallback(
    (item: VariableSchemaItem) => {
      if (!editor || !suggestionRef.current) return;
      const { from, query } = suggestionRef.current;
      const to = from + query.length;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContent({ type: 'variableChip', attrs: { key: item.key, label: item.label } })
        .run();
      setSuggestion(null);
    },
    [editor]
  );

  const dismissSuggestion = useCallback(() => setSuggestion(null), []);

  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const onTransaction = useCallback(
    ({ transaction }: { transaction: { docChanged: boolean; selectionSet: boolean } }) => {
      if (transaction.docChanged || transaction.selectionSet) {
        forceSelectionUpdate();
        // 通知外部选区变化状态
        if (onSelectionChangeRef.current && editor) {
          onSelectionChangeRef.current(!editor.state.selection.empty);
        }
      }
    },
    [forceSelectionUpdate, editor]
  );

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', forceSelectionUpdate);
    editor.on('transaction', onTransaction);
    // 游標移動時（無內容變更）也要更新建議（例如游標移走後關閉浮窗）
    const handleSelectionForSuggestion = () => {
      const result = findSuggestion(editor, allVariablesRef.current);
      if (!result) {
        setSuggestionRef.current(null);
        return;
      }
      const pos = getCursorCoords(editor);
      if (pos) {
        setSuggestionRef.current({ ...result, pos });
      }
    };
    editor.on('selectionUpdate', handleSelectionForSuggestion);
    return () => {
      editor.off('selectionUpdate', forceSelectionUpdate);
      editor.off('transaction', onTransaction);
      editor.off('selectionUpdate', handleSelectionForSuggestion);
    };
  }, [editor, forceSelectionUpdate, onTransaction]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = normalizeBlockStylesToSpans(convertVariablesToChips(value || '', allVariablesRef.current));
    if (current !== next) editor.commands.setContent(next, { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [disabled, editor]);

  // 鍵盤導航建議
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const s = suggestionRef.current;
      if (!s) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dismissSuggestion();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSuggestionIndex((i) => (i + 1) % s.matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSuggestionIndex((i) => (i - 1 + s.matches.length) % s.matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        insertVariable(s.matches[suggestionIndex]);
        return;
      }
    },
    [dismissSuggestion, insertVariable, suggestionIndex]
  );

  useImperativeHandle(
    ref,
    () => ({
      saveCurrentSelection() {
        if (!editor || editor.state.selection.empty) return;
        const { from, to } = editor.state.selection;
        savedSelectionRef.current = { from, to };
        setFauxSel(editor, from, to);
      },
      insertContentAtCursor(htmlOrText: string) {
        if (!editor) return;
        const varMatch = /^\{\{([\w.]+)\}\}$/.exec(htmlOrText.trim());
        if (varMatch) {
          const key = varMatch[1];
          const customItem = allVariablesRef.current.find((v) => v.key === key);
          const item = customItem ?? VARIABLE_SCHEMA_MAP.get(key);
          const label = item?.label ?? key;
          // 若有保存的选区（用户点击「插入变量」前曾选中文字），先删除选区再插入，实现「替换选中文字」
          const saved = savedSelectionRef.current;
          if (saved) {
            editor
              .chain()
              .focus()
              .setTextSelection({ from: saved.from, to: saved.to })
              .deleteSelection()
              .insertContent({ type: 'variableChip', attrs: { key, label } })
              .run();
            clearFauxSel(editor);
            savedSelectionRef.current = null;
          } else {
            editor
              .chain()
              .focus()
              .insertContent({ type: 'variableChip', attrs: { key, label } })
              .run();
          }
        } else {
          editor.chain().focus().insertContent(htmlOrText).run();
        }
      },
    }),
    [editor, savedSelectionRef]
  );

  return (
    <div className={styles.wrap} style={{ minHeight }} onKeyDown={handleKeyDown}>
      <Toolbar editor={editor} savedSelectionRef={savedSelectionRef} />
      <EditorContent editor={editor} className={styles.content} />
      {suggestion && (
        <VariableSuggestionPopup
          matches={suggestion.matches}
          selectedIndex={suggestionIndex}
          pos={suggestion.pos}
          onSelect={insertVariable}
        />
      )}
    </div>
  );
}

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(RichTextEditorInner);
export default RichTextEditor;
