import { useCallback, useEffect, useRef } from "react";
import { findScrollContainer, scrollBy } from "../dom/scrollContainer";

/**
 * Keeps the control a user clicked at the same viewport position while content
 * above it expands or collapses. This preserves reading position without
 * competing with the chat controller's one-time navigation snaps.
 */
export function useStableInteractionAnchor() {
  const frameIdsRef = useRef<number[]>([]);

  const cancelPendingRestores = useCallback(() => {
    for (const frameId of frameIdsRef.current) {
      window.cancelAnimationFrame(frameId);
    }
    frameIdsRef.current = [];
  }, []);

  useEffect(() => cancelPendingRestores, [cancelPendingRestores]);

  return useCallback((anchor: HTMLElement) => {
    cancelPendingRestores();
    const initialTop = anchor.getBoundingClientRect().top;
    const scrollContainer = findScrollContainer(anchor);

    const restore = () => {
      if (!anchor.isConnected) return;
      const delta = anchor.getBoundingClientRect().top - initialTop;
      if (Math.abs(delta) > 0.5) {
        scrollBy(scrollContainer, delta);
      }
    };

    const firstFrameId = window.requestAnimationFrame(() => {
      restore();
      const secondFrameId = window.requestAnimationFrame(() => {
        restore();
        const thirdFrameId = window.requestAnimationFrame(() => {
          restore();
          frameIdsRef.current = [];
        });
        frameIdsRef.current.push(thirdFrameId);
      });
      frameIdsRef.current.push(secondFrameId);
    });
    frameIdsRef.current.push(firstFrameId);
  }, [cancelPendingRestores]);
}
