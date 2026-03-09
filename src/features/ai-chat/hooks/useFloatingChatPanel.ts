import { useCallback, useEffect, useRef, useState, useMemo } from 'react';

const AI_TOGGLE_SIZE = 46;
const AI_PANEL_WIDTH_DEFAULT = 372;
const AI_PANEL_WIDTH_MIN = 280;
const AI_PANEL_WIDTH_MAX = 560;
const AI_PANEL_HEIGHT = 640;
const AI_EDGE_MARGIN = 12;
const AI_MIN_TOP = 8;
const AI_BUBBLE_LONG_PRESS_MS = 240;
const AI_DRAG_MOVE_TOLERANCE = 8;

interface UseFloatingChatPanelOptions {
  longPressingClassName: string;
  dragReadyClassName: string;
}

export function useFloatingChatPanel(options: UseFloatingChatPanelOptions) {
  const { longPressingClassName, dragReadyClassName } = options;

  const initialBubblePosition = useMemo(() => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const initialX = Math.max(AI_EDGE_MARGIN, window.innerWidth - AI_TOGGLE_SIZE - AI_EDGE_MARGIN);
    const initialY = Math.max(AI_MIN_TOP, window.innerHeight - AI_TOGGLE_SIZE - AI_EDGE_MARGIN);
    return { x: initialX, y: initialY };
  }, []);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPanelMotion, setAiPanelMotion] = useState<'idle' | 'opening' | 'closing'>('idle');
  const [aiPanelOrigin, setAiPanelOrigin] = useState({ x: AI_TOGGLE_SIZE / 2, y: AI_TOGGLE_SIZE / 2 });
  const [aiPanelWidth, setAiPanelWidth] = useState(AI_PANEL_WIDTH_DEFAULT);
  const [aiPanelPositionState, setAiPanelPositionState] = useState(initialBubblePosition);
  /** 气泡位置用 state 保证首屏即显示在右下角（effect 中设置会触发重绘） */
  const [aiBubblePositionState, setAiBubblePositionState] = useState(initialBubblePosition);

  const aiToggleRef = useRef<HTMLButtonElement | null>(null);
  const aiPanelRef = useRef<HTMLDivElement | null>(null);
  const aiLastTriggerRef = useRef<HTMLElement | null>(null);
  const aiBubblePositionRef = useRef(initialBubblePosition);
  const aiPanelPositionRef = useRef(initialBubblePosition);
  const aiPositionReadyRef = useRef(typeof window !== 'undefined');
  const aiDragOffsetRef = useRef({ x: 0, y: 0 });
  const aiDragRef = useRef(false);
  const aiDragMovedRef = useRef(false);
  const aiDragRafRef = useRef<number | null>(null);
  const aiPendingPositionRef = useRef<{ x: number; y: number } | null>(null);
  const aiResizeStartRef = useRef<{ x: number; panelX: number; width: number } | null>(null);

  const clampPosition = useCallback((x: number, y: number, width: number, height: number) => {
    if (typeof window === 'undefined') return { x, y };
    const maxX = Math.max(AI_EDGE_MARGIN, window.innerWidth - width - AI_EDGE_MARGIN);
    const maxY = Math.max(AI_MIN_TOP, window.innerHeight - height - AI_EDGE_MARGIN);
    return {
      x: Math.min(Math.max(AI_EDGE_MARGIN, x), maxX),
      y: Math.min(Math.max(AI_MIN_TOP, y), maxY),
    };
  }, []);

  const getSmartPanelPosition = useCallback(
    (bubble: { x: number; y: number }, width: number) => {
      if (typeof window === 'undefined') return bubble;
      const bCx = bubble.x + AI_TOGGLE_SIZE / 2;
      const bCy = bubble.y + AI_TOGGLE_SIZE / 2;
      const goLeft = bCx >= window.innerWidth / 2;
      const goUp = bCy >= window.innerHeight / 2;

      const rawX = goLeft
        ? bubble.x + AI_TOGGLE_SIZE - width
        : bubble.x;
      const rawY = goUp
        ? bubble.y + AI_TOGGLE_SIZE - AI_PANEL_HEIGHT
        : bubble.y;

      return clampPosition(rawX, rawY, width, AI_PANEL_HEIGHT);
    },
    [clampPosition]
  );

  const getBubbleRelativeOrigin = useCallback(
    (bubble: { x: number; y: number }, panel: { x: number; y: number }) => ({
      x: bubble.x + AI_TOGGLE_SIZE / 2 - panel.x,
      y: bubble.y + AI_TOGGLE_SIZE / 2 - panel.y,
    }),
    []
  );

  const applyBubbleDOM = useCallback((x: number, y: number) => {
    aiBubblePositionRef.current = { x, y };
    setAiBubblePositionState({ x, y });
    const el = aiToggleRef.current;
    if (el) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }, []);

  const animateBubbleTo = useCallback((x: number, y: number) => {
    const el = aiToggleRef.current;
    if (!el) {
      applyBubbleDOM(x, y);
      return;
    }
    el.style.transition = 'left 120ms ease-out, top 120ms ease-out';
    applyBubbleDOM(x, y);
    window.setTimeout(() => {
      if (aiToggleRef.current === el) {
        el.style.transition = '';
      }
    }, 140);
  }, [applyBubbleDOM]);

  const snapBubbleToEdge = useCallback((x: number, y: number) => {
    if (typeof window === 'undefined') return { x, y };
    const leftX = AI_EDGE_MARGIN;
    const rightX = window.innerWidth - AI_TOGGLE_SIZE - AI_EDGE_MARGIN;
    const centerX = x + AI_TOGGLE_SIZE / 2;
    const snapX = centerX <= window.innerWidth / 2 ? leftX : rightX;
    return clampPosition(snapX, y, AI_TOGGLE_SIZE, AI_TOGGLE_SIZE);
  }, [clampPosition]);

  const applyPanelDOM = useCallback((x: number, y: number, width?: number) => {
    aiPanelPositionRef.current = { x, y };
    setAiPanelPositionState({ x, y });
    const el = aiPanelRef.current;
    if (el) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      if (width !== undefined) el.style.width = `${width}px`;
    }
  }, []);

  useEffect(() => {
    if (!aiPositionReadyRef.current || typeof window === 'undefined') return;
    const handleResize = () => {
      if (aiOpen) {
        const w = aiPanelWidth;
        const next = clampPosition(aiPanelPositionRef.current.x, aiPanelPositionRef.current.y, w, AI_PANEL_HEIGHT);
        applyPanelDOM(next.x, next.y, w);
      } else {
        const next = clampPosition(aiBubblePositionRef.current.x, aiBubblePositionRef.current.y, AI_TOGGLE_SIZE, AI_TOGGLE_SIZE);
        applyBubbleDOM(next.x, next.y);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [aiOpen, aiPanelWidth, clampPosition, applyBubbleDOM, applyPanelDOM]);

  const openAiPanelFromBubble = useCallback(() => {
    aiLastTriggerRef.current = aiToggleRef.current;
    const bubble = aiBubblePositionRef.current;
    const panelPos = getSmartPanelPosition(bubble, aiPanelWidth);
    aiPanelPositionRef.current = panelPos;
    setAiPanelPositionState(panelPos);
    setAiPanelOrigin(getBubbleRelativeOrigin(bubble, panelPos));
    setAiPanelMotion('opening');
    setAiOpen(true);
  }, [aiPanelWidth, getSmartPanelPosition, getBubbleRelativeOrigin]);

  const closeAiPanel = useCallback(() => {
    const bubble = aiBubblePositionRef.current;
    const panel = aiPanelPositionRef.current;
    setAiPanelOrigin(getBubbleRelativeOrigin(bubble, panel));
    setAiPanelMotion('closing');
  }, [getBubbleRelativeOrigin]);

  useEffect(() => {
    if (!aiOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAiPanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aiOpen, closeAiPanel]);

  const startAiDragging = useCallback(
    (
      event: React.MouseEvent<HTMLElement>,
      mode: 'bubble' | 'panel',
      onClickWithoutDrag?: () => void,
      minPressBeforeDragMs = 0
    ) => {
      event.preventDefault();
      aiDragRef.current = true;
      aiDragMovedRef.current = false;
      const startClientX = event.clientX;
      const startClientY = event.clientY;
      let dragEnabled = minPressBeforeDragMs === 0;
      let didLongPress = false;
      let longPressTimer: number | null = null;
      const posRef = mode === 'bubble' ? aiBubblePositionRef : aiPanelPositionRef;
      const bounds = mode === 'bubble'
        ? { width: AI_TOGGLE_SIZE, height: AI_TOGGLE_SIZE }
        : { width: aiPanelWidth, height: AI_PANEL_HEIGHT };
      const applyFn = mode === 'bubble' ? applyBubbleDOM : applyPanelDOM;
      const bubbleEl = mode === 'bubble' ? aiToggleRef.current : null;

      if (bubbleEl) {
        bubbleEl.classList.add(longPressingClassName);
        bubbleEl.classList.remove(dragReadyClassName);
      }

      if (minPressBeforeDragMs > 0) {
        longPressTimer = window.setTimeout(() => {
          dragEnabled = true;
          didLongPress = true;
          if (bubbleEl) {
            bubbleEl.classList.remove(longPressingClassName);
            bubbleEl.classList.add(dragReadyClassName);
          }
        }, minPressBeforeDragMs);
      }

      aiDragOffsetRef.current = {
        x: event.clientX - posRef.current.x,
        y: event.clientY - posRef.current.y,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!aiDragRef.current) return;
        const deltaX = Math.abs(moveEvent.clientX - startClientX);
        const deltaY = Math.abs(moveEvent.clientY - startClientY);
        if (!dragEnabled) {
          if (deltaX > AI_DRAG_MOVE_TOLERANCE || deltaY > AI_DRAG_MOVE_TOLERANCE) {
            aiDragMovedRef.current = true;
          }
          return;
        }
        if (deltaX > AI_DRAG_MOVE_TOLERANCE || deltaY > AI_DRAG_MOVE_TOLERANCE) {
          aiDragMovedRef.current = true;
        }
        aiPendingPositionRef.current = clampPosition(
          moveEvent.clientX - aiDragOffsetRef.current.x,
          moveEvent.clientY - aiDragOffsetRef.current.y,
          bounds.width,
          bounds.height
        );
        if (aiDragRafRef.current !== null) return;
        aiDragRafRef.current = window.requestAnimationFrame(() => {
          aiDragRafRef.current = null;
          const pending = aiPendingPositionRef.current;
          if (!pending) return;
          applyFn(pending.x, pending.y);
        });
      };

      const handleMouseUp = () => {
        aiDragRef.current = false;
        if (longPressTimer !== null) {
          window.clearTimeout(longPressTimer);
          longPressTimer = null;
        }
        if (bubbleEl) {
          bubbleEl.classList.remove(longPressingClassName);
          bubbleEl.classList.remove(dragReadyClassName);
        }
        if (aiDragRafRef.current !== null) {
          window.cancelAnimationFrame(aiDragRafRef.current);
          aiDragRafRef.current = null;
        }
        if (aiPendingPositionRef.current) {
          applyFn(aiPendingPositionRef.current.x, aiPendingPositionRef.current.y);
        }
        if (mode === 'bubble' && dragEnabled && aiDragMovedRef.current) {
          const snapped = snapBubbleToEdge(aiBubblePositionRef.current.x, aiBubblePositionRef.current.y);
          animateBubbleTo(snapped.x, snapped.y);
        }
        aiPendingPositionRef.current = null;
        if (!aiDragMovedRef.current && !didLongPress) {
          onClickWithoutDrag?.();
        }
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [aiPanelWidth, animateBubbleTo, applyBubbleDOM, applyPanelDOM, clampPosition, dragReadyClassName, longPressingClassName, snapBubbleToEdge]
  );

  const handleResizeHandleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>, side: 'left' | 'right') => {
      event.preventDefault();
      event.stopPropagation();
      const panelX = aiPanelPositionRef.current.x;
      const panelY = aiPanelPositionRef.current.y;
      aiResizeStartRef.current = { x: event.clientX, panelX, width: aiPanelWidth };
      const handleMouseMove = (moveEvent: MouseEvent) => {
        const start = aiResizeStartRef.current;
        if (!start) return;
        const deltaX = moveEvent.clientX - start.x;
        let newWidth: number;
        let newPanelX: number;
        if (side === 'left') {
          newWidth = Math.min(
            AI_PANEL_WIDTH_MAX,
            Math.max(AI_PANEL_WIDTH_MIN, start.width - deltaX)
          );
          const rightEdge = start.panelX + start.width;
          newPanelX = rightEdge - newWidth;
        } else {
          newWidth = Math.min(
            AI_PANEL_WIDTH_MAX,
            Math.max(AI_PANEL_WIDTH_MIN, start.width + deltaX)
          );
          newPanelX = start.panelX;
        }
        const clamped = clampPosition(newPanelX, panelY, newWidth, AI_PANEL_HEIGHT);
        setAiPanelWidth(newWidth);
        applyPanelDOM(clamped.x, clamped.y, newWidth);
      };
      const handleMouseUp = () => {
        aiResizeStartRef.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [aiPanelWidth, applyPanelDOM, clampPosition]
  );

  const handleAiHeaderMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      startAiDragging(event, 'panel');
    },
    [startAiDragging]
  );

  const handleAiToggleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      startAiDragging(event, 'bubble', openAiPanelFromBubble, AI_BUBBLE_LONG_PRESS_MS);
    },
    [startAiDragging, openAiPanelFromBubble]
  );

  const handleAiPanelAnimationEnd = useCallback(() => {
    if (aiPanelMotion === 'opening') {
      setAiPanelMotion('idle');
      return;
    }
    if (aiPanelMotion === 'closing') {
      setAiOpen(false);
      setAiPanelMotion('idle');
      const trigger = aiLastTriggerRef.current;
      if (trigger) {
        window.setTimeout(() => trigger.focus(), 0);
      }
    }
  }, [aiPanelMotion]);

  return {
    aiOpen,
    aiPanelMotion,
    aiPanelOrigin,
    aiPanelWidth,
    aiToggleRef,
    aiPanelRef,
    aiBubblePosition: aiBubblePositionState,
    aiPanelPosition: aiPanelPositionState,
    handleAiToggleMouseDown,
    handleAiHeaderMouseDown,
    handleAiPanelAnimationEnd,
    handleResizeHandleMouseDown,
    closeAiPanel,
  };
}
