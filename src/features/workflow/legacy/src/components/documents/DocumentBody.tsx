// The imported library uses headings, paragraphs and lists. Keep source text
// escaped by React; imported documents cannot inject HTML or run scripts.
export default function DocumentBody({ body }: { body: string }) {
  return <article className="space-y-4 break-words text-[14px] leading-7 text-ink2">
    {body.split(/\n\s*\n/).map((block, index) => {
      if (block.startsWith('# ')) return <h2 key={index} className="text-2xl font-semibold leading-tight text-ink">{block.slice(2)}</h2>
      if (block.startsWith('## ')) return <h3 key={index} className="pt-4 text-lg font-semibold text-ink">{block.slice(3)}</h3>
      const lines = block.split('\n')
      if (lines.every(line => line.startsWith('- '))) return <ul key={index} className="list-disc space-y-2 pl-5">{lines.map((line, i) => <li key={i}>{line.slice(2)}</li>)}</ul>
      if (lines.every(line => /^\d+\. /.test(line))) return <ol key={index} className="list-decimal space-y-2 pl-5">{lines.map((line, i) => <li key={i}>{line.replace(/^\d+\. /, '')}</li>)}</ol>
      return <p key={index} className="whitespace-pre-line">{block}</p>
    })}
  </article>
}
