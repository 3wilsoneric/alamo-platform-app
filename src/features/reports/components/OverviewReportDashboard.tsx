import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import type { FullReportBlock, FullReportDocument } from "../../../shared/types/fullReport";
import "./platform-design-pass.css";

// Presentation only: use the governed report's exact values and missing-data labels.
export default function OverviewReportDashboard({ report, renderBlock }: {
  report: FullReportDocument; renderBlock: (block: FullReportBlock) => ReactNode;
}) {
  const operating = report.sections.find(section => section.id === "community-operating-position");
  const table = operating?.blocks.find(block => block.type === "table");
  const metric = (label: string) => report.metrics.find(item => item.label === label);
  const number = (value: string | number | undefined) => value !== undefined && /^[-+\d,.]+$/.test(String(value)) ? Number(String(value).replace(/,/g, "")) : null;
  const has = (key: string) => table?.columns.some(column => column.key === key);
  const capacity = has("operatingLimit");
  const maximum = Math.max(1, ...(table?.rows.map(row => number(capacity ? row.operatingLimit : row.census) ?? 0) ?? []));
  const census = metric("Census");
  const flowPeriod = operating?.intro?.split(". ").find(sentence => sentence.startsWith("Resident flow uses "));
  const net = metric("Net resident flow") ?? metric("Reported net flow");
  return <div className="overview-dashboard">
    {table && <>
      <section className="overview-dashboard__census" aria-labelledby="overview-census-title">
        <header><div><h2 id="overview-census-title">Census</h2>{census?.detail && census.detail !== report.dataThrough && <p>{census.detail}</p>}</div><p className="overview-dashboard__total"><strong>{census?.value}</strong><span>residents</span></p></header>
        <div className="overview-dashboard__census-labels" aria-hidden="true"><span>Community</span><span>{capacity ? "Census / operating limit" : "Census"}</span>{capacity && <span>Open beds</span>}</div>
        <ul>{table.rows.map(row => {
          const occupied = number(row.census), limit = number(row.operatingLimit);
          const facility = ALAMO_FACILITIES.find(item => item.shortName === row.community || item.communityName === row.community);
          return <li key={String(row.community)}>
            {facility ? <Link className="overview-dashboard__community-link" to={`/home/community/${facility.facilityId}`}>{row.community}<ArrowUpRight size={16} aria-hidden="true" /></Link> : <strong>{row.community}</strong>}
            <div className="overview-dashboard__capacity" role="img" aria-label={`${row.census} residents${capacity ? ` of ${row.operatingLimit} operating beds` : ""}`}>
              <span>{row.census}{capacity && <> <small>/ {row.operatingLimit}</small></>}</span>
              {occupied !== null && (!capacity || limit !== null) && <div className="overview-dashboard__capacity-track" aria-hidden="true" style={{ width: `${Math.min(100, (capacity ? Math.max(limit ?? 0, occupied) : occupied) / maximum * 100)}%` }}><i style={{ width: `${capacity && limit ? Math.min(100, occupied / Math.max(limit, occupied) * 100) : 100}%` }} /></div>}
            </div>
            {capacity && <span className="overview-dashboard__open" role="img" aria-label={`${row.open} open beds`}><strong>{row.open}</strong><small>open</small></span>}
          </li>;
        })}</ul>
        {capacity && <p className="overview-dashboard__legend"><i aria-hidden="true" />Occupied <span />Available to current operating limit</p>}
      </section>
      <div className="overview-dashboard__details">
        {has("admissions") && <section aria-labelledby="overview-movement-title"><header><div><h2 id="overview-movement-title">Admissions & discharges</h2>{flowPeriod && <p>{flowPeriod.replace("Resident flow uses ", "").replace(/\.$/, "")}</p>}</div></header>
          <table><thead><tr><th>Community</th><th>In</th><th>Out</th><th>Net</th></tr></thead><tbody>{table.rows.map(row => <tr key={String(row.community)}><th scope="row">{row.community}</th><td>{row.admissions}</td><td>{row.discharges}</td><td>{row.net}</td></tr>)}</tbody></table>
          {net && <p className="overview-dashboard__result"><span>{net.label}</span><strong>{net.value}</strong></p>}
        </section>}
        {(has("incidents") || has("compliance")) && <section aria-labelledby="overview-recorded-title"><header><h2 id="overview-recorded-title">Recorded activity</h2></header>
          <table><thead><tr><th>Community</th>{has("incidents") && <th>Incidents<small>{metric("Incidents")?.detail}</small></th>}{has("compliance") && <th>Administrations given<small>{metric("Administrations given")?.detail}</small></th>}</tr></thead><tbody>{table.rows.map(row => <tr key={String(row.community)}><th scope="row">{row.community}</th>{has("incidents") && <td>{row.incidents}</td>}{has("compliance") && <td>{row.compliance}</td>}</tr>)}</tbody></table>
        </section>}
      </div>
    </>}
    {report.sections.filter(section => !table || section !== operating).map(section => <section className="overview-dashboard__additional" key={section.id} aria-label={section.title}><h2>{section.title}</h2>{section.blocks.map((block, index) => <div key={index}>{renderBlock(block)}</div>)}</section>)}
  </div>;
}
