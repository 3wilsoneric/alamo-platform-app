export type ScrollContainer = HTMLElement | null;

function hasScrollableOverflow(element: HTMLElement) {
  const { overflowY } = window.getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(overflowY);
}

export function findScrollContainer(element: Element | null): ScrollContainer {
  let current = element?.parentElement ?? null;

  while (current) {
    if (current !== document.body && current !== document.documentElement && hasScrollableOverflow(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

export function getScrollPosition(container: ScrollContainer) {
  return container ? container.scrollTop : window.scrollY;
}

export function scrollBy(container: ScrollContainer, top: number) {
  if (container) {
    container.scrollBy({ top, behavior: "auto" });
    return;
  }
  window.scrollBy({ top, behavior: "auto" });
}

export function scrollTo(
  container: ScrollContainer,
  top: number,
  behavior: ScrollBehavior = "auto"
) {
  if (container) {
    container.scrollTo({ top, behavior });
    return;
  }
  window.scrollTo({ top, behavior });
}

export function getTargetScrollTop(
  target: HTMLElement,
  container: ScrollContainer,
  topOffset: number
) {
  const targetRect = target.getBoundingClientRect();
  if (!container) {
    return Math.max(0, targetRect.top + window.scrollY - topOffset);
  }

  const containerRect = container.getBoundingClientRect();
  return Math.max(
    0,
    targetRect.top - containerRect.top + container.scrollTop - topOffset
  );
}
