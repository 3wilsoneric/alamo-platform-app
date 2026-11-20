import type { CSSProperties, ReactNode } from "react";
import type { FullReportBlock, FullReportDocument, FullReportMetric } from "../../../shared/types/fullReport";
import "./community-report-dashboard.css";

type Section = FullReportDocument["sections"][number];
type RenderBlock = (block: FullReportBlock) => ReactNode;
const metrics = (section?: Section) => section?.blocks.flatMap(block => block.type === "metric_grid" ? block.items : []) ?? [];
const numeric = (value?: string) => value && /^[+-]?[\d,]+(?:\.\d+)?%?$/.test(value) ? Number(value.replace(/[,%]/g, "")) : null;

function Facts({ items }: { items: FullReportMetric[] }) {
  return <dl className="community-dashboard__facts">{items.map(item => <div key={item.label}>
    <dt>{item.label}</dt><dd>{item.value}{item.detail && <small>{item.detail}</small>}</dd>
  </div>)}</dl>;
}

function Bars({ block, percentage = false }: { block: Extract<FullReportBlock, { type: "bar_list" }>; percentage?: boolean }) {
  const maximum = percentage ? 100 : Math.max(...block.items.map(item => item.value), 1);
  return <div className="community-dashboard__bars">{block.items.map(item => <div className="community-dashboard__bar-row" key={item.label}>
    <div><span>{item.label}</span><strong>{item.displayValue ?? item.value.toLocaleString()}</strong></div>
    <div className="community-dashboard__track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, item.value / maximum * 100))}%` }} /></div>
  </div>)}</div>;
}

function SectionContent({ section, renderBlock, omit = [] }: { section?: Section; renderBlock: RenderBlock; omit?: FullReportBlock["type"][] }) {
  if (!section) return null;
  return <>{section.intro && <p className="community-dashboard__note">{section.intro}</p>}{section.blocks.filter(block => !omit.includes(block.type)).map((block, index) => <div key={index}>
    {block.type === "metric_grid" ? <Facts items={block.items} /> : block.type === "bar_list" ? <Bars block={block} /> : renderBlock(block)}
  </div>)}</>;
}

export default function CommunityReportDashboard({ report, renderBlock }: { report: FullReportDocument; renderBlock: RenderBlock }) {
  const section = (id: string) => report.sections.find(item => item.id === id);
  const capacity = section("capacity-position");
  const population = section("census-and-residents");
  const flow = section("resident-flow");
  const incidents = section("incident-pattern");
  const severity = section("incident-severity");
  const medications = section("medication-performance");
  const burden = section("medication-burden");
  const coverage = section("care-delivery-coverage");
  const watch = section("resident-watch");
  const capacityMetrics = metrics(capacity);
  const capacityMetric = (label: string) => capacityMetrics.find(item => item.label === label);
  const occupied = capacityMetric("Weekly operating census");
  const limit = capacityMetric("Operating limit");
  const open = capacityMetric("Open to operating limit");
  const used = numeric(occupied?.value);
  const available = numeric(limit?.value);
  const utilization = report.metrics.find(item => item.label === "Weekly operating utilization");
  const trend = population?.blocks.find(block => block.type === "trend");
  const history = trend?.items.flatMap(item => {
    const value = numeric(item.value);
    return value === null ? [] : [{ label: item.label, value, displayValue: item.value }];
  }) ?? [];
  const flowMetrics = metrics(flow);
  const arrivals = flowMetrics.find(item => item.label === "Admissions");
  const departures = flowMetrics.find(item => item.label === "Discharges");
  const net = flowMetrics.find(item => item.label === "Net movement");
  const flowMaximum = Math.max(numeric(arrivals?.value) ?? 0, numeric(departures?.value) ?? 0, 1);
  const incidentCount = report.metrics.find(item => item.label === "Incidents");
  const longStayDetail = report.metrics.find(metric => metric.label === "Stays over one year")?.detail;
  const diagnosis = population?.blocks.find(block => block.type === "bar_list");
  const administrations = metrics(medications)[0];
  const knownSections = new Set([capacity, population, flow, incidents, severity, medications, burden, coverage, watch].filter(Boolean));

  return <div className="community-dashboard" data-community-dashboard="true">
    <div className="community-dashboard__overview">
      <section className="community-dashboard__panel community-dashboard__census" id={capacity?.id ?? "census-history"} aria-labelledby="community-census-heading">
        <header><h2 id="community-census-heading">Census</h2><span>{report.period.label}</span></header>
        <div className="community-dashboard__census-body">
          {capacity && <div className="community-dashboard__capacity">
            <div className="community-dashboard__capacity-label">Current census</div>
            <div className="community-dashboard__ratio"><strong>{occupied?.value}</strong><span>/ {limit?.value}</span></div>
            <div className="community-dashboard__capacity-label">{limit?.label}</div>
            {used !== null && available !== null && available > 0 && <div className="community-dashboard__capacity-meter" role="img" aria-label={`${occupied?.value} occupied of ${limit?.value} operating beds`}>
              {Array.from({ length: 25 }, (_, i) => <span key={i} style={{ "--segment-fill": `${Math.max(0, Math.min(1, used / available * 25 - i)) * 100}%` } as CSSProperties} />)}
            </div>}
            <div className="community-dashboard__open"><strong>{open?.value}</strong><span>Open beds</span></div>
            {utilization && <div className="community-dashboard__utilization"><strong>{utilization.value}</strong><span>Operating utilization</span></div>}
            <details className="community-dashboard__capacity-details"><summary>{capacity.title}</summary>
              {capacity.intro && <p>{capacity.intro}</p>}
              <Facts items={capacityMetrics.filter(item => ![occupied, limit, open].includes(item))} />
            </details>
          </div>}
          <div className="community-dashboard__history">
            <h3>Census history</h3>
            {history.length ? <>{renderBlock({ type: "line_chart", label: "Monthly census", items: history.map(point => ({ ...point, label: point.label.replace(/^([A-Za-z]{3})[A-Za-z]* /, "$1 ") })) })}
              <details className="community-dashboard__details"><summary>Monthly values</summary>{renderBlock({ type: "table", columns: [{ key: "month", label: "Month" }, { key: "census", label: "Census" }], rows: history.map(point => ({ month: point.label, census: point.displayValue })) })}</details>
            </> : <p>{population?.intro ?? "Census unavailable for this period."}</p>}
          </div>
        </div>
      </section>

      {flow && <section className="community-dashboard__panel community-dashboard__flow" id={flow.id} aria-labelledby="community-flow-heading">
        <header><h2 id="community-flow-heading">{flow.title}</h2>{flow.intro && <span>{flow.intro}</span>}</header>
        <div className="community-dashboard__flow-body">
          {[arrivals, departures].map((item, i) => item && <div className="community-dashboard__movement" data-direction={i === 0 ? "in" : "out"} key={item.label}>
            <div><span aria-hidden="true">{i === 0 ? "↘" : "↗"}</span><span>{item.label}</span><strong>{item.value}</strong></div>
            <div className="community-dashboard__track" aria-hidden="true"><span style={{ width: `${(numeric(item.value) ?? 0) / flowMaximum * 100}%` }} /></div>
          </div>)}
          {net && <div className="community-dashboard__net"><span>{net.label}</span><strong>{net.value}</strong></div>}
        </div>
      </section>}
    </div>

    <div className="community-dashboard__domains">
      {incidents && <section className="community-dashboard__panel community-dashboard__incidents" id={incidents.id} aria-labelledby="community-incidents-heading">
        <header><h2 id="community-incidents-heading">{incidents.title}</h2>{incidentCount && <div className="community-dashboard__total"><strong>{incidentCount.value}</strong><span>{incidentCount.label}</span></div>}</header>
        <div className="community-dashboard__inset">
          <SectionContent section={incidents} renderBlock={renderBlock} omit={["table"]} />
          {severity && <div id={severity.id} className="community-dashboard__severity"><h3>{severity.title}</h3><SectionContent section={severity} renderBlock={renderBlock} /></div>}
          {incidents.blocks.filter(block => block.type === "table").map((block, i) => <details className="community-dashboard__details" key={i}><summary>Incident records <span>{block.rows.length}</span></summary>{renderBlock(block)}</details>)}
        </div>
      </section>}

      {population && <section className="community-dashboard__panel community-dashboard__profile" id={population.id} aria-labelledby="community-profile-heading">
        <header><h2 id="community-profile-heading">Client profile</h2></header>
        <div className="community-dashboard__inset">
          {population.intro && history.length > 0 && <p className="community-dashboard__note">{population.intro}</p>}
          <Facts items={metrics(population).map(item => ({ ...item, label: item.label === "Current profile rows" ? "Current clients" : item.label, ...(item.label === "Stay over one year" && longStayDetail ? { detail: longStayDetail } : {}) }))} />
          {diagnosis && diagnosis.items.length > 0 && <div className="community-dashboard__diagnosis"><h3>Diagnosis mix</h3><Bars block={{ ...diagnosis, items: diagnosis.items.slice(0, 4) }} />{diagnosis.items.length > 4 && <details className="community-dashboard__details"><summary>Other diagnoses <span>{diagnosis.items.length - 4}</span></summary><Bars block={{ ...diagnosis, items: diagnosis.items.slice(4) }} /></details>}</div>}
        </div>
      </section>}
    </div>

    <div className="community-dashboard__domains">
      {(medications || burden) && <section className="community-dashboard__panel community-dashboard__medications" id="medication-performance" aria-labelledby="community-medications-heading">
        <header><h2 id="community-medications-heading">{medications?.title ?? burden?.title}</h2></header>
        <div className="community-dashboard__inset">
          {medications?.intro && <p className="community-dashboard__note">{medications.intro}</p>}
          {administrations && <div className="community-dashboard__administrations"><strong>{administrations.value}</strong><span>{administrations.label}</span></div>}
          {burden && <div id={burden.id}><h3>{burden.title}</h3><SectionContent section={burden} renderBlock={renderBlock} /></div>}
        </div>
      </section>}
      {coverage && <section className="community-dashboard__panel community-dashboard__coverage" id={coverage.id} aria-labelledby="community-coverage-heading">
        <header><h2 id="community-coverage-heading">{coverage.title}</h2></header>
        <div className="community-dashboard__inset"><SectionContent section={coverage} renderBlock={renderBlock} omit={["metric_grid"]} />
          <Bars percentage block={{ type: "bar_list", items: metrics(coverage).flatMap(item => { const value = numeric(item.value); return value === null ? [] : [{ label: item.label, value, displayValue: item.value }]; }) }} />
          <Facts items={metrics(coverage).filter(item => numeric(item.value) === null)} />
        </div>
      </section>}
    </div>
    {watch && <section className="community-dashboard__panel community-dashboard__watch" id={watch.id} aria-labelledby="community-watch-heading"><header><h2 id="community-watch-heading">{watch.title}</h2></header><div className="community-dashboard__inset">
      {watch.intro && <p className="community-dashboard__note">{watch.intro}</p>}
      {watch.blocks.map((block, i) => block.type === "table" ? <details className="community-dashboard__details" key={i}><summary>{block.columns[0]?.label}<span>{block.rows.length}</span></summary>{renderBlock(block)}</details> : <div key={i}>{renderBlock(block)}</div>)}
    </div></section>}
    {report.sections.filter(item => !knownSections.has(item)).map(item => <section className="community-dashboard__panel" key={item.id} id={item.id}><header><h2>{item.title}</h2></header><div className="community-dashboard__inset"><SectionContent section={item} renderBlock={renderBlock} /></div></section>)}
  </div>;
}
