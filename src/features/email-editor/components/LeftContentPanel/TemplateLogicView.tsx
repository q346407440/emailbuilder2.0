import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import { TYPE_LABELS } from '@shared/constants/componentLibrary';
import type { ComponentRules, EmailComponent, SimpleCondition, ConditionOperator } from '@shared/types/email';
import { mergeRulesIntoComponents } from '@shared/utils/mergeRulesIntoComponents';
import styles from './TemplateLogicView.module.css';

// ─── 条件运算符显示文本 ──────────────────────────────────────────────────────

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq:         '等于',
  neq:        '不等于',
  isEmpty:    '为空',
  isNotEmpty: '不为空',
  gt:         '大于',
  gte:        '大于等于',
  lt:         '小于',
  lte:        '小于等于',
};

type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

// ─── 扫描数据结构 ─────────────────────────────────────────────────────────────

interface VisibilityEntry {
  compId:    string;
  compName:  string;
  compType:  EmailComponent['type'];
  condition: SimpleCondition;
}

interface BranchGroupEntry {
  compId:   string;
  compName: string;
  compType: EmailComponent['type'];
  branches: { label: string; condition: SimpleCondition }[];
}

interface LoopEntry {
  compId:          string;
  compName:        string;
  compType:        EmailComponent['type'];
  loopVariableKey: string;
}

interface LogicScanResult {
  visibility: VisibilityEntry[];
  branches:   BranchGroupEntry[];
  loops:      LoopEntry[];
}

function scanLogic(components: EmailComponentWithRules[]): LogicScanResult {
  const result: LogicScanResult = { visibility: [], branches: [], loops: [] };

  function walk(comp: EmailComponentWithRules) {
    const name = comp.displayName?.trim() || TYPE_LABELS[comp.type] || comp.type;

    if (comp.visibilityCondition?.variableKey) {
      result.visibility.push({
        compId:    comp.id,
        compName:  name,
        compType:  comp.type,
        condition: comp.visibilityCondition,
      });
    }

    if (comp.conditionalBranches && comp.conditionalBranches.length > 0) {
      result.branches.push({
        compId:   comp.id,
        compName: name,
        compType: comp.type,
        branches: comp.conditionalBranches.map((b, i) => ({
          label:     b.label?.trim() || `分支 ${i + 1}`,
          condition: b.condition,
        })),
      });
    }

    // loopBinding 对所有 layout 组件有效（循环展开方向由 loopBinding.expandDirection 决定，与 props.direction 无关）
    const isLayout = comp.type === 'layout';
    if (isLayout && comp.loopBinding?.variableKey) {
      result.loops.push({
        compId:          comp.id,
        compName:        name,
        compType:        comp.type,
        loopVariableKey: comp.loopBinding.variableKey,
      });
    }

    if (comp.children?.length) {
      (comp.children as EmailComponentWithRules[]).forEach(walk);
    }
  }

  components.forEach(walk);
  return result;
}

// ─── 组件类型图标（复用 TYPE_ICONS 思路，简化 SVG） ──────────────────────────

const TYPE_ICON_EMOJI: Partial<Record<EmailComponent['type'], string>> = {
  text:    '文字',
  image:   '图片',
  button:  '按钮',
  icon:    '图标',
  divider: '分隔线',
  layout:  '布局',
  grid:    '栅格',
};

function CompTypeBadge({ type }: { type: EmailComponent['type'] }) {
  const label = TYPE_ICON_EMOJI[type] ?? TYPE_LABELS[type] ?? type;
  return <span className={styles.compTypeBadge}>{label}</span>;
}

// ─── 分区标题（可折叠） ───────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className={styles.sectionHeader} onClick={onToggle}>
      <span className={styles.sectionChevron} data-expanded={expanded}>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2l4 3-4 3" />
        </svg>
      </span>
      <span className={styles.sectionTitle}>{title}</span>
      {count > 0 && <span className={styles.sectionBadge}>{count}</span>}
    </button>
  );
}

// ─── 显示条件卡片 ─────────────────────────────────────────────────────────────

function VisibilityCard({
  entry,
  onClick,
}: {
  entry: VisibilityEntry;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.logicCard} onClick={onClick} title="点击定位到该组件">
      <div className={styles.cardTopRow}>
        <span className={styles.cardCompName}>{entry.compName}</span>
        <CompTypeBadge type={entry.compType} />
      </div>
      <div className={styles.conditionRow}>
        <span className={styles.conditionIcon} aria-hidden>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="7" cy="7" r="5.5" />
            <path d="M5 7h4M7 5v4" />
          </svg>
        </span>
        <ConditionText condition={entry.condition} />
      </div>
    </button>
  );
}

// ─── 条件文字渲染（拆分 key / operator / value 高亮） ─────────────────────────

function ConditionText({ condition }: { condition: SimpleCondition }) {
  const opLabel = OPERATOR_LABELS[condition.operator] ?? condition.operator;
  const hasValue = (condition.operator === 'eq' || condition.operator === 'neq') && condition.value != null;

  return (
    <span className={styles.conditionText}>
      <span className={styles.conditionKey}>{condition.variableKey}</span>
      <span className={styles.conditionOp}>{opLabel}</span>
      {hasValue && <span className={styles.conditionValue}>"{condition.value}"</span>}
    </span>
  );
}

// ─── 条件分支卡片 ─────────────────────────────────────────────────────────────

function BranchCard({
  entry,
  onClick,
}: {
  entry: BranchGroupEntry;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.logicCard} onClick={onClick} title="点击定位到该组件">
      <div className={styles.cardTopRow}>
        <span className={styles.cardCompName}>{entry.compName}</span>
        <CompTypeBadge type={entry.compType} />
      </div>
      <div className={styles.branchList}>
        {entry.branches.map((b, i) => (
          <div key={i} className={styles.branchRow}>
            <span className={styles.branchLabel}>{b.label}</span>
            <span className={styles.branchSep}>:</span>
            <ConditionText condition={b.condition} />
          </div>
        ))}
      </div>
    </button>
  );
}

// ─── 循环区块卡片 ─────────────────────────────────────────────────────────────

function LoopCard({
  entry,
  onClick,
}: {
  entry: LoopEntry;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.logicCard} onClick={onClick} title="点击定位到该组件">
      <div className={styles.cardTopRow}>
        <span className={styles.cardCompName}>{entry.compName}</span>
        <CompTypeBadge type={entry.compType} />
      </div>
      <div className={styles.conditionRow}>
        <span className={styles.loopIcon} aria-hidden>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 5V3h2" />
            <path d="M12 9v2h-2" />
            <path d="M2 3a6 6 0 0 1 10 3" />
            <path d="M12 11a6 6 0 0 1-10-3" />
          </svg>
        </span>
        <span className={styles.conditionText}>
          <span className={styles.loopLabel}>循环</span>
          <span className={styles.conditionKey}>{entry.loopVariableKey}</span>
        </span>
      </div>
    </button>
  );
}

// ─── 主视图 ───────────────────────────────────────────────────────────────────

export default function TemplateLogicView() {
  const { components, renderingRules, selectComponent, setRightPanelFocusHint } = useEmailStore(
    useShallow((s) => ({
      components:             s.components,
      renderingRules:         s.renderingRules,
      selectComponent:        s.selectComponent,
      setRightPanelFocusHint: s.setRightPanelFocusHint,
    }))
  );

  // 合併 Layer 4 規則後再掃描，否則靜態組件樹上讀不到任何邏輯字段
  const mergedComponents = useMemo(
    () => mergeRulesIntoComponents(components, renderingRules),
    [components, renderingRules]
  );

  const logic = useMemo(
    () => scanLogic(mergedComponents as EmailComponentWithRules[]),
    [mergedComponents]
  );

  const [visExpanded,    setVisExpanded]    = useState(true);
  const [branchExpanded, setBranchExpanded] = useState(true);
  const [loopExpanded,   setLoopExpanded]   = useState(true);

  const totalCount = logic.visibility.length + logic.branches.length + logic.loops.length;

  if (totalCount === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>暂未配置任何逻辑规则</p>
          <p className={styles.emptyHint}>
            为组件添加显示条件、条件分支或循环绑定后，规则将显示在这里
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>

      {/* ── 显示条件 ── */}
      {logic.visibility.length > 0 && (
        <div className={styles.section}>
          <SectionHeader
            title="显示条件"
            count={logic.visibility.length}
            expanded={visExpanded}
            onToggle={() => setVisExpanded((v) => !v)}
          />
          {visExpanded && (
            <div className={styles.cardList}>
              {logic.visibility.map((entry) => (
                <VisibilityCard
                  key={entry.compId}
                  entry={entry}
                  onClick={() => {
                    selectComponent(entry.compId);
                    setRightPanelFocusHint('visibility');
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 条件分支 ── */}
      {logic.branches.length > 0 && (
        <div className={styles.section}>
          <SectionHeader
            title="条件分支"
            count={logic.branches.length}
            expanded={branchExpanded}
            onToggle={() => setBranchExpanded((v) => !v)}
          />
          {branchExpanded && (
            <div className={styles.cardList}>
              {logic.branches.map((entry) => (
                <BranchCard
                  key={entry.compId}
                  entry={entry}
                  onClick={() => {
                    selectComponent(entry.compId);
                    setRightPanelFocusHint('branches');
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 循环区块 ── */}
      {logic.loops.length > 0 && (
        <div className={styles.section}>
          <SectionHeader
            title="循环区块"
            count={logic.loops.length}
            expanded={loopExpanded}
            onToggle={() => setLoopExpanded((v) => !v)}
          />
          {loopExpanded && (
            <div className={styles.cardList}>
              {logic.loops.map((entry) => (
                <LoopCard
                  key={entry.compId}
                  entry={entry}
                  onClick={() => {
                    selectComponent(entry.compId);
                    setRightPanelFocusHint('loop');
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
