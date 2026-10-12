import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import {
  fetchExecutiveDirectorIncidents,
  fetchPlatformIncidentHistory,
  type ExecutiveDirectorIncident,
  type ExecutiveDirectorIncidentRegister as IncidentRegisterData
} from "../data/executiveDirectorApi";
import { formatExecutiveNumber } from "./executiveDashboardFormatters";
import "../executiveIncidentRegister.css";

interface RegisterProps {
  facilityId: string;
  mode?: "executive" | "platform";
  onTotal?: (total: number | null) => void;
  focusFilter?: { category: string | null; from: string; to: string; key: number; scroll?: boolean };
}

interface IncidentFilters {
  query: string;
  facility: string;
  category: string;
  incidentType: string;
  priority: string;
  year: string;
  sort: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: IncidentFilters = { query: "", facility: "", category: "", incidentType: "", priority: "", year: "", sort: "date_desc", from: "", to: "" };
const PAGE_SIZE = 25;
const FACILITY_LABELS = new Map(ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility.shortName]));

function incidentDate(value: string | null, includeTime = false) {
  if (!value) return "Not recorded";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12) : new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
    ...(includeTime && !dateOnly ? { hour: "numeric", minute: "2-digit" } as const : {})
  }).format(date);
}

function recordedBoolean(value: boolean | null) {
  return value == null ? "Not recorded" : value ? "Yes" : "No";
}

export function ExecutiveIncidentRegister(props: RegisterProps) {
  return <IncidentRegisterContent key={props.facilityId} {...props} />;
}

function IncidentRegisterContent({ facilityId, mode = "executive", onTotal, focusFilter }: RegisterProps) {
  const headingId = useId();
  const rowPrefix = useId();
  const [filters, setFilters] = useState<IncidentFilters>(() => ({ ...EMPTY_FILTERS, facility: mode === "platform" && facilityId !== "all" ? facilityId : "" }));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<IncidentRegisterData | null>(null);
  const [result, setResult] = useState<{ key: string; data?: IncidentRegisterData; error?: string } | null>(null);
  const generation = useRef(0);
  const registerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const cursor = cursors[page] ?? null;
  const scopeFacilityId = mode === "platform" ? filters.facility || "all" : facilityId;
  const requestKey = JSON.stringify([scopeFacilityId, mode, filters, cursor, retry]);
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const activeResult = result?.key === requestKey ? result : null;
  const data = activeResult?.data?.status === "ready" ? activeResult.data : null;
  const unavailable = activeResult?.data?.status === "unavailable";
  const loading = !activeResult && !invalidDates;
  const hasFilters = Boolean(filters.query || filters.facility || filters.category || filters.incidentType || filters.priority || filters.year || filters.from || filters.to || filters.sort !== "date_desc");
  const publishedCount = catalog?.coverage.status === "partial" && catalog.coverage.reportedTotal != null;
  const total = publishedCount ? catalog.coverage.reportedTotal : catalog?.totalIncidents ?? null;
  const totalLabel = !catalog || catalog.coverage.status === "complete" ? "Total incidents" : publishedCount ? "Published incidents" : "Available records";

  useEffect(() => { onTotal?.(total); }, [onTotal, total]);

  useEffect(() => {
    if (!focusFilter) return;
    setFilters({ ...EMPTY_FILTERS, category: focusFilter.category ?? "", from: focusFilter.from, to: focusFilter.to });
    if (focusFilter.category || focusFilter.from || focusFilter.to) setMobileFiltersOpen(true);
    setPage(0);
    setCursors([null]);
    setExpandedId(null);
    if (!focusFilter.scroll) return;
    const frame = window.requestAnimationFrame(() => registerRef.current?.scrollIntoView({ behavior: "instant", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusFilter?.key, focusFilter?.category, focusFilter?.from, focusFilter?.to, focusFilter?.scroll]);

  useEffect(() => {
    const controller = new AbortController();
    const currentGeneration = ++generation.current;
    if (invalidDates) return () => controller.abort();
    const timeout = window.setTimeout(async () => {
      try {
        const loader = mode === "platform" ? fetchPlatformIncidentHistory : fetchExecutiveDirectorIncidents;
        const next = await loader(scopeFacilityId, {
          query: filters.query.trim(), category: filters.category, incidentType: filters.incidentType,
          priority: filters.priority, year: filters.year, sort: filters.sort,
          from: filters.from, to: filters.to, ...(cursor ? { cursor } : {})
        }, controller.signal);
        if (controller.signal.aborted || generation.current !== currentGeneration) return;
        if (next.facilityId !== scopeFacilityId) throw new Error("Incident history did not match this community. Please retry.");
        setResult({ key: requestKey, data: next });
        setCatalog(next.status === "ready" ? next : null);
      } catch (error) {
        if (!controller.signal.aborted && generation.current === currentGeneration) {
          setResult({ key: requestKey, error: error instanceof Error ? error.message : "Incident history could not be loaded." });
        }
      }
    }, filters.query ? 250 : 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [scopeFacilityId, mode, filters, cursor, requestKey, invalidDates]);

  const updateFilters = (next: IncidentFilters) => {
    setFilters(next);
    setCatalog(null);
    setPage(0);
    setCursors([null]);
    setExpandedId(null);
  };
  const retryHistory = () => {
    setPage(0);
    setCursors([null]);
    setExpandedId(null);
    setRetry((value) => value + 1);
  };
  const changePage = (nextPage: number) => {
    if (loading) return;
    if (nextPage > page) {
      if (!data?.nextCursor) return;
      setCursors((previous) => [...previous.slice(0, page + 1), data.nextCursor]);
    }
    setPage(nextPage);
    setExpandedId(null);
    resultsRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
    resultsRef.current?.focus({ preventScroll: true });
  };

  return (
    <section ref={registerRef} className="executive-incident-register" data-executive-incident-register="true" data-incident-scope={mode} aria-labelledby={headingId}>
      <header className="executive-incident-register__heading">
        <div><ClipboardList aria-hidden="true" />{mode === "platform" ? <h1 id={headingId}>Incident history</h1> : <h2 id={headingId}>All incidents</h2>}</div>
        <dl className="executive-incident-register__counts">
          <div><dt>{totalLabel}{activeResult?.error && catalog ? " · Last loaded" : ""}</dt><dd data-executive-incident-total="true">{formatExecutiveNumber(total)}</dd></div>
          {publishedCount ? <div><dt>Available records</dt><dd data-executive-incident-available="true">{formatExecutiveNumber(catalog.totalIncidents)}</dd></div> : null}
          <div><dt>Matching records</dt><dd data-executive-incident-matches="true">{formatExecutiveNumber(data?.matchingIncidents)}</dd></div>
        </dl>
      </header>

      <form className={`executive-incident-register__filters${mobileFiltersOpen ? " is-open" : ""}`} role="search" aria-label="Search all incidents" onSubmit={(event) => event.preventDefault()}>
        <label className="executive-incident-register__search"><span>Search incidents</span><div><Search aria-hidden="true" /><input ref={searchRef} type="search" aria-label="Search incidents" value={filters.query} onChange={(event) => updateFilters({ ...filters, query: event.target.value })} placeholder="Name or keyword" />{filters.query ? <button type="button" aria-label="Clear incident search" onClick={() => { updateFilters({ ...filters, query: "" }); searchRef.current?.focus(); }}><X aria-hidden="true" /></button> : null}</div></label>
        <button className="executive-incident-register__advanced-toggle" type="button" aria-expanded={mobileFiltersOpen} onClick={() => setMobileFiltersOpen((open) => !open)}>Filters{hasFilters && !filters.query ? " · Active" : ""}<ChevronDown aria-hidden="true" /></button>
        {mode === "platform" ? <label className="executive-incident-register__advanced"><span>Community</span><select value={filters.facility} onChange={(event) => updateFilters({ ...filters, facility: event.target.value })}><option value="">All communities</option>{ALAMO_FACILITIES.map((facility) => <option key={facility.facilityId} value={facility.facilityId}>{facility.shortName}</option>)}</select></label> : null}
        <label className="executive-incident-register__advanced"><span>Year occurred</span><select value={filters.year} onChange={(event) => updateFilters({ ...filters, year: event.target.value })}><option value="">All years</option>{filters.year && !catalog?.years?.some((item) => item.label === filters.year) ? <option value={filters.year}>{filters.year}</option> : null}{catalog?.years?.map((item) => <option key={item.label} value={item.label}>{item.label === "undated" ? "Not dated" : item.label} ({formatExecutiveNumber(item.count)})</option>)}</select></label>
        <label className="executive-incident-register__advanced executive-incident-register__category-filter"><span>Category</span><select value={filters.category} onChange={(event) => updateFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{filters.category && !catalog?.categories.some((item) => item.label === filters.category) ? <option value={filters.category}>{filters.category}</option> : null}{catalog?.categories.map((item) => <option key={item.label} value={item.label}>{item.label} ({formatExecutiveNumber(item.count)})</option>)}</select></label>
        <label className="executive-incident-register__advanced"><span>Incident type</span><select value={filters.incidentType} onChange={(event) => updateFilters({ ...filters, incidentType: event.target.value })}><option value="">All types</option>{filters.incidentType && !catalog?.types?.some((item) => item.label === filters.incidentType) ? <option value={filters.incidentType}>{filters.incidentType}</option> : null}{catalog?.types?.map((item) => <option key={item.label} value={item.label}>{item.label} ({formatExecutiveNumber(item.count)})</option>)}</select></label>
        <label className="executive-incident-register__advanced"><span>Derived priority</span><select value={filters.priority} onChange={(event) => updateFilters({ ...filters, priority: event.target.value })}><option value="">All priorities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="unknown">Unknown</option></select></label>
        <label className="executive-incident-register__advanced"><span>From date</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => updateFilters({ ...filters, from: event.target.value })} /></label>
        <label className="executive-incident-register__advanced"><span>To date</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => updateFilters({ ...filters, to: event.target.value })} /></label>
        <label className="executive-incident-register__advanced"><span>Sort by</span><select value={filters.sort} onChange={(event) => updateFilters({ ...filters, sort: event.target.value })}><option value="date_desc">Newest first</option><option value="date_asc">Oldest first</option><option value="priority_desc">Derived priority</option><option value="type_asc">Type A–Z</option><option value="category_asc">Category A–Z</option>{mode === "platform" ? <option value="community_asc">Community A–Z</option> : null}</select></label>
        <button className="executive-incident-register__reset executive-incident-register__advanced" type="button" disabled={!hasFilters} onClick={() => updateFilters(EMPTY_FILTERS)}>Reset filters</button>
      </form>

      <details className="executive-incident-register__priority-rule"><summary>How derived priority is assigned</summary><p>Provisional operational grouping, not an official severity grade: High = recorded sentinel event or emergency-services notification; Medium = recorded injury; Low = all three explicitly No; otherwise Unknown.</p></details>

      {catalog ? <div className="executive-incident-register__coverage" data-executive-incident-coverage={catalog.coverage.status}>
        <span>{catalog.coverage.status === "complete" ? "Complete connected source" : "Partial published snapshot"}{catalog.coverage.startDate && catalog.coverage.endDate ? ` · ${incidentDate(catalog.coverage.startDate)} – ${incidentDate(catalog.coverage.endDate)}` : ""}</span>
        {catalog.coverage.note ? <p>{catalog.coverage.note}</p> : null}
        {catalog.freshness.stale ? <p className="executive-incident-register__warning">{catalog.freshness.warning || "This history is awaiting a source refresh."}</p> : null}
      </div> : null}

      <div ref={resultsRef} tabIndex={-1} className="executive-incident-register__results" aria-label="Incident results" aria-busy={loading}>
        {invalidDates ? <p role="alert" className="executive-incident-register__message">Choose an end date on or after the start date.</p> : loading ? <p role="status" className="executive-incident-register__message">Loading incident history…</p> : activeResult?.error || unavailable ? <div className="executive-incident-register__message" role="alert"><p>{activeResult?.error || activeResult?.data?.coverage.note || "Incident history is temporarily unavailable."}</p><button type="button" onClick={retryHistory}><RefreshCw aria-hidden="true" />Retry incident history</button></div> : data?.incidents.length ? <>
          <div className="executive-incident-register__column-headings" aria-hidden="true"><span>Date</span><span>Resident</span>{mode === "platform" ? <span>Community</span> : null}<span>Type</span><span>Category</span><span>Derived priority</span><span /></div>
          <ol className="executive-incident-register__list" aria-label="Incident search results">
            {data.incidents.map((incident, index) => {
              const recordKey = mode === "platform" ? `${incident.facilityId}:${incident.id}` : incident.id;
              const expanded = expandedId === recordKey;
              const detailId = `${rowPrefix}-detail-${index}`;
              return <li key={recordKey} data-executive-incident-row={recordKey}>
                <button type="button" className="executive-incident-register__row" aria-expanded={expanded} aria-controls={detailId} aria-label={`${expanded ? "Hide" : "View"} incident details for ${incident.residentName}, ${incidentDate(incident.date)}, ${incident.category}`} onClick={() => setExpandedId(expanded ? null : recordKey)}>
                  <span className="executive-incident-register__date">{incidentDate(incident.date)}</span>
                  <strong className="executive-incident-register__resident">{incident.residentName}</strong>
                  {mode === "platform" ? <span className="executive-incident-register__community">{FACILITY_LABELS.get(incident.facilityId) ?? "Unknown community"}</span> : null}
                  <span className="executive-incident-register__type">{incident.incidentType || "Not recorded"}</span>
                  <span className="executive-incident-register__category">{incident.category}</span>
                  <span className="executive-incident-register__mobile-context">{mode === "platform" ? `${FACILITY_LABELS.get(incident.facilityId) ?? "Unknown community"} · ` : ""}{incident.category}{incident.incidentType && incident.incidentType !== incident.category ? ` · ${incident.incidentType}` : ""}</span>
                  <span className={`executive-incident-register__priority is-${incident.priority}`}>{incident.priority}</span>
                  <ChevronDown className="executive-incident-register__expand" aria-hidden="true" />
                </button>
                <div id={detailId} hidden={!expanded} data-executive-incident-detail={recordKey}><IncidentDetails incident={incident} /></div>
              </li>;
            })}
          </ol>
        </> : data ? <div className="executive-incident-register__message"><h3>{hasFilters ? "No matching incidents" : "No incident records available"}</h3><p>{hasFilters ? "Try another search or reset the filters." : data.coverage.note || "No incident records are included in the available history."}</p>{hasFilters ? <button type="button" onClick={() => updateFilters(EMPTY_FILTERS)}>Reset filters</button> : null}</div> : null}
      </div>

      {data && data.incidents.length > 0 && data.matchingIncidents != null ? <nav className="executive-incident-register__pagination" aria-label="Incident pages"><p aria-live="polite">{formatExecutiveNumber(page * PAGE_SIZE + 1)}–{formatExecutiveNumber(page * PAGE_SIZE + data.incidents.length)} of {formatExecutiveNumber(data.matchingIncidents)} matching records</p><div><button type="button" disabled={page === 0 || loading} onClick={() => changePage(page - 1)}><ChevronLeft aria-hidden="true" />Previous</button><button type="button" disabled={!data.nextCursor || loading} onClick={() => changePage(page + 1)}>Next<ChevronRight aria-hidden="true" /></button></div></nav> : null}
    </section>
  );
}

function IncidentDetails({ incident }: { incident: ExecutiveDirectorIncident }) {
  return <div className="executive-incident-register__detail">
    <dl className="executive-incident-register__facts">
      <div><dt>Occurred</dt><dd>{incidentDate(incident.date, true)}</dd></div>
      <div><dt>Received</dt><dd>{incidentDate(incident.receivedAt, true)}</dd></div>
      <div><dt>Incident type</dt><dd>{incident.incidentType || incident.category}</dd></div>
      <div><dt>Derived priority</dt><dd>{{ high: "High", medium: "Medium", low: "Low", unknown: "Unknown" }[incident.priority]}</dd></div>
      <div><dt>Location</dt><dd>{incident.location || "Not recorded"}</dd></div>
      <div><dt>Recorded by</dt><dd>{incident.staffName || "Not recorded"}</dd></div>
      <div><dt>Injury</dt><dd>{recordedBoolean(incident.injuryOccurred)}</dd></div>
      <div><dt>Emergency services notified</dt><dd>{recordedBoolean(incident.emergencyServicesNotified)}</dd></div>
      <div><dt>Sentinel event</dt><dd>{recordedBoolean(incident.sentinelEvent)}</dd></div>
    </dl>
    <div className="executive-incident-register__narratives"><section><h3>Incident details</h3><p>{incident.description || "No incident description is recorded."}</p></section><section><h3>Recorded response</h3><p>{incident.response || "No response is recorded."}</p></section></div>
    <p className="executive-incident-register__record-id">Record {incident.id}{incident.residentId ? ` · Resident ${incident.residentId}` : ""}</p>
  </div>;
}
