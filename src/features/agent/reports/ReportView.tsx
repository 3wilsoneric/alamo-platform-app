import { applyViewCalculations } from '@alamo/agent-runtime/shared/executive-report-views.mjs';
import SourceTable from './ReportTable';
import ReportProse from './ReportProse';
import ReportCalendar from './ReportCalendar';
import { formatDisplayDate } from '../../../../shared/display-date.mjs';
import type { ExecutiveReport, ReportDataset } from './reportClient';
import { reportColumnLabel, reportCellValue as displayValue } from '../../../../shared/report-display.mjs';
export type ReportMeasures = Record<string, string>;

function DataView({dataset, component, measure, dateKey, labelKey, sort, onMeasureChange}: {dataset: ReportDataset; component: string; measure: string | undefined; dateKey?:string|null; labelKey?:string|null; sort?: {key:string;direction:'asc'|'desc'} | null; onMeasureChange: ((measure: string) => void) | undefined}) {
  if(component==='calendar')return <ReportCalendar dataset={dataset} dateKey={dateKey ?? null} labelKey={labelKey ?? null}/>;
  const columns = dataset.columns.map(column => ({...column,label:reportColumnLabel(column)}));
  const label = columns.find(c => c.key===labelKey && c.type==='string') ?? columns.find(c => c.type === 'string');
  const numbers = columns.filter(c => c.type === 'number');
  const metric = numbers.find(c => c.key === measure) ?? numbers[0];
  const chart = component !== 'table' && label && metric && dataset.rows.length > 0 && dataset.rows.length <= (component === 'comparison' ? 20 : 100);
  const sorted = sort && columns.some(column=>column.key===sort.key) ? [...dataset.rows].sort((a,b)=>{const left=a[sort.key],right=b[sort.key];if(left==null)return right==null?0:1;if(right==null)return -1;const order=typeof left==='number'&&typeof right==='number'?left-right:String(left).localeCompare(String(right));return sort.direction==='desc'?-order:order;}) : dataset.rows;
  const rows = sort ? sorted : component === 'trend' && label ? [...dataset.rows].sort((a,b) => String(a[label.key]).localeCompare(String(b[label.key]))) : dataset.rows;
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
      : <SourceTable dataset={{...dataset,rows}}/>}
    {chart && <details className="ally-report-data-table"><summary>View data table</summary><SourceTable dataset={{...dataset,rows}}/></details>}
    {chart && <div className="ally-report-print-values"><SourceTable dataset={{...dataset,rows}}/></div>}
  </div>;
}
export default function ReportView({report, canvas = false, anchorPrefix = 'ally', measures = {}, onMeasureChange, onOpenSource}: {report: ExecutiveReport; canvas?: boolean; anchorPrefix?: string; measures?: ReportMeasures; onMeasureChange?: (sectionId: string, measure: string) => void; onOpenSource?: (sectionId:string, opener:HTMLElement) => void}) {
  const artifact = report.artifact;
  if (!artifact) return null;
  return <article className={`ally-report-document${canvas ? ' ally-report-document--canvas' : ''}`} aria-label="Report findings">
    {!canvas && <header><h2>{artifact.title}</h2><p>{formatDisplayDate(report.scope.from,{month:'short'})} – {formatDisplayDate(report.scope.through,{month:'short'})}</p></header>}
    {artifact.findings.map((finding,i) => <section className="ally-report-finding" key={i}><ReportProse text={finding.text}/></section>)}
    {artifact.gaps.length > 0 && <details className="ally-report-gaps" open><summary>Data limits</summary><ul>{artifact.gaps.map((gap,i) => <li key={i}><ReportProse text={gap}/></li>)}</ul></details>}
    {artifact.sections.filter(section=>section.dataset && (!canvas || !report.view || report.view.blocks.some(block=>block.datasetId===section.id && block.sourceIds.includes(section.id)))).map(section => {
      const blocks = report.view?.blocks.filter(block => block.datasetId === section.id && block.sourceIds.includes(section.id)) ?? [];
      return <section id={`${anchorPrefix}-${section.id}`} tabIndex={-1} key={section.id} className="ally-report-source"><h3>{section.dataset!.title}</h3>
        {(blocks.length ? blocks : [undefined]).map(block => {
          const selectionKey = blocks.length > 1 ? `${section.id}:${block!.id}` : section.id;
          return <DataView key={`${report.selectedVersion}-${selectionKey}`} dataset={applyViewCalculations(section.dataset!,block?.computedColumns)} component={block?.componentId ?? 'table'} dateKey={block?.dateKey ?? null} labelKey={block?.labelKey ?? null} measure={measures[selectionKey] ?? block?.measureKey ?? undefined} sort={block?.sort ?? null} onMeasureChange={onMeasureChange && (measure => onMeasureChange(selectionKey, measure))}/>;
        })}
      </section>;
    })}
    <details className="ally-report-sources"><summary>Sources</summary><ul>{artifact.sections.map(section => <li key={section.id} {...(!section.dataset ? {id:`${anchorPrefix}-${section.id}`,tabIndex:-1} : {})}>
      <a href={`#${canvas && onOpenSource ? 'ally-document' : anchorPrefix}-${section.id}`} onClick={canvas && onOpenSource ? event=>{event.preventDefault();onOpenSource(section.id,event.currentTarget);} : undefined}>{section.dataset?.title ?? section.title}</a>
      {!canvas && <><p>{formatDisplayDate(section.observedAt,{month:'short'})}</p></>}
    </li>)}</ul></details>
  </article>;
}
