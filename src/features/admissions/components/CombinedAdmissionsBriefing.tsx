import { useState } from "react";
import type {
  AdmissionsPipelineBriefing,
  AdmissionsPipelineMovingClient,
  AdmissionsWeeklyBriefing
} from "../../../shared/types/platformSnapshot";

type ReadyBriefing = Extract<AdmissionsPipelineBriefing, { status: "ready" }>;
type ClientContext = { sourceName?: string | null; referringCounty?: string | null; priorPlacement?: string | null; owner: string };
type MovingPhase = AdmissionsPipelineMovingClient["phase"];

const phases: { key: MovingPhase; label: string; hint: string }[] = [
  { key: "needs_date", label: "Needs admit date", hint: "Accepted, no date planned" },
  { key: "awaiting_arrival", label: "Awaiting arrival", hint: "Planned, not yet admitted" },
  { key: "intake_assessment", label: "Intake & assessment", hint: "Before a decision" },
  { key: "decision_pending", label: "Decision pending", hint: "Assessment finished" }
];

function dateLabel(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", timeZone: "UTC"
  }).format(date);
}

function contextLabel(row: ClientContext) {
  return `Origin: ${row.sourceName || "not recorded"} · County: ${row.referringCounty || "not recorded"} · Prior placement: ${row.priorPlacement || "not recorded"} · Assessor: ${row.owner}`;
}

export default function CombinedAdmissionsBriefing({
  census, pipeline
}: { census: AdmissionsWeeklyBriefing; pipeline: ReadyBriefing }) {
  const [selectedPhase, setSelectedPhase] = useState<MovingPhase | "all" | null>(null);
  const [communityFilter, setCommunityFilter] = useState("all");
  const [assessorFilter, setAssessorFilter] = useState("all");
  const communities = census.communities
    .filter((row) => row.census !== null && row.facilityId !== "unassigned")
    .sort((left, right) => (right.census ?? 0) - (left.census ?? 0));
  const largest = Math.max(1, ...communities.map((row) => row.census ?? 0));
  const admitted = pipeline.admittedLastWeek ?? [];
  const planned = pipeline.plannedMoveIns;
  const moving = pipeline.movingThrough ?? [];
  const hasLastWeek = pipeline.lastWeekStart && pipeline.lastWeekEnd;
  const coverage = pipeline.coverage;
  const phase = selectedPhase ?? phases.find(({ key }) => moving.some((row) => row.phase === key))?.key ?? "all";
  const movingCommunities = [...new Set(moving.map((row) => row.community))].sort();
  const assessors = [...new Set(moving.map((row) => row.owner))].sort();
  const community = movingCommunities.includes(communityFilter) ? communityFilter : "all";
  const assessor = assessors.includes(assessorFilter) ? assessorFilter : "all";
  const visible = moving.filter((row) => (phase === "all" || row.phase === phase) && (community === "all" || row.community === community) && (assessor === "all" || row.owner === assessor));

  return <article data-admissions-combined-briefing="true" aria-labelledby="combined-admissions-title" className="mx-auto max-w-[1160px] border border-[#d7ddd7] border-t-[5px] border-t-[#087c64] bg-white text-[#202b24]">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#26352b] px-5 py-7 sm:px-9">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#087c64]">Platform admissions · Weekly briefing</p>
        <h2 id="combined-admissions-title" className="mt-1 text-[32px] font-bold tracking-[-0.05em] sm:text-[44px]">Admissions &amp; census</h2>
        <p className="mt-1 text-[14px] text-[#617067]">Week of {dateLabel(pipeline.weekStart)} · Current residents, admissions, and clients still moving through Pipeline.</p></div>
    </header>

    <section aria-labelledby="combined-census-title" className="border-b border-[#e2e6e1] px-5 py-7 sm:px-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#087c64]">Current census · {dateLabel(census.asOfDate)}</p><h3 id="combined-census-title" className="mt-1 text-[27px] font-semibold tracking-[-0.04em]">Census by community</h3></div>
        <p className="text-[13px] text-[#667168]">{census.totals.census === null ? "Total unavailable" : <><strong className="mr-1 text-[31px] tabular-nums text-[#087c64]">{census.totals.census}</strong> residents</>}</p>
      </div>
      {communities.length ? <ul className="mt-5">{communities.map((row) => <li key={row.facilityId} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,1.4fr)_auto] items-center gap-4 border-t border-[#e8ece7] py-2 max-sm:grid-cols-[minmax(0,1fr)_auto]">
        <a href={`/communities/${encodeURIComponent(row.facilityId)}?focus=census`} className="text-[14px] font-semibold text-[#096f57] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={`Explore ${row.shortName} census`}>{row.shortName} <span aria-hidden="true">↗</span></a>
        <span className="h-2.5 rounded-full bg-[#edf1ed] max-sm:col-span-2 max-sm:row-start-2"><span className="block h-full rounded-full bg-[#087c64]" style={{ width: `${(row.census ?? 0) / largest * 100}%` }} /></span>
        <strong className="text-right text-[17px] tabular-nums">{row.census}</strong>
      </li>)}</ul> : <p className="mt-5 text-[14px] text-[#657267]">Community census is unavailable in this snapshot.</p>}
    </section>

    <div className="grid border-b border-[#e2e6e1] lg:grid-cols-2">
      <WeekList title="Admitted last week" period={hasLastWeek ? `${dateLabel(pipeline.lastWeekStart!)}–${dateLabel(pipeline.lastWeekEnd!)}` : "Previous week"} complete={coverage.admittedLastWeek === true} empty="No recorded admissions last week." rows={admitted.map((row) => ({ key: row.referralId, name: row.clientName, date: row.admittedAt, detail: row.community, context: contextLabel(row), url: row.pipelineUrl }))} />
      <WeekList title="Planned admits this week" period={`${dateLabel(pipeline.weekStart)}–${dateLabel(pipeline.weekEnd)}`} complete={coverage.moveIns} empty="No planned admits this week." rows={planned.map((row) => ({ key: row.referralId, name: row.clientName, date: row.plannedAt, detail: `${row.community} · ${row.readiness === "blocked" ? "Requirements open" : row.readiness === "watch" ? "Review requirements" : "Ready"}`, context: contextLabel(row), url: row.pipelineUrl }))} />
    </div>

    <section aria-labelledby="combined-moving-title" className="px-5 py-7 sm:px-9">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#087c64]">Current work</p><h3 id="combined-moving-title" className="mt-1 text-[27px] font-semibold tracking-[-0.04em]">Clients moving through</h3></div><span className="text-[13px] text-[#68746b]">{coverage.movingThrough === false && !moving.length ? "Unavailable" : `${moving.length}${coverage.movingThrough === false ? "+" : ""} active`}</span></div>
      {moving.length ? <>
        <div className="mt-5 grid grid-cols-2 border border-[#e2e6e1] md:grid-cols-4" aria-label="Choose clients to review">{phases.map(({ key, label, hint }) => { const count = moving.filter((row) => row.phase === key).length; return <button key={key} type="button" disabled={!count} aria-pressed={phase === key} onClick={() => setSelectedPhase(key)} className={`min-w-0 border-r border-[#e2e6e1] border-t-4 px-3 py-3 text-left last:border-r-0 disabled:cursor-default disabled:opacity-45 md:px-4 ${phase === key ? "border-t-[#087c64] bg-[#eaf3ed]" : "border-t-transparent bg-white hover:bg-[#f8faf7]"}`}><strong className="block text-[28px] font-semibold leading-none tabular-nums text-[#087c64]">{count}</strong><span className="mt-1 block text-[13px] font-semibold">{label}</span><small className="block text-[11px] text-[#67756b] max-sm:hidden">{hint}</small></button>; })}</div>
        <div className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><h4 className="text-[20px] font-semibold tracking-[-0.03em]">{phase === "all" ? "All active clients" : phases.find((item) => item.key === phase)?.label}</h4><p className="mt-0.5 text-[12px] text-[#68746b]">{visible.length} shown · Select a client to open the Pipeline workspace</p></div><button type="button" aria-pressed={phase === "all"} onClick={() => setSelectedPhase("all")} className="text-[12px] font-semibold text-[#096f57] hover:underline">View all {moving.length}</button></div>
          <div className="mt-4 flex flex-wrap gap-3 sm:gap-5"><label className="flex items-center gap-2 text-[12px] font-semibold text-[#627066]">Community <select value={community} onChange={(event) => setCommunityFilter(event.target.value)} className="min-h-9 max-w-[210px] border border-[#cbd4ca] bg-white px-2 text-[#25362b]"><option value="all">All communities</option>{movingCommunities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="flex items-center gap-2 text-[12px] font-semibold text-[#627066]">Assessor <select value={assessor} onChange={(event) => setAssessorFilter(event.target.value)} className="min-h-9 max-w-[210px] border border-[#cbd4ca] bg-white px-2 text-[#25362b]"><option value="all">All assessors</option>{assessors.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
          {visible.length ? <ul className="mt-4">{visible.map((row) => <li key={row.referralId} className="grid gap-x-5 gap-y-1 border-t border-[#e8ece7] py-3 text-[12px] sm:grid-cols-2"><div><a href={row.pipelineUrl} className="text-[14px] font-semibold text-[#096f57] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">{row.clientName} <span aria-hidden="true">↗</span></a><p className="text-[#68746b]">{row.community} · {row.owner}</p></div><div><strong className="font-semibold">{row.status}</strong>{row.plannedAt ? <p className={row.plannedAt < pipeline.windowEnd ? "font-semibold text-[#9b5d26]" : "text-[#68746b]"}>Planned {dateLabel(row.plannedAt)}{row.plannedAt < pipeline.windowEnd ? " · Date passed" : ""}</p> : null}</div><p className="break-words text-[#68746b] sm:col-span-2">{contextLabel(row)}</p></li>)}</ul> : <p className="mt-5 text-[13px] text-[#68746b]">No clients match these filters.</p>}
        </div>
      </> : <p className="mt-5 text-[14px] text-[#657267]">{coverage.movingThrough === true ? "No active clients on the Pipeline board." : "Pipeline movement is unavailable."}</p>}
      {coverage.movingThrough === false ? <p className="mt-4 text-[12px] text-[#7a6845]">The list is capped; more clients may be on the board.</p> : null}
    </section>
    <footer className="border-t border-[#e2e6e1] px-5 py-4 text-[12px] text-[#68746b] sm:px-9">Census: Platform clinical snapshot. Admissions: Pipeline referral records updated {dateLabel(pipeline.windowEnd)}. Planned dates are not confirmed arrivals.</footer>
  </article>;
}

function WeekList({ title, period, complete, empty, rows }: { title: string; period: string; complete: boolean; empty: string; rows: Array<{ key: number; name: string; date: string; detail: string; context: string; url: string }> }) {
  return <section aria-label={title} className="min-w-0 px-5 py-7 sm:px-9 lg:first:border-r lg:first:border-[#e2e6e1]">
    <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#087c64]">{period}</p><h3 className="mt-1 text-[25px] font-semibold tracking-[-0.04em]">{title}</h3></div><strong className="text-[30px] tabular-nums text-[#087c64]">{!complete && !rows.length ? "—" : `${rows.length}${complete ? "" : "+"}`}</strong></div>
    {rows.length ? <ul className="mt-4">{rows.map((row) => <li key={row.key} className="border-t border-[#e8ece7] py-3 text-[12px] leading-5"><div className="flex flex-wrap items-baseline justify-between gap-x-3"><a href={row.url} className="text-[14px] font-semibold text-[#096f57] hover:underline">{row.name}</a><time className="text-[#68746b]">{dateLabel(row.date)}</time></div><p className="text-[#506057]">{row.detail}</p><p className="break-words text-[#68746b]">{row.context}</p></li>)}</ul> : <p className="mt-5 text-[13px] text-[#67756b]">{complete ? empty : "Admissions records are unavailable."}</p>}
    {!complete ? <p className="mt-3 text-[12px] text-[#7a6845]">The list is capped or unavailable; this is not a complete count.</p> : null}
  </section>;
}
