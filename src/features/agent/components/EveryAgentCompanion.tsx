import { useEffect, useMemo, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, X } from "lucide-react";
import { agentStatus, useEveryAgent } from "../EveryAgentContext";
import { EveryAgentOrb } from "./EveryAgentIdentity";
import WorkflowKnowledge from "./WorkflowKnowledge";
import EveryAgentWork from "./EveryAgentWork";
import { useAgentBranding } from "../useAgentBranding";
import { agentChatConfigured } from "../conversations/agentTransport";
import { createAgentTransport } from "../conversations/agentTransport";
import AgentConversationHome from "../conversations/AgentConversationHome";
import "../everyAgent.css";

export default function EveryAgentCompanion() {
  const { data, error, refresh } = useEveryAgent();
  const branding = useAgentBranding();
  const { instance } = useMsal();
  const transport = useMemo(() => createAgentTransport(instance), [instance]);
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState<"updates" | "chats">("updates");
  const [chatId, setChatId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const needsReview = data?.work.filter(item => item.status === "needs_review") ?? [];
  const recent = showAll ? data?.work ?? [] : (needsReview.length ? needsReview : data?.work ?? []).slice(0, 2);
  useEffect(() => { setOpen(false); setShowAll(false); setView("updates"); setChatId(null); }, [location.pathname, location.search]);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) { element.close(); launcher.current?.focus({ preventScroll: true }); }
  }, [open]);
  if (agentChatConfigured && location.pathname === "/analytics/agent" && new URLSearchParams(location.search).has("chat")) return null;
  return <div className="everyagent-embedded">
    <button ref={launcher} type="button" className={`everyagent-launcher everyagent-launcher--${branding.variant}`} aria-label="Open Ally" title="Ally" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <img className="everyagent-launcher__mark" src="/brand/ally-mark.svg" alt="" /><span className="everyagent-launcher__label">Ally</span>{needsReview.length > 0 && <span className="everyagent-badge" aria-label={`${needsReview.length} updates need review`}>{needsReview.length}</span>}
    </button>
    <dialog ref={dialog} data-empty={view === "updates" && !data?.work.length && !data?.skills.length ? "true" : undefined} className={`everyagent-companion${view === "chats" ? " everyagent-companion--chat" : ""}`} aria-label="Ally" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="everyagent-companion-inner">
        <header><div><EveryAgentOrb /><strong>Ally</strong><span className="everyagent-live" role="status">{agentStatus(data, error)}</span></div><button autoFocus type="button" aria-label="Close Ally" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="everyagent-companion-body">
          {view === "chats" && agentChatConfigured ? <AgentConversationHome transport={transport} conversationId={chatId} onNavigate={setChatId} /> : <>
          <WorkflowKnowledge active={open} onOpenSource={() => setOpen(false)} />
          {error && <div role="alert" className="everyagent-error">{error}<button type="button" onClick={refresh}>Try again</button></div>}
          <div className="everyagent-companion-work">{recent.map(item => <EveryAgentWork key={item.id} item={item} compact />)}{!recent.length && <p className="everyagent-empty">{data ? "No updates yet." : "Loading updates…"}</p>}</div>
          {data && <nav className="everyagent-companion-skills" aria-label={`${branding.name} skills`}>{data.skills.map(skill => <Link key={skill.id} to={skill.href} onClick={() => setOpen(false)}>{skill.title}<ArrowUpRight size={16} /></Link>)}</nav>}
          </>}
        </div>
        <footer>{view === "chats" ? <button type="button" onClick={() => setView("updates")}>Updates</button> : <button type="button" onClick={() => setShowAll(value => !value)}>{showAll ? "Recent updates" : "All updates"}</button>}{agentChatConfigured ? <button type="button" aria-pressed={view === "chats"} onClick={() => setView("chats")}>Chats</button> : <button type="button" onClick={refresh}>Refresh</button>}</footer>
      </div>
    </dialog>
  </div>;
}
