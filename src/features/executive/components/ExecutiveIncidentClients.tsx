import { ArrowRight, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchExecutiveDirectorIncidents, type ExecutiveDirectorIncidentRegister } from "../data/executiveDirectorApi";
import { formatExecutiveDate, formatExecutiveNumber } from "./executiveDashboardFormatters";

export type IncidentClient = ExecutiveDirectorIncidentRegister["clients"][number];

export function ExecutiveIncidentClients({ facilityId, compact = false, onSelect }: {
  facilityId: string;
  compact?: boolean;
  onSelect: (client: IncidentClient) => void;
}) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<ExecutiveDirectorIncidentRegister | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setResult(null);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const next = await fetchExecutiveDirectorIncidents(facilityId, { clientQuery: compact ? "" : query.trim(), clientOffset: compact ? 0 : offset, limit: 1 }, controller.signal);
        if (!controller.signal.aborted) setResult(next);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Client incident history could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query && !compact ? 220 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [facilityId, query, offset, compact]);

  const clients = (result?.clients ?? []).slice(0, compact ? 3 : 20);
  const complete = result?.coverage.status === "complete";
  const coverageLabel = complete
    ? `${formatExecutiveNumber(result?.clientCount ?? 0)} matching clients`
    : `Partial published incident history${!compact && result?.coverage.startDate && result.coverage.endDate ? ` · ${formatExecutiveDate(result.coverage.startDate)}–${formatExecutiveDate(result.coverage.endDate)}` : ""}${!compact ? ` · ${formatExecutiveNumber(result?.clientCount ?? 0)} matching clients` : ""}`;
  return <section data-incident-client-triage="true" className={`incident-client-triage${compact ? " incident-client-triage--compact" : ""}`} aria-label="Clients with incident records">
    {!compact ? <div className="incident-client-triage__intro"><div><h2>Clients with incident records</h2><p>Start with a client, then review their incident history. This is an operational sort by the latest record’s derived priority and date—not a clinical severity grade or an open-task queue.</p></div><label><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} aria-label="Search clients with incidents" placeholder="Search client name or ID" /></label></div> : <p className="incident-client-triage__lead">Clients first · open a record to review its incident history.</p>}
    {result?.status === "ready" && (!complete || !compact) ? <p className="incident-client-triage__coverage" data-incident-client-coverage={result.coverage.status}>{coverageLabel}</p> : null}
    {loading && !result ? <p role="status" className="incident-client-triage__message">Loading clients…</p> : null}
    {error ? <p role="alert" className="incident-client-triage__message">{error}</p> : null}
    {!loading && !error && result?.status === "unavailable" ? <p role="status" className="incident-client-triage__message">Individual incident records are unavailable. The full incident register can be retried below.</p> : null}
    {!loading && !error && result?.status === "ready" && !clients.length ? <p className="incident-client-triage__message">{query ? "No matching clients in the available incident history." : "No linked client incident records are available."}</p> : null}
    {clients.length ? <ol className="incident-client-triage__list">{clients.map((client) => <li key={`${client.facilityId}:${client.residentId}`}><button type="button" onClick={() => onSelect(client)} aria-label={`View incidents for ${client.residentName}`}><span className="incident-client-triage__person"><strong>{client.residentName}</strong><small>{client.latestDate ? `Latest record ${formatExecutiveDate(client.latestDate)}` : "Latest date not recorded"}</small></span><span className="incident-client-triage__signal">{client.latestPriority === "high" ? "Emergency/sentinel signal" : client.latestPriority === "medium" ? "Injury recorded" : client.latestPriority === "unknown" ? "Details incomplete" : "Recorded event"}</span><span className="incident-client-triage__count">{formatExecutiveNumber(client.incidentCount)} <small>{client.incidentCount === 1 ? "record" : "records"}</small></span><ArrowRight aria-hidden="true" /></button></li>)}</ol> : null}
    {!compact && result?.status === "ready" ? <div className="incident-client-triage__footer"><p className="incident-client-triage__foot">{clients.length ? `Showing ${formatExecutiveNumber(result.clientOffset + 1)}–${formatExecutiveNumber(result.clientOffset + clients.length)} of ${formatExecutiveNumber(result.clientCount)} matching linked clients` : "No matching linked clients"}{result.unlinkedCount ? `; ${formatExecutiveNumber(result.unlinkedCount)} records without a client ID remain in All incidents` : ""}. {complete ? "" : "This published snapshot may omit older individual records."}</p>{result.clientCount > 20 ? <div><button type="button" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 20))}>Previous clients</button><button type="button" disabled={offset + clients.length >= result.clientCount} onClick={() => setOffset((current) => current + 20)}>Next clients</button></div> : null}</div> : null}
  </section>;
}
