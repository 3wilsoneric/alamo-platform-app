import { ArrowRight, ChevronDown, MessageCircle } from "lucide-react";
import { useState } from "react";
import type { LicensingLibrary } from "../../../../shared/licensing-contracts.mjs";
import { licensingQuestions } from "../licensingQuestions";

export default function LicensingAgent({ communities, community, answered, onAsk }: {
  communities: LicensingLibrary["communities"]; community: string; answered: boolean;
  onAsk: (question: string, community: string, q?: string) => void;
}) {
  const [expanded, setExpanded] = useState(!answered);
  const [scope, setScope] = useState(community);
  function ask(question: string, q?: string) { onAsk(question, scope, q); setExpanded(false); }
  return <section aria-label="Licensing agent" data-licensing-agent="true" className="licensing-agent">
    <button type="button" className="licensing-agent__trigger" aria-expanded={expanded} aria-controls="licensing-agent-questions" onClick={() => setExpanded(!expanded)}>
      <MessageCircle size={20} aria-hidden="true" /><span>Licensing agent</span><ChevronDown size={18} aria-hidden="true" className={expanded ? "rotate-180" : ""} />
    </button>
    {expanded && <div id="licensing-agent-questions" className="licensing-agent__questions">
      <h1>What would you like to know?</h1>
      <p>Explore findings and correction plans from the state’s licensing reports.</p>
      <label className="licensing-agent__scope">Community<select aria-label="Licensing community" value={scope} onChange={event => setScope(event.target.value)}>
        <option value="">All communities</option>{communities.map(item => <option key={item.facilityId} value={item.facilityId}>{item.name}</option>)}
      </select></label>
      <div className="licensing-agent__suggestions">{licensingQuestions.map(item => <button type="button" key={item.id} onClick={() => ask(item.id)}>{item.prompt}<ArrowRight size={16} aria-hidden="true" /></button>)}</div>
      <form data-licensing-search="true" className="licensing-agent__search" onSubmit={event => {
        event.preventDefault(); const q = String(new FormData(event.currentTarget).get("q") ?? "").trim(); if (q) ask("search", q);
      }}>
        <label htmlFor="licensing-question">Or find reports by community, topic, finding, or year</label>
        <div><input id="licensing-question" name="q" aria-label="Ask about licensing reports" required maxLength={200} placeholder="e.g. San Pablo medication findings in 2025" /><button type="submit" aria-label="Find licensing reports"><ArrowRight size={20} aria-hidden="true" /></button></div>
      </form>
    </div>}
  </section>;
}
