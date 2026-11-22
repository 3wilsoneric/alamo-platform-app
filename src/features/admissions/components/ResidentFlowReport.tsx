import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { fetchWithApiAuth } from "../../../shared/api/authenticatedFetch";
import "./resident-flow-report.css";

type Totals = { admissions: number; discharges: number; net: number; openingCensus: number; closingCensus: number; bedDays: number; averageDailyCensus: number; completedStayCount: number; averageCompletedStayDays: number | null; medianCompletedStayDays: number | null; movedInAndOut: number; dischargedWithin30Days: number };
type Stay = { id: string; name: string; facilityId: string; community: string; admitted: string; discharged: string | null; county: string; priorPlacement: string | null; admittedInPeriod: boolean; dischargedInPeriod: boolean; stayDays: number | null };
type Report = {
  status: "complete"; scope: { kind: "portfolio" | "community"; facilityId: string | null; label: string };
  period: { start: string; through: string; year: number; days: number }; years: number[];
  snapshot: { asOfDate: string; generatedAt: string; stale: boolean }; totals: Totals;
  sites: (Totals & { facilityId: string; community: string })[];
  counties: { available: boolean; rows: { county: string; admissions: number }[] }; records: Stay[];
};
type Selection = { kind: "admissions" | "discharges" | "churn" | "short" | "county"; county?: string };
const number = (value: number) => new Intl.NumberFormat("en-US").format(value);
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;
const communityOptions = [["337", "San Pablo"], ["342", "Victoria’s House"], ["343", "JC Wallace House"], ["344", "Turlock"], ["345", "Santa Clarita"]];

export default function ResidentFlowReport({ facilityId = null, onCommunityChange, selectedYear, onYearChange }: { facilityId?: string | null; onCommunityChange?: (facilityId: string) => void; selectedYear?: string; onYearChange?: (year: string) => void }) {
  const [selectedFacility, setSelectedFacility] = useState(facilityId);
  const [localYear, setLocalYear] = useState("");
  const year = selectedYear ?? localYear;
  const setYear = onYearChange ?? setLocalYear;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const detailRef = useRef<HTMLElement>(null);
  const communityRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => { setSelectedFacility(facilityId); }, [facilityId]);
  useEffect(() => { setSelection(null); setSearch(""); setPage(0); }, [selectedFacility, year]);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      const params = new URLSearchParams();
      if (selectedFacility) params.set("facilityId", selectedFacility);
      if (year) params.set("year", year);
      const url = `/api/platform/resident-flow-report?${params}`;
      try {
        const result = await fetchWithApiAuth(url, { signal: controller.signal }, {
          consume: async (response) => {
            if (!response.ok) throw new Error(`Client flow unavailable (${response.status})`);
            return await response.json() as Report;
          }
        });
        if (!controller.signal.aborted) { setReport(result); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { inFlight = false; }
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [selectedFacility, year, retry]);
  const ready = report && report.scope.facilityId === selectedFacility && (!year || report.period.year === Number(year));
  const open = (next: Selection) => {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelection(next); setSearch(""); setPage(0);
    window.requestAnimationFrame(() => { detailRef.current?.focus({ preventScroll: true }); detailRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); });
  };
  const changeCommunity = (id: string) => {
    if (onCommunityChange) onCommunityChange(id);
    else { setSelectedFacility(id || null); communityRef.current?.focus(); }
  };
  const title = selection?.kind === "county" ? `${selection.county} admissions` : selection?.kind === "discharges" ? "Discharges" : selection?.kind === "churn" ? "Moved in and out" : selection?.kind === "short" ? "Left within 30 days" : "Admissions";
  const matching = ready && selection ? report.records.filter((row) => {
    const included = selection.kind === "admissions" ? row.admittedInPeriod : selection.kind === "county" ? row.admittedInPeriod && row.county === selection.county : selection.kind === "churn" ? row.admittedInPeriod && row.dischargedInPeriod : selection.kind === "short" ? row.dischargedInPeriod && row.stayDays !== null && row.stayDays <= 30 : row.dischargedInPeriod;
    return included && `${row.name} ${row.community} ${row.county} ${row.priorPlacement ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => (selection.kind === "admissions" || selection.kind === "county" ? b.admitted.localeCompare(a.admitted) : String(b.discharged).localeCompare(String(a.discharged))) || a.name.localeCompare(b.name)) : [];
  const lastPage = Math.max(0, Math.ceil(matching.length / 12) - 1);
  const currentPage = Math.min(page, lastPage);
  return (
    <section className="resident-flow-report" aria-labelledby="resident-flow-title" data-resident-flow-report={ready ? report.scope.kind : "loading"}>
      <header className="resident-flow-head">
        <div className="resident-flow-title-row">
          <h2 id="resident-flow-title">Admissions & resident flow</h2>
          <label className="resident-flow-year">
            <span aria-hidden="true">{year || report?.period.year || "This year"}<ChevronDown size={16} /></span>
            <select aria-label="Client flow year" value={year || report?.period.year || ""} onChange={(event) => setYear(event.target.value)}>{report ? report.years.map((value) => <option key={value} value={value}>{value}</option>) : <option value="">This year</option>}</select>
          </label>
        </div>
        <div className="resident-flow-filters">
          {!onCommunityChange && <select ref={communityRef} aria-label="Client flow community" value={selectedFacility ?? ""} onChange={(event) => changeCommunity(event.target.value)}><option value="">All communities</option>{communityOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}
          {ready && <p>Jan 1–{dateLabel(report.period.through)}{report.snapshot.asOfDate !== report.period.through ? ` · Data through ${dateLabel(report.snapshot.asOfDate)}` : ""}</p>}
        </div>
      </header>
      {error ? <div className="resident-flow-error" role="status">{ready ? "Update delayed. Showing the last loaded report." : "Client flow is temporarily unavailable."} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div> : null}
      {!ready ? <p className="resident-flow-loading" role="status">{error ? "" : "Loading client flow…"}</p> : <>
        {report.snapshot.stale ? <p className="resident-flow-error" role="status">Data update delayed · Latest source: {dateLabel(report.snapshot.asOfDate)}</p> : null}
        <div className="resident-flow-movement">
          <div><span>Starting census</span><strong>{number(report.totals.openingCensus)}</strong></div>
          <button type="button" onClick={() => open({ kind: "admissions" })}><span>Admissions </span><strong>+{number(report.totals.admissions)}</strong></button>
          <button type="button" onClick={() => open({ kind: "discharges" })}><span>Discharges </span><strong>−{number(report.totals.discharges)}</strong></button>
          <div className="resident-flow-ending"><span>Ending census</span><strong>{number(report.totals.closingCensus)}</strong><small>{signed(report.totals.net)} net</small></div>
        </div>
        <div className="resident-flow-occupancy"><p><strong>{number(report.totals.bedDays)}</strong> occupied bed-days</p><p><strong>{number(report.totals.averageDailyCensus)}</strong> clients per day, on average</p></div>
        {report.sites.length > 1 ? <div className="resident-flow-table-wrap" tabIndex={0} role="region" aria-label="Community flow comparison"><table><caption>By community</caption><thead><tr><th>Community</th><th>Admissions</th><th>Discharges</th><th>Net</th><th>Bed-days</th></tr></thead><tbody>{report.sites.map((site) => <tr key={site.facilityId}><th scope="row"><button type="button" onClick={() => changeCommunity(site.facilityId)}>{site.community} <span aria-hidden="true">→</span></button></th><td>{number(site.admissions)}</td><td>{number(site.discharges)}</td><td>{signed(site.net)}</td><td>{number(site.bedDays)}</td></tr>)}</tbody></table></div> : null}
        {report.sites.length > 1 ? <div className="resident-flow-site-list" aria-label="Community flow"><h3>By community</h3>{report.sites.map((site) => <button type="button" key={site.facilityId} onClick={() => changeCommunity(site.facilityId)}><strong>{site.community}<i aria-hidden="true">→</i></strong><span>{number(site.admissions)} admissions · {number(site.discharges)} discharges · {signed(site.net)} net</span></button>)}</div> : null}
        <div className="resident-flow-detail-grid">
          <section className="resident-flow-counties" aria-labelledby="resident-counties-title"><div className="resident-flow-section-head"><h3 id="resident-counties-title">Where admissions came from</h3><span>{number(report.totals.admissions)} admissions</span></div>
            {!report.counties.available ? <p role="status">County details are awaiting the next data update.</p> : !report.counties.rows.length ? <p>No admissions in this period.</p> : <ol>{report.counties.rows.map((row) => <li key={row.county}><button type="button" onClick={() => open({ kind: "county", county: row.county })} aria-label={`${row.county}: ${row.admissions} ${row.admissions === 1 ? "admission" : "admissions"}`}><span>{row.county}</span><strong>{number(row.admissions)}</strong><span className="resident-flow-county-track" aria-hidden="true"><i style={{ width: `${row.admissions / report.totals.admissions * 100}%` }} /></span></button></li>)}</ol>}
          </section>
          <section className="resident-flow-churn" aria-labelledby="resident-churn-title"><h3 id="resident-churn-title">Who leaves, and how soon</h3>
            <button type="button" onClick={() => open({ kind: "churn" })}><strong>{number(report.totals.movedInAndOut)}</strong><span>Moved in and out in {report.period.year}<small>Part of the {number(report.totals.discharges)} discharges</small></span><i aria-hidden="true">→</i></button>
            <button type="button" onClick={() => open({ kind: "short" })}><strong>{number(report.totals.dischargedWithin30Days)}</strong><span>Left within 30 days<small>Among this period’s discharges</small></span><i aria-hidden="true">→</i></button>
            <div className="resident-flow-length"><span>Length of stay before discharge</span><div><p><strong>{report.totals.medianCompletedStayDays === null ? "—" : number(report.totals.medianCompletedStayDays)}</strong> days <small>Median</small></p><p><strong>{report.totals.averageCompletedStayDays === null ? "—" : number(report.totals.averageCompletedStayDays)}</strong> days <small>Average</small></p></div></div>
          </section>
        </div>
        {selection ? <section ref={detailRef} tabIndex={-1} className="resident-flow-records" aria-labelledby="resident-flow-records-title"><div className="resident-flow-section-head"><div><h3 id="resident-flow-records-title">{title}</h3><span>{number(matching.length)} {matching.length === 1 ? "stay" : "stays"} · {report.scope.label}</span></div><button type="button" aria-label="Close client detail" onClick={() => { setSelection(null); window.requestAnimationFrame(() => triggerRef.current?.focus()); }}>Close</button></div>
          <input type="search" aria-label="Search report clients" placeholder="Search clients" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
          {!matching.length ? <p>No matching clients.</p> : <ul>{matching.slice(currentPage * 12, (currentPage + 1) * 12).map((row) => <li key={row.id}><div><strong>{row.name}</strong><span>{row.community} · {row.county}</span></div><dl><div><dt>Admitted</dt><dd>{dateLabel(row.admitted)}</dd></div><div><dt>Discharged</dt><dd>{row.discharged && row.discharged <= report.period.through ? dateLabel(row.discharged) : "Still in community"}</dd></div>{row.dischargedInPeriod ? <div><dt>Stay</dt><dd>{number(row.stayDays ?? 0)} {row.stayDays === 1 ? "day" : "days"}</dd></div> : null}</dl>{row.priorPlacement ? <p>From {row.priorPlacement}</p> : null}</li>)}</ul>}
          {matching.length > 12 ? <nav aria-label="Client detail pages"><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage + 1} of {lastPage + 1}</span><button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</button></nav> : null}
        </section> : null}
      </>}
    </section>
  );
}
