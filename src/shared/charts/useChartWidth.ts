import { useEffect, useState } from "react";

/** Match the SVG coordinate space to the rendered width so labels remain legible. */
export function useChartWidth<T extends HTMLElement = HTMLDivElement>(initialWidth = 700) {
  const [element, ref] = useState<T | null>(null);
  const [width, setWidth] = useState(initialWidth);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.max(240, entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { ref, width };
}
