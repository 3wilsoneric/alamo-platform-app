import {splitMarkdownTableRow, isMarkdownTableSeparator} from '../../../../shared/markdown-table.mjs';
import SourceTable from './ReportTable';
import type {ReportDataset} from './reportClient';
import {resolveEveryAgentLink} from '@alamo/agent-runtime/shared/everyagent-links.mjs';
// Preserve saved wording. This deliberately supports paragraphs, lists, tables and bold
// emphasis, plus links to registered application pages. Model HTML stays text.
// Use a maintained Markdown parser if reports later require nested formatting.
function inline(text: string) {
  const literal = (value:string) => value.replace(/\\([\\`*_[\]<>])/g,'$1');
  return text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{literal(part.slice(2,-2))}</strong>;
    const link=part.match(/^\[([^\]\n]+)\]\(([^\s)]+)\)$/);
    if(link?.[1] && link[2]) {
      try { return <a key={index} href={resolveEveryAgentLink(literal(link[2])).href} target="_blank" rel="noopener noreferrer">{literal(link[1])}</a>; }
      catch { /* Unregistered destinations remain readable text. */ }
    }
    return literal(part);
  });
}
export default function ReportProse({text}: {text: string}) {
  const blocks: Array<{kind:'paragraph'|'list'|'ordered'|'table'; rows:string[]; start?:number; dataset?:ReportDataset}> = [];
  const lines = text.split('\n');
  for (let lineIndex=0; lineIndex<lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? '';
    if (line.includes('|') && isMarkdownTableSeparator(lines[lineIndex+1] ?? '')) {
      const headers=splitMarkdownTableRow(line), rows:string[][]=[];
      let end=lineIndex+2;
      while(end<lines.length) {
        const rowLine=lines[end];
        if(!rowLine?.trim() || !rowLine.includes('|')) break;
        rows.push(splitMarkdownTableRow(rowLine));end++;
      }
      // Malformed rows stay literal, so extra cells or incomplete data are never dropped.
      if(headers.every(Boolean) && rows.length && rows.every(row=>row.length===headers.length)) {
        const columns=headers.map((label,i)=>({key:String(i),label,type:rows.every(row=>/^[-+]?[\d,]+(?:\.\d+)?%?$/.test(row[i] ?? ''))?'number':'string'}));
        blocks.push({kind:'table',rows:[line],dataset:{title:headers.join(' · '),shape:'records',columns,rows:rows.map(row=>Object.fromEntries(row.map((cell,i)=>[String(i),cell])))}});
        lineIndex=end-1;continue;
      }
    }
    if (!line.trim()) { blocks.push({kind:'paragraph',rows:[]}); continue; }
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/), ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
    const kind = bullet ? 'list' : ordered ? 'ordered' : 'paragraph';
    let block = blocks.at(-1);
    if (!block || block.kind !== kind) { block = {kind,rows:[],...(ordered ? {start:Number(ordered[1])} : {})}; blocks.push(block); }
    block.rows.push(bullet?.[1] ?? ordered?.[2] ?? line);
  }
  return <div className="ally-report-prose">{blocks.filter(block=>block.rows.length).map((block,index) => block.kind === 'table'
    ? <div key={index}><SourceTable dataset={block.dataset!}/></div> : block.kind === 'paragraph'
    ? <p key={index}>{inline(block.rows.join('\n'))}</p>
    : block.kind === 'ordered' ? <ol key={index} start={block.start}>{block.rows.map((row,i)=><li key={i}>{inline(row)}</li>)}</ol>
      : <ul key={index}>{block.rows.map((row,i)=><li key={i}>{inline(row)}</li>)}</ul>)}</div>;
}
