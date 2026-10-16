import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronDown, RefreshCw, SlidersHorizontal } from "lucide-react";
import { agentStatus, useEveryAgent } from "../EveryAgentContext";
import EveryAgentResponsibility, { agentTime } from "./EveryAgentResponsibility";
import { agentIntroduction, EveryAgentOrb, useAgentGreeting } from "./EveryAgentIdentity";
import EveryAgentWork from "./EveryAgentWork";
import "../everyAgent.css";

export default function EveryAgentWorkspace() {
  const { data, error, busy, refresh, command } = useEveryAgent();
  const greeting = useAgentGreeting();
  const [filter, setFilter] = useState("latest");
  const [visibleCount, setVisibleCount] = useState(10);
  const [settings, setSettings] = useState(false);
  const needsReview = data?.work.filter(item => item.status === "needs_review").length ?? 0;
  const work = data?.work.filter(item => filter === "latest" || item.status === filter) ?? [];
  return <section className="everyagent-workspace" aria-label="EveryAgent workspace">
    <header className="everyagent-masthead"><span className="everyagent-wordmark">EveryAgent<span> / Your assistant</span></span><span className="everyagent-live" role="status">{agentStatus(data, error)}</span></header>
    <div className="everyagent-layout">
      <aside className="everyagent-presence" aria-label="Your assistant">
        <EveryAgentOrb />
        <p className="everyagent-presence-caption">Here, while you work.</p>
        <div className="everyagent-skill-links"><p className="everyagent-eyebrow">My skills</p>{data?.skills.map(skill => {
          const responsibility = data.responsibilities.find(item => item.skillId === skill.id);
          return <Link key={skill.id} to={skill.href}><span><strong>{skill.title}</strong><small>{skill.applicationName} · {responsibility?.paused ? "Paused" : responsibility?.issue ? "Needs attention" : !data.workerEnabled ? "Offline" : "Watching"}</small></span><ArrowUpRight size={16} /></Link>;
        })}</div>
        <button type="button" className="everyagent-manage" aria-expanded={settings} onClick={() => setSettings(value => !value)}><SlidersHorizontal size={15} />Manage my skills</button>
      </aside>
      <div className="everyagent-briefing">
        <div className="everyagent-intro"><p className="everyagent-greeting">{greeting}</p><h1>I’m EveryAgent.</h1><p>{agentIntroduction(data)}</p></div>
        {error && <div role="alert" className="everyagent-error">{error}<button type="button" onClick={refresh}>Try again</button></div>}
        {settings && data && <section className="everyagent-manage-panel" aria-label="Manage skills"><div className="everyagent-section-title"><h2>What I watch for you</h2><button type="button" onClick={() => setSettings(false)}>Done</button></div>
          {data.skills.map(skill => { const responsibility = data.responsibilities.find(item => item.skillId === skill.id); return responsibility ? <EveryAgentResponsibility key={`${skill.id}-${responsibility.version}`} skill={skill} responsibility={responsibility} busy={busy} onCommand={command} /> : null; })}
        </section>}
        {!data ? <p role="status" className="everyagent-loading">Bringing together your latest work…</p> : <>
          <section aria-labelledby="everyagent-work"><div className="everyagent-section-title"><div><p className="everyagent-eyebrow">Your briefing</p><h2 id="everyagent-work">{needsReview ? `${needsReview} ${needsReview === 1 ? "update" : "updates"} for your attention.` : "Here’s where things stand."}</h2></div><button type="button" aria-label="Refresh EveryAgent" onClick={refresh}><RefreshCw size={15} /></button></div>
            <div className="everyagent-filters" role="group" aria-label="Filter work">{[["latest", "Latest"], ["needs_review", `Needs you${needsReview ? ` · ${needsReview}` : ""}`], ["completed", "Completed"]].map(([id, title]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id ?? "latest"); setVisibleCount(10); }}>{title}</button>)}</div>
            {!work.length && <p className="everyagent-empty">{filter === "needs_review" ? "You’re caught up. Nothing needs your review right now." : "Your first completed checks will appear here."}</p>}
            <div className="everyagent-work-list">{work.slice(0, visibleCount).map(item => <EveryAgentWork key={item.id} item={item} />)}</div>
            {work.length > visibleCount && <button type="button" className="everyagent-more" onClick={() => setVisibleCount(count => count + 10)}>Show more work ({work.length - visibleCount} remaining)<ChevronDown size={15} /></button>}
          </section>
          <div className="everyagent-next"><p>Something you want to look into?</p><Link to="/analytics/questions">Ask a question<ArrowUpRight size={16} /></Link></div>
          <details className="everyagent-history"><summary>Check history</summary>{data.runs.length ? <ul>{data.runs.map(run => <li key={run.id}><span>{data.skills.find(skill => skill.id === run.skillId)?.title}</span><span>{run.status.replaceAll("_", " ")}</span><time>{agentTime(run.finishedAt)}</time></li>)}</ul> : <p>No checks recorded yet.</p>}</details>
          <p className="everyagent-footer">Updates stay here with you. Email delivery is off.</p>
        </>}
      </div>
    </div>
  </section>;
}
