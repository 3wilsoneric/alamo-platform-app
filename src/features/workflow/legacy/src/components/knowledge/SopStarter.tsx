'use client'

import { useEffect, useRef, useState } from 'react'
import { workflowHref } from '@/lib/workflow-navigation'
import { knowledgeClient } from '@/lib/knowledge-client'
import { authoringClient } from '@/lib/authoring-client'
import { renderSop, validateSop } from '@/lib/sop-contract.mjs'
import type { DraftContent } from '@/lib/authoring-types'

export default function SopStarter({ snapshotId, nodeId }: { snapshotId: string; nodeId: string }) {
  const [content, setContent] = useState<DraftContent | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const draftId = useRef<string | null>(null)
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (busy) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])
  async function preview() {
    setBusy(true); setError('')
    try {
      const evidence = await knowledgeClient.evidence({ snapshotId, nodeId })
      const starter = JSON.parse(evidence.excerpt)
      if (starter.reviewStatus !== 'draft-not-reviewed' || starter.grounding !== 'inferred') throw new Error('This source is not an unapproved SOP starter.')
      const sop = validateSop(starter.content.sop)
      setContent({ ...starter.content, sop, body: renderSop(sop) })
    } catch (error) { setError(error instanceof Error ? error.message : 'The starter could not be loaded.') }
    finally { setBusy(false) }
  }
  async function save() {
    if (!content || busy || saved) return
    setBusy(true); setError('')
    draftId.current ??= crypto.randomUUID()
    try {
      // Reuse the ID on retry so an uncertain response cannot create a second copy.
      try { await authoringClient.mutate(draftId.current, { action: 'save', expectedRevision: 0, content }) }
      catch (error) {
        const existing = await authoringClient.get(draftId.current).catch(() => null)
        if (!existing) throw error
      }
      setSaved(true)
    } catch (error) { setError(error instanceof Error ? error.message : 'The draft could not be saved.') }
    finally { setBusy(false) }
  }
  return <section className="knowledge-sop-starter" aria-label="SOP starter">
    <p>Draft starter · Requires review</p>
    {!content && <button disabled={busy} onClick={() => void preview()}>{busy ? 'Loading starter…' : 'Preview SOP starter'}</button>}
    {content && <><details open><summary>Proposed instructions</summary><pre>{content.body}</pre></details>
      <button disabled={busy || saved} onClick={() => void save()}>{saved ? 'Draft copy saved' : busy ? 'Saving draft…' : 'Create editable draft'}</button></>}
    {saved && <p role="status">Saved as an unapproved draft. <a href={workflowHref('drafts', { draft: draftId.current! })}>Continue editing this SOP</a>.</p>}
    {error && <p className="knowledge-error" role="alert">{error}</p>}
  </section>
}
