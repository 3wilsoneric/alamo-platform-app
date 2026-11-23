'use client'

import { useEffect, useState } from 'react'
import { replaceWorkflowParams, workflowParams } from '@/lib/workflow-navigation'

export const handoffRehearsalAvailable = false

export type HandoffTurn = { id: string; text: string; status: string; answer?: { paragraphs: { text: string }[] }; draftReview?: { artifactId: string; artifactRevision: string; decision: 'accept' | 'reject' | null } }
type HandoffChat = { id: string; version: number; workId: string; turns: HandoffTurn[] }
type Command = Record<string, string | number | string[]>
async function request<T>(query = '', command?: Command): Promise<T> {
  if (!handoffRehearsalAvailable) throw new Error('The referral handoff rehearsal is available only in the local development sandbox. This Platform deployment has no handoff execution connection.')
  const response = await fetch(`/api/workflow/v1/handoff${query}`, { method: command ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(120000),
    headers: { 'content-type': 'application/json' }, ...(command ? { body: JSON.stringify(command) } : {}) })
  const data = await response.json().catch(() => null)
  if (!data) throw new Error('The handoff connection is unavailable in this environment.')
  if (!response.ok) throw new Error(data.error?.message ?? 'Ally could not complete the macro request.')
  return data
}
export function useHandoffConversation() {
  const [chat, setChat] = useState<HandoffChat | null>(null), [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [pending, setPending] = useState<Command | null>(null)
  useEffect(() => {
    const id = workflowParams().get('macro')
    if (!id) return
    let current = true
    request<HandoffChat>(`?id=${encodeURIComponent(id)}`).then(result => { if (current) { setChat(result); setActive(true) } }).catch(error => { if (current) { setError(error instanceof Error ? error.message : 'Could not reopen the macro.'); setActive(true) } })
    return () => { current = false }
  }, [])
  function save(result: HandoffChat) { setChat(result); setActive(true); replaceWorkflowParams({ macro: result.id }) }
  const recognizes = (text: string) => active || /^try (?:the )?fictional handoff[.!]?$/i.test(text.trim())
  async function send(text: string) {
    if (busy) return false
    if (/^back to (?:the )?guide[.!]?$/i.test(text.trim()) && !pending) { setActive(false); setError(''); replaceWorkflowParams({ macro: undefined }); return true }
    setBusy(true); setError(''); setActive(true)
    try {
      let current = chat, command = pending
      if (!current && !command) command = { action: 'create', requestId: crypto.randomUUID(), skillIds: ['assessment-review'], workId: 'synthetic-ready' }
      if (!command && current) {
        const decision = /^accept this draft[.!]?$/i.test(text.trim()) ? 'accept' : /^reject this draft[.!]?$/i.test(text.trim()) ? 'reject' : null
        if (decision) {
          const turn = [...current.turns].reverse().find(item => item.draftReview?.decision === null)
          if (!turn?.draftReview) throw new Error('There is no pending draft to review in this macro conversation.')
          // Explicit typed review binds the displayed artifact version. Model text
          // and generic approval language never produce this command.
          command = { action: 'review_draft', conversationId: current.id, turnId: turn.id, requestId: crypto.randomUUID(), expectedArtifactRevision: turn.draftReview.artifactRevision, decision }
        } else command = { action: 'send', conversationId: current.id, expectedVersion: current.version, requestId: crypto.randomUUID(), text: text.trim() }
      }
      if (!command) return false
      setPending(command)
      current = await request<HandoffChat>('', command); save(current); setPending(null)
      if (command.action === 'create') {
        const next = { action: 'send', conversationId: current.id, expectedVersion: current.version, requestId: crypto.randomUUID(), text: 'Review answer quality in preparation for a referral handoff draft.' }
        setPending(next); current = await request<HandoffChat>('', next); save(current); setPending(null)
      }
      return true
    } catch (error) { setChat(null); setError(error instanceof Error ? error.message : 'The macro could not complete this request.'); return false }
    finally { setBusy(false) }
  }
  async function reload() {
    const id = chat?.id ?? workflowParams().get('macro')
    if (!id || busy) return
    setBusy(true)
    try { const result = await request<HandoffChat>(`?id=${encodeURIComponent(id)}`); save(result); setError('') }
    catch (error) { setChat(null); setError(error instanceof Error ? error.message : 'This macro is unavailable.') }
    finally { setBusy(false) }
  }
  function leave() {
    if (busy) return
    // Leaving does not cancel or repeat a possibly accepted server command. The
    // saved conversation can be reopened through its original URL.
    setChat(null); setPending(null); setActive(false); setError(''); replaceWorkflowParams({ macro: undefined })
  }
  return { chat, active, busy, error, pending, recognizes, send, reload, leave }
}
