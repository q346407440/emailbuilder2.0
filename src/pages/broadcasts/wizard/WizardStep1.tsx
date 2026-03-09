import type { WizardDraft } from './BroadcastWizard';
import styles from './WizardStep.module.css';

interface Props { draft: WizardDraft; onChange: (d: Partial<WizardDraft>) => void; onNext: () => void; }

export default function WizardStep1({ draft, onChange, onNext }: Props) {
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>基本信息</h2>
      <p className={styles.cardDesc}>设置广播活动的名称和邮件主旨</p>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.labelLine}>活动名称 <span className={styles.req}>*</span></span>
          <input
            type="text"
            className={styles.input}
            placeholder="例如：新品上架通知 - 2026 春季"
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            maxLength={100}
            autoFocus
          />
          <span className={styles.hint}>仅内部使用，不会展示给订阅者</span>
        </label>

        <label className={styles.field}>
          <span className={styles.labelLine}>邮件主旨 <span className={styles.req}>*</span></span>
          <input
            type="text"
            className={styles.input}
            placeholder="例如：新品上架！春季精选抢先看"
            value={draft.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            maxLength={200}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.labelLine}>预览文案 <span className={styles.opt}>（选填）</span></span>
          <input
            type="text"
            className={styles.input}
            placeholder="邮件客户端主旨下方显示的预览文字"
            value={draft.previewText}
            onChange={(e) => onChange({ previewText: e.target.value })}
            maxLength={200}
          />
          <span className={styles.hint}>大多数邮件客户端会在主旨后显示此文字</span>
        </label>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.nextBtn}
          onClick={onNext}
          disabled={!draft.name.trim() || !draft.subject.trim()}
        >
          下一步：选择模板 →
        </button>
      </div>
    </div>
  );
}
