import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, X } from "lucide-react";
import { agentStatus, useEveryAgent } from "../EveryAgentContext";
import { EveryAgentOrb } from "./EveryAgentIdentity";
import EveryAgentWork from "./EveryAgentWork";
import "../everyAgent.css";

export default function EveryAgentCompanion() {
  const { data, error, refresh } = useEveryAgent();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const needsReview = data?.work.filter(item => item.status === "needs_review") ?? [];
  const recent = (needsReview.length ? needsReview : data?.work ?? []).slice(0, 2);
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) { element.close(); launcher.current?.focus({ preventScroll: true }); }
  }, [open]);
  return <div className="everyagent-embedded">
    <button ref={launcher} type="button" className="everyagent-launcher" aria-label="Open EveryAgent" title="EveryAgent" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <EveryAgentOrb />{needsReview.length > 0 && <span className="everyagent-badge" aria-label={`${needsReview.length} updates need review`}>{needsReview.length}</span>}
    </button>
    <dialog ref={dialog} className="everyagent-companion" aria-label="EveryAgent" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="everyagent-companion-inner">
        <header><div><EveryAgentOrb /><span className="everyagent-live" role="status">{agentStatus(data, error)}</span></div><button autoFocus type="button" aria-label="Close EveryAgent" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="everyagent-companion-body">
          {error && <div role="alert" className="everyagent-error">{error}<button type="button" onClick={refresh}>Try again</button></div>}
          <div className="everyagent-companion-work">{recent.map(item => <EveryAgentWork key={item.id} item={item} compact />)}{!recent.length && <p className="everyagent-empty">{data ? "No updates yet." : "Loading updates…"}</p>}</div>
          {data && <nav className="everyagent-companion-skills" aria-label="EveryAgent skills">{data.skills.map(skill => <Link key={skill.id} to={skill.href} onClick={() => setOpen(false)}>{skill.title}<ArrowUpRight size={16} /></Link>)}</nav>}
        </div>
        <footer><Link to="/analytics/agent" onClick={() => setOpen(false)}>All updates<ArrowUpRight size={16} /></Link><Link to="/analytics/questions" onClick={() => setOpen(false)}>Ask a question</Link></footer>
      </div>
    </dialog>
  </div>;
}
