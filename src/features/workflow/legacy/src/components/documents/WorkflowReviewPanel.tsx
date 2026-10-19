import { useEffect, useState } from 'react'
import type { DraftAction, DraftRevision } from '@/lib/authoring-types'
import type { KnowledgeProposal } from '@/lib/knowledge-types'
import { knowledgeClient } from '@/lib/knowledge-client'
import { authenticatedWorkflowFetch } from '@/lib/platform-transport'

export default function WorkflowReviewPanel({ document, permissions, disabled, onAction, onUnsavedChange }: {
  document: DraftRevision; permissions: string[]; disabled: boolean;
  onAction: (action: Exclude<DraftAction, 'import_capture'>, note: string, proposalIds: string[]) => Promise<boolean>;
  onUnsavedChange: (value: boolean) => void
}) {
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [connections, setConnections] = useState<KnowledgeProposal[]>([])
  const [error, setError] = useState('')
  const [publication, setPublication] = useState<{ title: string; body: string; revision: number; hash: string; citations: { connectionId: string; source: { excerpt: string; reference: string }; target: { title: string; status: string } }[] } | null>(null)
  useEffect(() => { onUnsavedChange(!!note || !!selected.length) }, [note, selected, onUnsavedChange])
  async function loadConnections() {
    setError('')
    try { const graph = await knowledgeClient.graph(); setConnections(graph.proposals.filter(item => item.source.draftId === document.id && item.status === 'approved' && item.freshness === 'current')) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not load approved connections.') }
  }
  async function act(action: Exclude<DraftAction, 'import_capture'>) {
    if (await onAction(action, note, selected)) { setNote(''); setSelected([]); setPublication(null) }
  }
  async function readPublication() {
    setError(''); setPublication(null)
    try {
      const response = await authenticatedWorkflowFetch(`/api/platform/workflow/v1/published/${document.id}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Published guidance is unavailable.')
      const published = result.publication.document
      setPublication({ title: published.content.title, body: published.content.body, revision: published.contentRevision, hash: published.contentHash, citations: result.citations })
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load the publication.') }
  }
  return <section className="drafts-history" aria-label="Review and publication"><h2>Review & publication</h2>
    <p>Review the document and its connections separately. Publishing selects the exact approved content and connections to serve.</p>
    {document.approval && <p className="drafts-notice">Document approved by {document.approval.actor.name}. Decision: {document.approval.note}</p>}
    {error && <p role="alert" className="drafts-alert">{error}</p>}
    {['in_review', 'approved', 'published'].includes(document.state) && <label>Review decision<textarea aria-label="Review decision" value={note} maxLength={1000} disabled={disabled} onChange={event => setNote(event.target.value)} placeholder="Record what you reviewed and the reason for your decision." /></label>}
    <div className="drafts-actions">
      {document.state === 'in_review' && permissions.includes('review') && <><button disabled={disabled || !note.trim()} onClick={() => void act('approve')}>Approve document</button><button disabled={disabled || !note.trim()} onClick={() => void act('reject')}>Request changes</button></>}
      {document.state === 'approved' && permissions.includes('publish') && <button disabled={disabled} onClick={() => void loadConnections()}>Load approved connections</button>}
      {document.state === 'published' && permissions.includes('publish') && <button disabled={disabled || !note.trim()} onClick={() => void act('retract')}>Retract publication</button>}
      <button disabled={disabled} onClick={() => void readPublication()}>Read published version</button>
    </div>
    {document.state === 'approved' && permissions.includes('publish') && <div className="knowledge-proposal"><h3>Include reviewed connections</h3><p>Unselected connections stay outside this publication. A document can be published with no connections.</p>
      {connections.map(item => <label key={item.id} className="workflow-publication-choice"><input type="checkbox" disabled={disabled} checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />{item.targetTitle}</label>)}
      <button className="drafts-primary" disabled={disabled} onClick={() => void act('publish')}>Publish approved version</button></div>}
    {publication && <article className="drafts-history-preview" aria-label="Published version"><h3>{publication.title}</h3><p>Published content revision {publication.revision} · SHA-256 {publication.hash}</p><pre>{publication.body}</pre>
      <h3>Published evidence</h3>{!publication.citations.length && <p>No connections included in this publication.</p>}{publication.citations.map(item => <div key={item.connectionId}><blockquote>{item.source.excerpt}</blockquote><p>{item.source.reference} → {item.target.title} · Target status: {item.target.status}</p></div>)}</article>}
  </section>
}
