import { useState } from "react";
import { UserRound } from "lucide-react";
import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";

import type { AdmissionsBoardCard, AdmissionsReferralPipeline } from "../../../shared/types/platformSnapshot";
import { isAcceptedReferral } from "../schedule";
import { activeIntakeCards, hasCompleteIntakeBoard, intakeStage, INTAKE_STAGES as STAGES } from "../../../../shared/admissions-intake.mjs";
import "./active-intake-journey.css";

type ConnectedPipeline = Extract<AdmissionsReferralPipeline, { status: "connected" }>;
type Breakdown = { label: string; count: number };

const COMMUNITY_COLORS: Record<string, string> = {
  "337": "#245d83",
  "342": "#68558a",
  "343": "#287063",
  "344": "#8c6429",
  "345": "#8a4f69"
};
const UNASSIGNED_COLOR = "#68777d";
const COMMUNITY_ORDER = new Map(ALAMO_FACILITIES.map((facility, index) => [facility.facilityId, index]));

export function actionMarkerReasons(card: AdmissionsBoardCard): string[] {
  const reasons: string[] = [];
  if (card.flags.moveInOverdue) reasons.push("Planned move-in date passed without a recorded outcome");
  if (isAcceptedReferral(card.status) && !card.plannedAdmissionDate) reasons.push("Accepted; move-in date not recorded");
  if (!card.facilityId) reasons.push("Community not assigned");
  if (!card.owner || card.owner === "Unassigned") reasons.push("Assessor not assigned");
  return reasons;
}

function counts(values: Array<string | null | undefined>, missingLabel: string): Breakdown[] {
  const counts = new Map<string, Breakdown>();
  for (const value of values) {
    const label = value?.trim() || missingLabel;
    const key = label.toLocaleLowerCase("en-US");
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { label, count: 1 });
  }
  return [...counts.values()].sort((left, right) =>
    right.count - left.count || left.label.localeCompare(right.label)
  );
}

function displaySource(card: AdmissionsBoardCard, pipeline: ConnectedPipeline) {
  const recent = pipeline.briefing.status === "ready"
    ? pipeline.briefing.recentReferrals.find((row) => row.referralId === card.referralId)
    : null;
  const source = card.managementProfile.referralSource || recent?.sourceName || null;
  return source?.trim().toLowerCase() === "referral packet" ? null : source;
}

function recordedSetting(card: AdmissionsBoardCard, pipeline: ConnectedPipeline) {
  const currentSetting = card.managementProfile.overview
    .find((line) => /^current setting\s*:/i.test(line))?.replace(/^current setting\s*:\s*/i, "").trim();
  const source = displaySource(card, pipeline);
  const value = currentSetting || source;
  if (!value) return "Setting not recorded";
  if (/\b(home|household|family home|mother.s house|father.s house|own apartment|own home)\b/i.test(value) &&
    !/\b(guest home|group home|board and care|care home|residential home)\b/i.test(value)) return "Home";
  if (/\b(jail|prison|correctional|detention)\b/i.test(value)) return "Justice setting";
  if (/\b(snf|skilled nursing|post.?acute|nursing facility)\b/i.test(value)) return "Skilled nursing / post-acute";
  if (/\b(hospital|inpatient|medical center|phf|psychiatric health facility|sfgh|lagmc)\b/i.test(value)) return "Hospital / inpatient";
  if (/\b(crtp|mhrc|residential|treatment center|guest home|group home|rehab center|recovery residence|board and care)\b/i.test(value)) return "Residential care / treatment";
  if (/\b(outpatient|community services)\b/i.test(value)) return "Community / outpatient";
  return "Setting not recorded";
}

function displayCounty(card: AdmissionsBoardCard, pipeline: ConnectedPipeline) {
  const recent = pipeline.briefing.status === "ready"
    ? pipeline.briefing.recentReferrals.find((row) => row.referralId === card.referralId)
    : null;
  return card.managementProfile.referringCounty || recent?.referringCounty || null;
}

function displayAssessor(card: AdmissionsBoardCard) {
  return card.owner && card.owner !== "Unassigned" ? card.owner : null;
}

function assessmentProgress(card: AdmissionsBoardCard) {
  if (card.managementProfile.assessmentSigned) return "Signed";
  if (card.managementProfile.assessmentStatus === "draft") return "Draft; answers not shown here";
  if (card.managementProfile.assessmentStatus === "complete") return "Complete; awaiting signature";
  return "Status not published";
}

export function buildJourneyPopulation(pipeline: ConnectedPipeline, facilityId: string | null = null) {
  const all = activeIntakeCards(pipeline);
  const complete = hasCompleteIntakeBoard(pipeline);
  const cards = facilityId ? all.filter((card) => card.facilityId === facilityId) : all;
  const groups = STAGES.map((stage) => ({
    ...stage,
    cards: cards.filter((card) => intakeStage(card) === stage.key).sort((left, right) =>
      (COMMUNITY_ORDER.get(left.facilityId || "") ?? 99) - (COMMUNITY_ORDER.get(right.facilityId || "") ?? 99)
    )
  }));
  return { cards, complete, groups };
}

export default function ActiveIntakeJourney({
  pipeline,
  facilityId = null,
  onOpenCard
}: {
  pipeline: ConnectedPipeline | null;
  facilityId?: string | null;
  onOpenCard: (card: AdmissionsBoardCard) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (!pipeline) {
    return <section className="admissions-journey admissions-journey-unavailable" data-admissions-journey="unavailable" role="status">
      Active intake is unavailable while the Pipeline feed is disconnected.
    </section>;
  }

  const { cards, complete, groups } = buildJourneyPopulation(pipeline, facilityId);
  if (!complete) {
    return <section className="admissions-journey" data-admissions-journey="partial">
      <div className="admissions-journey-sheet">
        <p role="status">The active intake list is incomplete. Open Pipeline for the full referral record; no partial list is charted as the total.</p>
      </div>
    </section>;
  }

  const actionCards = cards.filter((card) => actionMarkerReasons(card).length > 0);
  const selected = cards.find((card) => card.referralId === selectedId) ?? actionCards[0] ?? cards[0] ?? null;
  const selectedActions = selected ? actionMarkerReasons(selected) : [];
  const settings = counts(cards.map((card) => recordedSetting(card, pipeline)), "Setting not recorded");
  const counties = counts(cards.map((card) => displayCounty(card, pipeline)), "Not recorded");
  const assessors = counts(cards.map(displayAssessor), "Not assigned");
  const preparingToMove = groups.find((group) => group.key === "arrival")!.cards.length;
  const acceptedWithoutDate = groups.find((group) => group.key === "arrival")!.cards.filter((card) => !card.plannedAdmissionDate).length;
  const communityLegend = ALAMO_FACILITIES.filter((facility) => cards.some((card) => card.facilityId === facility.facilityId));
  const hasUnassignedCommunity = cards.some((card) => !card.facilityId);
  return <section className="admissions-journey" data-admissions-journey="complete" aria-labelledby="admissions-journey-title">
    <div className="admissions-journey-sheet">
      <h2 id="admissions-journey-title" className="sr-only">Active intake</h2>
      <div className="admissions-journey-key" aria-label="Person colors by community">
        <span className="admissions-journey-key-label">Community</span>
        {communityLegend.map((facility) => <span key={facility.facilityId}><UserRound aria-hidden="true" style={{ color: COMMUNITY_COLORS[facility.facilityId] }} />{facility.shortName}</span>)}
        {hasUnassignedCommunity ? <span><UserRound aria-hidden="true" style={{ color: UNASSIGNED_COLOR }} />Not assigned</span> : null}
        {actionCards.length ? <span className="admissions-journey-action-key"><i aria-hidden="true">!</i>Specific action needed</span> : null}
        <time className="admissions-journey-updated">Updated {formatUpdatedAt(pipeline.generatedAt)}</time>
      </div>

      {cards.length ? <div className="admissions-journey-main">
        <div className="admissions-journey-left">
        <div className="admissions-journey-chart">
          <div className="admissions-journey-overline">{cards.length} open referrals</div>
          <div className={`admissions-journey-stages ${cards.length > 80 ? "admissions-journey-bars" : ""}`}>
            {groups.map((group) => <div className="admissions-journey-stage" key={group.key} data-admissions-journey-stage={group.key}>
              <strong className="admissions-journey-count">{group.cards.length}</strong>
              <span className="admissions-journey-label">{group.label}</span>
              {cards.length <= 80 ? <span className="admissions-journey-people">
                {group.cards.map((card) => { const needsAction = actionMarkerReasons(card).length > 0; return <button type="button" key={card.referralId} onClick={() => setSelectedId(card.referralId)} title={`${card.clientName} · ${card.facilityId ? card.community : "Community not assigned"}`} aria-label={`${card.clientName}, ${group.label}, ${card.facilityId ? card.community : "community not assigned"}${needsAction ? ", specific action needed" : ""}`} aria-pressed={selected?.referralId === card.referralId} data-community={card.facilityId || "unassigned"} data-action-marker={needsAction ? "true" : "false"} className={`admissions-journey-person-button ${needsAction ? "needs-action" : ""} ${selected?.referralId === card.referralId ? "selected" : ""}`} style={{ color: COMMUNITY_COLORS[card.facilityId || ""] || UNASSIGNED_COLOR }}><UserRound className="admissions-journey-person" aria-hidden="true" />{needsAction ? <i className="admissions-journey-action-marker" aria-hidden="true">!</i> : null}</button>; })}
              </span> : <span className="admissions-journey-bar" aria-hidden="true"><span style={{ width: `${group.cards.length / cards.length * 100}%` }} /></span>}
              {group.key === "arrival" && acceptedWithoutDate > 0 ? <span className="admissions-journey-annotation">{acceptedWithoutDate} of {preparingToMove} without a move-in date</span> : null}
            </div>)}
          </div>
        </div>

        <div className="admissions-journey-analysis">
          <div className="admissions-journey-breakdown-head"><h3>Where referrals come from</h3></div>
          <div className="admissions-journey-breakdowns">
            <JourneyBreakdown title="Previous setting" rows={settings} missingLabel="Setting not recorded" />
            <JourneyBreakdown title="Referring county" rows={counties} missingLabel="Not recorded" />
            <JourneyBreakdown title="Assigned assessor" rows={assessors} missingLabel="Not assigned" />
          </div>
        </div>
        </div>

        {selected ? <aside className="admissions-journey-file" aria-label={`Selected referral: ${selected.clientName}`}>
          <div className="admissions-journey-file-heading">
            <div><h3>{selected.clientName}</h3><p>{selected.facilityId ? selected.community : "Community not assigned"} · Referral #{selected.referralId}</p></div>
          </div>
          <p className="admissions-journey-file-stage">{STAGES.find((stage) => stage.key === intakeStage(selected))?.label}<span> · </span>{selected.daysOpen == null ? "Open date unavailable" : `${selected.daysOpen} ${selected.daysOpen === 1 ? "day" : "days"} open`}</p>
          <dl>
            <div><dt>Coming from</dt><dd title={displaySource(selected, pipeline) || undefined}>{recordedSetting(selected, pipeline)}</dd></div>
            <div><dt>County</dt><dd>{displayCounty(selected, pipeline) || "Not recorded"}</dd></div>
            <div><dt>Assessor</dt><dd>{displayAssessor(selected) || "Not assigned"}</dd></div>
            <div><dt>Assessment</dt><dd>{assessmentProgress(selected)}</dd></div>
            <div><dt>Updated</dt><dd>{selected.daysSinceUpdate} {selected.daysSinceUpdate === 1 ? "day" : "days"} ago</dd></div>
          </dl>
          {selectedActions.length ? <div className="admissions-journey-action-note"><strong>Specific action needed</strong><ul>{selectedActions.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
          <div className="admissions-journey-next"><span>Next step in Pipeline</span><ul>{(selected.nextAction || "Not recorded").split(/,\s*/).filter(Boolean).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div>
          <button type="button" className="admissions-journey-open" onClick={() => onOpenCard(selected)}>Open client file <span aria-hidden="true">→</span></button>
        </aside> : null}
      </div> : <p className="admissions-journey-empty">No active referrals are recorded in the current Pipeline feed.</p>}
    </div>
  </section>;
}

function JourneyBreakdown({ title, rows, missingLabel }: { title: string; rows: Breakdown[]; missingLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, 5);
  const largest = Math.max(1, ...rows.map((row) => row.count));
  return <div className="admissions-journey-breakdown">
    <h4>{title}</h4>
    <div className="admissions-journey-breakdown-rows">{visible.map((row) => <div className={`admissions-journey-breakdown-row ${row.label === missingLabel ? "missing" : ""}`} key={row.label}>
      <span title={row.label}>{row.label}</span>
      <span className="admissions-journey-breakdown-track"><i style={{ width: `${row.count / largest * 100}%` }} /></span>
      <strong>{row.count}</strong>
    </div>)}</div>
    {rows.length > 5 ? <button type="button" className="admissions-journey-breakdown-more" onClick={() => setExpanded((current) => !current)}>{expanded ? "Show fewer" : `Show ${rows.length - 5} more`}</button> : null}
  </div>;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "time unavailable" : new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles"
  }).format(date);
}
