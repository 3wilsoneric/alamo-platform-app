'use client'

import { useEffect, useRef, useState } from 'react'
import { authoringClient, AuthoringRequestError } from '@/lib/authoring-client'
import type { AuthoringClient, DraftAction, DraftContent, DraftDetail, DraftRevision, DraftSummary } from '@/lib/authoring-types'
import DraftKnowledgeLinks from '@/components/knowledge/DraftKnowledgeLinks'
import WorkflowReviewPanel from './WorkflowReviewPanel'
import { workflowSession, type WorkflowSession } from '@/lib/platform-transport'
import CaptureImport from './CaptureImport'
import SopEditor from './SopEditor'
import { emptySop, renderSop, sopFromCapture, sopGaps } from '@/lib/sop-contract.mjs'
import type { StructuredSop } from '@/lib/sop-types'
import './drafts-workspace.css'

const emptyContent: DraftContent = { title: '', kind: 'procedure', audience: '', purpose: '', sourceReference: '', body: '' }
const stateLabel = (state: string) => ({ draft: 'Draft', in_review: 'Submitted for review', approved: 'Approved', published: 'Published' } as Record<string, string>)[state] ?? state
const actionLabel = (action: DraftAction) => ({ save: 'Saved draft', submit: 'Submitted for review', reopen: 'Returned to draft', approve: 'Approved document', reject: 'Requested changes', publish: 'Published version', retract: 'Retracted publication', import_capture: 'Imported browser capture' })[action]
const dateLabel = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'The draft could not be loaded or saved.'
const summaryOf = (doc: DraftRevision): DraftSummary => ({ id: doc.id, revision: doc.revision, state: doc.state, updatedAt: doc.updatedAt,
  title: doc.content.title, kind: doc.content.kind, audience: doc.content.audience })
type Destination = { type: 'new'; guided?: boolean } | { type: 'open'; id: string } | { type: 'list' } | { type: 'capture' }

export default function DraftsWorkspace({ client = authoringClient, onUnsavedChange }: {
  client?: AuthoringClient
  onUnsavedChange?: (value: boolean) => void
}) {
  const [documents, setDocuments] = useState<DraftSummary[]>([])
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<WorkflowSession | null>(null)
  const [reviewDirty, setReviewDirty] = useState(false)
  const canContribute = session?.permissions.includes('contribute') ?? false
  const [busy, setBusy] = useState(false)
  const [id, setId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DraftDetail | null>(null)
  const [content, setContent] = useState<DraftContent>(emptyContent)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [pending, setPending] = useState<Destination | null>(null)
  const [historical, setHistorical] = useState<DraftRevision | null>(null)
  const [knowledgeDirty, setKnowledgeDirty] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [captureDirty, setCaptureDirty] = useState(false)
  const [connectionEditorKey, setConnectionEditorKey] = useState(0)
  const titleInput = useRef<HTMLInputElement>(null)
  const dirty = id !== null && JSON.stringify(content) !== JSON.stringify(detail?.document.content ?? emptyContent)
  const locked = !!detail && detail.document.state !== 'draft'
  const gaps = content.sop ? [...(!content.audience.trim() ? ['Audience'] : []), ...(!content.purpose.trim() ? ['Purpose'] : []), ...(!content.sourceReference.trim() ? ['Source reference'] : []), ...sopGaps(content.sop)] : []
  const visible = documents.filter(doc => (filter === 'all' || doc.state === filter) && `${doc.title} ${doc.audience}`.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    let active = true
    Promise.all([client.list(), workflowSession()]).then(([result, identity]) => { if (active) { setDocuments(result.documents); setSession(identity); setReady(true) } })
      .catch(error => { if (active) setError(messageOf(error)) })
    return () => { active = false }
  }, [client])

  useEffect(() => { onUnsavedChange?.(dirty || busy || knowledgeDirty || reviewDirty || captureDirty) }, [dirty, busy, knowledgeDirty, reviewDirty, captureDirty, onUnsavedChange])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy || knowledgeDirty || reviewDirty || captureDirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy, knowledgeDirty, reviewDirty, captureDirty])

  function applyDetail(result: DraftDetail) {
    setId(result.document.id)
    setDetail(result)
    setContent(result.document.content)
    setHistorical(null)
    setConflict(false)
    setDocuments(current => [summaryOf(result.document), ...current.filter(doc => doc.id !== result.document.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  }

  async function navigate(destination: Destination) {
    setError(''); setNotice(''); setPending(null); setHistorical(null)
    setCaptureOpen(destination.type === 'capture'); setCaptureDirty(false)
    setKnowledgeDirty(false); setReviewDirty(false); setConnectionEditorKey(current => current + 1)
    if (destination.type === 'new') {
      const sop = destination.guided ? emptySop() : undefined
      setId(crypto.randomUUID()); setDetail(null); setContent({ ...emptyContent, ...(sop ? { sop, body: renderSop(sop) } : {}) }); setConflict(false)
      requestAnimationFrame(() => titleInput.current?.focus())
    } else if (destination.type === 'list' || destination.type === 'capture') {
      setId(null); setDetail(null); setContent(emptyContent); setConflict(false)
    } else {
      setBusy(true)
      try { applyDetail(await client.get(destination.id)) }
      catch (error) { setError(messageOf(error)) }
      finally { setBusy(false) }
    }
  }

  function go(destination: Destination) {
    if (busy) return
    if (dirty || knowledgeDirty || reviewDirty || captureDirty) setPending(destination)
    else void navigate(destination)
  }

  async function mutate(action: Exclude<DraftAction, 'import_capture'>, note?: string, proposalIds?: string[]): Promise<boolean> {
    if (!id || busy) return false
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await client.mutate(id, { action, expectedRevision: detail?.document.revision ?? 0, ...(action === 'save' ? { content } : {}), ...(note ? { note } : {}), ...(action === 'publish' ? { proposalIds: proposalIds ?? [] } : {}) })
      applyDetail(result)
      setPending(null)
      setNotice(`${actionLabel(action)} · Revision ${result.document.revision}.`)
      return true
    } catch (error) {
      setError(messageOf(error))
      if (error instanceof AuthoringRequestError && ['revision_conflict', 'review_locked'].includes(error.code)) setConflict(true)
      return false
    } finally { setBusy(false) }
  }

  async function retryList() {
    setBusy(true); setError('')
    try { const [result, identity] = await Promise.all([client.list(), workflowSession()]); setDocuments(result.documents); setSession(identity); setReady(true) }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }

  async function openRevision(revision: number) {
    if (!id) return
    setBusy(true); setError('')
    try { setHistorical(await client.revision(id, revision)) }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }

  function downloadCopy() {
    if (!id) return
    const text = `${content.title || 'Untitled draft'}\n\nType: ${content.kind}\nAudience: ${content.audience}\n\nPurpose\n${content.purpose}\n\nSource reference\n${content.sourceReference}\n\nInstructions\n${content.body}\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `workflow-draft-${id}.txt`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Editor text downloaded. Use the published version to check the current approval and source evidence.')
  }

  const update = (field: Exclude<keyof DraftContent, 'sop'>, value: string) => { setContent(current => ({ ...current, [field]: value })); setNotice('') }
  const updateSop = (sop: StructuredSop) => { setContent(current => ({ ...current, sop, body: renderSop(sop) })); setNotice('') }
  function organizeSop() {
    const sop = detail?.document.capture ? sopFromCapture(detail.document.capture.bundle, content.body) : { ...emptySop(), sourceNotes: content.body }
    updateSop(sop)
    setNotice('Guided sections added. Your previous instructions are retained in source notes; captured labels are proposed actions. Review each step before submission.')
  }
  return (
    <section className="drafts-workspace" aria-label="Drafts and review">
      <header className="drafts-heading">
        <div><div className="drafts-eyebrow">Authoring</div><h1>Drafts & review</h1><p>Build a guide, keep its history, and prepare it for review.</p></div>
        <div className="drafts-actions"><button disabled={!ready || busy || !canContribute} onClick={() => go({ type: 'capture' })}>Import capture</button><button disabled={!ready || busy || !canContribute} onClick={() => go({ type: 'new' })}>+ New draft</button><button className="drafts-primary" disabled={!ready || busy || !canContribute} onClick={() => go({ type: 'new', guided: true })}>Create SOP</button></div>
      </header>
      <p className="drafts-preview">Shared Workflow · {session?.actor.name ?? 'Verifying identity…'} · {session?.storage === 'azure_blob' ? 'Azure storage' : 'Isolated test storage'} · Owner-only pilot</p>
      {error && <div className="drafts-alert" role="alert"><p>{error}</p>
        {!ready && <button onClick={retryList} disabled={busy}>Retry connection</button>}
        {id && <div className="drafts-actions"><button onClick={downloadCopy}>Download my text</button>
          <button disabled={busy} onClick={() => go({ type: 'open', id })}>Load latest revision</button></div>}
      </div>}
      {notice && <p className="drafts-notice" role="status">{notice}</p>}
      {pending && <div className="drafts-alert" role="alert"><p>You have unsaved changes. Keep editing or discard them to continue.</p>
        <div className="drafts-actions"><button onClick={() => setPending(null)}>Keep editing</button><button onClick={downloadCopy}>Download my text</button>
          <button onClick={() => void navigate(pending)}>Discard and continue</button></div></div>}
      {!ready ? <div className="drafts-empty"><h2>{error ? 'Authoring is not connected' : 'Loading saved drafts…'}</h2>
        <p>{error ? 'Your source library remains available in Documents. Your signed-in identity and shared storage must be available to create drafts.' : 'Checking the server for your saved work.'}</p></div> :
        <div className={`drafts-layout ${id || captureOpen ? 'drafts-has-editor' : ''}`}>
          <aside className="drafts-list" aria-label="Saved drafts">
            <label>Find a draft<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title or audience" /></label>
            <label>Status<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All drafts</option><option value="draft">Draft</option><option value="in_review">Submitted for review</option><option value="approved">Approved</option><option value="published">Published</option></select></label>
            <p className="drafts-count">{visible.length} {visible.length === 1 ? 'document' : 'documents'}</p>
            {!visible.length && <p className="drafts-muted">{documents.length ? 'No matching drafts.' : 'Your saved drafts will appear here.'}</p>}
            {visible.map(doc => <button key={doc.id} className="drafts-list-item" aria-current={id === doc.id ? 'true' : undefined} disabled={busy} onClick={() => go({ type: 'open', id: doc.id })}>
              <span className={`drafts-badge ${doc.state === 'in_review' ? 'drafts-badge-review' : ''}`}>{stateLabel(doc.state)}</span>
              <strong>{doc.title}</strong><span>{doc.kind} · Revision {doc.revision}</span><small>{dateLabel(doc.updatedAt)}</small>
            </button>)}
          </aside>
          {captureOpen ? <div><button className="drafts-mobile-back" disabled={busy} onClick={() => go({ type: 'list' })}>← All drafts</button><CaptureImport key={connectionEditorKey} client={client} onBusyChange={setBusy} onUnsavedChange={setCaptureDirty} onCreated={result => { applyDetail(result); setCaptureDirty(false); setCaptureOpen(false); setNotice('Capture retained with the draft. Add the missing process context before review.') }} /></div> : !id ? <div className="drafts-empty"><h2>{documents.length ? 'Choose a draft to continue' : 'A place to build the next guide'}</h2><p>{documents.length ? 'Open a saved draft to edit it or inspect its review history.' : 'Start with what the team needs to do, who it is for, and the source it should follow. Save a draft at any point.'}</p><button className="drafts-primary" disabled={busy || !canContribute} onClick={() => go({ type: 'new' })}>Create a draft</button></div> :
            <div className="drafts-editor">
              <div className="drafts-editor-bar"><button className="drafts-mobile-back" disabled={busy} onClick={() => go({ type: 'list' })}>← All drafts</button>
                <span className={`drafts-badge ${locked ? 'drafts-badge-review' : ''}`}>{detail ? stateLabel(detail.document.state) : 'New draft'}</span>
                <span aria-live="polite">{busy ? 'Working…' : dirty ? 'Unsaved changes' : detail ? `Saved · Revision ${detail.document.revision}` : 'Not saved yet'}</span>
              </div>
              {locked && <p className="drafts-review-note">This content is locked for review or publication. Return it to draft to edit; prior decisions and publications remain in history.</p>}
              {conflict && <p className="drafts-review-note">Your editor text is preserved. Download it before loading the latest revision.</p>}
              <form onSubmit={event => { event.preventDefault(); void mutate('save') }}>
                <fieldset disabled={busy || locked || !canContribute}>
                  <label>Title<input ref={titleInput} required maxLength={160} value={content.title} onChange={event => update('title', event.target.value)} placeholder="Give the guide a clear, specific name" /></label>
                  <div className="drafts-field-row"><label>Document type<select disabled={!!content.sop} value={content.kind} onChange={event => update('kind', event.target.value)}><option value="procedure">Procedure</option><option value="policy">Policy draft</option><option value="tutorial">Tutorial</option></select></label>
                    <label>Audience<input maxLength={160} value={content.audience} onChange={event => update('audience', event.target.value)} placeholder="Who will use this guide?" /></label></div>
                  <label>Purpose<textarea aria-label="Purpose" rows={2} maxLength={2000} value={content.purpose} onChange={event => update('purpose', event.target.value)} placeholder="When should someone use this, and what should they achieve?" /></label>
                  <label>Source reference<textarea aria-label="Source reference" aria-describedby="draft-source-help" rows={2} maxLength={1000} value={content.sourceReference} onChange={event => update('sourceReference', event.target.value)} placeholder="Document title, version, section, or source URL" /><small id="draft-source-help">Record the source you used. This field does not verify or import it.</small></label>
                  {content.sop ? <SopEditor key={`${id}:${connectionEditorKey}`} sop={content.sop} onChange={updateSop} /> : <>
                    <label>Instructions<textarea aria-label="Instructions" className="drafts-body" rows={12} maxLength={40000} value={content.body} onChange={event => update('body', event.target.value)} placeholder="Write the steps, expected result, and handoffs. Keep unverified details marked for review." /></label>
                    {content.kind === 'procedure' && <div className="sop-upgrade"><button type="button" onClick={organizeSop}>Use guided SOP</button><p>Organize the procedure into context, steps, outcomes and handoffs. Your current instructions will be kept in source notes.</p></div>}
                  </>}
                </fieldset>
                {content.sop && <>
                  <section className="sop-readiness" aria-label="SOP readiness"><h3>{gaps.length ? `${gaps.length} details to add before review` : 'Ready to submit for review'}</h3>
                    {gaps.length ? <><p>Save at any time. Complete these sections, or explain why a section does not apply.</p><ul>{gaps.slice(0, 8).map(gap => <li key={gap}>{gap}</li>)}</ul>{gaps.length > 8 && <p>Plus {gaps.length - 8} remaining details.</p>}</> : <p>Required sections are filled. A reviewer still needs to check accuracy and supporting evidence.</p>}
                  </section>
                  <details className="capture-preview sop-preview"><summary>Preview guide</summary><h2>{content.title || 'Untitled SOP'}</h2><p>{content.purpose || 'Purpose not provided'}</p><p>Audience: {content.audience || 'Not provided'}</p><p>Source reference: {content.sourceReference || 'Not provided'}</p><pre>{content.body}</pre></details>
                </>}
                <div className="drafts-save-bar"><div className="drafts-actions">
                  {!locked && canContribute && <button type="submit" className="drafts-primary" disabled={busy || conflict || (!dirty && !!detail)}>Save draft</button>}
                  {!locked && canContribute && detail && <button type="button" disabled={busy || dirty || conflict || knowledgeDirty || gaps.length > 0} onClick={() => void mutate('submit')}>Submit for review</button>}
                  {locked && canContribute && <button type="button" className="drafts-primary" disabled={busy || reviewDirty || knowledgeDirty} onClick={() => void mutate('reopen')}>Return to draft</button>}
                  <button type="button" onClick={downloadCopy}>Download my text</button>
                </div><small>{dirty ? 'Save your changes before submitting for review.' : 'Drafts stay separate from the procedure and learning libraries.'}</small></div>
              </form>
              {detail?.document.capture && <details className="capture-preview"><summary>Original browser capture · {detail.document.capture.bundle.steps.length} steps</summary>
                <p>Contributor-reviewed source labels; not independently verified activity. Editing this guide preserves the imported capture.</p>
                <p>{detail.document.capture.bundle.origin} · {dateLabel(detail.document.capture.bundle.startedAt)}</p>
                <ol className="capture-steps">{detail.document.capture.bundle.steps.map(step => <li key={step.id}><strong>{step.kind === 'click' ? 'Activate' : 'Change'} {step.control}: {step.label}</strong><small>{dateLabel(step.at)}</small></li>)}</ol>
                <small>Capture {detail.document.capture.bundle.id}<br />SHA-256 {detail.document.capture.digest}</small>
              </details>}
              {detail && <DraftKnowledgeLinks key={`knowledge:${detail.document.id}:${connectionEditorKey}`} document={detail.document} permissions={session?.permissions ?? []} disabled={dirty || busy || !!locked || conflict || !canContribute} onUnsavedChange={setKnowledgeDirty} />}
              {detail && session && <WorkflowReviewPanel key={`review:${detail.document.id}:${connectionEditorKey}`} document={detail.document} permissions={session.permissions} disabled={dirty || busy || knowledgeDirty} onAction={mutate} onUnsavedChange={setReviewDirty} />}
              {detail && <section className="drafts-history" aria-label="Revision history"><h2>Revision history</h2><p>Every accepted save and review transition is retained.</p>
                <ol>{detail.history.map(version => <li key={version.revision}><div><strong>Revision {version.revision} · {actionLabel(version.action)}</strong><span>{dateLabel(version.updatedAt)} · {version.updatedBy.name}</span></div>
                  <button disabled={busy} onClick={() => void openRevision(version.revision)}>View revision {version.revision}</button></li>)}</ol>
                {historical && <article className="drafts-history-preview"><div className="drafts-editor-bar"><h3>Revision {historical.revision}</h3><button onClick={() => setHistorical(null)}>Close revision</button></div>
                  <p>{stateLabel(historical.state)} · {historical.content.kind}</p><h3>{historical.content.title}</h3>
                  <dl><dt>Audience</dt><dd>{historical.content.audience || 'Not added'}</dd><dt>Purpose</dt><dd>{historical.content.purpose || 'Not added'}</dd><dt>Source reference</dt><dd>{historical.content.sourceReference || 'Not added'}</dd></dl>
                  <pre>{historical.content.body || 'No instructions added yet.'}</pre></article>}
              </section>}
            </div>}
        </div>}
    </section>
  )
}
