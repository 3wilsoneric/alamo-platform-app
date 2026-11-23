'use client'
import { useEffect, useRef, useState } from 'react'
import type { ExecutionChat, ExecutionCommand, ExecutionConfiguration, ExecutionDiscovery, ExecutionSource, StepBinding } from '@/lib/execution-types'
import { replaceWorkflowParams, workflowParams } from '@/lib/workflow-navigation'
import { useExecutionTransport } from './ExecutionTransport'

const initiation = /^(?:show (?:me )?(?:the )?macros|what macros(?: are available)?\??|prepare (?:a |the )?referral handoff draft)[.!]?$/i
const connect = /^connect (?:alamoagent|agent)[.!]?$/i
const same = (a: ExecutionSource, b: ExecutionSource) => a.documentId === b.documentId && a.publicationId === b.publicationId && a.fingerprint === b.fingerprint
export function usePublishedExecution(source: ExecutionSource | null) {
  const request = useExecutionTransport(), sourceKey = source ? JSON.stringify(source) : ''
  const [configuration, setConfiguration] = useState<ExecutionConfiguration | null>(null), [discovery, setDiscovery] = useState<ExecutionDiscovery | null>(null)
  const [chat, setChat] = useState<ExecutionChat | null>(null), [active, setActive] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const pending = useRef<{ command: ExecutionCommand; kind: 'configuration' | 'chat'; message?: string } | null>(null)
  const epoch = useRef(0)
  function checkSource(value: { source?: ExecutionSource }) {
    if (value.source && (!source || !same(value.source, source))) throw new Error('This macro belongs to another guide version. Open its published guide to continue.')
  }
  function saveConfiguration(value: ExecutionConfiguration) { checkSource(value); setConfiguration(value); setChat(null); replaceWorkflowParams({ execution: value.id, run: undefined }) }
  function saveChat(value: ExecutionChat) {
    if (!value.processBinding) throw new Error('This conversation is not bound to a published guide.')
    checkSource(value.processBinding); setChat(value); replaceWorkflowParams({ execution: value.processBinding.executionId, run: value.id, runRequest: undefined, runPlan: undefined })
  }
  useEffect(() => {
    const sequence = ++epoch.current, params = workflowParams(), execution = params.get('execution'), run = params.get('run')
    let canceled = false
    // This state follows the selected server publication, including browser navigation.
    setConfiguration(null); setDiscovery(null); setChat(null); setError(''); setNotice(''); setBusy(false); setActive(!!execution); pending.current = null
    if (!sourceKey || !execution) return () => { canceled = true; epoch.current = sequence + 1 }
    setBusy(true)
    void request<{ configuration: ExecutionConfiguration }>({ action: 'read_process_configuration', executionId: execution }).then(async result => {
      if (canceled || sequence !== epoch.current) return
      const bound = JSON.parse(sourceKey) as ExecutionSource
      if (result.configuration.source && !same(result.configuration.source, bound)) throw new Error('This macro belongs to another guide version.')
      setConfiguration(result.configuration)
      if (run && result.configuration.available && result.configuration.enabled) {
        const saved = await request<ExecutionChat>(null, run)
        if (!saved.processBinding || !same(saved.processBinding.source, bound) || saved.processBinding.executionId !== execution) throw new Error('This run belongs to another process.')
        if (!canceled && sequence === epoch.current) setChat(saved)
      }
    }).catch(failure => { if (!canceled) { setChat(null); setError(failure instanceof Error ? failure.message : 'Could not restore the macro.') } }).finally(() => { if (!canceled) setBusy(false) })
    return () => { canceled = true; epoch.current = sequence + 1 }
  }, [sourceKey, request])

  async function send(text: string) {
    if (busy || !source) return false
    if (/^back to (?:the )?guide[.!]?$/i.test(text)) { setActive(false); setChat(null); setConfiguration(null); setDiscovery(null); setError(''); setNotice(''); pending.current = null; replaceWorkflowParams({ execution: undefined, run: undefined, runRequest: undefined, runPlan: undefined }); return true }
    setActive(true); setBusy(true); setError(''); const sequence = epoch.current
    try {
      if (connect.test(text)) { if (!request.connect) throw new Error('No agent sign-in connection is configured in this environment.'); await request.connect(); setNotice('Agent sign-in completed. Type “Show macros” to check access to this guide.'); return true }
      let job = pending.current
      if (job?.message && job.message !== text) throw new Error('The previous request may have saved. Retry its original message, reload this page, or return to the guide before sending another request.')
      if (!job && initiation.test(text) && !chat) {
        const found = await request<ExecutionDiscovery>({ action: 'discover_process', source }); if (sequence !== epoch.current) return false; checkSource(found); setDiscovery(found)
        const current = found.configurations.filter(c => c.available)
        if (current.length === 1) { const result = await request<{ configuration: ExecutionConfiguration }>({ action: 'read_process_configuration', executionId: current[0]!.id }); if (sequence !== epoch.current) return false; saveConfiguration(result.configuration); setNotice('Saved mapping loaded. Review its steps below.') }
        else setNotice(found.macros.length ? 'Choose a proposed macro by typing “Use macro 1”. Existing configurations are listed below.' : 'This published guide has no proposed macros. Add one to its working guide and complete review and publication.')
        return true
      }
      const choose = /^use macro (\d+)[.!]?$/i.exec(text), open = /^open configuration (\d+)[.!]?$/i.exec(text)
      if (!job && open) {
        const item = discovery?.configurations[Number(open[1]) - 1]; if (!item) throw new Error('Show macros first, then choose a listed configuration.')
        const result = await request<{ configuration: ExecutionConfiguration }>({ action: 'read_process_configuration', executionId: item.id }); if (sequence !== epoch.current) return false; saveConfiguration(result.configuration); return true
      }
      if (!job && choose) {
        const macro = discovery?.macros[Number(choose[1]) - 1]; if (!macro || !discovery) throw new Error('Show macros first, then choose a listed macro.')
        const handoff = macro.request.steps.findIndex(step => /handoff|draft/i.test(step.instruction))
        if (handoff < 0) throw new Error('This capability prepares referral drafts. This macro has no identifiable draft step; revise its working guide before mapping it.')
        const requestId = crypto.randomUUID()
        job = { kind: 'configuration', command: { action: 'propose_process', requestId, executionId: null, expectedRevision: 0,
          source: { ...source, sourceBindingId: discovery.sourceBindingId, macroId: macro.id }, stepBindings: macro.request.steps.map((_, i) => ({ stepIndex: i, stage: i === handoff ? 'assessor-handoff' : 'human' })) } }
        replaceWorkflowParams({ execution: requestId, run: undefined })
      }
      const mapping = /^map step (\d+) to (human|quality|clarification|handoff)[.!]?$/i.exec(text)
      if (!job && mapping && configuration?.available && configuration.stepBindings) {
        const found = await request<ExecutionDiscovery>({ action: 'discover_process', source }); if (sequence !== epoch.current) return false; checkSource(found)
        const current = await request<{ configuration: ExecutionConfiguration & { source: ExecutionSource & { macroId: string } } }>({ action: 'read_process_configuration', executionId: configuration.id })
        if (sequence !== epoch.current) return false
        if (current.configuration.revision !== configuration.revision) throw new Error('The mapping changed. Show macros to review it again.')
        const index = Number(mapping[1]) - 1, stages: Record<string, StepBinding['stage']> = { human: 'human', quality: 'assessment-answer-quality', clarification: 'assessor-clarification', handoff: 'assessor-handoff' }
        if (!configuration.stepBindings.some(s => s.stepIndex === index)) throw new Error('Choose a step shown in this mapping.')
        job = { kind: 'configuration', command: { action: 'propose_process', requestId: crypto.randomUUID(), executionId: configuration.id, expectedRevision: configuration.revision,
          source: { ...source, sourceBindingId: found.sourceBindingId, macroId: current.configuration.source.macroId }, stepBindings: configuration.stepBindings.map(s => s.stepIndex === index ? { ...s, stage: stages[mapping[2]!.toLowerCase()] } : s) } }
      }
      if (!job && /^(approve|reject) mapping[.!]?$/i.test(text)) {
        if (!configuration?.available || configuration.status !== 'pending') throw new Error('Load a pending mapping and review its steps first.')
        job = { kind: 'configuration', command: { action: 'review_process', requestId: crypto.randomUUID(), executionId: configuration.id, expectedRevision: configuration.revision, proposalHash: configuration.proposalHash, decision: /^approve/i.test(text) ? 'approve' : 'reject', activate: false } }
      }
      if (!job && /^(enable|pause) macro[.!]?$/i.test(text)) {
        if (!configuration || configuration.status !== 'approved') throw new Error('Approve the exact mapping before enabling it.')
        job = { kind: 'configuration', command: { action: 'set_process_enabled', requestId: crypto.randomUUID(), executionId: configuration.id, expectedRevision: configuration.revision, proposalHash: configuration.proposalHash, enabled: /^enable/i.test(text) } }
      }
      if (!job && /^(start macro|continue)[.!]?$/i.test(text) && !chat) {
        if (!configuration?.available || !configuration.enabled) throw new Error('Review and enable this mapping before starting a fictional run.')
        const saved = workflowParams(), requestId = saved.get('runRequest') ?? crypto.randomUUID(), priorPlan = saved.get('runPlan')
        const result = await request<{ planHash: string }>({ action: 'preview_process', executionId: configuration.id })
        if (sequence !== epoch.current) return false
        if (priorPlan && result.planHash !== priorPlan) throw new Error('The plan changed after your earlier start request. Review the configuration before starting again.')
        replaceWorkflowParams({ runRequest: requestId, runPlan: result.planHash })
        job = { kind: 'chat', command: { action: 'create_from_process', executionId: configuration.id, expectedPlanHash: result.planHash, requestId } }
      }
      if (!job && chat) {
        const decision = /^(accept|reject) this draft[.!]?$/i.exec(text)
        if (decision) {
          const turn = [...chat.turns].reverse().find(t => t.draftReview?.decision === null)
          if (!turn?.draftReview) throw new Error('There is no pending draft to review.')
          job = { kind: 'chat', command: { action: 'review_draft', requestId: crypto.randomUUID(), conversationId: chat.id, turnId: turn.id, expectedArtifactRevision: turn.draftReview.artifactRevision, decision: decision[1]!.toLowerCase() } }
        } else job = { kind: 'chat', command: { action: 'send', requestId: crypto.randomUUID(), conversationId: chat.id, expectedVersion: chat.version, text } }
      }
      if (!job) throw new Error('Show macros, choose a macro, or type “Back to guide” to ask about the guidance.')
      job.message = text; pending.current = job
      if (job.kind === 'configuration') {
        const result = await request<{ configuration: ExecutionConfiguration }>(job.command)
        if (sequence !== epoch.current) return false
        saveConfiguration(result.configuration); setNotice(result.configuration.status === 'pending' ? 'Mapping saved for review. No run has started.' : result.configuration.enabled ? 'Enabled for fictional draft runs.' : 'Saved. This mapping is not enabled.')
      } else {
        const result = await request<ExecutionChat>(job.command)
        if (sequence !== epoch.current) return false
        saveChat(result); setNotice(job.command.action === 'create_from_process' ? 'Fictional run ready. Describe the draft you want to prepare.' : '')
      }
      pending.current = null; return true
    } catch (failure) { setChat(null); setError(failure instanceof Error ? failure.message : 'Could not complete this request.'); return false }
    finally { setBusy(false) }
  }
  async function cancel() {
    const command = pending.current?.command
    if (command?.action !== 'send') return
    try { await request({ action: 'cancel', conversationId: command.conversationId, turnId: command.requestId }); setNotice('Stop requested. Waiting for the saved run state.') }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not stop this run.') }
  }
  return { configuration, discovery, chat, active, busy, error, notice, send, cancel, canCancel: busy && pending.current?.command.action === 'send', recognizes: (text: string) => active || initiation.test(text) || connect.test(text) }
}
