import { EveryAgentOrb } from "./EveryAgentIdentity";

export default function AgentWorkCard({ skill, status, summary, needsAttention, mode, facts }: {
  skill: string; status: string; summary: string; needsAttention: boolean; mode: string;
  facts: { label: string; value: string }[];
}) {
  return <section aria-label="EveryAgent work" className="agent-work-card">
    <div className="agent-work-card__identity"><EveryAgentOrb small /><h1>EveryAgent</h1><span className="agent-work-card__mode">{mode}</span></div>
    <p className="agent-work-card__skill"><span>Active skill</span> {skill}</p>
    <p className="agent-work-card__status" role={needsAttention ? "alert" : "status"}>{status}</p>
    <p className="agent-work-card__summary">{summary}</p>
    <dl className="agent-work-card__facts">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
  </section>;
}
