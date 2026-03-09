import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './AIChatPanel.module.css';
import type { ChatChangeCard, ChatMessage, ChatToolCall, PipelineStep, VerifyStep } from '../types';
import ImageLightbox from '@shared/ui/ImageLightbox';

type AssistantBlock =
  | { kind: 'text'; content: string }
  | { kind: 'tool'; toolIndex: number };

function buildAssistantBlocks(
  rawBuffer: string | undefined,
  content: string,
  toolCalls: ChatToolCall[] | undefined,
): AssistantBlock[] {
  const tools = toolCalls ?? [];
  if (tools.length === 0) {
    if (content.trim()) return [{ kind: 'text', content }];
    return [];
  }
  if (!rawBuffer) {
    const blocks: AssistantBlock[] = [];
    if (content.trim()) blocks.push({ kind: 'text', content });
    for (let i = 0; i < tools.length; i++) blocks.push({ kind: 'tool', toolIndex: i });
    return blocks;
  }
  const blocks: AssistantBlock[] = [];
  const toolRegex = /<tool\s+name="[^"]+">[\s\S]*?<\/tool>/gi;
  let lastIndex = 0;
  let matchedToolCount = 0;
  let match: RegExpExecArray | null;
  while ((match = toolRegex.exec(rawBuffer)) !== null) {
    const textBefore = rawBuffer.slice(lastIndex, match.index).trim();
    if (textBefore) blocks.push({ kind: 'text', content: textBefore });
    if (matchedToolCount < tools.length) {
      blocks.push({ kind: 'tool', toolIndex: matchedToolCount });
    }
    matchedToolCount++;
    lastIndex = match.index + match[0].length;
  }
  let textAfter = rawBuffer.slice(lastIndex);
  const lowerAfter = textAfter.toLowerCase();
  const lastToolStart = lowerAfter.lastIndexOf('<tool');
  if (lastToolStart >= 0 && !lowerAfter.slice(lastToolStart).includes('</tool>')) {
    textAfter = textAfter.slice(0, lastToolStart);
  }
  const lastLt = textAfter.lastIndexOf('<');
  const lastGt = textAfter.lastIndexOf('>');
  if (lastLt > lastGt) {
    textAfter = textAfter.slice(0, lastLt);
  }
  if (textAfter.trim()) blocks.push({ kind: 'text', content: textAfter.trim() });
  for (let i = matchedToolCount; i < tools.length; i++) {
    blocks.push({ kind: 'tool', toolIndex: i });
  }
  return blocks;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  getTemplateState: '获取画布状态',
  getComponentState: '获取组件状态',
  getComponentPreview: '获取组件预览',
  addComponentToTemplate: '添加组件到模板',
  updateTemplateComponent: '更新模板组件',
  clearTemplateOrSubtree: '清空画布或子树',
  removeComponent: '删除组件',
  updateCanvasConfig: '更新画布配置',
  captureCanvasPreview: '画布预览截图',
  createTemplateFromImage: '从设计图还原模板',
  createCompositeChildFromImage: '从图片创建复合子组件',
  planTemplate: '制定还原计划',
  markPlanStepDone: '标记计划步骤完成',
  searchPexelsImage: '搜索配图',
  runVerificationPipeline: '验证模板质量',
};

const PIPELINE_STEP_LABELS: Record<string, string> = {
  grounding: '分析设计图区域',
  image_search: '搜索配图',
  tokens: '提取设计风格',
  icon_extraction: '提取图标',
  text_extraction: '提取文案',
  structure: '生成组件结构',
};

const VERIFY_STEP_LABELS: Record<string, string> = {
  verify_structure: '结构完整性',
  verify_text: '文案覆盖',
  verify_images: '图片有效性',
  verify_image_match: '图片一致性',
  verify_icons: '图标有效性',
  verify_spacing: '间距与对齐',
  verify_typography: '字号与图标尺寸',
  verify_constraints: '组件约束',
  verify_visual: '视觉对比',
};

// 这些步骤的输出经过后端格式化，支持展开查看
const EXPANDABLE_STEPS = new Set(['grounding', 'tokens', 'icon_extraction', 'text_extraction', 'image_search']);
const VERIFY_EXPANDABLE_STEPS = new Set(['verify_image_match', 'verify_visual']);

function StepItem({
  step,
  state,
  output,
  labelsMap,
  expandableSet,
  dynamicLabel,
}: {
  step: string;
  state: 'running' | 'completed';
  output?: string;
  labelsMap: Record<string, string>;
  expandableSet: Set<string>;
  dynamicLabel?: string;
}) {
  const label = dynamicLabel ?? labelsMap[step] ?? step;
  const isDone = state === 'completed';
  const canExpand = isDone && !!output && expandableSet.has(step);
  const [manualCollapsed, setManualCollapsed] = useState(false);
  const expanded = canExpand && !manualCollapsed;

  return (
    <div className={`${styles.aiPipelineStep} ${isDone ? styles.aiPipelineStepDone : styles.aiPipelineStepRunning}`}>
      <div className={styles.aiPipelineStepRow}>
        <span className={styles.aiPipelineStepIcon}>
          {isDone ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5.5" fill="var(--success, #16a34a)" />
              <path d="M3.5 6.2L5 7.7L8.5 4.3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <span className={styles.aiPipelineStepSpinner} aria-hidden />
          )}
        </span>
        <span className={styles.aiPipelineStepLabel}>{label}</span>
        {canExpand && (
          <button
            type="button"
            className={styles.aiPipelineStepToggle}
            onClick={() => setManualCollapsed((v) => !v)}
            aria-expanded={expanded}
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none"
              style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
            >
              <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      {canExpand && expanded && (
        <pre className={styles.aiPipelineStepOutput}>{output}</pre>
      )}
    </div>
  );
}

function PipelineStepItem({ s }: { s: PipelineStep }) {
  return <StepItem step={s.step} state={s.state} output={s.output} labelsMap={PIPELINE_STEP_LABELS} expandableSet={EXPANDABLE_STEPS} dynamicLabel={s.label} />;
}

function VerifyStepItem({ s }: { s: VerifyStep }) {
  return <StepItem step={s.step} state={s.state} output={s.output} labelsMap={VERIFY_STEP_LABELS} expandableSet={VERIFY_EXPANDABLE_STEPS} />;
}

function PipelineStepList({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className={styles.aiPipelineSteps}>
      {steps.map((s) => (
        <PipelineStepItem key={s.step} s={s} />
      ))}
    </div>
  );
}

function VerifyStepList({ steps }: { steps: VerifyStep[] }) {
  return (
    <div className={styles.aiPipelineSteps}>
      {steps.map((s) => (
        <VerifyStepItem key={s.step} s={s} />
      ))}
    </div>
  );
}

function getToolStateLabel(state: 'detected' | 'running' | 'completed' | 'failed'): string {
  if (state === 'detected' || state === 'running') return '调用中';
  if (state === 'completed') return '已完成';
  return '失败';
}

function getToolStateIcon(state: 'detected' | 'running' | 'completed' | 'failed') {
  if (state === 'detected' || state === 'running') {
    return <span className={`${styles.aiToolStateIcon} ${styles.aiToolStateIconRunning}`} aria-hidden />;
  }
  if (state === 'completed') {
    return (
      <span className={`${styles.aiToolStateIcon} ${styles.aiToolStateIconCompleted}`} aria-hidden>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2L5 8.7L9.5 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`${styles.aiToolStateIcon} ${styles.aiToolStateIconFailed}`} aria-hidden>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M3.4 3.4L8.6 8.6M8.6 3.4L3.4 8.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const REMARK_PLUGINS = [remarkGfm];

interface ChatMessageItemProps {
  message: ChatMessage;
  expandedThinks: Set<string>;
  onToggleThink: (id: string) => void;
  expandedToolGroups: Set<string>;
  onToggleToolGroup: (key: string) => void;
  collapsedPlanCards: Set<string>;
  onTogglePlanCard: (id: string) => void;
  activePlan?: Array<{ index: number; description: string; status: string }> | null;
  conversationId: string | null;
  onLocateChange: (componentId?: string) => void;
  onUndoChange: (card: ChatChangeCard) => void;
  onRedoChange: (card: ChatChangeCard) => void;
}

const ChatMessageItem = memo(function ChatMessageItem({
  message,
  expandedThinks,
  onToggleThink,
  expandedToolGroups,
  onToggleToolGroup,
  collapsedPlanCards,
  onTogglePlanCard,
  activePlan,
  conversationId,
  onLocateChange,
  onUndoChange,
  onRedoChange,
}: ChatMessageItemProps) {
  const assistantBlocks = useMemo(
    () => message.role === 'assistant' && !message.typing
      ? buildAssistantBlocks(message.rawAnswerBuffer, message.content, message.toolCalls)
      : [],
    [message.role, message.typing, message.rawAnswerBuffer, message.content, message.toolCalls]
  );

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // fix-step-header：子任务启动分隔标题，独立渲染不走普通消息流程
  if (message.kind === 'fix-step-header') {
    const stepNum = (message.fixStepIndex ?? 0) + 1;
    const totalSteps = message.fixTotalSteps ?? 1;
    const desc = message.fixStepDescription ?? '';
    const isRunning = message.fixStepStatus !== 'completed';
    return (
      <div className={styles.fixStepHeader}>
        <span className={styles.fixStepBadge}>{stepNum}/{totalSteps}</span>
        <span className={styles.fixStepDesc}>{desc}</span>
        {isRunning ? (
          <span className={styles.fixStepSpinner} aria-label="进行中" />
        ) : (
          <span className={styles.fixStepDone} aria-label="已完成">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="7" fill="#16a34a" />
              <path d="M3.5 7l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${styles.aiMessageRow} ${message.role === 'assistant' ? styles.aiMessageRowAssistant : styles.aiMessageRowUser}`}
    >
      {message.role === 'assistant' && message.thinkContent && (() => {
        const isStreaming = !!message.streaming;
        const contentStarted = (message.content?.length ?? 0) > 0;
        const isExpanded = (isStreaming && !contentStarted) || expandedThinks.has(message.id);
        const charCount = message.thinkContent.length;
        return (
          <div
            className={`${styles.aiThinkBlock}${isStreaming && !contentStarted ? ` ${styles.aiThinkStreaming}` : ''}`}
          >
            <div
              className={styles.aiThinkHeader}
              onClick={() => !isStreaming && onToggleThink(message.id)}
              role={isStreaming ? undefined : 'button'}
              tabIndex={isStreaming ? undefined : 0}
              onKeyDown={(e) => {
                if (!isStreaming && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onToggleThink(message.id);
                }
              }}
            >
              <span className={styles.aiThinkHeaderIcon}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M4.5 5C4.5 4.17 5.17 3.5 6 3.5C6.83 3.5 7.5 4.17 7.5 5C7.5 5.6 7.17 6.1 6.67 6.37L6.5 6.46V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <circle cx="6" cy="8.5" r="0.6" fill="currentColor" />
                </svg>
              </span>
              <span className={styles.aiThinkHeaderTitle}>
                {isStreaming && !contentStarted ? '思考中…' : `已思考 ${charCount} 字`}
              </span>
              {(!isStreaming || contentStarted) && (
                <span className={`${styles.aiThinkChevron}${isExpanded ? ` ${styles.aiThinkChevronOpen}` : ''}`}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </div>
            <div className={`${styles.aiThinkBody}${isExpanded ? ` ${styles.aiThinkBodyOpen}` : ''}`}>
              <div className={styles.aiThinkContent}>{message.thinkContent}</div>
            </div>
          </div>
        );
      })()}
      {message.role === 'user' && (
        <>
          {message.content
            && message.content !== '（已发送附件）'
            && message.content !== '（已携带组件）' && (
            <div className={`${styles.aiMessageItem} ${styles.aiMessageUser}`}>
              {message.content}
            </div>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <div className={`${styles.aiMessageItem} ${styles.aiMessageUser}`}>
              <div className={styles.aiUserImageGrid}>
                {message.attachments
                  .filter(a => a.mimeType.startsWith('image/') && a.dataUrl)
                  .map(a => (
                    <img
                      key={a.id}
                      src={a.dataUrl}
                      alt=""
                      className={`${styles.aiUserImageThumb} ${styles.aiUserImageClickable}`}
                      onClick={() => setLightboxSrc(a.dataUrl!)}
                      title="点击放大"
                    />
                  ))}
              </div>
            </div>
          )}
          {message.componentAttachment && (() => {
            const comp = message.componentAttachment;
            const COMP_TYPE_LABELS: Record<string, string> = {
              layout: '布局', text: '文本', image: '图片',
              button: '按钮', icon: '图标', divider: '分割线', grid: '网格',
            };
            return (
              <div className={`${styles.aiMessageItem} ${styles.aiMessageUser}`}>
                <div className={styles.aiCompAttachCard}>
                  <button
                    type="button"
                    className={styles.aiCompAttachThumb}
                    onClick={() => comp.snapshot && setLightboxSrc(comp.snapshot)}
                    title="点击放大"
                    aria-label="预览组件"
                  >
                    {comp.snapshot ? (
                      <img src={comp.snapshot} alt="组件" className={styles.aiCompAttachThumbImg} />
                    ) : (
                      <span className={styles.aiCompAttachThumbEmpty}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.8"/>
                        </svg>
                      </span>
                    )}
                    <span className={styles.aiAttachThumbOverlay}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                        <path d="M17 17L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </span>
                  </button>
                  <div className={styles.aiCompAttachInfo}>
                    <span className={styles.aiCompAttachLabel}>组件</span>
                    <span className={styles.aiCompAttachId} title={comp.id}>{comp.id}</span>
                    <span className={styles.aiCompAttachTag}>
                      {COMP_TYPE_LABELS[comp.type] ?? comp.type}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} alt="预览" onClose={() => setLightboxSrc(null)} />
      )}
      {message.role === 'assistant' && message.typing && (
        <div className={`${styles.aiMessageItem} ${styles.aiMessageAssistant}`}>
          <span className={styles.aiTypingDots}>
            <span />
            <span />
            <span />
          </span>
        </div>
      )}
      {message.role === 'assistant' && !message.typing && (() => {
        const toolArr = message.toolCalls ?? [];
        const groups: Array<
          | { kind: 'text'; content: string; key: string }
          | { kind: 'tools'; indices: number[]; key: string }
        > = [];
        for (let i = 0; i < assistantBlocks.length; i++) {
          const blk = assistantBlocks[i];
          if (blk.kind === 'text') {
            groups.push({ kind: 'text', content: blk.content, key: `t-${i}` });
          } else {
            const last = groups[groups.length - 1];
            if (last && last.kind === 'tools') {
              last.indices.push(blk.toolIndex);
            } else {
              groups.push({ kind: 'tools', indices: [blk.toolIndex], key: `tl-${i}` });
            }
          }
        }
        return groups.map((group, groupIdx) => {
          if (group.kind === 'text') {
            const isStreamingTail = message.streaming && groupIdx === groups.length - 1;
            return (
              <div key={group.key} className={`${styles.aiMessageItem} ${styles.aiMessageAssistant}`}>
                <div className={styles.aiMessageMarkdown}>
                  <ReactMarkdown
                    remarkPlugins={REMARK_PLUGINS}
                    components={{
                      table: ({ ...props }) => (
                        <div className={styles.aiMessageTableWrap} role="region" aria-label="表格">
                          <table {...props} />
                        </div>
                      ),
                      a: ({ href, children, ...props }) => (
                        <a
                          {...props}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ),
                      img: ({ src, alt, ...props }) => {
                        if (!src) return null;
                        return (
                          <img
                            {...props}
                            src={src}
                            alt={alt ?? '图片'}
                            className={styles.aiMarkdownImage}
                            loading="lazy"
                            onClick={() => setLightboxSrc(src)}
                            title="点击放大"
                          />
                        );
                      },
                    }}
                  >
                    {group.content}
                  </ReactMarkdown>
                  {isStreamingTail && <span className={styles.aiStreamingCursor} />}
                </div>
              </div>
            );
          }
          const visibleIndices = group.indices.filter(ti => {
            const t = toolArr[ti];
            return t && t.name !== 'markPlanStepDone';
          });
          if (visibleIndices.length === 0) return null;
          const shouldFold = visibleIndices.length >= 3 && !expandedToolGroups.has(group.key);
          const changeCount = visibleIndices.filter(ti => toolArr[ti]?.changeCard).length;
          return (
            <div key={group.key} className={styles.aiToolList}>
              {visibleIndices.length >= 3 && (
                <div
                  className={styles.aiToolGroupSummary}
                  onClick={() => onToggleToolGroup(group.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleToolGroup(group.key); } }}
                >
                  <span className={styles.aiToolGroupLabel}>
                    {`执行了 ${visibleIndices.length} 个操作`}{changeCount > 0 ? ` · ${changeCount} 项改动` : ''}
                  </span>
                  <span className={`${styles.aiToolChevron}${!shouldFold ? ` ${styles.aiToolChevronOpen}` : ''}`}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </div>
              )}
              {!shouldFold && visibleIndices.map((ti) => {
                const tool = toolArr[ti];
                if (!tool) return null;
                return (
                  <div key={tool.id} className={styles.aiToolBlock}>
                    <div className={styles.aiToolBlockHeader}>
                      <span className={styles.aiToolHeaderLeft}>
                        {getToolStateIcon(tool.state)}
                        <span className={styles.aiToolName}>{TOOL_DISPLAY_NAMES[tool.name] ?? tool.name ?? '工具'}</span>
                      </span>
                      <span className={styles.aiToolStateLabel}>{getToolStateLabel(tool.state)}</span>
                    </div>
                    {tool.state === 'failed' && tool.result?.error !== undefined && tool.result?.error !== null && (
                      <div className={styles.aiToolBlockExtension}>
                        <p className={styles.aiToolErrorMessage}>{String(tool.result.error)}</p>
                      </div>
                    )}
                    {tool.name === 'captureCanvasPreview' && tool.state === 'completed' && typeof tool.result?.imageDataUrl === 'string' && (
                      <div className={styles.aiToolBlockExtension}>
                        <button
                          type="button"
                          className={styles.aiToolPreviewImgWrap}
                          onClick={() => setLightboxSrc(tool.result!.imageDataUrl as string)}
                          title="点击放大"
                          aria-label="放大预览画布截图"
                        >
                          <img
                            src={tool.result.imageDataUrl}
                            alt="画布预览"
                            className={styles.aiToolPreviewImg}
                          />
                        </button>
                      </div>
                    )}
                    {tool.name === 'createTemplateFromImage' && tool.pipelineSteps && tool.pipelineSteps.length > 0 && (
                      <PipelineStepList steps={tool.pipelineSteps} />
                    )}
                    {tool.name === 'runVerificationPipeline' && tool.verifySteps && tool.verifySteps.length > 0 && (
                      <VerifyStepList steps={tool.verifySteps} />
                    )}
                    {tool.name === 'planTemplate' && (() => {
                      const planSteps = activePlan ?? (tool.result?.plan as Array<{ index: number; description: string; status: string }> | undefined);
                      if (!planSteps || !Array.isArray(planSteps)) return null;
                      const doneCount = planSteps.filter(s => s.status === 'completed').length;
                      const isPlanCardExpanded = !collapsedPlanCards.has(tool.id);
                      return (
                        <div className={styles.aiPlanCard}>
                          <div
                            className={styles.aiPlanCardTitle}
                            onClick={() => onTogglePlanCard(tool.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTogglePlanCard(tool.id); } }}
                          >
                            <span className={styles.aiPlanCardTitleLeft}>
                              <svg
                                className={`${styles.aiPlanCardChevron} ${isPlanCardExpanded ? styles.aiPlanCardChevronOpen : ''}`}
                                width="16" height="16" viewBox="0 0 16 16" fill="none"
                              >
                                <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <span>执行计划</span>
                            </span>
                            <span className={styles.aiPlanCardProgress}>{doneCount}/{planSteps.length}</span>
                          </div>
                          {isPlanCardExpanded && (
                            <ul className={styles.aiPlanStepList}>
                              {planSteps.map(step => (
                                <li key={step.index} className={step.status === 'completed' ? styles.aiPlanStepDone : styles.aiPlanStepPending}>
                                  <span className={styles.aiPlanStepIcon}>
                                    {step.status === 'completed' ? (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <circle cx="8" cy="8" r="7" fill="var(--success, #16a34a)" />
                                        <path d="M5 8.2L7 10.2L11 5.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    ) : (
                                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <circle cx="8" cy="8" r="7" stroke="var(--border-strong, #D0D5DD)" strokeWidth="1.4" />
                                      </svg>
                                    )}
                                  </span>
                                  <span className={styles.aiPlanStepText}>{step.description}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                    {tool.changeCard && (
                      <div className={styles.aiToolBlockExtension}>
                        {(() => {
                          const lines = tool.changeCard.summary.split('\n').filter(Boolean);
                          return lines.length <= 1 ? (
                            <div className={styles.aiChangeCardSummary}>{tool.changeCard.summary}</div>
                          ) : (
                            <ul className={`${styles.aiChangeCardSummary} ${styles.aiChangeCardSummaryList}`}>
                              {lines.map((line, i) => <li key={i}>{line}</li>)}
                            </ul>
                          );
                        })()}
                        <div className={styles.aiChangeCardActions}>
                          {tool.changeCard.targetComponentId && (
                            <button
                              type="button"
                              className={styles.aiChangeCardButton}
                              onClick={() => onLocateChange(tool.changeCard!.targetComponentId)}
                            >
                              查看改动
                            </button>
                          )}
                          {conversationId != null && (tool.changeCard.beforePatch || tool.changeCard.afterPatch) ? (
                            tool.changeCard.status === 'applied' ? (
                              <button type="button" className={styles.aiChangeCardButton} onClick={() => onUndoChange(tool.changeCard!)}>
                                撤回更改
                              </button>
                            ) : (
                              <button type="button" className={styles.aiChangeCardButton} onClick={() => onRedoChange(tool.changeCard!)}>
                                恢复更改
                              </button>
                            )
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        });
      })()}
    </div>
  );
});

export default ChatMessageItem;
