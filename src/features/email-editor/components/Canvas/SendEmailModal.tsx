import { useState, useCallback, useEffect } from 'react';
import Modal, { ModalFooter } from '@shared/ui/Modal';
import { useGmailStore } from '@shared/store/useGmailStore';
import { serverSendEmail } from '@shared/api/serverApi';
import { toast } from '@shared/store/useToastStore';
import styles from './SendEmailModal.module.css';

const RECIPIENT_HISTORY_KEY = 'send-email-recipient-history';
const RECIPIENT_HISTORY_MAX = 10;

function getRecipientHistory(): string[] {
  try {
    const raw = localStorage.getItem(RECIPIENT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function addRecipientHistory(emails: string[]): void {
  const added = emails.map((e) => e.trim()).filter(Boolean);
  if (added.length === 0) return;
  const prev = getRecipientHistory();
  const addedLower = new Set(added.map((e) => e.toLowerCase()));
  const next = [...added];
  prev.forEach((e) => {
    if (addedLower.has(e.toLowerCase())) return;
    next.push(e);
    addedLower.add(e.toLowerCase());
  });
  const deduped = next.slice(0, RECIPIENT_HISTORY_MAX);
  try {
    localStorage.setItem(RECIPIENT_HISTORY_KEY, JSON.stringify(deduped));
  } catch {
    /* ignore */
  }
}

function removeFromRecipientHistory(email: string): string[] {
  const prev = getRecipientHistory();
  const lower = email.toLowerCase();
  const next = prev.filter((e) => e.toLowerCase() !== lower);
  try {
    localStorage.setItem(RECIPIENT_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 同步或異步返回郵件 HTML；發送時會 await，支援 prepareEmailHtmlAsync（SVG→PNG） */
  getHtml: () => string | Promise<string>;
}

export default function SendEmailModal({ open, onClose, getHtml }: Props) {
  const accounts = useGmailStore((s) => s.accounts);
  const currentGmailId = useGmailStore((s) => s.currentGmailId);
  const gmailConnecting = useGmailStore((s) => s.connecting);
  const startGmailConnect = useGmailStore((s) => s.startConnect);

  const [selectedGmailId, setSelectedGmailId] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [recipientHistory, setRecipientHistory] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const id =
      currentGmailId && accounts.some((a) => a.id === currentGmailId)
        ? currentGmailId
        : accounts[0]?.id ?? null;
    setSelectedGmailId(id);
    setRecipientHistory(getRecipientHistory());
  }, [open, currentGmailId, accounts]);

  const selectedAccount = accounts.find((a) => a.id === selectedGmailId);

  const parseEmails = (str: string): string[] =>
    str
      .split(/[,;，；\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSend = useCallback(async () => {
    if (!selectedGmailId || !selectedAccount) {
      toast('请选择发件人 Gmail 账号', 'error');
      return;
    }
    const toList = parseEmails(to);
    if (toList.length === 0) {
      toast('请输入收件人邮箱', 'error');
      return;
    }
    if (!subject.trim()) {
      toast('请输入邮件主旨', 'error');
      return;
    }
    const htmlBody = await Promise.resolve(getHtml());
    if (!htmlBody) {
      toast('无法获取模板内容，请确保画布有内容', 'error');
      return;
    }

    setSending(true);
    try {
      await serverSendEmail({
        gmailAccountId: selectedGmailId,
        to: toList,
        cc: parseEmails(cc),
        bcc: parseEmails(bcc),
        subject: subject.trim(),
        htmlBody,
      });
      toast('邮件发送成功', 'success');
      addRecipientHistory(toList);
      onClose();
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setShowCcBcc(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '发送失败';
      toast(message, 'error');
    } finally {
      setSending(false);
    }
  }, [selectedGmailId, selectedAccount, to, cc, bcc, subject, getHtml, onClose]);

  const handleClose = useCallback(() => {
    if (!sending) onClose();
  }, [sending, onClose]);

  const pickRecipient = useCallback((email: string) => {
    setTo((prev) => (prev.trim() ? `${prev.trim()}, ${email}` : email));
  }, []);

  const removeHistoryItem = useCallback((email: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecipientHistory(removeFromRecipientHistory(email));
  }, []);

  return (
    <Modal
      open={open}
      title="发送邮件"
      onClose={handleClose}
      footer={
        <ModalFooter
          cancelText="取消"
          onCancel={handleClose}
          confirmText={sending ? '发送中…' : '发送'}
          onConfirm={handleSend}
          confirmDisabled={sending}
        />
      }
    >
      <div className={styles.body}>
        {/* 发件人 */}
        <div className={styles.field}>
          <label className={styles.label}>发件人</label>
          {accounts.length === 0 ? (
            <div className={styles.noSender}>
              <span>未选择 Gmail 账号</span>
              <button
                type="button"
                className={styles.connectBtn}
                onClick={() => startGmailConnect()}
                disabled={gmailConnecting}
              >
                {gmailConnecting ? '授权中…' : '去连接'}
              </button>
            </div>
          ) : (
            <select
              className={styles.select}
              value={selectedGmailId ?? ''}
              onChange={(e) => setSelectedGmailId(e.target.value)}
              aria-label="选择发件人"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.gmailAddress}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 收件人 */}
        <div className={styles.field}>
          <div className={styles.label}>
            <span>收件人</span>
            {showCcBcc ? (
              <button
                type="button"
                className={styles.ccToggle}
                onClick={(e) => {
                  setShowCcBcc(false);
                  (e.currentTarget as HTMLButtonElement).blur();
                }}
              >
                收起 CC/BCC
              </button>
            ) : (
              <button
                type="button"
                className={styles.ccToggle}
                onClick={(e) => {
                  setShowCcBcc(true);
                  (e.currentTarget as HTMLButtonElement).blur();
                }}
              >
                CC/BCC
              </button>
            )}
          </div>
          <input
            type="text"
            className={styles.input}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="多个邮箱用逗号分隔"
          />
          {recipientHistory.length > 0 && (
            <div className={styles.recipientTags}>
              {recipientHistory.map((email) => (
                <span key={email} className={styles.recipientTag}>
                  <button
                    type="button"
                    className={styles.recipientTagText}
                    onClick={() => pickRecipient(email)}
                  >
                    {email}
                  </button>
                  <button
                    type="button"
                    className={styles.recipientTagRemove}
                    onClick={(e) => removeHistoryItem(email, e)}
                    aria-label={`从历史中移除 ${email}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CC / BCC */}
        {showCcBcc && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>抄送（CC）</label>
              <input
                type="text"
                className={styles.input}
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="选填，多个邮箱用逗号分隔"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>密送（BCC）</label>
              <input
                type="text"
                className={styles.input}
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="选填，多个邮箱用逗号分隔"
              />
            </div>
          </>
        )}

        {/* 主旨 */}
        <div className={styles.field}>
          <label className={styles.label}>主旨</label>
          <input
            type="text"
            className={styles.input}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="请输入邮件主旨"
          />
        </div>

        {/* 邮件内容提示 */}
        <div className={styles.contentHint}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>邮件内容将使用当前画布中的模板，自动转换为邮件兼容格式发送</span>
        </div>
      </div>
    </Modal>
  );
}
