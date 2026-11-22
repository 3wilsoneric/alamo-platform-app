import { useCallback, useEffect, useRef, type RefObject } from "react";

type Flight = { mark: SVGSVGElement; cancel: () => void };
type Departure = { box: DOMRect; transform?: string | undefined };

function visibleLauncher() {
  return [...document.querySelectorAll<HTMLButtonElement>(".platform-ally-header-button")]
    .find(button => button.getBoundingClientRect().width > 0 && getComputedStyle(button).visibility !== "hidden") ?? null;
}

function syncLaunchers(open: boolean) {
  document.documentElement.toggleAttribute("data-platform-ally-open", open);
  document.querySelectorAll<HTMLButtonElement>(".platform-ally-header-button")
    .forEach(button => button.setAttribute("aria-expanded", String(open)));
}

/** The Carelog bookmark moves between the header button and the chat header. */
export function useAllyTransition(open: boolean, setOpen: (value: boolean) => void, dialog: RefObject<HTMLDialogElement | null>) {
  const flight = useRef<Flight | null>(null);
  const departure = useRef<Departure | null>(null);
  const changeOpen = useCallback((next: boolean) => {
    if (next === open) return;
    const moving = flight.current?.mark;
    const source = moving ?? (next
      ? visibleLauncher()?.querySelector<SVGSVGElement>(".p-ally-mark")
      : dialog.current?.querySelector<SVGSVGElement>(".ally-panel-mark"));
    departure.current = source ? {
      box: source.getBoundingClientRect(),
      transform: moving ? getComputedStyle(moving).transform : undefined
    } : null;
    if (!next) visibleLauncher()?.setAttribute("data-ally-returning", "");
    syncLaunchers(next);
    setOpen(next);
  }, [open, setOpen, dialog]);

  useEffect(() => {
    syncLaunchers(open);
    const frame = requestAnimationFrame(() => {
      const launcher = visibleLauncher();
      const home = launcher?.querySelector<SVGSVGElement>(".p-ally-mark");
      const destination = open ? dialog.current?.querySelector<SVGSVGElement>(".ally-panel-mark") : home;
      const from = departure.current;
      departure.current = null;
      const clearReturn = () => document.querySelectorAll(".platform-ally-header-button[data-ally-returning]").forEach(button => button.removeAttribute("data-ally-returning"));
      if (!from || !destination || !home || matchMedia("(prefers-reduced-motion: reduce)").matches) { clearReturn(); return; }
      const start = from.box, end = destination.getBoundingClientRect();
      if (!start.width || !end.width) { clearReturn(); return; }
      const panel = open ? dialog.current : null;
      const overlay = document.createElement("div");
      overlay.setAttribute("data-ally-overlay", "");
      overlay.setAttribute("aria-hidden", "true");
      overlay.inert = true;
      overlay.popover = "manual";
      overlay.style.cssText = "position:fixed;inset:0 auto auto 0;width:0;height:0;margin:0;padding:0;border:0;overflow:visible;background:none;pointer-events:none;z-index:100;";
      document.body.append(overlay);
      try { overlay.showPopover(); } catch { overlay.removeAttribute("popover"); (panel ?? document.body).append(overlay); }
      const mark = destination.cloneNode(true) as SVGSVGElement;
      mark.removeAttribute("style");
      mark.setAttribute("data-ally-flight", open ? "out" : "home");
      mark.style.cssText = `position:fixed;left:0;top:0;width:${end.width}px;height:${end.height}px;pointer-events:none;transform-origin:center;`;
      overlay.append(mark);
      if (open) destination.style.visibility = "hidden";
      const lift = Math.min(18, Math.hypot(end.x - start.x, end.y - start.y) * .08);
      const animation = mark.animate([
        { transform: from.transform ?? `translate(${start.x}px, ${start.y}px) scale(${start.width / end.width}, ${start.height / end.height}) rotate(0deg)` },
        { transform: `translate(${(start.x + end.x) / 2}px, ${(start.y + end.y) / 2 - lift}px) rotate(${open ? -6 : 6}deg)`, offset: .5 },
        { transform: `translate(${end.x}px, ${end.y}px) scale(1) rotate(0deg)` }
      ], { duration: open ? 260 : 220, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" });
      const reveal = panel?.animate([
        { clipPath: "inset(-16px -12px calc(100% - 48px) -12px round 8px)", opacity: .65 },
        { clipPath: "inset(-16px -12px -12px -12px round 8px)", opacity: 1 }
      ], { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" });
      const motion = matchMedia("(prefers-reduced-motion: reduce)");
      let disposed = false;
      const clear = () => {
        if (disposed) return;
        disposed = true;
        window.removeEventListener("resize", cancel);
        window.visualViewport?.removeEventListener("resize", cancel);
        window.visualViewport?.removeEventListener("scroll", cancel);
        motion.removeEventListener("change", cancel);
        overlay.remove();
        if (open) destination.style.removeProperty("visibility");
        else clearReturn();
        if (flight.current?.mark === mark) flight.current = null;
      };
      const cancel = () => { animation.cancel(); reveal?.cancel(); clear(); };
      flight.current = { mark, cancel };
      void animation.finished.then(clear, clear);
      window.addEventListener("resize", cancel, { once: true });
      window.visualViewport?.addEventListener("resize", cancel, { once: true });
      window.visualViewport?.addEventListener("scroll", cancel, { once: true });
      motion.addEventListener("change", cancel, { once: true });
    });
    return () => { cancelAnimationFrame(frame); flight.current?.cancel(); };
  }, [open, dialog]);

  useEffect(() => () => { flight.current?.cancel(); syncLaunchers(false); }, []);
  return changeOpen;
}
