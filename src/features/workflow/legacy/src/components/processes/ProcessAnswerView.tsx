'use client'
import type { ProcessAnswer, ProcessEvidence } from '@/lib/process-types'
import { workflowHref } from '@/lib/workflow-navigation'
import './process-answer.css'
const label = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ')
export default function ProcessAnswerView({ answer, inspect, stale }: { stale: boolean; answer: ProcessAnswer; inspect: (evidence: ProcessEvidence, quote?: string) => void }) {
  return <div className="pw-answer">
    {stale && <p className="pw-answer-stale">Earlier source version · Check the current guidance.</p>}
    <small>{answer.method === 'model-assisted' ? 'AI answer · Check the cited sources' : 'Source excerpts'}</small>
    {answer.sourceContext ? <small> · {answer.sourceContext.title} · Unreviewed source</small> : answer.sourceMode !== 'current' && <small> · {answer.sourceMode === 'working' ? 'Working drafts' : 'Published only'}</small>}
    {answer.claims.length ? answer.claims.map((claim, index) => <div className="pw-claim" key={index}>
      {claim.kind === 'conflict' && <strong>Sources disagree</strong>}<p>{claim.text}</p>
      <span>{claim.citations.map((citation, position) => { const source = answer.evidence.find(item => item.id === citation.evidenceId); return source ? <button type="button" key={position} title={citation.quote} onClick={() => inspect(source, citation.quote)} aria-label={`View source: ${source.title}`}>[{answer.evidence.indexOf(source) + 1}]</button> : null })}</span>
    </div>) : <p>{answer.answer}</p>}
    {answer.missing.length > 0 && <ul className="pw-answer-gaps">{answer.missing.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    {!!answer.evidence.length && <details open={!answer.claims.length}><summary>Sources ({answer.evidence.length})</summary>{answer.evidence.map((item, index) => <blockquote key={item.id}>
      <button type="button" onClick={() => inspect(item)}>{index + 1}. {item.title} · View source</button>
      <small>{label(item.status)} · {item.field}{item.citation.revision ? ` · revision ${item.citation.revision}` : ''}</small>
      {item.via.length > 0 && <small>{item.via.map(link => `${label(link.predicate)} (${label(link.status)})`).join(' → ')}</small>}
      <p>{item.excerpt}</p>
      {!item.citation.questionId && <a href={item.citation.publicationId ? workflowHref('training', { publication: item.citation.publicationId }) : item.citation.draftId ? workflowHref('drafts', { draft: item.citation.draftId }) : workflowHref('knowledge', { entity: item.citation.nodeId })}>{item.citation.publicationId ? 'Read published guide' : item.citation.draftId ? 'Open guide' : 'Open in knowledge map'}</a>}
    </blockquote>)}</details>}
    {!!answer.excluded.length && <details><summary>Excluded sources ({answer.excluded.length})</summary><ul>{answer.excluded.map((item, index) => <li key={index}>{item.title}: {item.reason}</li>)}</ul></details>}
  </div>
}
