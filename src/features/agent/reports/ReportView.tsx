import type { ExecutiveReport, ReportDataset } from './reportClient';
import { reportColumnLabel, reportCellValue as displayValue } from '../../../../shared/report-display.mjs';
export type ReportMeasures = Record<string, string>;

function SourceTable({dataset}: {dataset: ReportDataset}) {
  const columns = dataset.columns.map(column => ({...column, label:reportColumnLabel(column)}));
  const identity = columns.find(column => column.type === 'string');
  return <>
    <div className="ally-report-table" tabIndex={0} role="region" aria-label={`${dataset.title} data`}>
      <table><caption>{dataset.title}</caption><thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>{dataset.rows.map((row,i) => <tr key={i}>{columns.map(c => <td key={c.key} data-numeric={c.type==='number'}>{displayValue(row[c.key])}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <ul className="ally-report-records" aria-label={dataset.title}>{dataset.rows.map((row,i) => <li key={i}>
      {identity && <h4>{displayValue(row[identity.key])}</h4>}
      <dl>{columns.filter(column => column !== identity).map(column => <div key={column.key}><dt>{column.label}</dt><dd>{displayValue(row[column.key])}</dd></div>)}</dl>
    </li>)}</ul>
    {!dataset.rows.length && <p>No records in this scope.</p>}
  </>;
}
function DataView({dataset, component, measure, onMeasureChange}: {dataset: ReportDataset; component: string; measure: string | undefined; onMeasureChange: ((measure: string) => void) | undefined}) {
  const columns = dataset.columns.map(column => ({...column,label:reportColumnLabel(column)}));
  const label = columns.find(c => c.type === 'string');
  const numbers = columns.filter(c => c.type === 'number');
  const metric = numbers.find(c => c.key === measure) ?? numbers[0];
  const chart = component !== 'table' && label && metric && dataset.rows.length > 0 && dataset.rows.length <= (component === 'comparison' ? 20 : 100);
  const rows = component === 'trend' && label ? [...dataset.rows].sort((a,b) => String(a[label.key]).localeCompare(String(b[label.key]))) : dataset.rows;
  const values = metric ? rows.map(r => typeof r[metric.key] === 'number' ? Number(r[metric.key]) : null) : [];
  const min = Math.min(0, ...values.filter((v): v is number => v !== null)), max = Math.max(0, ...values.filter((v): v is number => v !== null));
  const range = max - min || 1;
  return <div className="ally-report-data">
    {chart && <p className="ally-report-print-values">{metric.label}</p>}
    {chart && numbers.length > 1 && <div className="ally-report-chart-tools"><select aria-label="Chart measure" value={metric?.key} disabled={!onMeasureChange} onChange={e => onMeasureChange?.(e.target.value)}>{numbers.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>}
    {chart && numbers.length === 1 && <p className="ally-report-measure">{metric.label}</p>}
    {chart ? component === 'trend' ? <figure aria-label={`${dataset.title}: ${metric.label}`}>
      <div className="ally-report-trend-plot"><div className="ally-report-trend-scale" aria-hidden="true"><span>{displayValue(max)}</span><span>{displayValue(min)}</span></div>
        <svg viewBox="0 0 440 148" role="img" aria-label={`${metric.label} over time; exact values below`}>
          <line x1="4" y1={136-(0-min)/range*124} x2="436" y2={136-(0-min)/range*124} className="ally-report-axis"/>
          {rows.slice(1).map((_,i) => values[i] !== null && values[i+1] !== null && <line key={i} x1={4+i/Math.max(1,rows.length-1)*432} y1={136-(Number(values[i])-min)/range*124} x2={4+(i+1)/Math.max(1,rows.length-1)*432} y2={136-(Number(values[i+1])-min)/range*124} className="ally-report-trend"/>)}
          {rows.map((r,i) => values[i] !== null && <circle key={i} cx={4+i/Math.max(1,rows.length-1)*432} cy={136-(Number(values[i])-min)/range*124} r="3" className="ally-report-point"><title>{displayValue(r[label.key])}: {displayValue(values[i])}</title></circle>)}
        </svg>
      </div>
      <div className="ally-report-trend-labels"><span>{displayValue(rows[0]?.[label.key])}</span><span>{displayValue(rows.at(-1)?.[label.key])}</span></div>
    </figure>
      : <ul className="ally-report-comparison" aria-label={metric.label}>{rows.map((r,i) => <li key={i}><span>{displayValue(r[label.key])}</span><strong>{values[i]?.toLocaleString() ?? 'Not recorded'}</strong><div className="ally-report-track" aria-hidden="true"><i style={{left: `${(Math.min(values[i] ?? 0,0)-min)/range*100}%`, width: `${Math.abs(values[i] ?? 0)/range*100}%`}}/></div></li>)}</ul>
      : <SourceTable dataset={dataset}/>}
    {chart && <details className="ally-report-data-table"><summary>View data table</summary><SourceTable dataset={dataset}/></details>}
    {chart && <div className="ally-report-print-values"><SourceTable dataset={dataset}/></div>}
  </div>;
}
export default function ReportView({report, canvas = false, anchorPrefix = 'ally', measures = {}, onMeasureChange}: {report: ExecutiveReport; canvas?: boolean; anchorPrefix?: string; measures?: ReportMeasures; onMeasureChange?: (sectionId: string, measure: string) => void}) {
  const artifact = report.artifact;
  if (!artifact) return null;
  return <article className={`ally-report-document${canvas ? ' ally-report-document--canvas' : ''}`} aria-label="Report findings">
    {!canvas && <header><h2>{artifact.title}</h2><p>{report.scope.from} – {report.scope.through}<span>Version {report.selectedVersion} · {new Date(artifact.generatedAt).toLocaleString()}</span></p></header>}
    {artifact.findings.map((f,i) => <section className="ally-report-finding" key={i}><p>{f.text}</p>{!canvas && <div className="ally-report-citations">{f.sourceIds.map(id => <a key={id} href={`#${anchorPrefix}-${id}`}>{artifact.sections.find(s => s.id === id)?.title ?? 'Source'}</a>)}</div>}</section>)}
    {artifact.gaps.length > 0 && <details className="ally-report-gaps" open><summary>Coverage limits</summary><ul>{artifact.gaps.map((g,i) => <li key={i}>{g}</li>)}</ul></details>}
    {artifact.sections.map(section => { const block = report.view?.blocks.find(b => b.datasetId === section.id && b.sourceIds.includes(section.id));
      return <section id={`${anchorPrefix}-${section.id}`} key={section.id} className="ally-report-source"><h3>{section.title}</h3>{!canvas && <p className="ally-report-source-date">{section.period} · {section.grain}</p>}
        {section.dataset && <DataView key={`${report.selectedVersion}-${section.id}`} dataset={section.dataset} component={block?.componentId ?? 'table'} measure={measures[section.id] ?? block?.measureKey ?? undefined} onMeasureChange={onMeasureChange && (measure => onMeasureChange(section.id, measure))}/>}
        {!canvas && <details><summary>Source evidence</summary><p>{section.note}</p><p>Observed {new Date(section.observedAt).toLocaleString()}</p>{section.answer && <pre>{section.answer}</pre>}</details>}
      </section>;
    })}
    {canvas && <details className="ally-report-canvas-sources"><summary>Sources used</summary><ul>{artifact.sections.map(section => <li key={section.id}>{section.title} · {section.period}</li>)}</ul></details>}
  </article>;
}
