import type { ReactNode } from "react";
import type { FullReportBlock, FullReportDocument } from "../../../shared/types/fullReport";
import "./client-profile-report.css";

export default function ClientProfileReport({ report, renderBlock }: {
  report: FullReportDocument;
  renderBlock: (block: FullReportBlock) => ReactNode;
}) {
  return <details className="client-profile-report">
    <summary>Current client profile</summary>
    <dl className="client-profile-metrics">
      {report.metrics.map(metric => <div key={metric.label}>
        <dt>{metric.label === "Profile rows" ? "Client profiles" : metric.label === "Primary diagnosis populated" ? "Diagnosis recorded" : metric.label}</dt>
        <dd>{metric.value}</dd>
        {metric.detail && !["Current profile", "Current governed extract"].includes(metric.detail) && <small>{metric.detail}</small>}
      </div>)}
    </dl>
    <div className="client-profile-sections">
      {report.sections.map(section => <section key={section.id} id={section.id}>
        <h2>{section.title}</h2>
        {section.blocks.map((block, index) => <div key={index}>{renderBlock(block)}</div>)}
      </section>)}
    </div>
  </details>;
}
