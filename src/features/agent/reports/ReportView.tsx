import { useState } from 'react';
import type { ExecutiveReport, ReportDataset } from './reportClient';
const displayValue = (value: string | number | boolean | null | undefined) => typeof value === 'number' ? value.toLocaleString() : String(value ?? 'Not recorded');

function SourceTable({dataset}: {dataset: ReportDataset}) {
  return <div className="ally-report-table" tabIndex={0} role="region" aria-label={`${dataset.title} data`}><table><caption>{dataset.title}</caption><thead><tr>{dataset.columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead><tbody>{dataset.rows.map((r,i) => <tr key={i}>{dataset.columns.map(c => <td key={c.key}>{displayValue(r[c.key])}</td>)}</tr>)}</tbody></table>{!dataset.rows.length && <p>No records in this scope.</p>}</div>;
}
function DataView({dataset, component}: {dataset: ReportDataset; component: string}) {
  const [table, setTable] = useState(false);
  const label = dataset.columns.find(c => c.type === 'string');
  const numbers = dataset.columns.filter(c => c.type === 'number');
  const [measure, setMeasure] = useState(numbers[0]?.key ?? '');
  const metric = numbers.find(c => c.key === measure) ?? numbers[0];
  const chart = !table && component !== 'table' && label && metric && dataset.rows.length > 0 && dataset.rows.length <= (component === 'comparison' ? 20 : 100);
  const rows = component === 'trend' && label ? [...dataset.rows].sort((a,b) => String(a[label.key]).localeCompare(String(b[label.key]))) : dataset.rows;
  const values = metric ? rows.map(r => typeof r[metric.key] === 'number' ? Number(r[metric.key]) : null) : [];
  const min = Math.min(0, ...values.filter((v): v is number => v !== null)), max = Math.max(0, ...values.filter((v): v is number => v !== null));
  const range = max - min || 1;
  return <div className="ally-report-data">
    {chart && <p className="ally-report-print-values">{metric.label}</p>}
    {component !== 'table' && <div className="ally-report-chart-tools"><button type="button" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show values'}</button>{numbers.length > 1 && <select aria-label="Chart measure" value={metric?.key} onChange={e => setMeasure(e.target.value)}>{numbers.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>}</div>}
    {chart ? component === 'trend' ? <figure aria-label={`${dataset.title}: ${metric.label}`}><svg viewBox="0 0 440 180" role="img" aria-label={`${metric.label} over time; exact values below`}><line x1="32" y1="148" x2="426" y2="148" className="ally-report-axis"/>{rows.slice(1).map((_,i) => values[i] !== null && values[i+1] !== null && <line key={i} x1={32 + i/Math.max(1,rows.length-1)*394} y1={148-(Number(values[i])-min)/range*124} x2={32+(i+1)/Math.max(1,rows.length-1)*394} y2={148-(Number(values[i+1])-min)/range*124} className="ally-report-trend"/>)}{rows.map((r,i) => values[i] !== null && <circle key={i} cx={32+i/Math.max(1,rows.length-1)*394} cy={148-(Number(values[i])-min)/range*124} r="3" className="ally-report-point"><title>{String(r[label.key])}: {values[i]?.toLocaleString()}</title></circle>)}<text x="32" y="174">{String(rows[0]?.[label.key])}</text><text x="426" y="174" textAnchor="end">{String(rows.at(-1)?.[label.key])}</text><text x="4" y="24">{max.toLocaleString()}</text></svg><figcaption>{metric.label}</figcaption><details><summary>Exact values</summary><SourceTable dataset={dataset}/></details></figure>
      : <ul className="ally-report-comparison" aria-label={metric.label}>{rows.map((r,i) => <li key={i}><span>{String(r[label.key] ?? 'Not recorded')}</span><strong>{values[i]?.toLocaleString() ?? 'Not recorded'}</strong><div className="ally-report-track" aria-hidden="true"><i style={{left: `${(Math.min(values[i] ?? 0,0)-min)/range*100}%`, width: `${Math.abs(values[i] ?? 0)/range*100}%`}}/></div></li>)}</ul>
      : <SourceTable dataset={dataset}/>}
    {chart && component === 'comparison' && <div className="ally-report-print-values"><SourceTable dataset={dataset}/></div>}
  </div>;
}
export default function ReportView({report}: {report: ExecutiveReport}) {
  const artifact = report.artifact;
  if (!artifact) return null;
  return <article className="ally-report-document" aria-label="Report findings">
    <header><h2>{artifact.title}</h2><p>{report.scope.from} – {report.scope.through}<span>Version {report.selectedVersion} · {new Date(artifact.generatedAt).toLocaleString()}</span></p></header>
    {artifact.findings.map((f,i) => <section className="ally-report-finding" key={i}><p>{f.text}</p><div className="ally-report-citations">{f.sourceIds.map(id => <a key={id} href={`#ally-${id}`}>{artifact.sections.find(s => s.id === id)?.title ?? 'Source'}</a>)}</div></section>)}
    {artifact.gaps.length > 0 && <details className="ally-report-gaps" open><summary>Coverage limits</summary><ul>{artifact.gaps.map((g,i) => <li key={i}>{g}</li>)}</ul></details>}
    {artifact.sections.map(section => { const block = report.view?.blocks.find(b => b.datasetId === section.id && b.sourceIds.includes(section.id));
      return <section id={`ally-${section.id}`} key={section.id} className="ally-report-source"><h3>{section.title}</h3><p className="ally-report-source-date">{section.period} · {section.grain}</p>
        {section.dataset && <DataView key={`${report.selectedVersion}-${section.id}`} dataset={section.dataset} component={block?.componentId ?? 'table'}/>}
        <details><summary>Source evidence</summary><p>{section.note}</p><p>Observed {new Date(section.observedAt).toLocaleString()}</p>{section.answer && <pre>{section.answer}</pre>}</details>
      </section>;
    })}
  </article>;
}
