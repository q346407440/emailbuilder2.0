import { useState, useEffect, useRef } from 'react';
import { useEmailStore } from '@features/email-editor/store/useEmailStore';
import type {
  ComponentRules,
  EmailComponent,
  ComponentBranch,
  SimpleCondition,
  ConditionOperator,
} from '@shared/types/email';
import { getAllVariables } from '@shared/constants/variableSchema';
import editorStyles from './Editors.module.css';
import styles from './ConditionalBranchesEditor.module.css';
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

const OPERATORS_WITH_VALUE = new Set<ConditionOperator>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function buildConditionPreview(condition: SimpleCondition): string {
  if (!condition.variableKey) return '未配置条件';
  const opLabel = ALL_OPERATOR_LABELS[condition.operator] ?? condition.operator;
  const parts = [condition.variableKey, opLabel];
  if (OPERATORS_WITH_VALUE.has(condition.operator)) {
    parts.push(`"${condition.value ?? ''}"`);
  }
  return parts.join(' ');
}

function getSupportedOverrideFields(
  type: EmailComponent['type'],
): { key: string; label: string; multiline?: boolean }[] {
  switch (type) {
    case 'text':
      return [{ key: 'content', label: '文本内容（HTML）', multiline: true }];
    case 'image':
      return [
        { key: 'src',  label: '图片 URL' },
        { key: 'alt',  label: '图片描述（alt）' },
        { key: 'link', label: '跳转链接' },
      ];
    case 'button':
      return [
        { key: 'text', label: '按钮文字' },
        { key: 'link', label: '按钮链接' },
      ];
    case 'icon':
      return [
        { key: 'customSrc', label: '图标 URL' },
        { key: 'link',      label: '跳转链接' },
      ];
    default:
      return [];
  }
}

type EmailComponentWithRules = EmailComponent & Partial<ComponentRules>;

interface Props {
  component: EmailComponent;
  /** 来自左侧变量引用面板的聚焦信号（时间戳）；变化时自动展开并滚动到视口 */
  focusSignal?: number;
  /** 编辑器消费信号后回调，通知父级清除 hint */
  onFocusConsumed?: () => void;
  /** 渲染模式：'accordion' (默认，折叠面板) | 'panel' (平铺，用于逻辑 Tab) */
  variant?: 'accordion' | 'panel';
}

export default function ConditionalBranchesEditor({ component, focusSignal, onFocusConsumed, variant = 'accordion' }: Props) {
  const updateComponentRules = useEmailStore((s) => s.updateComponentRules);
  const customVariables = useEmailStore((s) => s.customVariables);
  const componentWithRules = component as EmailComponentWithRules;

  const [expanded, setExpanded] = useState(variant === 'panel');
  /** 当前展开编辑的分支 id；null = 全部折叠 */
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevFocusSignalRef = useRef<number | undefined>(undefined);

  /* 响应来自变量引用面板的联动信号 */
  useEffect(() => {
    if (focusSignal === undefined) return;
    if (focusSignal === prevFocusSignalRef.current) return;
    prevFocusSignalRef.current = focusSignal;
    setExpanded(true);
    requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    onFocusConsumed?.();
  }, [focusSignal, onFocusConsumed]);

  useEffect(() => {
    if (variant === 'panel') setExpanded(true);
  }, [variant]);

  const branches = componentWithRules.conditionalBranches ?? [];
  const hasBranches = branches.length > 0;
  const overrideFields = getSupportedOverrideFields(component.type);
  const isSupportedType = overrideFields.length > 0;

  /* ---------- 分支操作 ---------- */
  const addBranch = () => {
    const newBranch: ComponentBranch = {
      id: genId(),
      label: `分支 ${branches.length + 1}`,
      condition: { variableKey: '', operator: 'eq', value: '' },
      propsOverride: {},
    };
    updateComponentRules(component.id, { conditionalBranches: [...branches, newBranch] });
    setExpandedBranchId(newBranch.id);
    setExpanded(true);
  };

  const deleteBranch = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = branches.filter((b: ComponentBranch) => b.id !== id);
    updateComponentRules(component.id, { conditionalBranches: updated.length > 0 ? updated : undefined });
    if (expandedBranchId === id) setExpandedBranchId(null);
  };

  const updateBranch = (id: string, patch: Partial<ComponentBranch>) => {
    const updated = branches.map((b: ComponentBranch) => (b.id === id ? { ...b, ...patch } : b));
    updateComponentRules(component.id, { conditionalBranches: updated });
  };

  const updateBranchCondition = (id: string, patch: Partial<SimpleCondition>) => {
    const branch = branches.find((b: ComponentBranch) => b.id === id);
    if (!branch) return;
    const next = { ...branch.condition, ...patch };
    // 切换变量时，若运算符与新变量类型不兼容则重置为 eq
    if (patch.variableKey !== undefined) {
      const allVars = getAllVariables(customVariables);
      const newContentType = allVars.find((v) => v.key === patch.variableKey)?.contentType;
      const stringOnlyOps = new Set<ConditionOperator>(['isEmpty', 'isNotEmpty']);
      const numberOnlyOps = new Set<ConditionOperator>(['gt', 'gte', 'lt', 'lte']);
      if (newContentType === 'number' && stringOnlyOps.has(next.operator)) {
        next.operator = 'eq';
      } else if (newContentType !== 'number' && numberOnlyOps.has(next.operator)) {
        next.operator = 'eq';
      }
    }
    updateBranch(id, { condition: next });
  };

  const updateBranchOverride = (id: string, fieldKey: string, value: string) => {
    const branch = branches.find((b: ComponentBranch) => b.id === id);
    if (!branch) return;
    updateBranch(id, { propsOverride: { ...branch.propsOverride, [fieldKey]: value } });
  };

  const toggleBranch = (id: string) => {
    setExpandedBranchId((prev) => (prev === id ? null : id));
  };

  /* ---------- 渲染内容部分 (复用) ---------- */
  const renderContent = () => {
    if (!isSupportedType) {
      return (
        <p className={styles.hint}>
          此类型组件（{component.type}）暂不支持条件分支覆盖内容。
        </p>
      );
    }

    return (
      <>
        {/* 分支列表 */}
        {hasBranches && (
          <div className={styles.branchList}>
            {branches.map((branch: ComponentBranch, idx: number) => {
              const isOpen = expandedBranchId === branch.id;
              const preview = buildConditionPreview(branch.condition);
              const isConfigured = !!branch.condition.variableKey;
              const allVars = getAllVariables(customVariables);
              const branchVarContentType = branch.condition.variableKey
                ? allVars.find((v) => v.key === branch.condition.variableKey)?.contentType
                : undefined;
              const isBranchNumberVar = branchVarContentType === 'number';
              const branchOperatorOptions = isBranchNumberVar ? NUMBER_OPERATOR_OPTIONS : STRING_OPERATOR_OPTIONS;
              return (
                <div key={branch.id} className={styles.branchItem} data-open={isOpen}>
                  {/* 分支行标题 */}
                  <div
                    className={styles.branchItemHeader}
                    onClick={() => toggleBranch(branch.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && toggleBranch(branch.id)}
                  >
                    <svg
                      width="10" height="10" viewBox="0 0 10 10"
                      fill="none" stroke="currentColor" strokeWidth="1.8"
                      strokeLinecap="round" strokeLinejoin="round"
                      className={styles.branchChevron} data-open={isOpen} aria-hidden
                    >
                      <path d="M2 3l3 4 3-4" />
                    </svg>
                    <span className={styles.branchIndex}>{idx + 1}</span>
                    <span className={styles.branchPreview} data-configured={isConfigured}>
                      {preview}
                    </span>
                    <button
                      type="button"
                      className={styles.branchDelete}
                      title="删除此分支"
                      onClick={(e) => deleteBranch(branch.id, e)}
                      aria-label="删除分支"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M2 2l8 8M10 2l-8 8" />
                      </svg>
                    </button>
                  </div>

                  {/* 分支编辑区（展开） */}
                  {isOpen && (
                    <div className={styles.branchBody}>
                      {/* 名称 */}
                      <div className={editorStyles.field}>
                        <span className={editorStyles.label}>分支名称</span>
                        <input
                          type="text"
                          className={editorStyles.input}
                          value={branch.label ?? ''}
                          onChange={(e) => updateBranch(branch.id, { label: e.target.value })}
                          placeholder={`分支 ${idx + 1}`}
                        />
                      </div>

                      {/* 触发条件 */}
                      <p className={styles.subLabel}>触发条件</p>
                      <div className={editorStyles.field}>
                        <span className={editorStyles.label}>变量</span>
                        <VariablePicker
                          value={branch.condition.variableKey}
                          onChange={(key) =>
                            updateBranchCondition(branch.id, { variableKey: key })
                          }
                          customVariables={customVariables}
                        />
                      </div>

                      <div className={editorStyles.field}>
                        <span className={editorStyles.label}>条件</span>
                        <Select
                          value={branch.condition.operator}
                          onChange={(v) =>
                            updateBranchCondition(branch.id, { operator: v as ConditionOperator })
                          }
                          options={branchOperatorOptions}
                          aria-label="条件运算符"
                        />
                      </div>

                      {OPERATORS_WITH_VALUE.has(branch.condition.operator) && (
                        <div className={editorStyles.field}>
                          <span className={editorStyles.label}>值</span>
                          <input
                            type={isBranchNumberVar ? 'number' : 'text'}
                            step={isBranchNumberVar ? 'any' : undefined}
                            className={editorStyles.input}
                            value={branch.condition.value ?? ''}
                            onChange={(e) =>
                              updateBranchCondition(branch.id, { value: e.target.value })
                            }
                            placeholder={isBranchNumberVar ? '请输入数字' : '请输入比较值'}
                          />
                        </div>
                      )}

                      {/* 覆盖内容 */}
                      <p className={styles.subLabel}>覆盖内容</p>
                      <p className={styles.overrideHint}>
                        留空则使用组件原始值。
                      </p>
                      {overrideFields.map((field) => (
                        <div key={field.key} className={editorStyles.field}>
                          <span className={editorStyles.label}>{field.label}</span>
                          {field.multiline ? (
                            <textarea
                              className={editorStyles.textarea}
                              value={(branch.propsOverride[field.key] as string) ?? ''}
                              onChange={(e) =>
                                updateBranchOverride(branch.id, field.key, e.target.value)
                              }
                              placeholder={`留空则使用原始 ${field.key}`}
                              rows={3}
                            />
                          ) : (
                            <input
                              type="text"
                              className={editorStyles.input}
                              value={(branch.propsOverride[field.key] as string) ?? ''}
                              onChange={(e) =>
                                updateBranchOverride(branch.id, field.key, e.target.value)
                              }
                              placeholder={`留空则使用原始 ${field.key}`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 默认回退说明 */}
        <p className={styles.hint}>
          {hasBranches
            ? '所有条件均不满足时，使用组件原始内容。'
            : '暂无分支。添加后可按条件覆盖组件内容。'}
        </p>

        {/* 添加分支 */}
        {variant === 'panel' ? (
          <button type="button" className={styles.panelAddBtn} onClick={addBranch}>
            + 添加分支
          </button>
        ) : (
          <button type="button" className={styles.addBtn} onClick={addBranch}>
            + 添加分支
          </button>
        )}
      </>
    );
  };

  /* ---------- 渲染 ---------- */
  if (variant === 'panel') {
    return (
      <div ref={rootRef}>
        <ConfigSection title="条件分支">
          {renderContent()}
        </ConfigSection>
      </div>
    );
  }

  return (
    <div className={styles.root} ref={rootRef}>
      {/* 区块标题 */}
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.headerTitleWrap}>
          <span className={styles.headerLabel}>条件分支</span>
          {hasBranches && !expanded && branches[0] && (
            <span className={styles.headerSummary}>
              {buildConditionPreview(branches[0].condition)}
              {branches.length > 1 ? ` · 共 ${branches.length} 条` : ''}
            </span>
          )}
        </span>
        <span className={styles.headerRight}>
          {hasBranches && (
            <span className={styles.badge} data-variant="active">{branches.length} 个分支</span>
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
          {renderContent()}
        </div>
      )}
    </div>
  );
}
