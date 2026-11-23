'use client'
import { useState } from 'react'
import type { AuthoringClient } from '@/lib/authoring-types'
import type { ProcessCommand, ProcessHistory, ProcessPlan, ProcessPlanInput, ProcessRequestContext, ProcessRecord, ProcessWorkspace } from '@/lib/process-types'
import { processClient, processRequestRejected } from '@/lib/process-client'
import { practiceObservation } from '@/lib/practice-input'
import { downloadProcessSnapshot, runSavedProcessRequest } from '@/lib/process-request-runner'
import { replaceWorkflowParams, workflowParams } from '@/lib/workflow-navigation'

type Pending = { kind: 'plan'; id: string; input: ProcessPlanInput; context?: ProcessRequestContext } | { kind: 'command'; command: ProcessCommand } | { kind: 'request'; id: string; stop?: boolean; confirmPlanHash?: string }
type Result = ProcessPlan | { kind: 'handled'; processId?: string }
export function useGuideProcessActions(client: AuthoringClient) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [notice, setNotice] = useState('')
  const [showChanges, setShowChanges] = useState(false)
  const [attemptId, chooseAttempt] = useState('')
  function attemptFor(workspace: ProcessWorkspace, processId?: string) {
    const attempts = workspace.attempts.filter(item => item.processId === processId)
    return attempts.find(item => item.id === attemptId) ?? attempts.at(-1)
  }
  async function execute(operation: Exclude<Pending, { kind: 'plan' }>): Promise<Result> {
    setPending(operation)
    try {
      if (operation.kind === 'command') {
        const result = await processClient.command(operation.command)
        if (operation.command.action === 'start_practice') chooseAttempt(result.receipt.resultId ?? '')
        if (operation.command.action === 'reconcile') setShowChanges(true)
      } else {
        replaceWorkflowParams({ request: operation.id })
        const result = await runSavedProcessRequest(client, operation.id, operation.stop, operation.confirmPlanHash)
        return { kind: 'handled', ...(result?.processId ? { processId: result.processId } : {}) }
      }
      return { kind: 'handled' }
    } catch (error) { if (operation.kind === 'command' && processRequestRejected(error)) setPending(null); throw error }
  }
  async function route(message: string, workspace: ProcessWorkspace, process: ProcessRecord | undefined, history: string[], context?: ProcessRequestContext): Promise<Result> {
    const attached = !!context?.attachment
    setNotice('')
    if (pending && pending.kind !== 'plan') return execute(pending)
    const requireProcess = () => { if (!process) throw new Error('Save or select a guide before starting this process action.'); return process }
    const attempt = attemptFor(workspace, process?.id)
    const requests = workspace.requests.filter(item => ['running', 'awaiting_review'].includes(item.status) && [item.processId, item.originProcessId, ...(item.targets ?? []).map(target => target.processId)].includes(process?.id ?? null) && (!!process || (item.conversationId ?? '') === (context?.conversationId ?? '')))
    const active = requests.find(item => item.id === workflowParams().get('request')) ?? (requests.length === 1 ? requests[0] : undefined)
    if (/^(continue|resume|stop remaining steps)[.!]?$/i.test(message) && requests.length) {
      if (attached) throw new Error('Use or remove the unsent attachment before continuing the saved request. Your source is retained here.')
      if (!active) throw new Error('Several requests are waiting. Open the request you want to continue from its saved conversation link.')
      return execute({ kind: 'request', id: active.id, stop: /^stop/i.test(message), ...(active.status === 'awaiting_review' && !/^stop/i.test(message) ? { confirmPlanHash: active.planHash } : {}) })
    }
    let plan: ProcessPlan | Awaited<ReturnType<typeof processClient.request>>
    if (/^start practice[.!]?$/i.test(message)) {
      const p = requireProcess(); plan = { kind: 'command', command: { action: 'start_practice', processId: p.id, sourceFingerprint: p.fingerprint, expectedRevision: workspace.revision } }
    } else if (/^observed\s*:/i.test(message)) plan = { kind: 'command', command: { ...practiceObservation(message, attempt), expectedRevision: workspace.revision } }
    else if (/^feedback\s*:/i.test(message)) {
      const p = requireProcess(); plan = { kind: 'command', command: { action: 'feedback', processId: p.id, sourceFingerprint: p.fingerprint, note: message.replace(/^feedback\s*:/i, '').trim(), expectedRevision: workspace.revision } }
    } else if (/^(?:check|show) changes[.!]?$/i.test(message)) plan = workspace.permissions.includes('contribute') ? { kind: 'command', command: { action: 'reconcile', expectedRevision: workspace.revision } } : { kind: 'changes' }
    else if (/^export process[.!]?$/i.test(message)) { const p = requireProcess(); plan = { kind: 'export', processId: p.id, sourceFingerprint: p.fingerprint } }
    else if (!workspace.conversationAvailable) return { kind: 'ask' }
    else {
      const input: ProcessPlanInput = { message, expectedRevision: workspace.revision, sourceStateFingerprint: workspace.sourceStateFingerprint, processId: process?.id, sourceFingerprint: process?.fingerprint, attemptId: attempt?.status === 'active' ? attempt.id : undefined, history }
      const operation = pending?.kind === 'plan' ? pending : { kind: 'plan' as const, id: crypto.randomUUID(), input, ...(context ? { context } : {}) }
      setPending(operation); replaceWorkflowParams({ request: operation.id })
      try { plan = await processClient.request({ id: operation.id, input: operation.input, ...(operation.context ? { context: operation.context } : {}) }); if (plan.kind !== 'request') replaceWorkflowParams({ request: undefined }) }
      catch (error) { if (processRequestRejected(error)) setPending(null); throw error }
    }
    if (attached && !['ask', 'author', 'clarify', 'request'].includes(plan.kind)) { setPending(null); throw new Error('Ask about the attached source or add it to the guide before this action. Your source and message are retained.') }
    if (!process && !['ask', 'author', 'clarify', 'select_process', 'request'].includes(plan.kind)) { setPending(null); throw new Error('Create or open the guide before starting its process actions. Your message is retained.') }
    if (plan.kind === 'request') return execute({ kind: 'request', id: plan.request.id })
    if (plan.kind === 'command') {
      if (!workspace.permissions.includes('contribute')) { setPending(null); throw new Error('Contribution access is required to record process actions. Your message is retained.') }
      return execute({ kind: 'command', command: { ...plan.command, id: crypto.randomUUID(), conversation: { message, ...(process ? { processId: process.id } : {}) } } })
    }
    setPending(null)
    if (plan.kind === 'changes') { setShowChanges(true); return { kind: 'handled' } }
    if (plan.kind === 'export') {
      downloadProcessSnapshot(await processClient.snapshot(plan.processId, plan.sourceFingerprint), `proforma-process-${plan.sourceFingerprint.slice(0, 12)}.json`)
      setNotice('Process snapshot downloaded.'); return { kind: 'handled' }
    }
    return plan
  }
  function recover(history: ProcessHistory, workspace: ProcessWorkspace) {
    const saved = pending?.kind === 'command' ? history.turns.some(turn => turn.id === `command:${pending.command.id}`)
      : pending ? workspace.requests.some(request => request.id === pending.id) : false
    if (saved) setPending(null)
    return saved
  }
  return { pending, notice, showChanges, route, recover, attemptFor, chooseAttempt, finish: () => setPending(null), discard: () => { setPending(null); setNotice('') } }
}
