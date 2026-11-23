'use client'

import { useEffect, useRef } from 'react'
import type { InspectedSource } from '@/lib/process-types'
import type { StructuredSop } from '@/lib/sop-types'
import { validateSop } from '@/lib/sop-contract.mjs'
import { selectedSourcePassage } from '@/lib/source-inspection.mjs'
import { workflowHref } from '@/lib/workflow-navigation'
import GuideContent from '@/components/documents/GuideContent'
import { AttachmentContent } from '@/components/documents/SourceAttachments'
import { validateAttachment } from '@/lib/attachment-contract.mjs'
import type { SourceAttachment } from '@/lib/conversation-types'
import './source-inspector.css'

const label = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replaceAll('-', ' ')
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function RecordFields({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === '') return <span>Not provided</span>
  if (typeof value !== 'object') return <p>{String(value)}</p>
  if (depth >= 6) return <p>More detail is available under Source details.</p>
  if (Array.isArray(value)) return <><ol>{value.slice(0, 60).map((item, index) => <li key={index}><RecordFields value={item} depth={depth + 1} /></li>)}</ol>{value.length > 60 && <p>More items are available under Source details.</p>}</>
  const entries = Object.entries(value)
  return <><dl>{entries.slice(0, 60).map(([key, child]) => <div key={key}><dt>{label(key)}</dt><dd><RecordFields value={child} depth={depth + 1} /></dd></div>)}</dl>{entries.length > 60 && <p>More fields are available under Source details.</p>}</>
}

export default function SourceInspector({ source, onClose, manageFocus = true }: { source: InspectedSource; onClose: () => void; manageFocus?: boolean }) {
  const panel = useRef<HTMLElement>(null)
  const passage = selectedSourcePassage(source)
  const value = source.format === 'record' && record(source.value) ? source.value : null
  let sop: StructuredSop | undefined
  let attachment: SourceAttachment | undefined
  try { if (value?.sop) sop = validateSop(value.sop) } catch { /* Unknown structures remain readable as fields. */ }
  try {
    if (value && (['/intake/source', '/capture/bundle'].includes(source.citation.pointer) || /\/conversation\/turns\/\d+\/attachment$/.test(source.citation.pointer))) attachment = validateAttachment({ title: value.title, ...(value.source ? { source: value.source } : {}), ...(value.capture ? { capture: value.capture } : {}) })
  } catch { /* Unrecognized evidence remains available as fields. */ }
  const focusPath = passage?.location ?? source.citation.pointer.replace(/^\/content/, '')
  const step = focusPath.match(/^\/sop\/steps\/(\d+)/)
  const path = focusPath.match(/^\/sop\/flow\/transitions\/(\d+)/)
  const readingValue = (step || path) && value ? Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'fromStepId', 'toStepId', 'captureStepId'].includes(key))) : source.value
  const context = step ? `Step ${Number(step[1]) + 1}` : path ? `Path ${Number(path[1]) + 1}` : ''
  useEffect(() => {
    if (!manageFocus) return
    const previous = document.activeElement
    panel.current?.focus({ preventScroll: true })
    panel.current?.scrollIntoView({ block: 'nearest' })
    const reading = panel.current?.querySelector<HTMLElement>('.source-reading')
    const selected = reading?.querySelector<HTMLElement>('[data-source-selected=true], .source-text mark')
    if (reading && selected) reading.scrollTop += selected.getBoundingClientRect().top - reading.getBoundingClientRect().top - 8
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [manageFocus])
  const location = source.citation.publicationId ? workflowHref('training', { publication: source.citation.publicationId }) : source.citation.draftId ? workflowHref('drafts', { draft: source.citation.draftId }) : workflowHref('knowledge', { entity: source.citation.nodeId })
  return <aside ref={panel} tabIndex={-1} className="source-inspector" aria-label="Cited source">
    <header><strong>{source.title}</strong><button type="button" onClick={onClose}>Close source</button></header>
    <p className="source-version">{label(source.status)}{source.citation.revision ? ` · Revision ${source.citation.revision}` : ''}{source.citation.original ? ' · Original evidence' : ''}</p>
    {['superseded', 'retracted', 'needs_review', 'published-needs-review'].includes(source.status) && <p className="source-history">Earlier or changed source · Check current guidance before using it.</p>}
    {passage ? <section className="source-quotation" aria-label="Quoted passage"><small>{[context, label(passage.field)].filter(Boolean).join(' · ')}</small><blockquote><mark>{passage.quote}</mark></blockquote></section> : source.selection ? <p>The exact quotation could not be matched in this view. Review the retained source below.</p> : context && <p>{context}</p>}
    {attachment && <p>Retained evidence · This source has not been approved as guidance.</p>}
    <div className="source-reading" aria-label="Source content">
      {attachment ? <AttachmentContent attachment={attachment} /> : sop && value ? <GuideContent body={typeof value.body === 'string' ? value.body : ''} sop={sop} focusPath={focusPath} /> : source.format === 'record' ? <RecordFields value={readingValue} /> : <p className="source-text">{passage ? <>{source.excerpt.slice(0, passage.start)}<mark>{passage.quote}</mark>{source.excerpt.slice(passage.start + passage.quote.length)}</> : source.excerpt}</p>}
    </div>
    <footer>{source.citation.questionId ? <span>Retained in this conversation</span> : <a href={location}>{source.citation.publicationId ? 'Open this published version' : source.citation.draftId ? 'Open current guide' : 'Open in knowledge map'}</a>}<details><summary>Source details</summary><dl><dt>Snapshot</dt><dd>{source.citation.snapshotId}</dd><dt>Fingerprint</dt><dd>{source.citation.fingerprint}</dd><dt>Location</dt><dd>{source.selection?.location || source.citation.pointer}</dd>{source.citation.original && <><dt>Original digest</dt><dd>{source.citation.original.digest}</dd></>}</dl><pre>{source.excerpt}</pre></details></footer>
  </aside>
}
