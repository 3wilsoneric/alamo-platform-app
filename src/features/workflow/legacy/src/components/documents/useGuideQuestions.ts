'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { processClient, parseProcessQuestion, processRequestRejected } from '@/lib/process-client'
import { workflowParams, replaceWorkflowParams, workflowHref } from '@/lib/workflow-navigation'
import { useSourceSelection } from '@/components/processes/useSourceSelection'
import { useGuideProcessActions } from './useGuideProcessActions'
import type { AuthoringClient, DraftDetail } from '@/lib/authoring-types'
import type { SourceAttachment, ConversationOrigin } from '@/lib/conversation-types'
import type { InspectedSource, ProcessEvidence, ProcessHistoryTurn, ProcessQuestion, ProcessWorkspace } from '@/lib/process-types'

/** Questions keep their actor-scoped process history; guide edits keep their original records. */
export function useGuideQuestions(document: DraftDetail['document'] | undefined, client: AuthoringClient) {
  const actions = useGuideProcessActions(client)
  const [workspace, setWorkspace] = useState<ProcessWorkspace | null>(null)
  const [turns, setTurns] = useState<ProcessHistoryTurn[]>([])
  const [hasEarlier, setHasEarlier] = useState(false)
  const [busy, setBusy] = useState(true), [error, setError] = useState('')
  const [pending, setPending] = useState<ProcessQuestion | null>(null)
  const [source, setSource] = useState<InspectedSource | null>(null)
  const sources = useSourceSelection()
  const sourceContext = sources.value?.active ?? undefined
  const { accept: acceptSources, reset: resetSources } = sources
  const cursor = useRef('')
  const conversation = useRef('')
  const processId = document ? `draft:${document.id}` : ''

  const readHistory = useCallback((before = '') => processClient.history(processId, before, processId ? '' : conversation.current), [processId])

  const acceptHistory = useCallback((history: Awaited<ReturnType<typeof processClient.history>>, earlier = false) => {
    acceptSources(history.sourceSelection)
    cursor.current = history.turns[0]?.id ?? ''
    setHasEarlier(history.hasEarlier)
    const incoming = history.turns.filter(turn => turn.kind !== 'guide')
    setTurns(previous => earlier ? [...incoming, ...previous.filter(turn => !incoming.some(item => item.id === turn.id))] : incoming)
  }, [acceptSources])
  useEffect(() => {
    let active = true
    const previous = workflowParams().get('conversation') ?? ''
    conversation.current = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(previous) ? previous : processId ? '' : crypto.randomUUID()
    if (!processId) replaceWorkflowParams({ conversation: conversation.current })
    setSource(null); setError(''); resetSources()
    setBusy(true)
    Promise.all([processClient.workspace(), readHistory()]).then(([value, history]) => {
      if (!active) return
      setWorkspace(value); acceptHistory(history)
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load guide questions.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [processId, document?.revision, readHistory, resetSources, acceptHistory])

  async function refresh() {
    const [value, history] = await Promise.all([processClient.workspace(), readHistory()])
    // A lost response may be checked after enough other messages to move it off page one.
    let preceding = history
    const awaitingId = pending ? `question:${pending.turnId}` : actions.pending?.kind === 'command' ? `command:${actions.pending.command.id}` : null
    while (awaitingId && !history.turns.some(turn => turn.id === awaitingId) && preceding.hasEarlier) {
      preceding = await readHistory(preceding.turns[0]!.id)
      history.turns.unshift(...preceding.turns); history.hasEarlier = preceding.hasEarlier
    }
    setWorkspace(value); acceptHistory(history); setSource(null); setError('')
    const recoveredAction = actions.recover(history, value)
    const saved = recoveredAction || !!pending && history.turns.some(turn => turn.id === `question:${pending.turnId}`)
    // An absent history entry cannot prove the original request will never commit.
    // Retain its idempotency key until saved, retried or explicitly discarded.
    if (saved) setPending(null)
    else if (pending || actions.pending) setError('This message is not in saved history yet. Retry to check the same request.')
    return saved
  }
  async function earlier() {
    if (busy || !cursor.current) return
    setBusy(true); setError('')
    try { acceptHistory(await readHistory(cursor.current), true) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load earlier questions.') }
    finally { setBusy(false) }
  }
  async function inspect(selection: ProcessEvidence, quote?: string) {
    if (busy) return
    setBusy(true); setError(''); setSource(null)
    try { setSource({ ...await processClient.evidence(selection.citation), selection, ...(quote ? { quote } : {}) }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load this source.') }
    finally { setBusy(false) }
  }
  async function route(message: string, attachment?: SourceAttachment): Promise<'answered' | 'author' | { guideId: string }> {
    if (sources.busy || sources.pending) throw new Error('Finish saving the source choice before sending this message.')
    if (sources.value?.unavailable && !attachment) throw new Error('Choose or clear the unavailable source before sending this message.')
    let request = pending
    if (!request) {
      const value = await processClient.workspace()
      const process = value.processes.find(item => item.id === processId)
      if (document && (!process || process.revision !== document.revision)) throw new Error('The guide changed. Reload the guide and conversation, then review the current version before sending again.')
      setWorkspace(value)
      const parsed = parseProcessQuestion(message)
      const history = [...(document?.conversation?.turns ?? []).map(turn => ({ at: turn.at, message: `Author: ${turn.message}\nProForma: ${turn.reply}` })),
          ...turns.map(turn => ({ at: turn.at, message: turn.question }))]
          .sort((a, b) => a.at.localeCompare(b.at)).slice(-6).map(turn => turn.message.slice(0, 2500))
      const plan = parsed.question !== message && !actions.pending ? { kind: 'ask' as const }
        : await actions.route(message, value, process, history, !document || attachment || sourceContext ? { ...(!document ? { conversationId: conversation.current } : {}), ...(attachment ? { attachment } : sourceContext ? { sourceQuestionId: sourceContext.id } : {}) } : undefined)
      if (plan.kind === 'handled') {
        if (plan.processId?.startsWith('draft:') && plan.processId !== processId) { actions.finish(); return { guideId: plan.processId.slice(6) } }
        const [next, history] = await Promise.all([processClient.workspace(), readHistory()])
        setWorkspace(next); acceptHistory(history); actions.finish(); setError(''); return 'answered'
      }
      if (plan.kind === 'select_process') {
        window.location.assign(workflowHref(plan.processId.startsWith('draft:') ? 'drafts' : 'processes', plan.processId.startsWith('draft:') ? { draft: plan.processId.slice(6), action: 'chat' } : { process: plan.processId }))
        return 'answered'
      }
      if (plan.kind === 'author') {
        if (document ? plan.draftId !== document.id || plan.revision !== document.revision : !!plan.draftId) throw new Error('This edit targets a different guide or version. Open its process conversation to continue.')
        return 'author'
      }
      if (plan.kind === 'clarify') throw new Error(plan.message)
      if (plan.kind !== 'ask') throw new Error('This action needs more context. Your message is still here.')
      request = {
        ...parsed, processId: processId || undefined, sourceFingerprint: process?.fingerprint,
        ...(!document ? { conversationId: conversation.current } : {}),
        ...(attachment ? { attachment } : sourceContext && parsed.sourceMode !== 'published' ? { sourceQuestionId: sourceContext.id } : {}),
        // The editor shows the working document, including a pending successor.
        sourceMode: /(?:working draft|published only|current sources):/i.test(message.match(/^(?:(?:sources only|working draft|published only|current sources):\s*)+/i)?.[0] ?? '')
          ? parsed.sourceMode : document?.state === 'draft' || document?.state === 'in_review' || attachment || sourceContext ? 'working' : 'current',
        history: turns.filter(turn => turn.answer).slice(-6).map(turn => turn.answer!.question),
        turnId: crypto.randomUUID(), message,
      }
      setPending(request)
    }
    try { await processClient.askSaved(request) }
    catch (failure) { if (processRequestRejected(failure)) setPending(null); throw failure }
    const [value, history] = await Promise.all([processClient.workspace(), readHistory()])
    setWorkspace(value); acceptHistory(history); setPending(null); setError('')
    return 'answered'
  }
  const process = workspace?.processes.find(item => item.id === processId)
  const stale = (turn: ProcessHistoryTurn) => !workspace || process?.revision !== document?.revision
    || turn.answer?.sourceStateFingerprint !== workspace.sourceStateFingerprint
    || !!turn.processFingerprint && turn.processFingerprint !== process?.fingerprint
  return { turns, hasEarlier, busy: busy || sources.busy, error, sources, sourceScope: { ...(processId ? { processId } : { conversationId: conversation.current }) }, pending: pending ?? actions.pending, source, sourceContext, stale, route, refresh, earlier, inspect,
    notice: actions.notice, changeImpact: actions.showChanges ? workspace?.changeImpact : undefined,
    attempts: workspace?.attempts.filter(item => item.processId === processId) ?? [],
    attempt: workspace ? actions.attemptFor(workspace, processId) : undefined, chooseAttempt: actions.chooseAttempt,
    origin: (): ConversationOrigin | undefined => !document && conversation.current ? { conversationId: conversation.current } : undefined,
    retainedAttachment: async () => sourceContext ? (await processClient.sourceDiscussion(sourceContext.id)).attachment : undefined,
    closeSource: () => setSource(null), discard: () => { setPending(null); actions.discard(); setError('') } }
}
