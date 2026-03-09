import { useState, useEffect, useRef, useMemo } from 'react';
import { useEmailTemplateStore } from '@features/template-management/store/useEmailTemplateStore';
import { useAuthStore } from '@features/auth/store/useAuthStore';
import { fetchServerAssetBlob } from '@shared/api/serverApi';
import type { SavedEmailTemplate } from '@shared/types/emailTemplate';
import Modal, { ModalInput, ModalFooter } from '@shared/ui/Modal';
import styles from './SaveTemplateModal.module.css';

export type SaveTemplateMode = 'new' | 'overwrite';

export type SaveTemplatePayload =
  | { mode: 'new'; title: string; desc: string; setAsDefault?: boolean; isPublic?: boolean }
  | { mode: 'overwrite'; selectedId: string; setAsDefault?: boolean };

interface SaveTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: SaveTemplatePayload) => void;
  /** 当前正在编辑的模板 ID（来自编辑页路由）。有值时打开弹窗默认「覆盖旧模板」并选中该模板 */
  currentTemplateId?: string | null;
  /** 当前正在编辑的工程 ID（从工程发布为模板时传入） */
  currentProjectId?: string | null;
}

const failedTemplatePreviewUrls = new Set<string>();
const pendingTemplatePreviewBlobLoads = new Map<string, Promise<Blob>>();
const repairingTemplatePreviewIds = new Set<string>();
const blockedTemplatePreviewRepairIds = new Set<string>();
const attemptedTemplatePreviewRepairIds = new Set<string>();

function isNotFoundPreviewError(err: unknown): boolean {
  return err instanceof Error && /\b404\b/.test(err.message);
}

function useResolvedPreviewUrl(src: string | null | undefined, onNotFound: () => void): string | null {
  const [resolvedState, setResolvedState] = useState<{ origin: string; url: string | null } | null>(null);
  const isInline = typeof src === 'string' && /^(data:|blob:)/.test(src);
  const isFailed = typeof src === 'string' && failedTemplatePreviewUrls.has(src);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    if (!src || isInline || isFailed) return;
    const pendingLoad =
      pendingTemplatePreviewBlobLoads.get(src) ??
      (() => {
        const p = fetchServerAssetBlob(src).finally(() => {
          pendingTemplatePreviewBlobLoads.delete(src);
        });
        pendingTemplatePreviewBlobLoads.set(src, p);
        return p;
      })();

    pendingLoad
      .then((blob) => {
        if (cancelled) {
          return;
        }
        const url = URL.createObjectURL(blob);
        objectUrl = url;
        setResolvedState({ origin: src, url });
      })
      .catch((err) => {
        if (cancelled) return;
        failedTemplatePreviewUrls.add(src);
        if (isNotFoundPreviewError(err)) onNotFound();
        setResolvedState({ origin: src, url: null });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, isInline, isFailed, onNotFound]);

  return useMemo(() => {
    if (!src) return null;
    if (isInline) return src;
    if (isFailed) return null;
    if (resolvedState?.origin === src) return resolvedState.url;
    return null;
  }, [src, isInline, isFailed, resolvedState]);
}

export default function SaveTemplateModal({
  open,
  onClose,
  onConfirm,
  currentTemplateId,
  currentProjectId,
}: SaveTemplateModalProps) {
  const {
    savedTemplates,
    isLoaded,
    loadTemplates,
    myTemplates,
    isMyTemplatesLoaded,
    loadMyTemplates,
    updateTemplatePreview,
  } = useEmailTemplateStore();
  const user = useAuthStore((s) => s.user);
  const [mode, setMode] = useState<SaveTemplateMode>('new');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [saveLocation, setSaveLocation] = useState<'mine' | 'public'>('mine');
  const [overwriteLocation, setOverwriteLocation] = useState<'mine' | 'public'>('mine');
  const canChoosePublic = user?.isAdmin === true;

  useEffect(() => {
    if (!open) return;
    if (!isMyTemplatesLoaded) loadMyTemplates();
    if (canChoosePublic && !isLoaded) loadTemplates();
  }, [open, isMyTemplatesLoaded, loadMyTemplates, canChoosePublic, isLoaded, loadTemplates]);

  // 编辑已有模板时：打开弹窗默认「覆盖旧模板」并选中当前模板
  useEffect(() => {
    if (!open) return;
    if (currentTemplateId) {
      setMode('overwrite');
      setSelectedId(currentTemplateId);
      if (isMyTemplatesLoaded) {
        const inMine = myTemplates.some((t) => t.id === currentTemplateId);
        setOverwriteLocation(inMine ? 'mine' : 'public');
      }
    } else {
      setMode('new');
      setSelectedId(null);
      setOverwriteLocation('mine');
    }
  }, [open, currentTemplateId, isMyTemplatesLoaded, myTemplates]);

  const handleClose = () => {
    setMode('new');
    setTitle('');
    setDesc('');
    setSelectedId(null);
    setSetAsDefault(false);
    setSaveLocation('mine');
    setOverwriteLocation('mine');
    onClose();
  };

  const myTemplateIdSet = new Set(myTemplates.map((t) => t.id));
  const editablePublicTemplates = savedTemplates.filter((t) => myTemplateIdSet.has(t.id));
  const overwriteTemplates = overwriteLocation === 'public' ? editablePublicTemplates : myTemplates;
  const overwriteLoading = overwriteLocation === 'public' ? !isLoaded : !isMyTemplatesLoaded;

  const handleConfirm = () => {
    if (mode === 'new') {
      const t = title.trim();
      if (!t) return;
      onConfirm({
        mode: 'new',
        title: t,
        desc: desc.trim(),
        setAsDefault,
        isPublic: saveLocation === 'public' && (user?.isAdmin === true),
      });
    } else {
      if (!selectedId) return;
      // 覆盖模式下不提供「设为默认」，保持弹窗意图单一；设为默认可从模板列表编辑/更多操作完成
      onConfirm({ mode: 'overwrite', selectedId, setAsDefault: false });
    }
    handleClose();
  };

  const canConfirm =
    mode === 'new' ? title.trim().length > 0 : selectedId != null;

  return (
    <Modal
      open={open}
      title={currentProjectId ? '发布为模板' : '保存至邮件模板'}
      onClose={handleClose}
      size="large"
      footer={
        <ModalFooter
          onCancel={handleClose}
          onConfirm={handleConfirm}
          confirmText="确认"
          confirmDisabled={!canConfirm}
        />
      }
    >
      <div className={styles.contentWrap}>
        <div className={styles.modeSwitch}>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'new' ? styles.modeBtnActive : ''}`}
            onClick={() => setMode('new')}
          >
            保存为新模板
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'overwrite' ? styles.modeBtnActive : ''}`}
            onClick={() => setMode('overwrite')}
          >
            覆盖旧模板
          </button>
        </div>

        {mode === 'new' ? (
          <div className={styles.form}>
            <label className={styles.label}>模板标题 <span className={styles.required}>*</span></label>
            <ModalInput
              value={title}
              onChange={setTitle}
              placeholder="例如：促销邮件"
            />
            <label className={styles.label}>描述（选填）</label>
            <textarea
              className={styles.textarea}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="简短描述该模板的用途"
              rows={4}
            />
            <div className={styles.saveLocationSection}>
              <span className={styles.optionalLabel}>保存位置</span>
              <div className={styles.saveLocationOptions} role="radiogroup" aria-label="保存位置">
                <label className={styles.radioWrap}>
                  <input
                    type="radio"
                    name="saveLocation"
                    checked={saveLocation === 'mine'}
                    onChange={() => setSaveLocation('mine')}
                    className={styles.radioInput}
                  />
                  <span>保存到我的</span>
                </label>
                <label className={styles.radioWrap}>
                  <input
                    type="radio"
                    name="saveLocation"
                    checked={saveLocation === 'public'}
                    onChange={() => setSaveLocation('public')}
                    className={styles.radioInput}
                    disabled={user?.isAdmin !== true}
                    title={user?.isAdmin !== true ? '仅管理员可保存到公共邮件模板' : undefined}
                  />
                  <span>保存到公共</span>
                </label>
              </div>
            </div>
            <div className={styles.optionalSection}>
              <span className={styles.optionalLabel}>可选</span>
              <label className={styles.checkboxWrap}>
                <input
                  type="checkbox"
                  checked={setAsDefault}
                  onChange={(e) => setSetAsDefault(e.target.checked)}
                  className={styles.checkbox}
                  aria-describedby="save-new-default-desc"
                />
                <span id="save-new-default-desc">保存后将该模板设为默认模板</span>
              </label>
            </div>
          </div>
        ) : (
          <div className={styles.overwriteList}>
            {canChoosePublic && (
              <div className={styles.saveLocationSection}>
                <span className={styles.optionalLabel}>覆盖目标</span>
                <div className={styles.saveLocationOptions} role="radiogroup" aria-label="覆盖目标">
                  <label className={styles.radioWrap}>
                    <input
                      type="radio"
                      name="overwriteLocation"
                      checked={overwriteLocation === 'mine'}
                      onChange={() => {
                        setOverwriteLocation('mine');
                        setSelectedId(null);
                      }}
                      className={styles.radioInput}
                    />
                    <span>覆盖我的模板</span>
                  </label>
                  <label className={styles.radioWrap}>
                    <input
                      type="radio"
                      name="overwriteLocation"
                      checked={overwriteLocation === 'public'}
                      onChange={() => {
                        setOverwriteLocation('public');
                        setSelectedId(null);
                      }}
                      className={styles.radioInput}
                    />
                    <span>覆盖公共模板</span>
                  </label>
                </div>
              </div>
            )}
            {overwriteLoading ? (
              <p className={styles.hint}>加载中…</p>
            ) : overwriteTemplates.length === 0 ? (
              <p className={styles.hint}>
                {overwriteLocation === 'public' ? '暂无你可覆盖的公共模板。' : '暂无你可覆盖的模板，请先使用「保存为新模板」保存当前画布。'}
              </p>
            ) : (
              <ul className={styles.templateOptions} role="radiogroup" aria-label="选择要覆盖的模板">
                {overwriteTemplates.map((t) => (
                  <TemplateOption
                    key={t.id}
                    template={t}
                    selected={selectedId === t.id}
                    onSelect={() => setSelectedId(t.id)}
                    onBrokenPreview={() => {
                      if (
                        !t.previewDataUrl ||
                        repairingTemplatePreviewIds.has(t.id) ||
                        blockedTemplatePreviewRepairIds.has(t.id) ||
                        attemptedTemplatePreviewRepairIds.has(t.id)
                      ) return;
                      attemptedTemplatePreviewRepairIds.add(t.id);
                      repairingTemplatePreviewIds.add(t.id);
                      updateTemplatePreview(t.id, '')
                        .catch((err) => {
                          if (err instanceof Error && /\b403\b|Forbidden/.test(err.message)) {
                            blockedTemplatePreviewRepairIds.add(t.id);
                          }
                          // 可能无权限更新该模板，忽略即可，避免打断用户流程
                        })
                        .finally(() => {
                          repairingTemplatePreviewIds.delete(t.id);
                        });
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TemplateOption({
  template,
  selected,
  onSelect,
  onBrokenPreview,
}: {
  template: SavedEmailTemplate;
  selected: boolean;
  onSelect: () => void;
  onBrokenPreview: () => void;
}) {
  const onBrokenPreviewRef = useRef(onBrokenPreview);

  useEffect(() => {
    onBrokenPreviewRef.current = onBrokenPreview;
  }, [onBrokenPreview]);

  const resolvedPreviewUrl = useResolvedPreviewUrl(template.previewDataUrl, () => onBrokenPreviewRef.current());

  return (
    <li>
      <button
        type="button"
        className={`${styles.optionRow} ${selected ? styles.optionRowSelected : ''}`}
        onClick={onSelect}
      >
        <span className={`${styles.radio} ${selected ? styles.radioChecked : ''}`} aria-hidden />
        {resolvedPreviewUrl ? (
          <img src={resolvedPreviewUrl} alt="" className={styles.optionThumb} />
        ) : (
          <span className={styles.optionThumbPlaceholder} />
        )}
        <span className={styles.optionTitle}>{template.title}</span>
      </button>
    </li>
  );
}
