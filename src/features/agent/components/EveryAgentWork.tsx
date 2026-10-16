import { ArrowUpRight, Check } from "lucide-react";
import type { EveryAgentWork as Work } from "../../../../shared/everyagent-contracts.mjs";
import { useEveryAgent } from "../EveryAgentContext";
import { agentTime } from "./EveryAgentResponsibility";

export default function EveryAgentWork({ item, compact = false }: { item: Work; compact?: boolean }) {
  const { data, busy, command } = useEveryAgent();
  return <article className={`everyagent-work-item${compact ? " everyagent-work-item--compact" : ""}`}>
    <div className="everyagent-row"><span className="everyagent-eyebrow">{data?.skills.find(skill => skill.id === item.skillId)?.title}</span><span className="everyagent-date">{agentTime(item.createdAt)}</span></div>
    <h3>{item.title}</h3><p>{item.summary}</p>
    <div className="everyagent-evidence">{item.evidence.map(evidence => <a key={evidence.id} href={evidence.href} {...(evidence.href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{evidence.label}<ArrowUpRight size={14} aria-hidden="true" /></a>)}</div>
    {!compact && <div className="everyagent-review">{item.status === "needs_review" ? <button type="button" disabled={busy} onClick={() => { void command({ action: "review", workId: item.id }).catch(() => {}); }}><Check size={15} />Mark reviewed</button> : <span><Check size={14} />{item.reviewedAt ? `Reviewed ${agentTime(item.reviewedAt)}` : "Check completed"}</span>}</div>}
  </article>;
}
