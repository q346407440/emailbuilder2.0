import { useCallback, useEffect, useState, useMemo, type CSSProperties, type ChangeEvent, type MouseEvent, type RefObject } from 'react';
import styles from './AIChatPanel.module.css';
import ChatMessageItem from './ChatMessageItem';
import ImageLightbox from '@shared/ui/ImageLightbox';
import type { ChatChangeCard, ChatConversationSummary, ChatMessage, ComponentAttachment } from '../types';

interface AIChatPanelProps {
  aiOpen: boolean;
  aiPanelMotion: 'idle' | 'opening' | 'closing';
  aiPanelOrigin: { x: number; y: number };
  aiPanelWidth: number;
  aiBubblePosition: { x: number; y: number };
  aiPanelPosition: { x: number; y: number };
  onResizeHandleMouseDown?: (event: MouseEvent<HTMLDivElement>, side: 'left' | 'right') => void;
  conversationId: string | null;
  currentConversationTitle: string | null;
  chatViewMode: 'chat' | 'history';
  conversations: ChatConversationSummary[];
  loadingConversations: boolean;
  chatInput: string;
  chatMessages: ChatMessage[];
  isStreaming: boolean;
  pendingAttachments: File[];
  pendingComponent: ComponentAttachment | null;
  aiToggleRef: RefObject<HTMLButtonElement | null>;
  aiPanelRef: RefObject<HTMLDivElement | null>;
  aiInputRef: RefObject<HTMLTextAreaElement | null>;
  aiFileInputRef: RefObject<HTMLInputElement | null>;
  aiMessageViewportRef: RefObject<HTMLDivElement | null>;
  onToggleMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onPanelHeaderMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onPanelAnimationEnd: () => void;
  onClosePanel: () => void;
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPasteAttachments: (files: File[]) => void;
  onChatInputChange: (value: string) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onRemovePendingComponent: () => void;
  onSendMessage: () => void;
  onStopGeneration: () => void;
  onNewConversation: () => void;
  onBackToChat: () => void;
  onSelectConversation: (conversationId: string) => void;
  onLocateChange: (componentId?: string) => void;
  onUndoChange: (card: ChatChangeCard) => void;
  onRedoChange: (card: ChatChangeCard) => void;
  activePlan?: Array<{ index: number; description: string; status: string }> | null;
  onMarkAllPlanDone?: () => void;
}

function AIToggleIcon() {
  return (
    <svg
      className={styles.aiToggleIcon}
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        className={styles.aiToggleBubble}
        d="M4.5 6.8C4.5 5.53 5.53 4.5 6.8 4.5H15.6C16.87 4.5 17.9 5.53 17.9 6.8V12.2C17.9 13.47 16.87 14.5 15.6 14.5H11.2L8 17.6V14.5H6.8C5.53 14.5 4.5 13.47 4.5 12.2V6.8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className={styles.aiToggleBubble}
        d="M7.7 8.8H14.7M7.7 11.2H12.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        className={styles.aiToggleSparkPrimary}
        d="M18.2 3.0 L18.9 4.7 L20.6 5.4 L18.9 6.1 L18.2 7.8 L17.5 6.1 L15.8 5.4 L17.5 4.7 Z"
        fill="currentColor"
      />
      <path
        className={styles.aiToggleSparkSecondary}
        d="M20.3 9.2 L20.7 10.2 L21.7 10.6 L20.7 11.0 L20.3 12.0 L19.9 11.0 L18.9 10.6 L19.9 10.2 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size}B`;
  const kb = size / 1024;
  if (kb < 1024) return `${Math.round(kb)}KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
}

function formatConversationTime(ts: number): string {
  const time = Number(ts);
  if (!Number.isFinite(time)) return '--';
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString('zh-CN');
}

export default function AIChatPanel({
  aiOpen,
  aiPanelMotion,
  aiPanelOrigin,
  aiPanelWidth,
  aiBubblePosition,
  aiPanelPosition,
  onResizeHandleMouseDown,
  conversationId,
  currentConversationTitle,
  chatViewMode,
  conversations,
  loadingConversations,
  chatInput,
  chatMessages,
  isStreaming,
  pendingAttachments,
  pendingComponent,
  aiToggleRef,
  aiPanelRef,
  aiInputRef,
  aiFileInputRef,
  aiMessageViewportRef,
  onToggleMouseDown,
  onPanelHeaderMouseDown,
  onPanelAnimationEnd,
  onClosePanel,
  onAttachmentChange,
  onPasteAttachments,
  onChatInputChange,
  onRemoveAttachment,
  onRemovePendingComponent,
  onSendMessage,
  onStopGeneration,
  onNewConversation,
  onBackToChat,
  onSelectConversation,
  onLocateChange,
  onUndoChange,
  onRedoChange,
  activePlan,
  onMarkAllPlanDone,
}: AIChatPanelProps) {
  const [expandedThinks, setExpandedThinks] = useState<Set<string>>(new Set());
  const [planExpanded, setPlanExpanded] = useState(false);
  const [expandedToolGroups, setExpandedToolGroups] = useState<Set<string>>(new Set());
  const [collapsedPlanCards, setCollapsedPlanCards] = useState<Set<string>>(new Set());
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const thumbUrls = useMemo(() => {
    const urls: Record<string, string> = {};
    for (const file of pendingAttachments) {
      const id = `${file.name}-${file.size}-${file.lastModified}`;
      urls[id] = URL.createObjectURL(file);
    }
    return urls;
  }, [pendingAttachments]);

  useEffect(() => {
    return () => {
      Object.values(thumbUrls).forEach(URL.revokeObjectURL);
    };
  }, [thumbUrls]);

  const toggleThink = useCallback((messageId: string) => {
    setExpandedThinks((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const toggleToolGroup = useCallback((groupKey: string) => {
    setExpandedToolGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const togglePlanCard = useCallback((toolId: string) => {
    setCollapsedPlanCards((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  }, []);

  return (
    <>
      {!aiOpen && (
        <button
          ref={aiToggleRef}
          type="button"
          className={styles.aiFloatingToggle}
          aria-label="打开AI对话窗"
          title="打开AI对话窗"
          onMouseDown={onToggleMouseDown}
          style={{ left: `${aiBubblePosition.x}px`, top: `${aiBubblePosition.y}px` }}
        >
          <AIToggleIcon />
        </button>
      )}
      {aiOpen && (
        <div
          ref={aiPanelRef}
          className={`${styles.aiFloatingPanel} ${aiPanelMotion === 'opening' ? styles.aiFloatingPanelOpening : ''} ${aiPanelMotion === 'closing' ? styles.aiFloatingPanelClosing : ''}`}
          style={
            {
              left: `${aiPanelPosition.x}px`,
              top: `${aiPanelPosition.y}px`,
              width: `${aiPanelWidth}px`,
              '--ai-origin-x': `${aiPanelOrigin.x}px`,
              '--ai-origin-y': `${aiPanelOrigin.y}px`,
            } as CSSProperties & Record<string, string>
          }
          onAnimationEnd={onPanelAnimationEnd}
          aria-label="AI对话悬浮窗"
          role="dialog"
          aria-modal="false"
        >
          {onResizeHandleMouseDown && (
            <>
              <div
                className={`${styles.aiPanelResizeHandle} ${styles.aiPanelResizeHandleLeft}`}
                onMouseDown={(e) => onResizeHandleMouseDown?.(e, 'left')}
                role="separator"
                aria-label="拖拽左侧调整宽度"
                title="拖拽调整面板宽度"
              />
              <div
                className={`${styles.aiPanelResizeHandle} ${styles.aiPanelResizeHandleRight}`}
                onMouseDown={(e) => onResizeHandleMouseDown?.(e, 'right')}
                role="separator"
                aria-label="拖拽右侧调整宽度"
                title="拖拽调整面板宽度"
              />
            </>
          )}
          <div className={styles.aiFloatingHeader} onMouseDown={onPanelHeaderMouseDown}>
            <div className={styles.aiFloatingHeaderLeft}>
              {chatViewMode === 'chat' && (
                <div className={styles.aiAgentBadge} aria-hidden>
                  <svg
                    className={styles.aiAgentGlyph}
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect x="4.5" y="7.8" width="15" height="11.2" rx="3.6" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M9 6.2H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 3.9V6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="9.7" cy="12.6" r="1" fill="currentColor" />
                    <circle cx="14.3" cy="12.6" r="1" fill="currentColor" />
                    <path
                      d="M9.4 15.6C10 16.35 10.9 16.8 12 16.8C13.1 16.8 14 16.35 14.6 15.6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <path d="M19 5.2L19.6 6.6L21 7.2L19.6 7.8L19 9.2L18.4 7.8L17 7.2L18.4 6.6Z" fill="currentColor" />
                  </svg>
                </div>
              )}
              <div className={styles.aiFloatingHeaderMain}>
                {chatViewMode === 'history' ? (
                  <button
                    type="button"
                    className={styles.aiHeaderBackButton}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={onBackToChat}
                    title="返回对话"
                  >
                    返回对话
                  </button>
                ) : (
                  <span className={styles.aiFloatingSubTitle}>{currentConversationTitle || '邮件编辑助手'}</span>
                )}
              </div>
            </div>
            {chatViewMode === 'history' ? (
              <span className={styles.aiHeaderHistoryTitle}>历史对话</span>
            ) : (
              <>
                <button
                  type="button"
                  className={styles.aiHeaderAction}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={onNewConversation}
                  title="开启新会话"
                >
                  新会话
                </button>
              </>
            )}
            <button
              type="button"
              className={styles.aiFloatingClose}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={onClosePanel}
              aria-label="关闭AI对话窗"
              title="关闭"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className={styles.aiFloatingBody}>
            {chatViewMode === 'history' ? (
              <div className={styles.aiHistoryList} role="list" aria-label="历史对话列表">
                {loadingConversations ? (
                  <div className={styles.aiHistoryEmpty}>正在加载历史对话…</div>
                ) : conversations.length === 0 ? (
                  <div className={styles.aiHistoryEmpty}>暂无历史对话</div>
                ) : (
                  conversations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.aiHistoryItem}
                      onClick={() => onSelectConversation(item.id)}
                      role="listitem"
                    >
                      <span className={styles.aiHistoryTitle}>{item.title || '未命名会话'}</span>
                      <span className={styles.aiHistoryMetaRow}>
                        <span className={styles.aiHistoryMeta}>{formatConversationTime(item.lastMessageAt)}</span>
                        {conversationId != null && item.id === conversationId ? (
                          <span className={styles.aiHistoryCurrentTag}>当前</span>
                        ) : null}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className={styles.aiChatContent}>
                <div ref={aiMessageViewportRef} className={styles.aiMessageList} role="log" aria-live="polite">
                  {chatMessages.map((message) => (
                    <ChatMessageItem
                      key={message.id}
                      message={message}
                      expandedThinks={expandedThinks}
                      onToggleThink={toggleThink}
                      expandedToolGroups={expandedToolGroups}
                      onToggleToolGroup={toggleToolGroup}
                      collapsedPlanCards={collapsedPlanCards}
                      onTogglePlanCard={togglePlanCard}
                      activePlan={activePlan}
                      conversationId={conversationId}
                      onLocateChange={onLocateChange}
                      onUndoChange={onUndoChange}
                      onRedoChange={onRedoChange}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          {chatViewMode === 'chat' && (
          <div className={styles.aiFloatingInputArea}>
            {activePlan && activePlan.length > 0 && (() => {
              const doneCount = activePlan.filter(s => s.status === 'completed').length;
              const allDone = doneCount === activePlan.length;
              return (
                <div className={`${styles.aiPlanProgressBar} ${allDone ? styles.aiPlanProgressDone : ''}`}>
                  {planExpanded && (
                    <div className={styles.aiPlanProgressDropup}>
                      <ul className={styles.aiPlanProgressSteps}>
                        {activePlan.map(step => (
                          <li key={step.index} className={step.status === 'completed' ? styles.aiPlanStepDone : ''}>
                            <span className={styles.aiPlanStepIcon}>
                              {step.status === 'completed' ? (
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                  <circle cx="8" cy="8" r="7" fill="var(--success, #16a34a)" />
                                  <path d="M5 8.2L7 10.2L11 5.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                  <circle cx="8" cy="8" r="7" stroke="var(--border-strong, #D0D5DD)" strokeWidth="1.4" />
                                </svg>
                              )}
                            </span>
                            <span className={styles.aiPlanStepText}>{step.description}</span>
                          </li>
                        ))}
                      </ul>
                      {!allDone && onMarkAllPlanDone && (
                        <button
                          type="button"
                          className={styles.aiPlanMarkAllDone}
                          onClick={onMarkAllPlanDone}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M5 8.2L7 10.2L11 5.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          全部标记完成
                        </button>
                      )}
                    </div>
                  )}
                  <div className={styles.aiPlanProgressHeader}>
                    <button
                      type="button"
                      className={styles.aiPlanProgressToggle}
                      onClick={() => setPlanExpanded(prev => !prev)}
                    >
                      <span className={styles.aiPlanProgressLabel}>
                        {allDone ? (
                          <>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                              <circle cx="8" cy="8" r="7" fill="var(--success, #16a34a)" />
                              <path d="M5 8.2L7 10.2L11 5.8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            执行计划已完成
                          </>
                        ) : (
                          <>执行计划 {doneCount}/{activePlan.length}</>
                        )}
                      </span>
                      <svg
                        className={`${styles.aiPlanProgressChevron} ${planExpanded ? styles.aiPlanProgressChevronOpen : ''}`}
                        width="14" height="14" viewBox="0 0 16 16" fill="none"
                      >
                        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div className={styles.aiPlanProgressTrack}>
                      <div className={styles.aiPlanProgressFill} style={{ width: `${(doneCount / activePlan.length) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* 快捷操作暂时隐藏，交互保留待后续恢复
            <div className={styles.aiQuickActions} aria-label="快捷操作">
              {quickActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={styles.aiQuickAction}
                  onClick={() => onRunQuickAction(action)}
                >
                  {action}
                </button>
              ))}
            </div>
            */}
            {pendingAttachments.length > 0 && (
              <div className={styles.aiPendingAttachments} aria-label="待发送附件">
                {pendingAttachments.map((file) => {
                  const attachmentId = `${file.name}-${file.size}-${file.lastModified}`;
                  const thumbUrl = thumbUrls[attachmentId];
                  return (
                    <div key={attachmentId} className={styles.aiAttachThumbItem}>
                      <button
                        type="button"
                        className={styles.aiAttachThumb}
                        onClick={() => thumbUrl && setLightboxSrc(thumbUrl)}
                        aria-label={`预览图片 ${file.name}`}
                        title="点击放大预览"
                      >
                        {thumbUrl && (
                          <img
                            src={thumbUrl}
                            alt={file.name}
                            className={styles.aiAttachThumbImg}
                          />
                        )}
                        <span className={styles.aiAttachThumbOverlay}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                            <path d="M17 17L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          </svg>
                        </span>
                      </button>
                      <div className={styles.aiAttachThumbMeta}>
                        <span className={styles.aiAttachThumbName} title={file.name}>{file.name}</span>
                        <span className={styles.aiAttachThumbSize}>{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.aiAttachThumbRemove}
                        onClick={() => onRemoveAttachment(attachmentId)}
                        aria-label={`移除图片 ${file.name}`}
                        title="移除图片"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <input
              ref={aiFileInputRef}
              type="file"
              className={styles.aiHiddenFileInput}
              accept="image/*"
              onChange={onAttachmentChange}
            />
            {pendingComponent && (
              <div className={styles.aiPendingComponent} aria-label="待发送组件">
                <button
                  type="button"
                  className={styles.aiPendingCompThumb}
                  onClick={() => pendingComponent.snapshot && setLightboxSrc(pendingComponent.snapshot)}
                  title="点击预览"
                  aria-label="预览组件截图"
                >
                  {pendingComponent.snapshotLoading ? (
                    <span className={styles.aiPendingCompThumbEmpty}>
                      <span className={styles.aiThumbSpinner} aria-label="截图加载中" />
                    </span>
                  ) : pendingComponent.snapshot ? (
                    <img
                      src={pendingComponent.snapshot}
                      alt="组件预览"
                      className={styles.aiPendingCompThumbImg}
                    />
                  ) : (
                    <span className={styles.aiPendingCompThumbEmpty}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                        <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.8"/>
                      </svg>
                    </span>
                  )}
                  <span className={styles.aiAttachThumbOverlay}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                      <path d="M17 17L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </span>
                </button>
                <div className={styles.aiPendingCompMeta}>
                  <span className={styles.aiPendingCompLabel}>组件</span>
                  <span className={styles.aiPendingCompId} title={pendingComponent.id}>
                    {pendingComponent.id}
                  </span>
                  <span className={styles.aiPendingCompTag}>{pendingComponent.type}</span>
                </div>
                <button
                  type="button"
                  className={styles.aiAttachThumbRemove}
                  onClick={onRemovePendingComponent}
                  aria-label="移除组件"
                  title="移除组件"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            )}
            <div className={styles.aiFloatingInputRow}>
              <textarea
                ref={aiInputRef}
                className={styles.aiFloatingInput}
                rows={1}
                placeholder={conversationId ? '输入消息…' : '输入消息（将自动创建新会话）…'}
                value={chatInput}
                onChange={(event) => onChatInputChange(event.target.value)}
                onPaste={(event) => {
                  const clipboard = event.clipboardData;
                  const itemFiles = Array.from(clipboard?.items ?? [])
                    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                    .map((item) => item.getAsFile())
                    .filter((file): file is File => file != null);
                  const imageFiles = itemFiles.length > 0
                    ? itemFiles
                    : Array.from(clipboard?.files ?? []).filter((file) => file.type.startsWith('image/'));
                  if (imageFiles.length > 0) {
                    const plainText = clipboard.getData('text/plain');
                    if (!plainText.trim()) {
                      event.preventDefault();
                    }
                    onPasteAttachments(imageFiles);
                  }
                  const textarea = event.currentTarget;
                  window.requestAnimationFrame(() => onChatInputChange(textarea.value));
                }}
                onKeyDown={(event) => {
                  const nativeEvent = event.nativeEvent as KeyboardEvent;
                  const isComposing = nativeEvent.isComposing || nativeEvent.keyCode === 229;
                  if (isComposing) return;
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (isStreaming) {
                      onStopGeneration();
                    } else {
                      onSendMessage();
                    }
                  }
                }}
              />
              <div className={styles.aiComposerActionRow}>
                <div className={styles.aiComposerLeftActions}>
                  <button
                    type="button"
                    className={styles.aiAttachButton}
                    onClick={() => pendingAttachments.length === 0 && aiFileInputRef.current?.click()}
                    aria-label="添加图片"
                    title={pendingAttachments.length > 0 ? '已有图片，请先移除后再添加' : '添加图片'}
                    aria-disabled={pendingAttachments.length > 0}
                    data-disabled={pendingAttachments.length > 0 ? 'true' : undefined}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
                      <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                {isStreaming ? (
                  <button
                    type="button"
                    className={`${styles.aiFloatingSend} ${styles.aiFloatingStop}`}
                    onClick={onStopGeneration}
                    aria-label="停止生成"
                    title="停止生成"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.aiFloatingSend}
                    onClick={onSendMessage}
                    disabled={!chatInput.trim() && pendingAttachments.length === 0 && !pendingComponent}
                    aria-label="发送"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M4 12H18.5M12.5 7L18.5 12L12.5 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      )}
      {lightboxSrc && (
        <ImageLightbox
          key={lightboxSrc}
          src={lightboxSrc}
          alt="图片预览"
          onClose={() => setLightboxSrc(null)}
        />
      )}
    </>
  );
}
