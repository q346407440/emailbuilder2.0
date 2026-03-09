import { useState, useEffect, useRef, useMemo } from 'react';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import type { ComponentRules, EmailComponent, SimpleCondition, ConditionOperator } from '@shared/types/email';
import { getAllVariables } from '@shared/constants/variableSchema';
import editorStyles from './Editors.module.css';
import styles from './VisibilityConditionEditor.module.css';
import VariablePicker from './VariablePicker';
import Select from './Select';
import ConfigSection from './ConfigSection';

const STRING_OPERATOR_OPTIONS: { value: ConditionOperator; label: string }[] = [
  { value: 'eq',         label: '等于' },
  { value: 'neq',        label: '不等于' },
  { value: 'isEmpty',    label: '为空' },
  { value: 'isNotEmpty', label: '不为空' },
];

const NUMBER_OPERATOR_OPTIONS: { value: ConditionOperator; label: string }[] = [
  { value: 'eq',  label: '等于' },
  { value: 'neq', label: '不等于' },
  { value: 'gt',  label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt',  label: '小于' },
  { value: 'lte', label: '小于等于' },
];

const ALL_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: '等于', neq: '不等于', isEmpty: '为空', isNotEmpty: '不为空',
  gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于',
};

type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

/** 需要填写 value 的运算符 */
const OPERATORS_WITH_VALUE = new Set<ConditionOperator>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);

function buildConditionSummary(condition: SimpleCondition): string {
  const opLabel = ALL_OPERATOR_LABELS[condition.operator] ?? condition.operator;
  const parts = [condition.variableKey || '（未选变量）', opLabel];
  if (OPERATORS_WITH_VALUE.has(condition.operator)) {
    parts.push(`"${condition.value ?? ''}"`);
  }
  return parts.join(' ');
}

interface Props {
  component: EmailComponent;
  /** 来自左侧变量引用面板的聚焦信号（时间戳）；变化时自动展开并滚动到视口 */
  focusSignal?: number;
  /** 编辑器消费信号后回调，通知父级清除 hint */
  onFocusConsumed?: () => void;
  /** 渲染模式：'accordion' (默认，折叠面板) | 'panel' (平铺，用于逻辑 Tab) */
  variant?: 'accordion' | 'panel';
}

export default function VisibilityConditionEditor({ component, focusSignal, onFocusConsumed, variant = 'accordion' }: Props) {
  const updateComponentRules = useEmailStore((s) => s.updateComponentRules);
  const customVariables = useEmailStore((s) => s.customVariables);
  const componentWithRules = component as EmailComponentWithRules;

  const condition = componentWithRules.visibilityCondition;
  const hasCondition = !!condition;

  /** 当前选中变量的 contentType，用于决定可用运算符和值输入框类型 */
  const selectedVarContentType = useMemo(() => {
    if (!condition?.variableKey) return undefined;
    const allVars = getAllVariables(customVariables);
    return allVars.find((v) => v.key === condition.variableKey)?.contentType;
  }, [condition?.variableKey, customVariables]);

  const isNumberVar = selectedVarContentType === 'number';
  const operatorOptions = isNumberVar ? NUMBER_OPERATOR_OPTIONS : STRING_OPERATOR_OPTIONS;

  const [expanded, setExpanded] = useState(hasCondition || variant === 'panel');
  const rootRef = useRef<HTMLDivElement>(null);
  const prevFocusSignalRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (hasCondition || variant === 'panel') setExpanded(true);
  }, [hasCondition, variant]);

  /* 响应来自变量引用面板的联动信号 */
  useEffect(() => {
    if (focusSignal === undefined) return;
    if (focusSignal === prevFocusSignalRef.current) return;
    prevFocusSignalRef.current = focusSignal;
    setExpanded(true);
    // 等 DOM 展开后再滚动
    requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    onFocusConsumed?.();
  }, [focusSignal, onFocusConsumed]);

  const enableCondition = () => {
    updateComponentRules(component.id, {
      visibilityCondition: { variableKey: '', operator: 'eq', value: '' },
    });
  };

  const disableCondition = () => {
    updateComponentRules(component.id, { visibilityCondition: undefined });
  };

  const updateCondition = (updates: Partial<SimpleCondition>) => {
    const base = condition ?? { variableKey: '', operator: 'eq' as ConditionOperator };
    const next = { ...base, ...updates };
    // 切换变量时，若新变量为数字类型而当前运算符是字符串专属（isEmpty/isNotEmpty），重置为 eq
    if (updates.variableKey !== undefined) {
      const allVars = getAllVariables(customVariables);
      const newContentType = allVars.find((v) => v.key === updates.variableKey)?.contentType;
      const stringOnlyOps = new Set<ConditionOperator>(['isEmpty', 'isNotEmpty']);
      const numberOnlyOps = new Set<ConditionOperator>(['gt', 'gte', 'lt', 'lte']);
      if (newContentType === 'number' && stringOnlyOps.has(next.operator)) {
        next.operator = 'eq';
      } else if (newContentType !== 'number' && numberOnlyOps.has(next.operator)) {
        next.operator = 'eq';
      }
    }
    updateComponentRules(component.id, { visibilityCondition: next });
  };

  // ===== Panel 模式渲染 =====
  if (variant === 'panel') {
    return (
      <div ref={rootRef}>
        <ConfigSection title="显示条件">
        {!hasCondition ? (
          <div className={styles.panelEmptyState}>
            <p className={styles.panelHint}>此组件始终显示。</p>
            <button type="button" className={styles.panelAddBtn} onClick={enableCondition}>
              + 设置显示条件
            </button>
          </div>
        ) : (
          condition && (
            <div className={styles.panelConditionCard}>
              {/* 条件摘要标签 */}
              <div className={styles.panelConditionHeader}>
                <span className={styles.panelConditionBadge}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  条件显示
                </span>
                <button type="button" className={styles.panelRemoveBtn} onClick={disableCondition} title="移除显示条件">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  移除
                </button>
              </div>

              <div className={styles.panelConditionForm}>
                <div className={editorStyles.field}>
                  <span className={editorStyles.label}>变量</span>
                  <VariablePicker
                    value={condition.variableKey}
                    onChange={(key) => updateCondition({ variableKey: key })}
                    customVariables={customVariables}
                  />
                </div>

                <div className={editorStyles.field}>
                  <span className={editorStyles.label}>条件</span>
                  <Select
                    value={condition.operator}
                    onChange={(v) => updateCondition({ operator: v as ConditionOperator })}
                    options={operatorOptions}
                    aria-label="条件运算符"
                  />
                </div>

                {OPERATORS_WITH_VALUE.has(condition.operator) && (
                  <div className={editorStyles.field}>
                    <span className={editorStyles.label}>值</span>
                    <input
                      type={isNumberVar ? 'number' : 'text'}
                      step={isNumberVar ? 'any' : undefined}
                      className={editorStyles.input}
                      value={condition.value ?? ''}
                      onChange={(e) => updateCondition({ value: e.target.value })}
                      placeholder={isNumberVar ? '请输入数字' : '请输入比较值'}
                    />
                  </div>
                )}
              </div>

              {/* 条件逻辑摘要 */}
              {condition.variableKey && (
                <div className={styles.panelConditionSummary}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>
                    当 <code className={styles.panelConditionCode}>{condition.variableKey}</code>
                    {' '}{ALL_OPERATOR_LABELS[condition.operator]}
                    {OPERATORS_WITH_VALUE.has(condition.operator) && condition.value
                      ? <> <code className={styles.panelConditionCode}>{isNumberVar ? condition.value : `"${condition.value}"`}</code></>
                      : null
                    }{' '}时显示此组件
                  </span>
                </div>
              )}
            </div>
          )
        )}
        </ConfigSection>
      </div>
    );
  }

  // ===== Accordion 模式渲染 (保持原样) =====
  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.headerTitleWrap}>
          <span className={styles.headerLabel}>显示条件</span>
          {hasCondition && condition && !expanded && (
            <span className={styles.headerSummary}>
              {buildConditionSummary(condition)}
            </span>
          )}
        </span>
        <span className={styles.headerRight}>
          {hasCondition && (
            <span className={styles.badge} data-variant="active">已设置</span>
          )}
          <svg
            width="12" height="12" viewBox="0 0 12 12"
            fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            className={styles.chevron} data-open={expanded} aria-hidden
          >
            <path d="M2 4l4 4 4-4" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className={styles.body}>
          {!hasCondition ? (
            /* 无条件状态：空提示 + 单个行动按钮 */
            <div className={styles.emptyState}>
              <span className={styles.emptyText}>此组件始终显示。</span>
              <button type="button" className={styles.addConditionBtn} onClick={enableCondition}>
                + 设置显示条件
              </button>
            </div>
          ) : (
            /* 有条件状态：直接显示表单 */
            condition && (
              <div className={styles.conditionForm}>
                <div className={editorStyles.field}>
                  <span className={editorStyles.label}>变量</span>
                  <VariablePicker
                    value={condition.variableKey}
                    onChange={(key) => updateCondition({ variableKey: key })}
                    customVariables={customVariables}
                  />
                </div>

                <div className={editorStyles.field}>
                  <span className={editorStyles.label}>条件</span>
                  <Select
                    value={condition.operator}
                    onChange={(v) => updateCondition({ operator: v as ConditionOperator })}
                    options={operatorOptions}
                    aria-label="条件运算符"
                  />
                </div>

                {OPERATORS_WITH_VALUE.has(condition.operator) && (
                  <div className={editorStyles.field}>
                    <span className={editorStyles.label}>值</span>
                    <input
                      type={isNumberVar ? 'number' : 'text'}
                      step={isNumberVar ? 'any' : undefined}
                      className={editorStyles.input}
                      value={condition.value ?? ''}
                      onChange={(e) => updateCondition({ value: e.target.value })}
                      placeholder={isNumberVar ? '请输入数字' : '请输入比较值'}
                    />
                  </div>
                )}

                {condition.variableKey && (
                  <p className={styles.summary}>
                    当 {buildConditionSummary(condition)} 时显示此组件
                  </p>
                )}

                <button type="button" className={styles.removeBtn} onClick={disableCondition}>
                  移除条件
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
