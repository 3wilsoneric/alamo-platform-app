// Preserve saved wording. This deliberately supports paragraphs, lists and bold
// emphasis only; model HTML and URLs never become executable markup or links.
// Use a maintained Markdown parser if reports later require nested formatting.
function inline(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong> : part);
}
export default function ReportProse({text}: {text: string}) {
  const blocks: Array<{kind:'paragraph'|'list'|'ordered'; rows:string[]; start?:number}> = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) { blocks.push({kind:'paragraph',rows:[]}); continue; }
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/), ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
    const kind = bullet ? 'list' : ordered ? 'ordered' : 'paragraph';
    let block = blocks.at(-1);
    if (!block || block.kind !== kind) { block = {kind,rows:[],...(ordered ? {start:Number(ordered[1])} : {})}; blocks.push(block); }
    block.rows.push(bullet?.[1] ?? ordered?.[2] ?? line);
  }
  return <div className="ally-report-prose">{blocks.filter(block=>block.rows.length).map((block,index) => block.kind === 'paragraph'
    ? <p key={index}>{inline(block.rows.join('\n'))}</p>
    : block.kind === 'ordered' ? <ol key={index} start={block.start}>{block.rows.map((row,i)=><li key={i}>{inline(row)}</li>)}</ol>
      : <ul key={index}>{block.rows.map((row,i)=><li key={i}>{inline(row)}</li>)}</ul>)}</div>;
}
