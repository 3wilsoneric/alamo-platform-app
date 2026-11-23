'use client'
import { useCallback, useRef, useState } from 'react'
import { processClient, processRequestRejected } from '@/lib/process-client'
import type { SourceDiscussion, SourceSelection, SourceSelectionInput, ProcessWorkspace } from '@/lib/process-types'

type Scope = Pick<SourceSelectionInput, 'processId' | 'conversationId'>
export function useSourceSelection(onWorkspace?: (workspace: ProcessWorkspace) => void) {
  const [value, setValue] = useState<SourceSelection | null>(null)
  const [original, setOriginal] = useState<SourceDiscussion | null>(null)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<SourceSelectionInput | null>(null)
  const pendingRequest = useRef<SourceSelectionInput | null>(null)
  const generation = useRef(0), current = useRef<SourceSelection | null>(null), inFlight = useRef(false)
  const reset = useCallback(() => {
    generation.current++; current.current = null; inFlight.current = false; pendingRequest.current = null
    setValue(null); setOriginal(null); setError(''); setPending(null); setBusy(false)
  }, [])
  const accept = useCallback((next: SourceSelection) => {
    if (current.current?.active?.id !== next.active?.id) setOriginal(null)
    current.current = next; setValue(next)
    const awaiting = pendingRequest.current
    if (awaiting && next.revision > awaiting.expectedRevision && !next.unavailable && (next.active?.id ?? null) === awaiting.sourceQuestionId) {
      pendingRequest.current = null; setPending(null); setError('')
    } else if (!awaiting) setError('')
  }, [])
  async function change(sourceQuestionId: string | null, scope: Scope) {
    if (!current.current || inFlight.current) return
    const request = pendingRequest.current ?? { ...scope, id: crypto.randomUUID(), expectedRevision: current.current.revision, sourceQuestionId }
    const epoch = generation.current
    inFlight.current = true; pendingRequest.current = request; setBusy(true); setError(''); setPending(request)
    try {
      const next = await processClient.selectSource(request)
      const workspace = onWorkspace ? await processClient.workspace() : null
      if (epoch !== generation.current) return
      if (workspace) onWorkspace?.(workspace)
      accept(next); pendingRequest.current = null; setPending(null)
    } catch (failure) {
      if (epoch !== generation.current) return
      if (processRequestRejected(failure)) { pendingRequest.current = null; setPending(null) }
      setError(failure instanceof Error ? failure.message : 'Could not save this source choice. Retry the same choice or reload the conversation.')
    } finally { if (epoch === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  async function inspect() {
    if (!current.current?.active || inFlight.current) return
    const epoch = generation.current, id = current.current.active.id
    inFlight.current = true; setBusy(true); setError(''); setOriginal(null)
    try {
      const source = await processClient.sourceDiscussion(id)
      if (epoch === generation.current && current.current?.active?.id === id) setOriginal(source)
    } catch (failure) { if (epoch === generation.current) setError(failure instanceof Error ? failure.message : 'Could not open this original source.') }
    finally { if (epoch === generation.current) { inFlight.current = false; setBusy(false) } }
  }
  return { value, original, error, busy, pending, accept, reset, change, inspect, close: () => setOriginal(null) }
}
