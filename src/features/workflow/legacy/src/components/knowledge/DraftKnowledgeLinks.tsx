'use client'

import { useEffect, useRef, useState } from 'react'
import type { DraftRevision } from '@/lib/authoring-types'
import type { KnowledgeGraph, KnowledgeProposal } from '@/lib/knowledge-types'
import { knowledgeClient, relationshipLabel } from '@/lib/knowledge-client'
import EvidenceButton from './EvidenceButton'
import './knowledge.css'

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'The knowledge connection could not be saved.'

export default function DraftKnowledgeLinks({ document, disabled, permissions, onUnsavedChange }: {
  document: DraftRevision; disabled: boolean; permissions: string[]; onUnsavedChange: (value: boolean) => void
}) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [predicate, setPredicate] = useState('for_role')
  const [targetId, setTargetId] = useState('')
  const [query, setQuery] = useState('')
  const [quote, setQuote] = useState('')
  const [rationale, setRationale] = useState('')
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const attemptId = useRef<string | null>(null)
  const dirty = open && !!(targetId || quote || rationale)
  useEffect(() => { onUnsavedChange(dirty || busy || !!reviewNote) }, [dirty, busy, reviewNote, onUnsavedChange])
  useEffect(() => {
    let active = true
    knowledgeClient.graph().then(result => { if (active) { setGraph(result); setError('') } }).catch(error => { if (active) setError(messageOf(error)) })
    return () => { active = false }
  }, [document.id, document.revision])
  async function refresh() {
    setBusy(true); setError('')
    try { setGraph(await knowledgeClient.graph()) }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }
  async function propose() {
    if (!graph || disabled || busy) return
    const target = graph.nodes.find(node => node.id === targetId)
    if (!target) { setError('Choose a connected entity.'); return }
    const quoteStart = document.content.body.indexOf(quote)
    if (!quote.trim() || quoteStart < 0) { setError('Copy an exact excerpt from the saved Instructions field.'); return }
    setBusy(true); setError(''); setNotice('')
    attemptId.current ??= crypto.randomUUID()
    try {
      await knowledgeClient.propose(attemptId.current, { action: 'propose', expectedRevision: 0, draftId: document.id, draftRevision: document.revision,
        snapshotId: graph.snapshot.id, targetId, targetFingerprint: target.fingerprint, predicate, quote, quoteStart, rationale })
      setOpen(false); setQuote(''); setRationale(''); setTargetId(''); setQuery(''); attemptId.current = null
      setNotice('Connection saved as a proposal. It is not approved knowledge.')
      setGraph(await knowledgeClient.graph())
    } catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }
  async function withdraw(item: KnowledgeProposal) {
    setBusy(true); setError(''); setNotice('')
    try { await knowledgeClient.withdraw(item.id, item.revision); setGraph(await knowledgeClient.graph()); setNotice('Connection withdrawn. Its original evidence remains in history.') }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }
  async function decide(item: KnowledgeProposal, action: 'approve' | 'reject') {
    setBusy(true); setError('')
    try { await knowledgeClient.decide(item.id, item.revision, action, reviewNote); setReviewNote(''); setReviewing(null); setGraph(await knowledgeClient.graph()); setNotice(action === 'approve' ? 'Connection approved. Include it explicitly when publishing the document.' : 'Connection rejected. Evidence and decision remain in history.') }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }
  const connections = graph?.proposals.filter(item => item.source.draftId === document.id) ?? []
  const targets = graph?.nodes.filter(node => node.id !== `draft:${document.id}` && graph.predicates[predicate]?.includes(node.type) && `${node.title} ${node.type}`.toLowerCase().includes(query.toLowerCase())) ?? []
  return <section className="draft-knowledge" aria-label="Knowledge connections">
    <div className="knowledge-row"><h2>Knowledge connections</h2><button type="button" onClick={() => void refresh()} disabled={busy}>Refresh connections</button></div>
    <p>Connect this guide to the people, work, and sources it describes. Every proposed link keeps an exact excerpt and revision.</p>
    {disabled && <p className="knowledge-muted">Save changes and return the document to draft before proposing a connection.</p>}
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    {notice && <p className="drafts-notice" role="status">{notice}</p>}
    {connections.map(item => <article className="knowledge-proposal" key={item.id}><span className={`knowledge-badge ${item.freshness === 'needs_review' && item.status !== 'withdrawn' ? 'knowledge-warning' : ''}`}>{item.status === 'withdrawn' ? 'Withdrawn · History retained' : item.status === 'rejected' ? 'Rejected · History retained' : item.freshness === 'needs_review' ? 'Evidence changed · Needs review' : item.status === 'approved' ? 'Connection approved' : 'Proposed · Unapproved'}</span>
      <h3>{relationshipLabel(item.predicate)} → {item.targetTitle}</h3><p>Evidence from draft revision {item.source.revision}</p><blockquote>{item.source.quote}</blockquote><p>{item.rationale}</p>
      {item.status !== 'withdrawn' && item.staleReasons.map(reason => <p className="knowledge-warning-text" key={reason}>{reason}</p>)}
      <div className="knowledge-actions"><EvidenceButton label="View quoted source" input={{ proposalId: item.id, side: 'source' }} /><EvidenceButton label="View cited target" input={{ proposalId: item.id, side: 'target' }} />
        {['proposed', 'approved'].includes(item.status) && permissions.includes('contribute') && <button type="button" disabled={busy} onClick={() => void withdraw(item)}>Withdraw connection</button>}
        {item.status === 'proposed' && permissions.includes('review') && <button type="button" disabled={busy || (!!reviewNote && reviewing !== item.id)} onClick={() => setReviewing(item.id)}>Review connection</button>}</div>
      {reviewing === item.id && <div className="knowledge-proposal"><label>Connection decision<textarea aria-label="Connection decision" maxLength={1000} disabled={busy} value={reviewNote} onChange={event => setReviewNote(event.target.value)} /></label><div className="knowledge-actions">
        <button type="button" disabled={busy || !reviewNote.trim() || item.freshness !== 'current'} onClick={() => void decide(item, 'approve')}>Approve connection</button><button type="button" disabled={busy || !reviewNote.trim()} onClick={() => void decide(item, 'reject')}>Reject connection</button><button type="button" disabled={busy} onClick={() => { setReviewNote(''); setReviewing(null) }}>Cancel decision</button>
      </div></div>}</article>)}
    {!connections.length && graph && <p className="knowledge-muted">No proposed connections yet.</p>}
    {!open ? <div className="knowledge-actions"><button type="button" disabled={disabled || busy || !graph} onClick={() => { setOpen(true); setNotice('') }}>+ Connect knowledge</button></div> :
      <form onSubmit={event => { event.preventDefault(); void propose() }}><fieldset disabled={disabled || busy}>
        <label>Relationship<select aria-label="Relationship" value={predicate} onChange={event => { setPredicate(event.target.value); setTargetId('') }}>{Object.keys(graph?.predicates ?? {}).map(key => <option key={key} value={key}>{relationshipLabel(key)}</option>)}</select></label>
        <label>Find a connected entity<input value={query} onChange={event => { setQuery(event.target.value); setTargetId('') }} placeholder="Search roles, workflows, procedures…" /></label>
        <label>Connected entity<select aria-label="Connected entity" required value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">Choose an entity</option>{targets.map(node => <option value={node.id} key={node.id}>{node.title} · {node.type}{node.origin === 'draft' ? ' · Saved draft' : ''}</option>)}</select></label>
        <label>Exact evidence excerpt<textarea aria-label="Exact evidence excerpt" required maxLength={1000} rows={3} value={quote} onChange={event => setQuote(event.target.value)} placeholder="Copy the part of your saved instructions that supports this connection." /><small>Must match text in saved revision {document.revision} exactly.</small></label>
        <label>Why are these connected?<textarea aria-label="Why are these connected?" required maxLength={1000} rows={2} value={rationale} onChange={event => setRationale(event.target.value)} /></label>
        <button className="drafts-primary" type="submit">Save proposed connection</button>
      </fieldset><div className="knowledge-actions"><button type="button" disabled={busy} onClick={() => { setOpen(false); setTargetId(''); setQuote(''); setRationale(''); attemptId.current = null }}>Discard connection form</button></div></form>}
  </section>
}
