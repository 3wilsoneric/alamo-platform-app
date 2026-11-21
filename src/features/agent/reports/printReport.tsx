import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ReportView from './ReportView';
import type { ExecutiveReport } from './reportClient';
import styles from './executiveAlly.css?raw';

export async function printReport(target: Window, report: ExecutiveReport) {
  if (!report.artifact || target.closed) throw Error('Report is not ready to export.');
  target.document.title = 'Ally report';
  target.document.documentElement.lang = 'en';
  const style = target.document.createElement('style'); style.textContent = styles;
  target.document.head.append(style);
  const main = target.document.createElement('main'); main.className = 'executive-ally ally-report-print';
  target.document.body.replaceChildren(main);
  const root = createRoot(main); flushSync(() => root.render(<ReportView report={report}/>));
  main.querySelectorAll('details').forEach(element => { element.open = true; });
  await target.document.fonts.ready;
  // Keep the authorized snapshot open after print/cancel so it can be checked
  // and printed again; closing during afterprint can interrupt PDF generation.
  target.focus(); target.print();
}
