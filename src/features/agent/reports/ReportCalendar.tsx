import SourceTable, {ReportCell} from './ReportTable';
import type {ReportDataset} from './reportClient';
import {reportColumnLabel,reportCellValue} from '../../../../shared/report-display.mjs';

const dateKeyOf=(value:unknown)=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value ? value : null;
const label=(day:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));

/** A registered view over source columns, never model-generated markup or events. */
export default function ReportCalendar({dataset,dateKey,labelKey}:{dataset:ReportDataset;dateKey?:string|null;labelKey?:string|null}) {
  if(!dateKey || !labelKey || !dataset.columns.some(c=>c.key===dateKey) || !dataset.columns.some(c=>c.key===labelKey) ||
    dataset.rows.some(row=>row[dateKey]!==null && !dateKeyOf(row[dateKey])))return <SourceTable dataset={dataset}/>;
  const dated=new Map<string,ReportDataset['rows']>(),undated:ReportDataset['rows']=[];
  for(const row of dataset.rows){const day=dateKeyOf(row[dateKey]);if(!day)undated.push(row);else dated.set(day,[...(dated.get(day)??[]),row]);}
  const months=[...new Set([...dated.keys()].sort().map(day=>day.slice(0,7)))];
  const details=dataset.columns.filter(c=>c.key!==dateKey && c.key!==labelKey);
  const event=(row:ReportDataset['rows'][number],i:number)=><li key={i} className="ally-calendar-event">
    {details.length ? <details><summary>{reportCellValue(row[labelKey])}</summary><dl>{details.map(c=><div key={c.key}><dt>{reportColumnLabel(c)}</dt><dd><ReportCell value={row[c.key]} label={reportColumnLabel(c)}/></dd></div>)}</dl></details> : <strong>{reportCellValue(row[labelKey])}</strong>}
  </li>;
  return <div className="ally-calendar" aria-label={dataset.title}>
    {months.map(month=>{
      const first=month+'-01',start=new Date(first+'T00:00:00Z');
      const monthDates=[...dated.keys()].filter(day=>day.startsWith(month)).sort();
      const earliest=new Date(monthDates[0]+'T00:00:00Z'),latest=new Date(monthDates.at(-1)+'T00:00:00Z');
      const firstDay=Math.max(1,earliest.getUTCDate()-(earliest.getUTCDay()+6)%7);
      const lastDay=Math.min(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate(),latest.getUTCDate()+6-(latest.getUTCDay()+6)%7);
      const offset=(new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),firstDay)).getUTCDay()+6)%7;
      return <section key={month} aria-label={label(first,{month:'long',year:'numeric'})}>
        <h4>{label(first,{month:'long',year:'numeric'})}</h4>
        <div className="ally-calendar-weekdays" aria-hidden="true">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=><span key={day}>{day}</span>)}</div>
        <ol className="ally-calendar-days">
          {Array.from({length:offset},(_,i)=><li key={'blank-'+i} className="ally-calendar-blank" aria-hidden="true"/>)}
          {Array.from({length:lastDay-firstDay+1},(_,i)=>{const number=firstDay+i,day=month+'-'+String(number).padStart(2,'0'),events=dated.get(day)??[];
            return <li key={day} className={`ally-calendar-day${events.length?'':' ally-calendar-day--empty'}`}>
              <time dateTime={day} aria-label={label(day,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}><span className="ally-calendar-weekday">{label(day,{weekday:'short'})} </span>{number}</time>
              {!!events.length && <ul aria-label={`Events on ${label(day,{month:'long',day:'numeric'})}`}>{events.map(event)}</ul>}
            </li>;})}
        </ol>
      </section>;
    })}
    {!!undated.length && <section aria-label="Date not recorded"><h4>Date not recorded</h4><ul className="ally-calendar-undated">{undated.map(event)}</ul></section>}
    {!dataset.rows.length && <p>No records in this scope.</p>}
    <details className="ally-report-data-table"><summary>View data table</summary><SourceTable dataset={dataset}/></details>
  </div>;
}
