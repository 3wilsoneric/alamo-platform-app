import { useEffect, useState } from "react";
import { fetchWithApiAuth } from "../../../shared/api/authenticatedFetch";
import "./resident-flow-report.css";

type Site = { facilityId: string; community: string; admissions: number; discharges: number; net: number; bedDays: number; averageDailyCensus: number; medianCompletedStayDays: number | null };
type Month = { month: string; admissions: number; discharges: number; bedDays: number; averageDailyCensus: number };
type Report = {
  status: "complete";
  scope: { kind: "portfolio" | "community"; facilityId: string | null; label: string };
  period: { start: string; through: string; year: number; completeMonths: number; days: number };
  snapshot: { asOfDate: string; generatedAt: string };
  totals: { admissions: number; discharges: number; net: number; bedDays: number; averageDailyCensus: number; completedStayCount: number; averageCompletedStayDays: number | null; medianCompletedStayDays: number | null };
  monthly: Month[];
  sites: Site[];
  reconciliation: { weeklyCensusPoints: number; movementRows: number; communities: number };
  method: string;
};

const number = (value: number) => new Intl.NumberFormat("en-US").format(value);
const monthName = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function ResidentFlowReport({ facilityId = null }: { facilityId?: string | null }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const url = `/api/platform/resident-flow-report${facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : ""}`;
    fetchWithApiAuth(url, { signal: controller.signal }, {
      consume: async (response) => {
        if (!response.ok) throw new Error(`Client flow unavailable (${response.status})`);
        return await response.json() as Report;
      }
    }).then(setReport).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [facilityId]);

  if (error) return <p className="resident-flow-error" role="status">Client flow is temporarily unavailable.</p>;
  if (!report || report.scope.facilityId !== facilityId) return <p className="resident-flow-error" role="status">Loading client flow…</p>;

  const { totals, period } = report;
  const values = report.monthly.map((row) => row.averageDailyCensus);
  const baseline = Math.floor(Math.min(...values) / 25) * 25;
  const range = Math.max(1, Math.max(...values) - baseline);
  const place = report.scope.kind === "community" ? `at ${report.scope.label}` : "across the portfolio";

  return (
    <section className="resident-flow-report" aria-labelledby="resident-flow-title" data-resident-flow-report={report.scope.kind}>
      <div className="resident-flow-head">
        <h2 id="resident-flow-title">Client flow</h2>
        <span>{report.scope.label} · Jan–{monthName(report.monthly.at(-1)!.month)} {period.year} · updated {dateLabel(report.snapshot.asOfDate)}</span>
      </div>
      <p className="resident-flow-lede"><strong>{number(totals.admissions)} people moved in</strong> and <strong>{number(totals.discharges)} moved out</strong> through {monthName(report.monthly.at(-1)!.month)}. That added <strong>{number(totals.net)} clients</strong> {place}. Occupied bed-days totaled <strong>{number(totals.bedDays)}</strong>, with <strong>{totals.averageDailyCensus}</strong> clients present on an average day.</p>

      <div className="resident-flow-body">
        <div className="resident-flow-chart">
          <div className="resident-flow-chart-head">
            <span className="resident-flow-section-label">Average clients per day</span>
            <span className="resident-flow-scale">Scale starts at {number(baseline)}</span>
          </div>
          <div className="resident-flow-bars" style={{ gridTemplateColumns: `repeat(${report.monthly.length}, minmax(0, 1fr))` }} role="img" aria-label={`Average clients per day, scale starts at ${baseline}. ${report.monthly.map((row) => `${monthName(row.month)}: ${row.averageDailyCensus}`).join(", ")}`}>
            {report.monthly.map((row) => (
              <div className="resident-flow-bar" key={row.month}>
                <strong>{row.averageDailyCensus}</strong>
                <span className="resident-flow-bar-track"><i style={{ height: `${Math.max(8, (row.averageDailyCensus - baseline) / range * 100)}%` }} /></span>
                <span>{monthName(row.month)}</span>
              </div>
            ))}
          </div>
          <ol className="resident-flow-month-list" aria-label="Average clients per day by month">
            {report.monthly.map((row) => (
              <li key={row.month}>
                <span>{monthName(row.month)}</span>
                <span className="resident-flow-month-track" aria-hidden="true"><i style={{ width: `${Math.max(8, (row.averageDailyCensus - baseline) / range * 100)}%` }} /></span>
                <strong>{number(row.averageDailyCensus)}</strong>
              </li>
            ))}
          </ol>
        </div>
        <aside className="resident-flow-stay">
          <span className="resident-flow-section-label">Completed stays</span>
          <strong>{totals.medianCompletedStayDays ?? "—"} days</strong>
          <span>Median length of stay</span>
          <p>Among {number(totals.completedStayCount)} people discharged in this period, the average completed stay was {totals.averageCompletedStayDays ?? "—"} days. Full stays can begin before {period.year}.</p>
        </aside>
      </div>

      {report.scope.kind === "portfolio" ? (
        <>
          <div className="resident-flow-table-wrap"><table><caption>Movement and occupied days by community</caption><thead><tr><th>Community</th><th>Moved in</th><th>Moved out</th><th>Net</th><th>Occupied bed-days</th><th>Daily average</th><th>Median completed stay</th></tr></thead><tbody>{report.sites.map((site) => <tr key={site.facilityId}><th scope="row">{site.community}</th><td>{number(site.admissions)}</td><td>{number(site.discharges)}</td><td>{site.net > 0 ? "+" : ""}{site.net}</td><td>{number(site.bedDays)}</td><td>{site.averageDailyCensus}</td><td>{site.medianCompletedStayDays == null ? "—" : `${site.medianCompletedStayDays} days`}</td></tr>)}</tbody></table></div>
          <div className="resident-flow-sites" aria-label="Movement and occupied days by community">
            <h3>By community</h3>
            {report.sites.map((site) => (
              <section key={site.facilityId} className="resident-flow-site">
                <h4>{site.community}</h4>
                <dl>
                  <div><dt>Moved in</dt><dd>{number(site.admissions)}</dd></div>
                  <div><dt>Moved out</dt><dd>{number(site.discharges)}</dd></div>
                  <div><dt>Net</dt><dd>{site.net > 0 ? "+" : ""}{number(site.net)}</dd></div>
                  <div><dt>Occupied bed-days</dt><dd>{number(site.bedDays)}</dd></div>
                  <div><dt>Daily average</dt><dd>{number(site.averageDailyCensus)}</dd></div>
                  <div><dt>Median completed stay</dt><dd>{site.medianCompletedStayDays == null ? "—" : `${number(site.medianCompletedStayDays)} days`}</dd></div>
                </dl>
              </section>
            ))}
          </div>
        </>
      ) : null}
      <p className="resident-flow-foot">Through {dateLabel(period.through)}. Admission day counts; discharge day does not. Monthly movement reconciles with stay records, and {report.reconciliation.weeklyCensusPoints} weekly census points match. Historical occupancy percentage is omitted because dated operating limits are unavailable.</p>
    </section>
  );
}
