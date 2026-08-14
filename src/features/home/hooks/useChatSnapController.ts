import { useCallback, useEffect, useRef } from "react";
import {
  findScrollContainer,
  getScrollPosition,
  getTargetScrollTop,
  scrollTo,
  type ScrollContainer
} from "../../../shared/dom/scrollContainer";

type PendingChatSnap = {
  itemId: string;
  behavior: ScrollBehavior;
  force: boolean;
};

export function useChatSnapController(
  chatOpen: boolean,
  timelineItemCount: number,
  moduleScrollLockUntilRef: { current: number },
  topOffset: number
) {
  const pendingSnapItemRef = useRef<PendingChatSnap | null>(null);
  const snapTimerIdsRef = useRef<number[]>([]);
  const snapFrameIdsRef = useRef<number[]>([]);
  const userScrollControlRef = useRef(false);
  const activeScrollContainerRef = useRef<ScrollContainer>(null);

  const clearScheduledChatSnaps = useCallback(() => {
    for (const timerId of snapTimerIdsRef.current) {
      window.clearTimeout(timerId);
    }
    snapTimerIdsRef.current = [];
    for (const frameId of snapFrameIdsRef.current) {
      window.cancelAnimationFrame(frameId);
    }
    snapFrameIdsRef.current = [];
  }, []);

  useEffect(() => () => {
    clearScheduledChatSnaps();
  }, [clearScheduledChatSnaps]);

  const resolveScrollContainer = useCallback((target?: Element | null) => {
    const workspace =
      target?.closest?.('[data-chat-workspace-panel="true"]') ??
      document.querySelector('[data-chat-workspace-panel="true"]');
    return findScrollContainer(workspace ?? target ?? null);
  }, []);

  const markUserScrollControl = useCallback((event?: Event) => {
    userScrollControlRef.current = true;
    pendingSnapItemRef.current = null;
    if (event?.target instanceof Element) {
      activeScrollContainerRef.current = resolveScrollContainer(event.target);
    }
    clearScheduledChatSnaps();
  }, [clearScheduledChatSnaps, resolveScrollContainer]);

  useEffect(() => {
    if (!chatOpen) return;

    const keyHandler = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
        markUserScrollControl();
      }
    };

    window.addEventListener("wheel", markUserScrollControl, { passive: true });
    window.addEventListener("touchstart", markUserScrollControl, { passive: true });
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("wheel", markUserScrollControl);
      window.removeEventListener("touchstart", markUserScrollControl);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [chatOpen, markUserScrollControl]);

  const snapChatItemIntoView = useCallback((itemId: string, initialBehavior: ScrollBehavior = "smooth", force = false) => {
    if (userScrollControlRef.current && !force) return;
    if (force) userScrollControlRef.current = false;

    const selector = `[data-chat-item-id="${itemId}"]`;
    const anchorSelector = `[data-chat-snap-anchor-id="${itemId}"]`;
    moduleScrollLockUntilRef.current = Date.now() + 900;
    clearScheduledChatSnaps();

    const snap = (behavior: ScrollBehavior) => {
      if (userScrollControlRef.current) return;
      const target =
        document.querySelector<HTMLElement>(anchorSelector) ??
        document.querySelector<HTMLElement>(selector);
      if (!target) return;

      const scrollContainer = resolveScrollContainer(target);
      activeScrollContainerRef.current = scrollContainer;
      scrollTo(scrollContainer, getTargetScrollTop(target, scrollContainer, topOffset), behavior);
    };

    const scheduleSnap = (delayMs: number, behavior: ScrollBehavior) => {
      const timerId = window.setTimeout(() => {
        const frameId = window.requestAnimationFrame(() => snap(behavior));
        snapFrameIdsRef.current.push(frameId);
      }, delayMs);
      snapTimerIdsRef.current.push(timerId);
    };

    const initialFrameId = window.requestAnimationFrame(() => snap(initialBehavior));
    snapFrameIdsRef.current.push(initialFrameId);
    scheduleSnap(180, "auto");
    scheduleSnap(420, "auto");
    scheduleSnap(800, "auto");
  }, [clearScheduledChatSnaps, moduleScrollLockUntilRef, resolveScrollContainer, topOffset]);

  const queueChatItemSnap = useCallback((
    itemId: string,
    initialBehavior: ScrollBehavior = "smooth",
    options: { force?: boolean } = {}
  ) => {
    const pendingSnap = { itemId, behavior: initialBehavior, force: Boolean(options.force) };
    pendingSnapItemRef.current = pendingSnap;
    const timerId = window.setTimeout(() => {
      if (pendingSnapItemRef.current?.itemId !== itemId) return;
      pendingSnapItemRef.current = null;
      snapChatItemIntoView(pendingSnap.itemId, pendingSnap.behavior, pendingSnap.force);
    }, 0);
    snapTimerIdsRef.current.push(timerId);
  }, [snapChatItemIntoView]);

  const preserveScrollIfUserControlled = useCallback(() => {
    if (!userScrollControlRef.current) return;
    const scrollContainer =
      activeScrollContainerRef.current ??
      resolveScrollContainer(document.querySelector('[data-chat-workspace-panel="true"]'));
    const scrollPosition = getScrollPosition(scrollContainer);
    const restore = () => scrollTo(scrollContainer, scrollPosition, "auto");
    const firstFrameId = window.requestAnimationFrame(() => {
      restore();
      const secondFrameId = window.requestAnimationFrame(restore);
      snapFrameIdsRef.current.push(secondFrameId);
      const timerId = window.setTimeout(restore, 80);
      snapTimerIdsRef.current.push(timerId);
    });
    snapFrameIdsRef.current.push(firstFrameId);
  }, [resolveScrollContainer]);

  useEffect(() => {
    const pendingSnap = pendingSnapItemRef.current;
    if (!pendingSnap) return;

    pendingSnapItemRef.current = null;
    snapChatItemIntoView(pendingSnap.itemId, pendingSnap.behavior, pendingSnap.force);
  }, [snapChatItemIntoView, timelineItemCount]);

  return {
    claimUserScrollControl: markUserScrollControl,
    preserveScrollIfUserControlled,
    queueChatItemSnap
  };
}
