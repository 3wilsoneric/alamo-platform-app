import type {
  AdmissionsPipelineBriefing,
  AdmissionsWeeklyBriefing
} from "../../../shared/types/platformSnapshot";

type ReadyBriefing = Extract<AdmissionsPipelineBriefing, { status: "ready" }>;
type ClientContext = { sourceName?: string | null; referringCounty?: string | null; priorPlacement?: string | null; owner: string };

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
  const communities = census.communities
    .filter((row) => row.census !== null && row.facilityId !== "unassigned")
    .sort((left, right) => (right.census ?? 0) - (left.census ?? 0));
  const largest = Math.max(1, ...communities.map((row) => row.census ?? 0));
  const admitted = pipeline.admittedLastWeek ?? [];
  const planned = pipeline.plannedMoveIns;
  const didNotMoveIn = pipeline.didNotMoveIn ?? [];
  const hasLastWeek = pipeline.lastWeekStart && pipeline.lastWeekEnd;
  const coverage = pipeline.coverage;

  return <article data-admissions-combined-briefing="true" aria-labelledby="combined-admissions-title" className="mx-auto border border-[#c4d2dc] border-t-[5px] border-t-[#164d7c] bg-[#fcfbf7] text-[#16283a]">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#c9d5de] px-5 py-7 sm:px-9">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1c5a83]">Platform admissions · Weekly briefing</p>
        <h2 id="combined-admissions-title" className="mt-1 text-[32px] font-bold tracking-[-0.05em] sm:text-[44px]">Admissions &amp; census</h2>
        <p className="mt-1 text-[14px] text-[#617067]">Week of {dateLabel(pipeline.weekStart)} · Current residents and admission activity.</p></div>
    </header>

    <section aria-labelledby="combined-census-title" data-admissions-census-section="true" className="border-b border-[#e2e6e1] px-5 py-7 sm:px-9">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1c5a83]">Current census · {dateLabel(census.asOfDate)}</p><h3 id="combined-census-title" className="mt-1 text-[27px] font-semibold tracking-[-0.04em]">Census by community</h3></div>
        <p className="text-[13px] text-[#667168]">{census.totals.census === null ? "Total unavailable" : <><strong data-admissions-census-total="true" className="mr-1 text-[31px] tabular-nums text-[#164d7c]">{census.totals.census}</strong> residents</>}</p>
      </div>
      {communities.length ? <ul className="mt-5">{communities.map((row) => <li key={row.facilityId} className="grid grid-cols-[minmax(0,1fr)_minmax(80px,1.4fr)_auto] items-center gap-4 border-t border-[#e8ece7] py-2 max-sm:grid-cols-[minmax(0,1fr)_auto]">
        <span data-admissions-census-name="true" className="text-[14px] font-semibold text-[#16283a]">{row.shortName}</span>
        <span data-admissions-census-track="true" className="h-2.5 rounded-full bg-[#e4edf4] max-sm:col-span-2 max-sm:row-start-2"><span data-admissions-census-bar="true" className="block h-full rounded-full bg-[#1b5a8b]" style={{ width: `${(row.census ?? 0) / largest * 100}%` }} /></span>
        <strong className="text-right text-[17px] tabular-nums">{row.census}</strong>
      </li>)}</ul> : <p className="mt-5 text-[14px] text-[#657267]">Community census is unavailable in this snapshot.</p>}
    </section>

    <div data-admissions-week-lists="true" className="grid border-b border-[#e2e6e1] lg:grid-cols-2">
      <WeekList title="Admitted last week" period={hasLastWeek ? `${dateLabel(pipeline.lastWeekStart!)}–${dateLabel(pipeline.lastWeekEnd!)}` : "Previous week"} complete={coverage.admittedLastWeek === true} empty="No recorded admissions last week." rows={admitted.map((row) => ({ key: row.referralId, name: row.clientName, date: row.admittedAt, detail: row.community, context: contextLabel(row), url: row.pipelineUrl }))} />
      <WeekList title="Planned admits this week" period={`${dateLabel(pipeline.weekStart)}–${dateLabel(pipeline.weekEnd)}`} complete={coverage.moveIns} empty="No planned admits this week." rows={planned.map((row) => ({ key: row.referralId, name: row.clientName, date: row.plannedAt, detail: `${row.community} · ${row.readiness === "blocked" ? "Requirements open" : row.readiness === "watch" ? "Review requirements" : "Ready"}`, context: contextLabel(row), url: row.pipelineUrl }))} />
    </div>

    {coverage.didNotMoveIn !== undefined ? <div data-admissions-did-not-move="true" className="border-b border-[#e2e6e1]">
      <WeekList title="Did not move in" period="Recorded in the past 30 days" complete={coverage.didNotMoveIn} empty="No placements were recorded as did not move in during this period." standalone rows={didNotMoveIn.map((row) => ({ key: row.referralId, name: row.clientName, date: row.cancelledAt, detail: `${row.community} · ${row.status}`, context: contextLabel(row), url: row.pipelineUrl }))} />
    </div> : null}

    <footer className="border-t border-[#e2e6e1] px-5 py-4 text-[12px] text-[#68746b] sm:px-9">Census: Platform clinical snapshot. Admissions: Pipeline referral records updated {dateLabel(pipeline.windowEnd)}. Planned dates are not confirmed arrivals.</footer>
  </article>;
}

function WeekList({ title, period, complete, empty, rows, standalone = false }: { title: string; period: string; complete: boolean; empty: string; standalone?: boolean; rows: Array<{ key: number; name: string; date: string; detail: string; context: string; url: string }> }) {
  return <section aria-label={title} data-admissions-week-list={title} className={`min-w-0 px-5 py-7 sm:px-9 ${standalone ? "" : "lg:first:border-r lg:first:border-[#e2e6e1]"}`}>
    <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#1c5a83]">{period}</p><h3 className="mt-1 text-[25px] font-semibold tracking-[-0.04em]">{title}</h3></div><strong data-admissions-week-count="true" className="text-[30px] tabular-nums text-[#164d7c]">{!complete && !rows.length ? "—" : `${rows.length}${complete ? "" : "+"}`}</strong></div>
    {rows.length ? <ul className="mt-4">{rows.map((row) => <li key={row.key} className="border-t border-[#e8ece7] py-3 text-[12px] leading-5"><div className="flex flex-wrap items-baseline justify-between gap-x-3"><a href={row.url} className="text-[14px] font-semibold text-[#096f57] hover:underline">{row.name}</a><time className="text-[#68746b]">{dateLabel(row.date)}</time></div><p className="text-[#506057]">{row.detail}</p><p className="break-words text-[#68746b]">{row.context}</p></li>)}</ul> : <p className="mt-5 text-[13px] text-[#67756b]">{complete ? empty : "Admissions records are unavailable."}</p>}
    {!complete ? <p className="mt-3 text-[12px] text-[#7a6845]">The list is capped or unavailable; this is not a complete count.</p> : null}
  </section>;
}
