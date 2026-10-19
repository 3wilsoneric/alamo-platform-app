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
  const moving = pipeline.movingThrough ?? [];
  const hasLastWeek = pipeline.lastWeekStart && pipeline.lastWeekEnd;
  const coverage = pipeline.coverage;

  return <article data-admissions-combined-briefing="true" aria-labelledby="combined-admissions-title" className="overflow-hidden rounded-[24px] border border-[#d8ddd7] bg-white shadow-[0_10px_30px_rgba(37,61,50,0.06)]">
    <header className="border-b border-[#e2e7e1] bg-[linear-gradient(110deg,#edf4ef,#faf8f1)] px-5 py-6 sm:px-8 sm:py-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#52715f]">Weekly admissions briefing</p>
      <h2 id="combined-admissions-title" className="mt-1 text-[28px] font-semibold tracking-[-0.04em] text-[#1d3c31] sm:text-[36px]">Admissions &amp; census</h2>
      <p className="mt-2 text-[14px] leading-6 text-[#52665b]">Week of {dateLabel(pipeline.weekStart)} · Current residents, arrivals, planned admits, and clients still moving through Pipeline.</p>
    </header>

    <section aria-labelledby="combined-census-title" className="border-b border-[#e6e8e3] px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6c7e71]">Clinical snapshot · {dateLabel(census.asOfDate)}</p><h3 id="combined-census-title" className="mt-1 text-[22px] font-semibold tracking-[-0.025em] text-[#26392f]">Census by community</h3></div>
        <p className="text-[14px] text-[#657267]">{census.totals.census === null ? "Total unavailable" : <><strong className="text-[25px] tabular-nums text-[#1e5d46]">{census.totals.census}</strong> residents</>}</p>
      </div>
      {communities.length ? <ul className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">{communities.map((row) => <li key={row.facilityId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <span className="truncate text-[13px] font-medium text-[#35473c]">{row.shortName}</span><strong className="text-[15px] tabular-nums text-[#284638]">{row.census}</strong>
        <span className="col-span-2 h-2 overflow-hidden rounded-full bg-[#e9eee8]"><span className="block h-full rounded-full bg-[#5f977a]" style={{ width: `${(row.census ?? 0) / largest * 100}%` }} /></span>
      </li>)}</ul> : <p className="mt-5 text-[14px] text-[#657267]">Community census is unavailable in this snapshot.</p>}
    </section>

    <div className="grid lg:grid-cols-2">
      <WeekList title="Admitted last week" period={hasLastWeek ? `${dateLabel(pipeline.lastWeekStart!)}–${dateLabel(pipeline.lastWeekEnd!)}` : "Previous week"} complete={coverage.admittedLastWeek === true} empty="No recorded admissions last week." rows={admitted.map((row) => ({ key: row.referralId, name: row.clientName, date: row.admittedAt, detail: row.community, context: contextLabel(row), url: row.pipelineUrl }))} />
      <WeekList title="Planned admits this week" period={`${dateLabel(pipeline.weekStart)}–${dateLabel(pipeline.weekEnd)}`} complete={coverage.moveIns} empty="No planned admits this week." rows={planned.map((row) => ({ key: row.referralId, name: row.clientName, date: row.plannedAt, detail: `${row.community} · ${row.readiness === "blocked" ? "Requirements open" : row.readiness === "watch" ? "Review requirements" : "Ready"}`, context: contextLabel(row), url: row.pipelineUrl }))} />
    </div>

    <section aria-labelledby="combined-moving-title" className="border-t border-[#e6e8e3] px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6c7e71]">Current work</p><h3 id="combined-moving-title" className="mt-1 text-[22px] font-semibold tracking-[-0.025em] text-[#26392f]">Clients moving through</h3></div><span className="text-[14px] font-medium tabular-nums text-[#637468]">{coverage.movingThrough === false && !moving.length ? "Unavailable" : `${moving.length}${coverage.movingThrough === false ? "+" : ""} active`}</span></div>
      {moving.length ? <div className="mt-5 grid gap-5 lg:grid-cols-3">{(["received", "in_progress", "decision"] as const).map((stage) => {
        const rows = moving.filter((row) => row.stage === stage);
        const label = stage === "received" ? "Referral received" : stage === "in_progress" ? "In progress" : "Decision";
        return <section key={stage} aria-label={label} className="min-w-0 rounded-xl border border-[#e1e7df] bg-[#fafbf8]">
          <h4 className="flex items-center justify-between border-b border-[#e1e7df] px-4 py-3 text-[13px] font-semibold text-[#345141]">{label}<span className="tabular-nums">{rows.length}</span></h4>
          {rows.length ? <ul className="divide-y divide-[#e8ece6]">{rows.map((row) => <li key={row.referralId} className="px-4 py-3 text-[12px] leading-5"><a href={row.pipelineUrl} className="font-semibold text-[#16684e] underline-offset-2 hover:underline">{row.clientName}</a><span className="block text-[#4d5d52]">{row.status} · {row.community}</span><span className="block text-[#718076]">{contextLabel(row)}</span></li>)}</ul> : <p className="px-4 py-4 text-[12px] text-[#718076]">None in this stage.</p>}
        </section>;
      })}</div> : <p className="mt-5 text-[14px] text-[#657267]">{coverage.movingThrough === true ? "No active clients on the Pipeline board." : "Pipeline movement is unavailable."}</p>}
      {coverage.movingThrough === false ? <p className="mt-4 text-[12px] text-[#7a6845]">The list is capped; more clients may be on the board.</p> : null}
    </section>
    <footer className="border-t border-[#e6e8e3] bg-[#fafbf8] px-5 py-3 text-[11px] leading-5 text-[#66766a] sm:px-8">Census: Platform clinical snapshot. Admissions and origins: Pipeline referral records updated {dateLabel(pipeline.windowEnd)}. Planned dates are not confirmed arrivals.</footer>
  </article>;
}

function WeekList({ title, period, complete, empty, rows }: { title: string; period: string; complete: boolean; empty: string; rows: Array<{ key: number; name: string; date: string; detail: string; context: string; url: string }> }) {
  return <section aria-label={title} className="min-w-0 border-b border-[#e6e8e3] px-5 py-6 sm:px-8 sm:py-8 lg:border-b-0 lg:first:border-r">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6c7e71]">{period}</p><h3 className="mt-1 text-[21px] font-semibold tracking-[-0.025em] text-[#26392f]">{title}</h3></div><strong className="text-[24px] tabular-nums text-[#2c684c]">{!complete && !rows.length ? "—" : `${rows.length}${complete ? "" : "+"}`}</strong></div>
    {rows.length ? <ul className="mt-4 divide-y divide-[#e6e9e4]">{rows.map((row) => <li key={row.key} className="py-3 text-[13px] leading-5"><div className="flex flex-wrap items-baseline justify-between gap-x-3"><a href={row.url} className="font-semibold text-[#16684e] underline-offset-2 hover:underline">{row.name}</a><time className="text-[#6f7b70]">{dateLabel(row.date)}</time></div><p className="mt-0.5 text-[#3d5143]">{row.detail}</p><p className="text-[#718076]">{row.context}</p></li>)}</ul> : <p className="mt-5 text-[13px] text-[#67756b]">{complete ? empty : "Admissions records are unavailable."}</p>}
    {!complete ? <p className="mt-3 text-[12px] text-[#7a6845]">The list is capped or unavailable; this is not a complete count.</p> : null}
  </section>;
}
