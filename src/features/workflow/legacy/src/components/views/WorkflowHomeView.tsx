'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, FileText, MoreHorizontal, PenLine } from 'lucide-react'
import { authoringClient } from '@/lib/authoring-client'
import type { DraftDetail, DraftSummary } from '@/lib/authoring-types'
import { workflowHref } from '@/lib/workflow-navigation'
import { workflowSession, type WorkflowSession } from '@/lib/platform-transport'
import ProcessWorkspace from '@/components/processes/ProcessWorkspace'
import ProcessDirectory from '@/components/processes/ProcessDirectory'
import type { ProcessWorkspace as Workspace } from '@/lib/process-types'
import './workflow-home.css'

export default function WorkflowHomeView() {
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null)
  const [session, setSession] = useState<WorkflowSession | null>(null)
  const canContribute = session?.permissions.includes('contribute') ?? false
  const [error, setError] = useState(false)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const pending = useRef({ busy: false, dirty: false, leaving: false })
  const busyChanged = useCallback((busy: boolean) => { pending.current.busy = busy }, [])
  const dirtyChanged = useCallback((dirty: boolean) => { pending.current.dirty = dirty }, [])
  useEffect(() => {
    let active = true
    Promise.all([authoringClient.list(), workflowSession()]).then(([result, identity]) => { if (active) { setDrafts(result.documents); setSession(identity) } }).catch(() => { if (active) setError(true) })
    const warn = (event: BeforeUnloadEvent) => {
      if (!pending.current.leaving && (pending.current.busy || pending.current.dirty)) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => { active = false; window.removeEventListener('beforeunload', warn) }
  }, [])
  function created(detail: DraftDetail) {
    // The accepted revision is durable before leaving; suppress only this successful transition.
    pending.current.leaving = true
    window.location.assign(workflowHref('drafts', { draft: detail.document.id }))
  }
  return <div className="workflow-home">
    <div className="pf-home-discussion">
    <div className="pf-home-bar"><span><PenLine size={18} aria-hidden="true" /> Ask ProForma</span>{canContribute && <a href={workflowHref('drafts', { action: 'sop' })}>Write an SOP <ArrowRight size={15} aria-hidden="true" /></a>}</div>
    <div className="workflow-home-compose">
      {session ? <><ProcessWorkspace home onSavedGuide={created} onBusyChange={busyChanged} onUnsavedChange={dirtyChanged} onWorkspaceChange={setWorkspace} />{!canContribute && <p className="workflow-home-empty">Read-only access</p>}</> : <p>{error ? 'ProForma is unavailable.' : 'Loading…'}</p>}
    </div>
    <nav className="workflow-home-tools" aria-label="Create or open">
      {canContribute && <details className="workflow-create-menu"><summary aria-label="More starting points"><MoreHorizontal size={18} aria-hidden="true" /><span>More</span></summary><div>
        <a href={workflowHref('drafts', { action: 'teach', input: 'source' })}>Paste text or use Pipeline</a>
        <a href={workflowHref('drafts', { action: 'sop' })}>New SOP</a>
        <a href={workflowHref('drafts', { action: 'capture' })}>Import capture</a>
      </div></details>}
    </nav>
    </div>
    <div className="pf-home-work">
    {(error || drafts === null || drafts.length > 0) && <section className="workflow-home-ledger" aria-label="Recent drafts">
      <div className="workflow-home-section"><h2>Continue editing</h2><a href={workflowHref('drafts')}>All documents</a></div>
      {error ? <p>Could not load drafts. <a href={workflowHref('drafts')}>Retry</a></p> : drafts === null ? <p role="status">Loading…</p> :
        <ul className="workflow-home-drafts">{[...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map(draft => <li key={draft.id}><a href={workflowHref('drafts', { draft: draft.id })}>
          <FileText size={18} aria-hidden="true" /><strong>{draft.title}</strong><span>{draft.state.replaceAll('_', ' ')} · v{draft.revision}</span>
        </a></li>)}</ul>}
    </section>}
    {workspace && <ProcessDirectory processes={workspace.processes} compact />}
    <nav className="workflow-home-reference" aria-label="Review">
      <a href={workflowHref('drafts', { status: 'in_review' })}>Review queue{drafts ? ` (${drafts.filter(draft => draft.state === 'in_review').length})` : ''}</a>
      <a href={workflowHref('knowledge', { tab: 'changes' })}>Source changes</a>
    </nav>
    </div>
  </div>
}
