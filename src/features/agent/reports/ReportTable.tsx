import type { ReportDataset } from './reportClient';
import type { ReactNode } from 'react';
import { reportColumnLabel, reportCellValue as displayValue } from '../../../../shared/report-display.mjs';

export default function SourceTable({dataset, renderCell}: {dataset: ReportDataset; renderCell?:(text:string)=>ReactNode}) {
  const cell = (value:Parameters<typeof displayValue>[0]) => renderCell ? renderCell(displayValue(value)) : displayValue(value);
  const columns = dataset.columns.map(column => ({...column, label:reportColumnLabel(column)}));
  const identity = columns.find(column => column.type === 'string');
  return <>
    <div className="ally-report-table" tabIndex={0} role="region" aria-label={`${dataset.title} data`}>
      <table aria-label={dataset.title}><thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>{dataset.rows.map((row,i) => <tr key={i}>{columns.map(c => <td key={c.key} data-numeric={c.type==='number'}>{cell(row[c.key])}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <ul className="ally-report-records" aria-label={dataset.title}>{dataset.rows.map((row,i) => <li key={i}>
      {identity && <h4>{cell(row[identity.key])}</h4>}
      <dl>{columns.filter(column => column !== identity).map(column => <div key={column.key}><dt>{column.label}</dt><dd>{cell(row[column.key])}</dd></div>)}</dl>
    </li>)}</ul>
    {!dataset.rows.length && <p>No records in this scope.</p>}
  </>;
}
