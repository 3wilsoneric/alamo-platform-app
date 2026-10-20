import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Activity, ClipboardCheck, ShieldAlert, Sparkles } from "lucide-react";
import { fetchAnalyticsSummary, fetchHomeDashboard, fetchMedroomDashboard, type HomeDashboardResponse, type MedroomDashboardResponse, type ReportsSummaryResponse } from "../../../shared/api/platformData";
import { useMedroomAccess } from "../../../shared/auth/medroomAccess";
import AnalyticsSectionNavigation from "../../california/components/AnalyticsSectionNavigation";
import { buildMedicationCommunities, buildMedicationMonths, buildQuarterlyTrend } from "../medroomDashboardModel";
import "../medroomDashboard.css";

const number = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-US").format(value);
const percent = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(1)}%`;
const monthLabel = (month: string | null | undefined) => month && /^\d{4}-\d{2}$/.test(month)
  ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))
  : "No period available";

function MedroomDashboard() {
  const navigate = useNavigate();
  const [medication, setMedication] = useState<ReportsSummaryResponse | null>(null);
  const [dashboard, setDashboard] = useState<HomeDashboardResponse | null>(null);
  const [detail, setDetail] = useState<MedroomDashboardResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [trendView, setTrendView] = useState<"monthly" | "quarterly">("monthly");
  const [rollingDays, setRollingDays] = useState<7 | 30 | 60 | 90 | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([fetchAnalyticsSummary(controller.signal), fetchHomeDashboard(controller.signal), fetchMedroomDashboard(controller.signal)]).then(([medResult, homeResult, detailResult]) => {
      if (controller.signal.aborted) return;
      setMedication(medResult.status === "fulfilled" ? medResult.value : null);
      setDashboard(homeResult.status === "fulfilled" ? homeResult.value : null);
      setDetail(detailResult.status === "fulfilled" ? detailResult.value : null);
      setLoaded(true);
    });
    return () => controller.abort();
  }, []);

  const months = useMemo(() => buildMedicationMonths(medication), [medication]);
  const current = months.at(-1) ?? null;
  const communities = useMemo(() => buildMedicationCommunities(medication, current?.month ?? null), [medication, current?.month]);
  const quarters = useMemo(() => buildQuarterlyTrend(months, dashboard), [months, dashboard]);
  const incidentByMonth = new Map(dashboard?.incidentTrend.map((row) => [row.month_bucket, row.incidentCount]) ?? []);
  const trendRows = trendView === "monthly"
    ? months.map((row) => ({ period: monthLabel(row.month), completion: row.completion, given: row.given, scheduled: row.scheduled,
      incidents: incidentByMonth.get(row.month) ?? null, coverage: `${row.communities}/5 communities`, partial: row.communities < 5 || !incidentByMonth.has(row.month) }))
    : quarters;
  const incidentMonth = dashboard?.reporting_month ?? null;
  const incidentCount = dashboard?.portfolio.currentIncidents ?? null;
  const communityIncidents = new Map(dashboard?.communities.map(row => [row.facility_id, row.currentIncidents]) ?? []);
  const note = !loaded ? "Loading governed measures…" : !medication && !dashboard ? "Governed measures are unavailable. No values have been inferred from the reference PDF." : null;
  const monthDetail = detail?.daily_available && detail.medication_month === current?.month ? detail.current_month : null;
  const activeWindow = rollingDays ? detail?.windows[String(rollingDays)] ?? null : null;
  const breakdown = [
    { label: "Missed", value: monthDetail?.missed_count, description: "Only outcomes explicitly recorded as missed in the source reason" },
    { label: "Late", value: monthDetail?.late_given_count, description: "Given more than 60 minutes late" },
    { label: "Refused", value: monthDetail?.refused_count, description: "Recorded refusal outcome; med-room detail only" },
    { label: "Held", value: monthDetail?.held_count, description: "Recorded held outcome" },
    { label: "Pending", value: monthDetail?.pending_count, description: "Scheduled administration without resolved outcome" },
    { label: "PRN given", value: monthDetail?.prn_given_count, description: "As-needed administrations recorded as given" },
    { label: "Possible duplicate orders", value: detail?.possible_duplicate_orders, description: "Matching current orders; human verification required" },
    { label: "Inventory", value: null, description: "Stock/on-hand feed not connected" }
  ];

  return <>
    <AnalyticsSectionNavigation active="licensing" onNavigate={section => navigate(section === "reports" ? "/analytics" : `/analytics/${section}`)} />
    <main className="medroom-dashboard" data-medroom-dashboard="true">
      <div className="medroom-dashboard__topline"><Link to="/analytics/licensing">Licensing reports</Link><span aria-hidden="true">/</span><span>Med-room dashboard</span></div>
      <header className="medroom-dashboard__header">
        <div><p className="medroom-dashboard__eyebrow">Portfolio · medication operations</p><h1>Med-room dashboard</h1><p>Five communities · source-backed measures and explicit coverage</p></div>
        <div className="medroom-dashboard__period"><span>MAR period</span><strong>{monthLabel(current?.month)}</strong><small>Incident period: {monthLabel(incidentMonth)}</small></div>
      </header>
      {note ? <p className="medroom-dashboard__notice" role="status">{note}</p> : null}
      {detail ? <p className="medroom-dashboard__source" role="status">Daily MAR: {detail.source_coverage}. {detail.latest_administration_date ? `Latest administration ${detail.latest_administration_date}.` : "No daily administration date available."} Rolling windows end {detail.as_of_date ?? "at the next governed snapshot"}.</p> : null}
      {detail?.monthly_reconciliation && !detail.monthly_reconciliation.matches ? <p className="medroom-dashboard__notice" role="alert">Monthly and daily MAR totals do not reconcile for {monthLabel(detail.medication_month)}. Monthly: {number(detail.monthly_reconciliation.monthly_given)} given / {number(detail.monthly_reconciliation.monthly_scheduled)} scheduled; daily: {number(detail.monthly_reconciliation.daily_given)} / {number(detail.monthly_reconciliation.daily_scheduled)}. Review source definitions before using the breakdown.</p> : null}

      <section className="medroom-dashboard__section" aria-labelledby="medroom-snapshot">
        <div className="medroom-dashboard__section-head"><h2 id="medroom-snapshot">Executive snapshot</h2><span>01 / 06</span></div>
        <div className="medroom-dashboard__metrics">
          <Metric label="Overall compliance" value="Not scored" detail="No approved composite definition" />
          <Metric label="eMAR" value={detail?.daily_available ? "Daily detail available" : medication ? "Monthly summary available" : "Unavailable"} detail={detail?.latest_administration_date ? `Administration data through ${detail.latest_administration_date}` : "Daily publisher not yet available"} />
          <Metric label="Med pass" value={percent(current?.completion)} detail={current ? `${number(current.given)} given / ${number(current.scheduled)} scheduled` : "No current MAR period"} tone="plum" />
          <Metric label="Incidents" value={number(incidentCount)} detail={monthLabel(incidentMonth)} tone="rust" />
          <Metric label="Review signals" value={detail ? number(detail.watch.length) : "Unavailable"} detail="From connected sources only; not clinical risk grades" />
          <Metric label="Survey readiness" value="Not scored" detail="Evidence is available; no approved survey rubric" />
        </div>
      </section>

      <section className="medroom-dashboard__section" aria-labelledby="medroom-risk">
        <div className="medroom-dashboard__section-head"><h2 id="medroom-risk">AI risk center</h2><span>02 / 06</span></div>
        <p className="medroom-dashboard__scope">Transparent source checks, not clinical AI scores. Predictions and criticality remain unclassified until validated against outcomes and approved by an owner.</p>
        <div className="medroom-dashboard__risk-grid">
          <RiskItem icon={<ShieldAlert />} title="Critical issues" value="Not classified" detail="The Platform has no approved med-room criticality rule." />
          <RiskItem icon={<Activity />} title="Emerging signals" value={detail ? `${number(detail.watch.length)} checks` : "Source unavailable"} detail={detail?.watch.map(row => `${row.count} ${row.label.toLowerCase()}`).join(" · ") || "No review signals in the connected sources"} />
          <RiskItem icon={<Sparkles />} title="Predicted issues" value="Not enabled" detail="Prediction needs validated outcomes and a monitored model." />
          <RiskItem icon={<ClipboardCheck />} title="Required actions" value="Review records" detail="Review source records in the governed question library. No tasks are auto-assigned or resolved." />
        </div>
        {detail?.watch.length ? <div className="medroom-dashboard__watch-list"><strong>Source checks to review</strong><ul>{detail.watch.map(item => <li key={item.code}><span>{item.label}</span><strong>{number(item.count)}</strong></li>)}</ul><small>These are read-only review prompts, not assigned tasks or clinical severity grades.</small></div> : null}
        <div className="medroom-dashboard__inline-actions"><Link to="/incidents/history">Review incidents <ArrowRight size={16} /></Link><Link to="/analytics">Open medication report <ArrowRight size={16} /></Link></div>
      </section>

      <section className="medroom-dashboard__section" aria-labelledby="medroom-medications">
        <div className="medroom-dashboard__section-head"><h2 id="medroom-medications">Medication compliance</h2><span>03 / 06</span></div>
        <div className="medroom-dashboard__med-summary"><div><span>Administrations given</span><strong>{number(current?.given)}</strong></div><div><span>Scheduled</span><strong>{number(current?.scheduled)}</strong></div><div><span>Not given</span><strong>{number(current?.notGiven)}</strong></div></div>
        <p className="medroom-dashboard__scope">{monthDetail ? `Daily eMAR detail for ${monthLabel(current?.month)}. Categories reflect recorded source outcomes; they are not a composite compliance score.` : "Daily eMAR detail has not been published for this month. Monthly given/scheduled totals remain available above."} {detail?.prn_followup ? `${number(detail.prn_followup.documented)} of ${number(detail.prn_followup.administrations)} PRN administrations have documented effectiveness follow-up.` : "PRN follow-up coverage is unavailable."}</p>
        <div className="medroom-dashboard__breakdown">{breakdown.map(row => <div key={row.label} title={row.description}><span>{row.label}</span><strong>{row.value == null ? "Unavailable" : number(row.value)}</strong><small>{row.description}</small></div>)}</div>
      </section>

      <section className="medroom-dashboard__section" aria-labelledby="medroom-communities">
        <div className="medroom-dashboard__section-head"><h2 id="medroom-communities">Community performance</h2><span>04 / 06</span></div>
        <p className="medroom-dashboard__scope">Administration completion, {monthLabel(current?.month)}. A missing row is shown as unavailable, not zero.</p>
        <div className="medroom-dashboard__community-list">{communities.map(row => <Link key={row.facilityId} to={`/communities/${row.facilityId}`} className="medroom-dashboard__community">
          <span className="medroom-dashboard__community-name">{row.name}</span><strong>{percent(row.completion)}</strong><span>{number(row.given)} given / {number(row.scheduled)} scheduled · {communityIncidents.has(row.facilityId) ? `${number(communityIncidents.get(row.facilityId))} incidents (${monthLabel(incidentMonth)})` : "incidents unavailable"}</span><ArrowRight size={17} aria-hidden="true" />
        </Link>)}</div>
      </section>

      <section className="medroom-dashboard__section" aria-labelledby="medroom-trends">
        <div className="medroom-dashboard__section-head"><h2 id="medroom-trends">Trends</h2><span>05 / 06</span></div>
        <div className="medroom-dashboard__trend-controls" aria-label="Trend period">
          {([7, 30, 60, 90] as const).map(days => <button key={days} type="button" aria-pressed={rollingDays === days} disabled={!detail?.windows[String(days)]} onClick={() => setRollingDays(days)}>{days} days{detail?.windows[String(days)] ? "" : " · unavailable"}</button>)}
          <button type="button" aria-pressed={trendView === "monthly"} onClick={() => setTrendView("monthly")}>Monthly</button>
          <button type="button" aria-pressed={trendView === "quarterly"} onClick={() => setTrendView("quarterly")}>Quarterly</button>
        </div>
        {activeWindow ? <div className="medroom-dashboard__rolling" role="status"><strong>{rollingDays}-day med pass: {percent(activeWindow.completion_pct)}</strong><span>{number(activeWindow.given_count)} given / {number(activeWindow.scheduled_count)} scheduled · {activeWindow.from} through {activeWindow.through}</span></div> : null}
        <div className="medroom-dashboard__trend-table" role="table" aria-label="Medication completion and incident trend">
          <div role="row" className="medroom-dashboard__trend-header"><span role="columnheader">Period</span><span role="columnheader">Med pass</span><span role="columnheader">Given / scheduled</span><span role="columnheader">Incidents</span><span role="columnheader">Coverage</span></div>
          {trendRows.slice(-8).reverse().map(row => <div role="row" key={row.period}><span role="cell">{row.period}{row.partial ? <small>Partial coverage</small> : null}</span><strong role="cell">{percent(row.completion)}</strong><span role="cell">{number(row.given)} / {number(row.scheduled)}</span><span role="cell">{number(row.incidents)}</span><span role="cell">{row.coverage}</span></div>)}
          {!trendRows.length ? <p className="medroom-dashboard__empty">No comparable monthly data is available.</p> : null}
        </div>
      </section>

      <section className="medroom-dashboard__section medroom-dashboard__ask" aria-labelledby="medroom-ask">
        <div className="medroom-dashboard__section-head"><h2 id="medroom-ask">Ask AI</h2><span>06 / 06</span></div>
        <p>Start with a governed question. The analyst answers from its approved tools and shows source coverage; it will not infer inventory, survey scores, or clinical predictions.</p>
        <div className="medroom-dashboard__ask-prompts">
          {["Show the medication profile by community.", "Show the current incident snapshot.", "Show the current portfolio operating snapshot."].map(prompt => <Link key={prompt} to={`/analytics/questions?${new URLSearchParams({ prompt })}`}>{prompt}<ArrowRight size={15} /></Link>)}
        </div>
        <Link to="/analytics/questions">Open Ask a question <ArrowRight size={17} /></Link>
      </section>
    </main>
  </>;
}

function Metric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "plum" | "rust" }) {
  return <div className={`medroom-dashboard__metric is-${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function RiskItem({ icon, title, value, detail }: { icon: ReactNode; title: string; value: string; detail: string }) {
  return <div className="medroom-dashboard__risk-item"><span className="medroom-dashboard__risk-icon" aria-hidden="true">{icon}</span><div><h3>{title}</h3><strong>{value}</strong><p>{detail}</p></div></div>;
}

export default function MedroomDashboardPage() {
  const allowed = useMedroomAccess();
  return allowed ? <MedroomDashboard /> : <Navigate to="/analytics" replace />;
}
