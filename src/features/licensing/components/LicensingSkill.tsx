import { ArrowRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { LicensingLibrary, LicensingUpdates } from "../../../../shared/licensing-contracts.mjs";
import { licensingQuestions } from "../licensingQuestions";
import { licensingDate } from "./LicensingReportReader";
import AgentWorkCard from "../../agent/components/AgentWorkCard";

export default function LicensingSkill({ library, community, feed, failed, onAsk, agentMode }: {
  library: LicensingLibrary; community: string; feed: LicensingUpdates | null; failed: boolean;
  agentMode: boolean;
  onAsk: (question: string, community: string, q?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState(community);
  function ask(question: string, q?: string) { onAsk(question, scope, q); setExpanded(false); }
  const needsReview = failed || feed?.status === "failed";
  const status = needsReview ? "Latest check needs attention" : feed?.status === "complete" ? "Latest check complete" : feed ? "Waiting for the first check" : "Loading check status…";
  return <section aria-label="Licensing skill" data-agent-skill="licensing" className="licensing-agent">
    <AgentWorkCard skill="Licensing" status={status} needsAttention={needsReview} agentMode={agentMode}
      mode={library.monitoring === "platform_scheduled" ? "Scheduled monitoring" : "Archived reports"}
      summary={needsReview ? "The last complete report collection is still available below." : "State reports collected, organized, and ready to review."}
      facts={[
        { label: "State reports", value: `${library.totalReports} archived · ${library.communities.length} communities` },
        { label: "Last check", value: feed?.lastChecked ? licensingDate(feed.lastChecked) : "Not available" },
        { label: "Automatic checks", value: feed?.schedule ? "Mon & Wed · 9 a.m. Pacific" : "Schedule not available" }
      ]} />
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
