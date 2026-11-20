import { useEffect } from "react";
import "./page-title-motion.css";

// Animate presentation only. Links, browser history, and data loading keep their owners.
export default function PageTitleMotion() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-platform-header]");
    if (!header) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let stop = () => {};
    const heading = () => document.querySelector<HTMLElement>("main h1:not(.sr-only)");
    const visible = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && getComputedStyle(element).visibility !== "hidden";
    };
    const textBounds = (element: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect();
    };
    const click = (event: MouseEvent) => {
      if (event.detail === 0 || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a") : null;
      if (!link || !header.contains(link) || link.target === "_blank" || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname || !visible(link)) return;
      stop();
      if (reducedMotion.matches || !Element.prototype.animate) return;
      const label = link.textContent?.trim();
      const oldTitle = heading();
      const oldText = oldTitle?.textContent?.trim();
      const returnLink = [...header.querySelectorAll<HTMLAnchorElement>("[data-platform-primary-links] a")].find(item => item.getAttribute("aria-current") === "page" && visible(item));
      const ghosts: HTMLElement[] = [];
      const hidden = new Set<HTMLElement>();
      const animations: Animation[] = [];
      let observer: MutationObserver | undefined;
      let timer = 0;
      let done = false;
      const hide = (element: HTMLElement) => { hidden.add(element); element.setAttribute("data-title-in-flight", "true"); };
      const restore = (element: HTMLElement) => { element.removeAttribute("data-title-in-flight"); hidden.delete(element); };
      stop = () => {
        done = true; observer?.disconnect(); clearTimeout(timer);
        animations.forEach(animation => animation.cancel());
        ghosts.forEach(ghost => ghost.remove()); hidden.forEach(restore);
      };
      const ghostAt = (element: HTMLElement, text: string) => {
        const rect = textBounds(element), style = getComputedStyle(element);
        const ghost = document.createElement("span");
        ghost.className = "platform-title-flight";
        ghost.setAttribute("aria-hidden", "true");
        ghost.textContent = text;
        Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, font: style.font, letterSpacing: style.letterSpacing, color: style.color });
        document.body.append(ghost); ghosts.push(ghost);
        return { ghost, rect };
      };
      const fly = (flight: ReturnType<typeof ghostAt>, target: HTMLElement) => {
        const targetRect = textBounds(target);
        const animation = flight.ghost.animate([
          { transform: "translate(0,0)", opacity: 1 },
          { transform: `translate(${targetRect.left - flight.rect.left}px,${targetRect.top - flight.rect.top}px)`, opacity: 1 }
        ], { duration: 420, easing: "cubic-bezier(.22,.8,.25,1)", fill: "forwards" });
        animations.push(animation);
        void animation.finished.then(() => { flight.ghost.remove(); restore(target); }).catch(() => {});
      };
      if (oldTitle && oldText && returnLink && visible(oldTitle)) {
        const returning = ghostAt(oldTitle, oldText);
        hide(oldTitle); hide(returnLink); fly(returning, returnLink);
      }
      // The logo has no text label to transfer; the outgoing title can still return.
      if (!label || link.dataset.platformPageTarget === "home") { timer = window.setTimeout(stop, 450); return; }
      const arriving = ghostAt(link, label);
      hide(link);
      const arrive = () => {
        if (done || window.location.pathname !== destination.pathname) return;
        const target = heading();
        if (!target || !visible(target) || (target === oldTitle && target.textContent?.trim() === oldText)) return;
        observer?.disconnect(); clearTimeout(timer);
        hide(target); fly(arriving, target);
        timer = window.setTimeout(stop, 450);
      };
      observer = new MutationObserver(arrive);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      // A slow or differently named destination must never leave navigation hidden.
      timer = window.setTimeout(stop, 1500);
    };
    const cancel = () => stop();
    header.addEventListener("click", click);
    window.addEventListener("popstate", cancel);
    window.addEventListener("resize", cancel);
    reducedMotion.addEventListener("change", cancel);
    return () => {
      stop(); header.removeEventListener("click", click);
      window.removeEventListener("popstate", cancel); window.removeEventListener("resize", cancel);
      reducedMotion.removeEventListener("change", cancel);
    };
  }, []);
  return null;
}
