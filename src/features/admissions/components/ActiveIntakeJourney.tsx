import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AdmissionsBoardCard, AdmissionsReferralPipeline } from "../../../shared/types/platformSnapshot";
import { CALIFORNIA_COMMUNITIES } from "../../california/data/californiaCommunities";
import { isAcceptedReferral } from "../schedule";
import { activeIntakeCards, hasCompleteIntakeBoard, intakeStage, INTAKE_STAGES as stages } from "../../../../shared/admissions-intake.mjs";
import "./active-intake-journey.css";

type Pipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;
function actions(card: AdmissionsBoardCard) {
  return [
    card.flags.moveInOverdue && "Planned move-in date passed without a recorded outcome",
    isAcceptedReferral(card.status) && !card.plannedAdmissionDate && "Accepted; move-in date not recorded",
    !card.facilityId && "Community not assigned",
    (!card.owner || card.owner === "Unassigned") && "Assessor not assigned"
  ].filter((value): value is string => Boolean(value));
}
function source(card: AdmissionsBoardCard, pipeline: Pipeline) {
  const recent = pipeline.briefing.status === "ready" ? pipeline.briefing.recentReferrals.find(row => row.referralId === card.referralId) : null;
  const value = card.managementProfile.referralSource || recent?.sourceName || null;
  return value?.trim().toLowerCase() === "referral packet" ? null : value;
}
function setting(card: AdmissionsBoardCard, pipeline: Pipeline) {
  const value = card.managementProfile.overview.find(row => /^current setting\s*:/i.test(row))?.replace(/^current setting\s*:\s*/i, "").trim() || source(card, pipeline);
  if (!value) return "Setting not recorded";
  if (/\b(home|household|family home|mother.s house|father.s house|own apartment|own home)\b/i.test(value) && !/\b(guest home|group home|board and care|care home|residential home)\b/i.test(value)) return "Home";
  if (/\b(jail|prison|correctional|detention)\b/i.test(value)) return "Justice setting";
  if (/\b(snf|skilled nursing|post.?acute|nursing facility)\b/i.test(value)) return "Skilled nursing / post-acute";
  if (/\b(hospital|inpatient|medical center|phf|psychiatric health facility|sfgh|lagmc)\b/i.test(value)) return "Hospital / inpatient";
  if (/\b(crtp|mhrc|residential|treatment center|guest home|group home|rehab center|recovery residence|board and care)\b/i.test(value)) return "Residential care / treatment";
  if (/\b(outpatient|community services)\b/i.test(value)) return "Community / outpatient";
  return "Setting not recorded";
}
function county(card: AdmissionsBoardCard, pipeline: Pipeline) {
  const recent = pipeline.briefing.status === "ready" ? pipeline.briefing.recentReferrals.find(row => row.referralId === card.referralId) : null;
  return card.managementProfile.referringCounty || recent?.referringCounty || "Not recorded";
}
function counts(values: string[], missingLabel: string) {
  const result = new Map<string, { label: string; count: number }>();
  for (const value of values) {
    const label = value.trim() || missingLabel; const key = label.toLocaleLowerCase("en-US");
    const row = result.get(key);
    if (row) row.count += 1; else result.set(key, { label, count: 1 });
  }
  return [...result.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
function Breakdown({ title, values, missingLabel = "Not recorded" }: { title: string; values: string[]; missingLabel?: string }) {
  const [expanded, setExpanded] = useState(false);
  const rows = counts(values, missingLabel);
  return <section className="intake-breakdown"><h3>{title}</h3><dl>{(expanded ? rows : rows.slice(0, 5)).map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.count}</dd></div>)}</dl>
    {rows.length > 5 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show ${rows.length - 5} more`}</button>}
  </section>;
}

export default function ActiveIntakeJourney({ pipeline, facilityId = null, onOpenCard }: {
  pipeline: Pipeline | null; facilityId?: string | null; onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const [stage, setStage] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  if (!pipeline) return <p role="status">Active intake is unavailable while the Pipeline feed is disconnected.</p>;
  const all = activeIntakeCards(pipeline);
  if (!hasCompleteIntakeBoard(pipeline)) return <p role="status">The active intake list is incomplete. Open Pipeline for the full referral record; no partial list is charted as the total.</p>;
  const communityOrder = new Map(CALIFORNIA_COMMUNITIES.map((community, index) => [community.facilityId, index]));
  const cards = all.filter(card => !facilityId || card.facilityId === facilityId);
  const visible = cards.filter(card => !stage || intakeStage(card) === stage).sort((a, b) => (communityOrder.get(a.facilityId || "") ?? 99) - (communityOrder.get(b.facilityId || "") ?? 99));
  const selected = visible.find(card => card.referralId === selectedId) ?? visible.find(card => actions(card).length) ?? visible[0];
  const generated = new Date(pipeline.generatedAt);
  const updated = Number.isNaN(generated.getTime()) ? "time unavailable" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(generated);
  return <section className="active-intake" aria-label="Active intake" data-admissions-journey="complete">
    <div className="active-intake-layout">
      <section className="intake-list" aria-label="Active referrals">
        <header><label className="intake-stage-control"><span aria-hidden="true">{stages.find(value => value.key === stage)?.label ?? "Active intake"} <strong>{visible.length}</strong><ChevronDown size={16} /></span>
          <select aria-label="Intake stage" value={stage} onChange={event => { setStage(event.target.value); setSelectedId(null); }}>
            <option value="">All stages · {cards.length}</option>{stages.map(value => <option key={value.key} value={value.key}>{value.label} · {cards.filter(card => intakeStage(card) === value.key).length}</option>)}
          </select></label><time dateTime={pipeline.generatedAt}>Updated {updated}</time></header>
        {visible.length ? <ul>{visible.map(card => <li key={card.referralId}><button type="button" aria-pressed={selected?.referralId === card.referralId} onClick={() => setSelectedId(card.referralId)}>
          <span><strong>{card.clientName}</strong><small>{card.facilityId ? card.community : "Community not assigned"} · {card.owner || "Unassigned"}</small></span>
          <span className="intake-row-status">{stages.find(value => value.key === intakeStage(card))?.label}{actions(card).length > 0 && <small className="intake-action-needed">Action needed</small>}</span>
        </button></li>)}</ul> : <p className="intake-empty">No active referrals in this view.</p>}
      </section>
      {selected && <aside className="intake-file" aria-label={`Selected referral: ${selected.clientName}`}>
        <header><h2>{selected.clientName}</h2><p>{selected.facilityId ? selected.community : "Community not assigned"} · Referral #{selected.referralId}</p></header>
        <p className="intake-file-status">{stages.find(value => value.key === intakeStage(selected))?.label}{selected.daysOpen !== null && <> · {selected.daysOpen} {selected.daysOpen === 1 ? "day" : "days"} open</>}</p>
        <dl><div><dt>Coming from</dt><dd title={source(selected, pipeline) || undefined}>{setting(selected, pipeline)}</dd></div><div><dt>County</dt><dd>{county(selected, pipeline)}</dd></div><div><dt>Assessor</dt><dd>{selected.owner || "Unassigned"}</dd></div><div><dt>Assessment</dt><dd>{selected.managementProfile.assessmentSigned ? "Signed" : selected.managementProfile.assessmentStatus === "draft" ? "Draft; answers not shown here" : selected.managementProfile.assessmentStatus === "complete" ? "Complete; awaiting signature" : "Status not published"}</dd></div><div><dt>Updated</dt><dd>{selected.daysSinceUpdate} {selected.daysSinceUpdate === 1 ? "day" : "days"} ago</dd></div></dl>
        {actions(selected).length > 0 && <ul className="intake-file-actions">{actions(selected).map(action => <li key={action}>{action}</li>)}</ul>}
        <div className="intake-file-next"><strong>Next step in Pipeline</strong><ul>{(selected.nextAction || "Not recorded").split(/,\s*/).filter(Boolean).map((action, index) => <li key={index}>{action}</li>)}</ul></div>
        <button type="button" className="intake-file-open" onClick={() => onOpenCard(selected)}>Open client file <span aria-hidden="true">→</span></button>
      </aside>}
    </div>
    {cards.length > 0 && <details className="intake-context"><summary>Referral sources & assessors</summary><div>
      <Breakdown title="Previous setting" values={cards.map(card => setting(card, pipeline))} />
      <Breakdown title="Referring county" values={cards.map(card => county(card, pipeline))} />
      <Breakdown title="Assigned assessor" missingLabel="Not assigned" values={cards.map(card => card.owner && card.owner !== "Unassigned" ? card.owner : "Not assigned")} />
    </div></details>}
  </section>;
}
