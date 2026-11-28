import type { ReportDataset } from './reportClient';
import type { ReactNode } from 'react';
import { reportColumnLabel, reportCellValue as displayValue } from '../../../../shared/report-display.mjs';
import {resolveEveryAgentLink} from '@alamo/agent-runtime/shared/everyagent-links.mjs';

export function ReportCell({value,label,renderCell}:{value:Parameters<typeof displayValue>[0];label:string;renderCell?:((text:string)=>ReactNode)|undefined}) {
    const text=displayValue(value);
    if(renderCell) return renderCell(text);
    if(typeof value==='string' && /^(https:\/\/|\/(?!\/))/.test(value)) {
      try { return <a href={resolveEveryAgentLink(value).href} target="_blank" rel="noopener noreferrer">{label}</a>; }
      catch { /* Unregistered destinations remain readable text. */ }
    }
    return text;
}
export default function SourceTable({dataset, renderCell}: {dataset: ReportDataset; renderCell?:((text:string)=>ReactNode)|undefined}) {
  const cell=(value:Parameters<typeof displayValue>[0],label:string)=><ReportCell value={value} label={label} renderCell={renderCell}/>;
  const columns = dataset.columns.map(column => ({...column, label:reportColumnLabel(column)}));
  const identity = columns.find(column => column.type === 'string');
  return <>
    <div className="ally-report-table" tabIndex={0} role="region" aria-label={`${dataset.title} data`}>
      <table aria-label={dataset.title}><thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>{dataset.rows.map((row,i) => <tr key={i}>{columns.map(c => <td key={c.key} data-numeric={c.type==='number'}>{cell(row[c.key],c.label)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <ul className="ally-report-records" aria-label={dataset.title}>{dataset.rows.map((row,i) => <li key={i}>
      {identity && <h4>{cell(row[identity.key],identity.label)}</h4>}
      <dl>{columns.filter(column => column !== identity).map(column => <div key={column.key}><dt>{column.label}</dt><dd>{cell(row[column.key],column.label)}</dd></div>)}</dl>
    </li>)}</ul>
    {!dataset.rows.length && <p>No records in this scope.</p>}
  </>;
}
