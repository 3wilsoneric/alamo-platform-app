import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  fetchExecutiveDirectorIncidents,
  type ExecutiveDirectorIncident,
  type ExecutiveDirectorIncidentRegister as IncidentRegisterData
} from "../data/executiveDirectorApi";
import { formatExecutiveNumber } from "./executiveDashboardFormatters";
import "../executiveIncidentRegister.css";

interface RegisterProps {
  facilityId: string;
  onTotal?: (total: number | null) => void;
  focusFilter?: { category: string | null; from: string; to: string; key: number; scroll?: boolean };
}

interface IncidentFilters {
  query: string;
  category: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: IncidentFilters = { query: "", category: "", from: "", to: "" };
const PAGE_SIZE = 25;

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

function IncidentRegisterContent({ facilityId, onTotal, focusFilter }: RegisterProps) {
  const headingId = useId();
  const rowPrefix = useId();
  const [filters, setFilters] = useState<IncidentFilters>(EMPTY_FILTERS);
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
  const requestKey = JSON.stringify([facilityId, filters, cursor, retry]);
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const activeResult = result?.key === requestKey ? result : null;
  const data = activeResult?.data?.status === "ready" ? activeResult.data : null;
  const unavailable = activeResult?.data?.status === "unavailable";
  const loading = !activeResult && !invalidDates;
  const hasFilters = Boolean(filters.query || filters.category || filters.from || filters.to);
  const publishedCount = catalog?.coverage.status === "partial" && catalog.coverage.reportedTotal != null;
  const total = publishedCount ? catalog.coverage.reportedTotal : catalog?.totalIncidents ?? null;
  const totalLabel = !catalog || catalog.coverage.status === "complete" ? "Total incidents" : publishedCount ? "Published incidents" : "Available records";

  useEffect(() => { onTotal?.(total); }, [onTotal, total]);

  useEffect(() => {
    if (!focusFilter) return;
    setFilters({ query: "", category: focusFilter.category ?? "", from: focusFilter.from, to: focusFilter.to });
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
        const next = await fetchExecutiveDirectorIncidents(facilityId, {
          query: filters.query.trim(), category: filters.category,
          from: filters.from, to: filters.to, ...(cursor ? { cursor } : {})
        }, controller.signal);
        if (controller.signal.aborted || generation.current !== currentGeneration) return;
        if (next.facilityId !== facilityId) throw new Error("Incident history did not match this community. Please retry.");
        setResult({ key: requestKey, data: next });
        setCatalog(next.status === "ready" ? next : null);
      } catch (error) {
        if (!controller.signal.aborted && generation.current === currentGeneration) {
          setResult({ key: requestKey, error: error instanceof Error ? error.message : "Incident history could not be loaded." });
        }
      }
    }, filters.query ? 250 : 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [facilityId, filters, cursor, requestKey, invalidDates]);

  const updateFilters = (next: IncidentFilters) => {
    setFilters(next);
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
    <section ref={registerRef} className="executive-incident-register" data-executive-incident-register="true" aria-labelledby={headingId}>
      <header className="executive-incident-register__heading">
        <div><ClipboardList aria-hidden="true" /><h2 id={headingId}>All incidents</h2></div>
        <dl className="executive-incident-register__counts">
          <div><dt>{totalLabel}{activeResult?.error && catalog ? " · Last loaded" : ""}</dt><dd data-executive-incident-total="true">{formatExecutiveNumber(total)}</dd></div>
          {publishedCount ? <div><dt>Available records</dt><dd data-executive-incident-available="true">{formatExecutiveNumber(catalog.totalIncidents)}</dd></div> : null}
          <div><dt>Matching records</dt><dd data-executive-incident-matches="true">{formatExecutiveNumber(data?.matchingIncidents)}</dd></div>
        </dl>
      </header>

      <form className="executive-incident-register__filters" role="search" aria-label="Search all incidents" onSubmit={(event) => event.preventDefault()}>
        <label className="executive-incident-register__search"><span>Search incidents</span><div><Search aria-hidden="true" /><input ref={searchRef} type="search" aria-label="Search incidents" value={filters.query} onChange={(event) => updateFilters({ ...filters, query: event.target.value })} placeholder="Resident, category, location or details" />{filters.query ? <button type="button" aria-label="Clear incident search" onClick={() => { updateFilters({ ...filters, query: "" }); searchRef.current?.focus(); }}><X aria-hidden="true" /></button> : null}</div></label>
        <label><span>Category</span><select value={filters.category} onChange={(event) => updateFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{filters.category && !catalog?.categories.some((item) => item.label === filters.category) ? <option value={filters.category}>{filters.category}</option> : null}{catalog?.categories.map((item) => <option key={item.label} value={item.label}>{item.label} ({formatExecutiveNumber(item.count)})</option>)}</select></label>
        <label><span>From date</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => updateFilters({ ...filters, from: event.target.value })} /></label>
        <label><span>To date</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => updateFilters({ ...filters, to: event.target.value })} /></label>
        <button className="executive-incident-register__reset" type="button" disabled={!hasFilters} onClick={() => updateFilters(EMPTY_FILTERS)}>Reset filters</button>
      </form>

      {catalog ? <div className="executive-incident-register__coverage" data-executive-incident-coverage={catalog.coverage.status}>
        <span>{catalog.coverage.status === "complete" ? "All available history" : "Available record dates"}{catalog.coverage.startDate && catalog.coverage.endDate ? ` · ${incidentDate(catalog.coverage.startDate)} – ${incidentDate(catalog.coverage.endDate)}` : ""}</span>
        {catalog.coverage.note ? <p>{catalog.coverage.note}</p> : null}
        {catalog.freshness.stale ? <p className="executive-incident-register__warning">{catalog.freshness.warning || "This history is awaiting a source refresh."}</p> : null}
      </div> : null}

      <div ref={resultsRef} tabIndex={-1} className="executive-incident-register__results" aria-label="Incident results" aria-busy={loading}>
        {invalidDates ? <p role="alert" className="executive-incident-register__message">Choose an end date on or after the start date.</p> : loading ? <p role="status" className="executive-incident-register__message">Loading incident history…</p> : activeResult?.error || unavailable ? <div className="executive-incident-register__message" role="alert"><p>{activeResult?.error || activeResult?.data?.coverage.note || "Incident history is temporarily unavailable."}</p><button type="button" onClick={retryHistory}><RefreshCw aria-hidden="true" />Retry incident history</button></div> : data?.incidents.length ? <>
          <div className="executive-incident-register__column-headings" aria-hidden="true"><span>Date</span><span>Resident</span><span>Category</span><span>Location</span><span /></div>
          <ol className="executive-incident-register__list" aria-label="Incidents, newest first">
            {data.incidents.map((incident, index) => {
              const expanded = expandedId === incident.id;
              const detailId = `${rowPrefix}-detail-${index}`;
              return <li key={incident.id} data-executive-incident-row={incident.id}>
                <button type="button" className="executive-incident-register__row" aria-expanded={expanded} aria-controls={detailId} aria-label={`${expanded ? "Hide" : "View"} incident details for ${incident.residentName}, ${incidentDate(incident.date)}, ${incident.category}`} onClick={() => setExpandedId(expanded ? null : incident.id)}>
                  <span className="executive-incident-register__date">{incidentDate(incident.date)}</span>
                  <strong className="executive-incident-register__resident">{incident.residentName}</strong>
                  <span className="executive-incident-register__category">{incident.category}</span>
                  <span className="executive-incident-register__location">{incident.location || "Location not recorded"}</span>
                  <ChevronDown className="executive-incident-register__expand" aria-hidden="true" />
                </button>
                <div id={detailId} hidden={!expanded} data-executive-incident-detail={incident.id}><IncidentDetails incident={incident} /></div>
              </li>;
            })}
          </ol>
        </> : data ? <div className="executive-incident-register__message"><h3>{hasFilters ? "No matching incidents" : "No incident records available"}</h3><p>{hasFilters ? "Try another search or reset the filters." : data.coverage.note || "No incident records are included in the available history."}</p>{hasFilters ? <button type="button" onClick={() => updateFilters(EMPTY_FILTERS)}>Reset filters</button> : null}</div> : null}
      </div>

      {data && data.incidents.length > 0 && data.matchingIncidents != null ? <nav className="executive-incident-register__pagination" aria-label="Incident pages"><p aria-live="polite">{formatExecutiveNumber(page * PAGE_SIZE + 1)}–{formatExecutiveNumber(page * PAGE_SIZE + data.incidents.length)} of {formatExecutiveNumber(data.matchingIncidents)} matching records <span>· Newest first</span></p><div><button type="button" disabled={page === 0 || loading} onClick={() => changePage(page - 1)}><ChevronLeft aria-hidden="true" />Previous</button><button type="button" disabled={!data.nextCursor || loading} onClick={() => changePage(page + 1)}>Next<ChevronRight aria-hidden="true" /></button></div></nav> : null}
    </section>
  );
}

function IncidentDetails({ incident }: { incident: ExecutiveDirectorIncident }) {
  return <div className="executive-incident-register__detail">
    <dl className="executive-incident-register__facts">
      <div><dt>Occurred</dt><dd>{incidentDate(incident.date, true)}</dd></div>
      <div><dt>Received</dt><dd>{incidentDate(incident.receivedAt, true)}</dd></div>
      <div><dt>Incident type</dt><dd>{incident.incidentType || incident.category}</dd></div>
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
