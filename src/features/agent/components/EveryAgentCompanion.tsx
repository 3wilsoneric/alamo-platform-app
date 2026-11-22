import { useEffect, useMemo, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useLocation } from "react-router-dom";
import { Maximize2, Minimize2, Pencil, X } from "lucide-react";
import { agentChatConfigured } from "../conversations/agentTransport";
import { createAgentTransport } from "../conversations/agentTransport";
import AgentConversationHome from "../conversations/AgentConversationHome";
import AllyAnswerCanvas from "../conversations/AllyAnswerCanvas";
import { OPEN_ALLY_EVENT } from "../allyLauncher";
import AllyMark from "./AllyMark";
import { useAllyTransition } from "./useAllyTransition";
import "../everyAgent.css";

export default function EveryAgentCompanion() {
  const { instance } = useMsal();
  const transport = useMemo(() => createAgentTransport(instance), [instance]);
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => { setOpen(false); setExpanded(false); setChatId(null); }, [location.pathname, location.search]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const resize = () => {
      if (!open) {
        if (element.open) element.close();
        return;
      }
      const mobile = window.matchMedia("(max-width: 700px)").matches;
      if (element.open && element.matches(":modal") === mobile) return;
      if (element.open) element.close();
      if (mobile) { element.showModal(); setExpanded(true); }
      else element.show();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open]);
  const changeOpen = useAllyTransition(open, setOpen, dialog);
  useEffect(() => {
    const toggleFromHeader = () => changeOpen(!open);
    window.addEventListener(OPEN_ALLY_EVENT, toggleFromHeader);
    return () => window.removeEventListener(OPEN_ALLY_EVENT, toggleFromHeader);
  }, [changeOpen, open]);
  useEffect(() => {
    if (!open && wasOpen.current) {
      setExpanded(false);
      [...document.querySelectorAll<HTMLButtonElement>(".platform-ally-header-button")].find(button => button.getBoundingClientRect().width > 0)?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open]);
  if (agentChatConfigured && location.pathname === "/analytics/agent" && new URLSearchParams(location.search).has("chat")) return null;
  return <div className="everyagent-embedded">
    <dialog ref={dialog} className={`everyagent-companion everyagent-companion--chat${expanded ? " everyagent-companion--expanded" : ""}`} aria-label="Ally" onClose={() => { if (!dialog.current?.open) changeOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); if (window.matchMedia("(max-width: 700px)").matches) changeOpen(false); else if (expanded) setExpanded(false); else changeOpen(false); } }} onCancel={event => { event.preventDefault(); if (window.matchMedia("(max-width: 700px)").matches) changeOpen(false); else if (expanded) setExpanded(false); else changeOpen(false); }} onClick={event => { if (event.target === event.currentTarget) changeOpen(false); }}>
      <div className="everyagent-companion-inner">
        <header><div><AllyMark className="ally-panel-mark" /><strong>Ally</strong></div>{chatId && <button type="button" className="ally-panel-new" onClick={() => setChatId(null)}><Pencil size={17} aria-hidden="true" />New chat</button>}<button type="button" className="ally-panel-expand" aria-label={expanded ? "Restore Ally panel" : "Expand Ally to full screen"} aria-pressed={expanded} title={expanded ? "Restore panel" : "Full screen"} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}</button><button autoFocus type="button" aria-label="Close Ally" onClick={() => changeOpen(false)}><X size={20} /></button></header>
        <div className="everyagent-companion-body">
          {agentChatConfigured ? <AgentConversationHome transport={transport} conversationId={chatId} onNavigate={setChatId} expanded={expanded} /> : <div className={`ally-preview-workspace${expanded ? " ally-preview-workspace--expanded" : ""}`}><div className="ally-chat-preview"><h2>Ask Ally</h2><p>Chat is unavailable in this preview.</p><div className="ally-chat-preview-composer"><input type="text" placeholder="Ask Ally…" aria-label="Ask Ally" disabled /><button type="button" disabled aria-label="Send question">↑</button></div></div>{expanded && <AllyAnswerCanvas chat={null} />}</div>}
        </div>
      </div>
    </dialog>
  </div>;
}
