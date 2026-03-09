import { useFloatingChatPanel } from '../hooks/useFloatingChatPanel';
import { useChatController } from '../hooks/useChatController';
import AIChatPanel from './AIChatPanel';
import aiStyles from './AIChatPanel.module.css';

export default function AIChatContainer() {
  const {
    aiOpen,
    aiPanelMotion,
    aiPanelOrigin,
    aiPanelWidth,
    aiToggleRef,
    aiPanelRef,
    aiBubblePosition,
    aiPanelPosition,
    handleAiToggleMouseDown,
    handleAiHeaderMouseDown,
    handleAiPanelAnimationEnd,
    handleResizeHandleMouseDown,
    closeAiPanel,
  } = useFloatingChatPanel({
    longPressingClassName: aiStyles.aiFloatingToggleLongPressing,
    dragReadyClassName: aiStyles.aiFloatingToggleDragReady,
  });

  const {
    conversationId,
    currentConversationTitle,
    chatViewMode,
    conversations,
    loadingConversations,
    chatInput,
    pendingAttachments,
    pendingComponent,
    chatMessages,
    isStreaming,
    activePlan,
    aiInputRef,
    aiFileInputRef,
    aiMessageViewportRef,
    setChatInput,
    handleAttachmentChange,
    handlePasteAttachments,
    removePendingAttachment,
    removePendingComponent,
    sendMessage,
    stopGeneration,
    handleNewConversation,
    backToChatView,
    selectConversation,
    handleLocateChange,
    handleUndoChange,
    handleRedoChange,
    markAllPlanDone,
  } = useChatController(aiOpen);

  return (
    <AIChatPanel
      aiOpen={aiOpen}
      aiPanelMotion={aiPanelMotion}
      aiPanelOrigin={aiPanelOrigin}
      aiPanelWidth={aiPanelWidth}
      aiBubblePosition={aiBubblePosition}
      aiPanelPosition={aiPanelPosition}
      onResizeHandleMouseDown={handleResizeHandleMouseDown}
      conversationId={conversationId}
      currentConversationTitle={currentConversationTitle}
      chatViewMode={chatViewMode}
      conversations={conversations}
      loadingConversations={loadingConversations}
      chatInput={chatInput}
      chatMessages={chatMessages}
      isStreaming={isStreaming}
      pendingAttachments={pendingAttachments}
      pendingComponent={pendingComponent}
      aiToggleRef={aiToggleRef}
      aiPanelRef={aiPanelRef}
      aiInputRef={aiInputRef}
      aiFileInputRef={aiFileInputRef}
      aiMessageViewportRef={aiMessageViewportRef}
      onToggleMouseDown={handleAiToggleMouseDown}
      onPanelHeaderMouseDown={handleAiHeaderMouseDown}
      onPanelAnimationEnd={handleAiPanelAnimationEnd}
      onClosePanel={closeAiPanel}
      onAttachmentChange={handleAttachmentChange}
      onPasteAttachments={handlePasteAttachments}
      onChatInputChange={setChatInput}
      onRemoveAttachment={removePendingAttachment}
      onRemovePendingComponent={removePendingComponent}
      onSendMessage={sendMessage}
      onStopGeneration={stopGeneration}
      onNewConversation={handleNewConversation}
      onBackToChat={backToChatView}
      onSelectConversation={selectConversation}
      onLocateChange={handleLocateChange}
      onUndoChange={handleUndoChange}
      onRedoChange={handleRedoChange}
      activePlan={activePlan}
      onMarkAllPlanDone={markAllPlanDone}
    />
  );
}
