import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronDown, RefreshCw, SlidersHorizontal } from "lucide-react";
import { agentStatus, useEveryAgent } from "../EveryAgentContext";
import EveryAgentResponsibility, { agentTime } from "./EveryAgentResponsibility";
import { EveryAgentOrb } from "./EveryAgentIdentity";
import EveryAgentWork from "./EveryAgentWork";
import "../everyAgent.css";

export default function EveryAgentWorkspace() {
  const { data, error, busy, refresh, command } = useEveryAgent();
  const [filter, setFilter] = useState("latest");
  const [visibleCount, setVisibleCount] = useState(10);
  const [settings, setSettings] = useState(false);
  const needsReview = data?.work.filter(item => item.status === "needs_review").length ?? 0;
  const work = data?.work.filter(item => filter === "latest" || item.status === filter) ?? [];
  return <section className="everyagent-workspace" aria-label="EveryAgent workspace">
    <div className="everyagent-toolbar">
      <div><EveryAgentOrb /><span className="everyagent-live" role="status">{agentStatus(data, error)}</span></div>
      <div><button type="button" aria-label="Refresh EveryAgent" title="Refresh" onClick={refresh}><RefreshCw size={17} /></button><button type="button" aria-label="Manage skills" title="Manage skills" aria-expanded={settings} onClick={() => setSettings(value => !value)}><SlidersHorizontal size={17} /></button></div>
    </div>
    <nav className="everyagent-skill-links" aria-label="Connected skills">
      {data?.skills.map(skill => <Link key={skill.id} to={skill.href}>{skill.title}<ArrowUpRight size={14} /></Link>)}
      <Link to="/analytics/questions">Ask a question<ArrowUpRight size={14} /></Link>
    </nav>
    {error && <div role="alert" className="everyagent-error">{error}<button type="button" onClick={refresh}>Try again</button></div>}
    {settings && data && <section className="everyagent-manage-panel" aria-label="Manage skills"><div className="everyagent-section-title"><h2>Skills</h2><button type="button" onClick={() => setSettings(false)}>Done</button></div>
      {data.skills.map(skill => { const responsibility = data.responsibilities.find(item => item.skillId === skill.id); return responsibility ? <EveryAgentResponsibility key={`${skill.id}-${responsibility.version}`} skill={skill} responsibility={responsibility} busy={busy} onCommand={command} /> : null; })}
      <p className="everyagent-notification-setting">Email notifications are off.</p>
    </section>}
    {!data ? <p role="status" className="everyagent-loading">Loading updates…</p> : <>
      <section aria-label="Updates">
        <div className="everyagent-filters" role="group" aria-label="Filter work">{[["latest", "Latest"], ["needs_review", `Needs you${needsReview ? ` · ${needsReview}` : ""}`], ["completed", "Completed"]].map(([id, title]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id ?? "latest"); setVisibleCount(10); }}>{title}</button>)}</div>
        {!work.length && <p className="everyagent-empty">{filter === "needs_review" ? "Nothing needs review." : "No updates yet."}</p>}
        <div className="everyagent-work-list">{work.slice(0, visibleCount).map(item => <EveryAgentWork key={item.id} item={item} />)}</div>
        {work.length > visibleCount && <button type="button" className="everyagent-more" onClick={() => setVisibleCount(count => count + 10)}>Show more work ({work.length - visibleCount} remaining)<ChevronDown size={15} /></button>}
      </section>
      <details className="everyagent-history"><summary>Check history</summary>{data.runs.length ? <ul>{data.runs.map(run => <li key={run.id}><span>{data.skills.find(skill => skill.id === run.skillId)?.title}</span><span>{run.status.replaceAll("_", " ")}</span><time>{agentTime(run.finishedAt)}</time></li>)}</ul> : <p>No checks recorded yet.</p>}</details>
    </>}
  </section>;
}
