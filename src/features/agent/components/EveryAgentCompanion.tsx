import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, X } from "lucide-react";
import { getApiAuthCachePartition } from "../../../shared/api/authenticatedFetch";
import { readStorageItem, writeStorageItem } from "../../../shared/storage/browserStorage";
import { agentStatus, useEveryAgent } from "../EveryAgentContext";
import { agentIntroduction, EveryAgentOrb } from "./EveryAgentIdentity";
import EveryAgentWork from "./EveryAgentWork";
import "../everyAgent.css";

function pageContext(path: string, search: string) {
  if (path === "/analytics/agent" && search) return "Licensing";
  if (path === "/analytics/agent" || path === "/everyagent") return "your briefing";
  if (path.startsWith("/admissions") || path === "/pipeline") return "Admissions";
  if (path.startsWith("/communities")) return "Communities";
  if (path === "/analytics/questions" || path === "/questions" || path === "/chat") return "Ask a question";
  if (path.startsWith("/analytics") || path.startsWith("/reports")) return "Reports";
  return "Alamo Platform";
}

export default function EveryAgentCompanion() {
  const { data, error, refresh } = useEveryAgent();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const introKey = `everyagent-introduction-v1:${getApiAuthCachePartition()}`;
  const [introduced, setIntroduced] = useState(() => readStorageItem(introKey, { kind: "session" }) === "seen");
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const context = pageContext(location.pathname, location.search);
  const needsReview = data?.work.filter(item => item.status === "needs_review") ?? [];
  const recent = (needsReview.length ? needsReview : data?.work ?? []).slice(0, 2);
  const dismissIntro = () => { setIntroduced(true); writeStorageItem(introKey, "seen", { kind: "session" }); };
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) { element.close(); launcher.current?.focus({ preventScroll: true }); }
  }, [open]);
  return <div className="everyagent-embedded">
    {!introduced && context !== "your briefing" && !open && <div className="everyagent-hello">
      <button type="button" className="everyagent-hello-dismiss" aria-label="Dismiss EveryAgent introduction" onClick={dismissIntro}><X size={14} /></button>
      <button type="button" onClick={() => { dismissIntro(); setOpen(true); }}><strong>I’m EveryAgent.</strong><span>I’ll keep your work close. Open your briefing here.</span></button>
    </div>}
    <button ref={launcher} type="button" className="everyagent-launcher" aria-label="Open EveryAgent" aria-haspopup="dialog" aria-expanded={open} onClick={() => { dismissIntro(); setOpen(true); }}>
      <EveryAgentOrb small /><span>EveryAgent</span>{needsReview.length > 0 && <span className="everyagent-badge" aria-label={`${needsReview.length} updates need review`}>{needsReview.length}</span>}
    </button>
    <dialog ref={dialog} className="everyagent-companion" aria-labelledby="everyagent-companion-title" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="everyagent-companion-inner">
        <header><div><EveryAgentOrb small /><span className="everyagent-wordmark">EveryAgent</span></div><button autoFocus type="button" aria-label="Close EveryAgent" onClick={() => setOpen(false)}><X size={20} /></button></header>
        <div className="everyagent-companion-body">
          <p className="everyagent-context">With you in {context}</p>
          <h2 id="everyagent-companion-title">I’m EveryAgent.</h2>
          <p className="everyagent-companion-intro">{agentIntroduction(data)}</p>
          <span className="everyagent-live" role="status">{agentStatus(data, error)}</span>
          {error && <div role="alert" className="everyagent-error">{error}<button type="button" onClick={refresh}>Try again</button></div>}
          <div className="everyagent-companion-work"><h3>{needsReview.length ? "Worth your attention" : "Your latest briefing"}</h3>{recent.map(item => <EveryAgentWork key={item.id} item={item} compact />)}{!recent.length && <p className="everyagent-empty">{data ? "I’ll bring the first completed checks here." : "Bringing together your latest work…"}</p>}</div>
          {data && <nav className="everyagent-companion-skills" aria-label="EveryAgent skills">{data.skills.map(skill => <Link key={skill.id} to={skill.href} onClick={() => setOpen(false)}>{skill.title}<ArrowUpRight size={16} /></Link>)}</nav>}
        </div>
        <footer><Link to="/analytics/agent" onClick={() => setOpen(false)}>Full briefing<ArrowUpRight size={16} /></Link><Link to="/analytics/questions" onClick={() => setOpen(false)}>Ask a question</Link><p>Updates stay in the app. Email delivery is off.</p></footer>
      </div>
    </dialog>
  </div>;
}
