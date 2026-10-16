import { useEffect, useRef, useState } from "react";
import { Bot, Check, ExternalLink, RefreshCw } from "lucide-react";
import type { EveryAgentCommand, EveryAgentOverview } from "../../../../shared/everyagent-contracts.mjs";
import { readEveryAgent, updateEveryAgent } from "../everyAgentApi";
import EveryAgentResponsibility, { agentTime } from "./EveryAgentResponsibility";
import "../everyAgent.css";

export default function EveryAgentWorkspace() {
  const [data, setData] = useState<EveryAgentOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("latest");
  const [visibleCount, setVisibleCount] = useState(50);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { const requested = ++generation.current; void readEveryAgent(controller.signal).then(result => {
      if (!controller.signal.aborted && requested === generation.current) { setData(result); setError(null); }
    }).catch(() => { if (!controller.signal.aborted && requested === generation.current) setError("EveryAgent could not refresh. Previously loaded results may be out of date."); }); };
    refresh(); const timer = globalThis.setInterval(refresh, 30_000);
    return () => { controller.abort(); globalThis.clearInterval(timer); };
  }, [attempt]);
  async function command(input: EveryAgentCommand) {
    setBusy(true); ++generation.current;
    try { const result = await updateEveryAgent(input); ++generation.current; setData(result); setError(null); }
    catch { setError("Your change was not saved. Refresh and try again."); throw new Error("Change not saved."); }
    finally { setBusy(false); }
  }
  const needsReview = data?.work.filter(item => item.status === "needs_review").length ?? 0;
  const work = data?.work.filter(item => filter === "latest" || item.status === filter) ?? [];
  return <main className="everyagent-workspace" aria-label="EveryAgent workspace">
    <header className="everyagent-intro"><div className="everyagent-mark"><Bot size={26} aria-hidden="true" /></div>
      <div><p className="everyagent-eyebrow">Your work, across applications</p><h1>EveryAgent</h1><p>Watching what matters. Keeping the next step ready.</p></div>
      <span className="everyagent-live" role="status">{data?.working ? "Checking sources" : data?.responsibilities.every(item => item.paused) ? "Monitoring paused" : data?.workerEnabled ? "Scheduled monitoring" : data ? "Monitoring not running" : "Loading your work"}</span>
    </header>
    {error && <div role="alert" className="everyagent-error">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
    {!data ? <p role="status" className="everyagent-loading">Loading responsibilities and recent work…</p> : <>
      <section aria-labelledby="everyagent-responsibilities"><div className="everyagent-section-title"><h2 id="everyagent-responsibilities">Watching for you</h2><span>{data.skills.length} skills</span></div>
        <div className="everyagent-responsibilities">{data.skills.map(skill => {
          const responsibility = data.responsibilities.find(item => item.skillId === skill.id);
          return responsibility ? <EveryAgentResponsibility key={`${skill.id}-${responsibility.version}`} skill={skill} responsibility={responsibility} busy={busy} onCommand={command} /> : null;
        })}</div>
      </section>
      <section aria-labelledby="everyagent-work"><div className="everyagent-section-title"><h2 id="everyagent-work">Your work</h2><button type="button" aria-label="Refresh EveryAgent" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} />Refresh</button></div>
        <div className="everyagent-filters" role="group" aria-label="Filter work">{[["latest", "Latest"], ["needs_review", `Needs you${needsReview ? ` · ${needsReview}` : ""}`], ["completed", "Completed"]].map(([id, title]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id ?? "latest")}>{title}</button>)}</div>
        {!work.length && <p className="everyagent-empty">{filter === "needs_review" ? "Nothing needs your review right now." : "Completed checks and new results will appear here."}</p>}
        <div className="everyagent-work-list">{work.slice(0, visibleCount).map(item => <article key={item.id} className="everyagent-work-item">
          <div className="everyagent-row"><span className="everyagent-eyebrow">{data.skills.find(skill => skill.id === item.skillId)?.title}</span><span className="everyagent-date">{agentTime(item.createdAt)}</span></div>
          <h3>{item.title}</h3><p>{item.summary}</p>
          <div className="everyagent-evidence">{item.evidence.map(evidence => <a key={evidence.id} href={evidence.href} {...(evidence.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{evidence.label}<ExternalLink size={12} aria-hidden="true" /></a>)}</div>
          <div className="everyagent-review">{item.status === "needs_review" ? <button type="button" disabled={busy} onClick={() => { void command({ action: "review", workId: item.id }).catch(() => {}); }}><Check size={15} />Mark reviewed</button> : <span><Check size={14} />{item.reviewedAt ? `Reviewed ${agentTime(item.reviewedAt)}` : "Check completed"}</span>}</div>
        </article>)}</div>
        {work.length > visibleCount && <button type="button" className="min-h-11 text-sm text-[#087d64]" onClick={() => setVisibleCount(count => count + 50)}>Show more work ({work.length - visibleCount} remaining)</button>}
      </section>
      <details className="everyagent-history"><summary>Check history</summary>{data.runs.length ? <ul>{data.runs.map(run => <li key={run.id}><span>{data.skills.find(skill => skill.id === run.skillId)?.title}</span><span>{run.status.replaceAll("_", " ")}</span><time>{agentTime(run.finishedAt)}</time></li>)}</ul> : <p>No checks recorded yet.</p>}</details>
      <p className="everyagent-footer">Updates stay in the app. Email delivery is off.</p>
    </>}
  </main>;
}
