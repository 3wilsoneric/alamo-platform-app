'use client'

import { useEffect, useState } from 'react'
import type { AuthoringClient, DraftDetail, DraftRevision } from '@/lib/authoring-types'
import { renderSop } from '@/lib/sop-contract.mjs'
import SopEditor from './SopEditor'

/** A document-shaped editor over the existing immutable draft/save contract. */
export default function GuidePageEditor({ document, client, onSaved, onCancel, onDirtyChange, onBusyChange, readOnly = false }: {
  document: DraftRevision; client: AuthoringClient; onSaved: (detail: DraftDetail) => void
  readOnly?: boolean; onCancel: () => void; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void
}) {
  const [content, setContent] = useState(document.content)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const dirty = JSON.stringify(content) !== JSON.stringify(document.content)
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  const field = (name: 'title' | 'purpose' | 'audience' | 'sourceReference' | 'body', value: string) => setContent(previous => ({ ...previous, [name]: value }))
  async function save() {
    if (busy || readOnly || !dirty) return
    setBusy(true); setError('')
    try {
      const result = await client.mutate(document.id, { action: 'save', expectedRevision: document.revision, content })
      onDirtyChange(false); onSaved(result)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save. Your changes are still here.') }
    finally { setBusy(false); onBusyChange(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ documentId: document.id, baseRevision: document.revision, content }, null, 2)], { type: 'application/json' }))
    const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = 'proforma-unsaved-guide.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <form className="guide-page-editor" aria-label="Edit guide document" onSubmit={event => { event.preventDefault(); void save() }}>
    <div className="guide-page-toolbar"><span role="status">{busy ? 'Saving…' : dirty ? 'Unsaved changes' : `Saved · Revision ${document.revision}`}</span><div>
      <button type="button" disabled={busy} onClick={() => { onDirtyChange(false); onCancel() }}>{dirty ? 'Discard changes' : 'Done'}</button>
      <button className="drafts-primary" type="submit" disabled={busy || readOnly || !dirty}>Save changes</button>
    </div></div>
    {error && <div role="alert" className="drafts-alert"><p>{error}</p><button type="button" onClick={download}>Download unsaved guide</button><p>Your text is retained. If the saved revision changed, keep a copy before discarding these edits and reloading.</p></div>}
    <fieldset disabled={busy || readOnly}>
      <label className="guide-title-field"><span className="sr-only">Guide title</span><textarea aria-label="Guide title" rows={2} required maxLength={160} value={content.title} onChange={event => field('title', event.target.value)} placeholder="Untitled guide" /></label>
      <label className="guide-purpose-field"><span className="sr-only">Guide purpose</span><textarea aria-label="Guide purpose" rows={2} maxLength={2000} value={content.purpose} onChange={event => field('purpose', event.target.value)} placeholder="What does this guide help someone do?" /></label>
      <details className="guide-properties"><summary>Properties</summary><label>Audience<input maxLength={160} value={content.audience} onChange={event => field('audience', event.target.value)} /></label><label>Source reference<input maxLength={1000} value={content.sourceReference} onChange={event => field('sourceReference', event.target.value)} /></label></details>
      {content.sop ? <SopEditor documentMode sop={content.sop} onChange={sop => setContent(previous => ({ ...previous, sop, body: renderSop(sop) }))} /> : <label>Instructions<textarea rows={12} maxLength={40000} value={content.body} onChange={event => field('body', event.target.value)} /></label>}
    </fieldset>
  </form>
}
