import { useEffect, useState } from "react";
import { fetchWithApiAuth } from "../../../shared/api/authenticatedFetch";
import "./resident-flow-report.css";

type Site = { facilityId: string; community: string; admissions: number; discharges: number; net: number; bedDays: number; averageDailyCensus: number; medianCompletedStayDays: number | null };
type Month = { month: string; admissions: number; discharges: number; bedDays: number; averageDailyCensus: number };
type Report = {
  status: "complete";
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

export default function ResidentFlowReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchWithApiAuth("/api/platform/resident-flow-report", { signal: controller.signal }, {
      consume: async (response) => {
        if (!response.ok) throw new Error(`Client flow unavailable (${response.status})`);
        return await response.json() as Report;
      }
    }).then(setReport).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  if (error) return <p className="resident-flow-error" role="status">Client flow is temporarily unavailable.</p>;
  if (!report) return <p className="resident-flow-error" role="status">Loading client flow…</p>;
  const { totals, period } = report;
  const maxCensus = Math.max(...report.monthly.map((row) => row.averageDailyCensus));
  return (
    <section className="resident-flow-report" aria-labelledby="resident-flow-title" data-resident-flow-report="complete">
      <div className="resident-flow-head"><h2 id="resident-flow-title">Client flow</h2><span>{`Jan–${monthName(report.monthly.at(-1)!.month)} ${period.year}`} · {report.reconciliation.communities} communities · updated {dateLabel(report.snapshot.asOfDate)}</span></div>
      <p className="resident-flow-lede"><strong>{number(totals.admissions)} people moved in</strong> and <strong>{number(totals.discharges)} moved out</strong> through {monthName(report.monthly.at(-1)!.month)}. That added <strong>{number(totals.net)} clients</strong> across the portfolio. The communities delivered <strong>{number(totals.bedDays)} occupied bed-days</strong>—an average daily census of <strong>{totals.averageDailyCensus}</strong>.</p>
      <div className="resident-flow-body">
        <div className="resident-flow-chart"><div className="resident-flow-section-label">Average clients per day</div><div className="resident-flow-bars" role="img" aria-label={report.monthly.map((row) => `${monthName(row.month)}: ${row.averageDailyCensus}`).join(", ")}>{report.monthly.map((row) => <div className="resident-flow-bar" key={row.month}><strong>{row.averageDailyCensus}</strong><i style={{ height: `${Math.max(8, row.averageDailyCensus / maxCensus * 100)}%` }} /><span>{monthName(row.month)}</span></div>)}</div></div>
        <aside className="resident-flow-stay"><span className="resident-flow-section-label">Completed stays</span><strong>{totals.medianCompletedStayDays ?? "—"} days</strong><span>median length of stay</span><p>Among {number(totals.completedStayCount)} people discharged in this period, the average stay was {totals.averageCompletedStayDays ?? "—"} days. These are full stays, including days before {period.year}.</p></aside>
      </div>
      <div className="resident-flow-table-wrap"><table><caption>Movement and occupied days by community</caption><thead><tr><th>Community</th><th>Moved in</th><th>Moved out</th><th>Net</th><th>Occupied bed-days</th><th>Daily average</th><th>Median completed stay</th></tr></thead><tbody>{report.sites.map((site) => <tr key={site.facilityId}><th scope="row">{site.community}</th><td>{number(site.admissions)}</td><td>{number(site.discharges)}</td><td>{site.net > 0 ? "+" : ""}{site.net}</td><td>{number(site.bedDays)}</td><td>{site.averageDailyCensus}</td><td>{site.medianCompletedStayDays} days</td></tr>)}</tbody></table></div>
      <p className="resident-flow-foot">Through {dateLabel(period.through)}. Admission day is counted; discharge day is excluded. Monthly movement reconciles with stay records, and {report.reconciliation.weeklyCensusPoints} weekly census points match. Historical occupancy percentage is omitted because dated operating limits are unavailable.</p>
    </section>
  );
}
