import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Maximize, Minimize, StickyNote, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadPresentation } from "./presentationApi";
import { presentationLinks } from "./presentationLinks";
import "./presentation.css";

type LoadedDeck = Awaited<ReturnType<typeof loadPresentation>>;

export default function PresentationPage() {
  const [deck, setDeck] = useState<LoadedDeck | null>(null);
  const [error, setError] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [scale, setScale] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const current = Math.max(0, deck?.slides.findIndex((slide) => `#${slide.id}` === location.hash) ?? 0);
  const slide = deck?.slides[current];
  const liveLink = slide ? presentationLinks[slide.id] : undefined;

  useEffect(() => {
    const controller = new AbortController();
    loadPresentation(controller.signal).then((value) => { if (!controller.signal.aborted) setDeck(value); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The presentation could not be loaded."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [deck]);

  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    const returnTo = location.state?.returnTo;
    navigate(typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") && !returnTo.startsWith("/presentation") ? returnTo : "/home", { replace: true });
  }, [location.state, navigate]);

  const go = useCallback((index: number) => {
    if (!deck) return;
    const next = deck.slides[Math.max(0, Math.min(index, deck.slides.length - 1))];
    if (next) navigate({ pathname: "/presentation", hash: next.id }, { replace: true, state: location.state });
  }, [deck, location.state, navigate]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (document.documentElement.requestFullscreen) void document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLSelectElement || event.target instanceof HTMLAnchorElement && [" ", "Enter"].includes(event.key) || event.target instanceof HTMLButtonElement && [" ", "Enter"].includes(event.key)) return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) go(current + 1);
      else if (["ArrowLeft", "PageUp"].includes(event.key)) go(current - 1);
      else if (event.key === "Home") go(0);
      else if (event.key === "End") go((deck?.slides.length ?? 1) - 1);
      else if (event.key.toLowerCase() === "s") setNotesOpen((open) => !open);
      else if (event.key.toLowerCase() === "f") toggleFullscreen();
      else if (event.key === "Escape") { if (notesOpen) setNotesOpen(false); else if (!document.fullscreenElement) close(); }
      else return;
      event.preventDefault();
    };
    document.addEventListener("fullscreenchange", syncFullscreen);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("fullscreenchange", syncFullscreen); window.removeEventListener("keydown", onKey); };
  }, [close, current, deck, go, notesOpen, toggleFullscreen]);

  return (
    <div className="presentation-viewer" aria-label="Alamo Data Strategy presentation">
      {deck && slide ? (
        <>
          <div className="presentation-stage" ref={stage} onPointerDown={(event) => { gesture.current = { x: event.clientX, y: event.clientY }; }}
            onPointerUp={(event) => {
              const start = gesture.current; gesture.current = null;
              if (!start || Math.abs(event.clientY - start.y) > 60) return;
              const change = event.clientX - start.x;
              if (Math.abs(change) > 60) go(current + (change < 0 ? 1 : -1));
              else if (Math.abs(change) < 10) go(current + (event.clientX < event.currentTarget.getBoundingClientRect().width / 2 ? -1 : 1));
            }}>
            <div className="presentation-slide-fit" style={{ width: 1920 * scale, height: 1080 * scale }}>
              <iframe key={slide.id} title={`Slide ${current + 1}: ${slide.title}`} srcDoc={slide.document} sandbox="" tabIndex={-1}
                className="presentation-slide" style={{ transform: `scale(${scale})` }} />
            </div>
          </div>
          {notesOpen ? <aside className="presentation-notes" aria-label="Speaker notes"><div><h2>Speaker notes · {current + 1} / {deck.slides.length}</h2><button type="button" aria-label="Close speaker notes" onClick={() => setNotesOpen(false)}><X size={18} /></button></div><p>{slide.notes || "No notes for this slide."}</p></aside> : null}
          <footer className="presentation-controls">
            <button type="button" onClick={close} aria-label="Close presentation" title="Back to Platform"><X size={20} /></button>
            <span className="presentation-title">{deck.title}</span>
            {liveLink ? <a className="presentation-live-link" href={liveLink.href} target="_blank" rel="noopener noreferrer" aria-label={`${liveLink.label} (opens in a new tab)`} title={`${liveLink.label} in a new tab`}><span className="presentation-live-link__desktop" aria-hidden="true">{liveLink.label}</span><span className="presentation-live-link__mobile" aria-hidden="true">Open page</span><ExternalLink size={17} aria-hidden="true" /></a> : null}
            <div className="presentation-paging">
              <button type="button" disabled={current === 0} onClick={() => go(current - 1)} aria-label="Previous slide"><ChevronLeft size={22} /></button>
              <label><span className="sr-only">Go to slide</span><select value={current} onChange={(event) => go(Number(event.target.value))}>{deck.slides.map((item, index) => <option key={item.id} value={index}>{index + 1} / {deck.slides.length} · {item.title}</option>)}</select><span aria-hidden="true">{current + 1} / {deck.slides.length}</span></label>
              <button type="button" disabled={current === deck.slides.length - 1} onClick={() => go(current + 1)} aria-label="Next slide"><ChevronRight size={22} /></button>
            </div>
            <button type="button" aria-label="Speaker notes" aria-expanded={notesOpen} onClick={() => setNotesOpen((open) => !open)} title="Speaker notes (S)"><StickyNote size={20} /></button>
            <button type="button" aria-label={fullscreen ? "Exit full screen" : "Enter full screen"} onClick={toggleFullscreen} title="Full screen (F)">{fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>
          </footer>
          <div className="presentation-progress" aria-hidden="true" style={{ width: `${((current + 1) / deck.slides.length) * 100}%` }} />
          <p className="sr-only" aria-live="polite">Slide {current + 1} of {deck.slides.length}: {slide.title}</p>
        </>
      ) : <div className="presentation-loading"><p role={error ? "alert" : "status"}>{error || "Loading presentation…"}</p><button type="button" onClick={close}>Back to Platform</button></div>}
    </div>
  );
}
