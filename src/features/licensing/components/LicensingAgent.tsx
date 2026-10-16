import { ArrowRight, ChevronDown, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { LicensingLibrary, LicensingUpdates } from "../../../../shared/licensing-contracts.mjs";
import { licensingQuestions } from "../licensingQuestions";
import { licensingDate } from "./LicensingReportReader";

export default function LicensingAgent({ library, community, feed, failed, onAsk }: {
  library: LicensingLibrary; community: string; feed: LicensingUpdates | null; failed: boolean;
  onAsk: (question: string, community: string, q?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState(community);
  function ask(question: string, q?: string) { onAsk(question, scope, q); setExpanded(false); }
  const needsReview = failed || feed?.status === "failed";
  const status = needsReview ? "Latest check needs attention" : feed?.status === "complete" ? "Latest check complete" : feed ? "Waiting for the first check" : "Loading check status…";
  return <section aria-label="Licensing agent" data-licensing-agent="true" className="licensing-agent">
    <div className="licensing-agent__worker">
      <div className="licensing-agent__identity"><ShieldCheck size={24} aria-hidden="true" /><h1>Licensing agent</h1><span>{library.monitoring === "platform_scheduled" ? "Scheduled monitoring" : "Archived reports"}</span></div>
      <p className="licensing-agent__status" role={needsReview ? "alert" : "status"}>{status}</p>
      <p>{needsReview ? "The last complete report collection is still available below." : "State reports collected, organized, and ready to review."}</p>
      <dl className="licensing-agent__work"><div><dt>State reports</dt><dd>{library.totalReports} archived · {library.communities.length} communities</dd></div><div><dt>Last check</dt><dd>{feed?.lastChecked ? licensingDate(feed.lastChecked) : "Not available"}</dd></div><div><dt>Automatic checks</dt><dd>{feed?.schedule ? "Mon & Wed · 9 a.m. Pacific" : "Schedule not available"}</dd></div></dl>
    </div>
    <button type="button" className="licensing-agent__trigger" aria-expanded={expanded} aria-controls="licensing-agent-questions" onClick={() => setExpanded(!expanded)}>
      <span>Explore reports</span><ChevronDown size={16} aria-hidden="true" className={expanded ? "rotate-180" : ""} />
    </button>
    {expanded && <div id="licensing-agent-questions" className="licensing-agent__questions">
      <label className="licensing-agent__scope">Community<select aria-label="Licensing community" value={scope} onChange={event => setScope(event.target.value)}>
        <option value="">All communities</option>{library.communities.map(item => <option key={item.facilityId} value={item.facilityId}>{item.name}</option>)}
      </select></label>
      <div className="licensing-agent__suggestions">{licensingQuestions.map(item => <button type="button" key={item.id} onClick={() => ask(item.id)}>{item.title}<ArrowRight size={16} aria-hidden="true" /></button>)}</div>
      <form data-licensing-search="true" className="licensing-agent__search" onSubmit={event => {
        event.preventDefault(); const q = String(new FormData(event.currentTarget).get("q") ?? "").trim(); if (q) ask("search", q);
      }}>
        <label htmlFor="licensing-question">Or find reports by community, topic, finding, or year</label>
        <div><input id="licensing-question" name="q" aria-label="Ask about licensing reports" required maxLength={200} placeholder="e.g. San Pablo medication findings in 2025" /><button type="submit" aria-label="Find licensing reports"><ArrowRight size={20} aria-hidden="true" /></button></div>
      </form>
    </div>}
  </section>;
}
