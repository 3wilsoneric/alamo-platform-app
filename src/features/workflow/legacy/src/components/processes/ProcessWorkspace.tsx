'use client'
import { runSavedProcessRequest } from '@/lib/process-request-runner'
import CaptureImage from '@/components/documents/CaptureImage'
import ConversationSources, { type ConversationSourceState } from '@/components/documents/ConversationSources'
import type { TeachingStart } from '@/lib/teaching-types'
import type { SourceAttachment } from '@/lib/conversation-types'
import { CONVERSATION_MESSAGE_LIMIT } from '@/lib/conversation-contract.mjs'
import { ArrowUp, ArrowLeft, ArrowRight, MessageSquare, ListChecks } from 'lucide-react'
import ProcessDirectory, { processStatus } from './ProcessDirectory'

import ProcessAnswerView from './ProcessAnswerView'
import SourceInspector from './SourceInspector'
import PracticePanel from './PracticePanel'
import ChangeImpact from './ChangeImpact'
import ReviewProposal from './ReviewProposal'
import { practiceObservation } from '@/lib/practice-input'

import { useEffect, useRef, useState } from 'react'
import { processClient, parseProcessQuestion, processRequestRejected } from '@/lib/process-client'
import { authoringClient } from '@/lib/authoring-client'
import type { DraftDetail } from '@/lib/authoring-types'
import type { ConversationTurn, ConversationInput } from '@/lib/conversation-types'
import { workflowHref, workflowParams, replaceWorkflowParams } from '@/lib/workflow-navigation'
import type { ProcessWorkspace as Workspace, ProcessAnswer, ProcessCommand, ProcessRecord, ProcessEvidence, InspectedSource, ProcessQuestion } from '@/lib/process-types'
import './process-workspace.css'
import FlowSummary from '@/components/documents/FlowSummary'
import SourceContext from './SourceContext'
import { useSourceSelection } from './useSourceSelection'
import { discussionAttachment, discussionAlreadyRetained, discussionTeachingSession } from '@/components/documents/discussion-sources'

type Turn = { id: string; origin?: true; at?: string; question: string; processFingerprint?: string | undefined; answer?: ProcessAnswer | undefined; message?: string | undefined; guideId?: string; automation?: ConversationTurn['automation']; requestSteps?: import('@/lib/process-types').RequestStepSummary[] }
type PendingGuide = { text: string; id: string; revision: number; turn: ConversationInput; session?: TeachingStart; attachment?: SourceAttachment }
type CommandFields = ProcessCommand extends infer C ? C extends ProcessCommand ? Omit<C, 'id' | 'expectedRevision'> : never : never
const label = (value: string) => value.replaceAll('_', ' ').replaceAll('-', ' ')
export default function ProcessWorkspace({ home = false, onSavedGuide, onBusyChange, onUnsavedChange, onWorkspaceChange }: {
  home?: boolean; onSavedGuide?: (detail: DraftDetail) => void; onWorkspaceChange?: (workspace: Workspace) => void
  onBusyChange?: (busy: boolean) => void; onUnsavedChange?: (dirty: boolean) => void
} = {}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [selected, setSelected] = useState(() => workflowParams().get('process') ?? '')
  const [panel, setPanel] = useState<'process' | 'practice' | 'changes'>(() => workflowParams().get('review') === 'changes' ? 'changes' : 'process')
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [error, setError] = useState('')
  const [source, setSource] = useState<InspectedSource | null>(null)
  const [busy, setBusy] = useState(true)
  const [hasEarlier, setHasEarlier] = useState(false)
  const [sources, setSources] = useState<ConversationSourceState>({ session: null, busy: false, pending: false, incomplete: false })
  const [sourceVersion, setSourceVersion] = useState(0)
  const selection = useSourceSelection(setWorkspace)
  const { accept: acceptSources, reset: resetSources } = selection
  const sourceContext = selection.value?.active ?? undefined
  const [attemptId, setAttemptId] = useState('')
  const [issueId, setIssueId] = useState('')
  const pending = useRef<{ text: string; process: string; command: ProcessCommand } | null>(null)
  const pendingGuide = useRef<PendingGuide | null>(null)
  const pendingRequest = useRef<import('@/lib/process-types').ProcessRequestInput | null>(null)
  const pendingQuestion = useRef<ProcessQuestion | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const showEarlier = useRef(false)
  const leaving = useRef(false)
  const process = workspace?.processes.find(item => item.id === selected)
  const attempts = workspace?.attempts.filter(item => item.processId === selected) ?? []
  const attempt = attempts.find(item => item.id === attemptId) ?? attempts.at(-1)
  const issues = workspace?.issues.filter(item => item.processId === selected) ?? []
  const activeIssue = issues.find(item => item.id === issueId)
  const activeRequest = workspace?.requests?.find(item => item.id === workflowParams().get('request')) ?? workspace?.requests?.find(item => ['running', 'awaiting_review'].includes(item.status) && [item.processId, item.originProcessId, ...(item.targets ?? []).map(target => target.processId)].includes(selected || null))
  useEffect(() => { if (workspace) onWorkspaceChange?.(workspace) }, [workspace, onWorkspaceChange])
  const canContribute = workspace?.permissions.includes('contribute') ?? false
  useEffect(() => { onBusyChange?.(busy || sources.busy || selection.busy) }, [busy, sources.busy, selection.busy, onBusyChange])
  useEffect(() => { onUnsavedChange?.(!!input || sources.pending || busy || sources.busy || selection.busy || !!selection.pending) }, [input, sources.pending, busy, sources.busy, selection.busy, selection.pending, onUnsavedChange])


  async function inspect(selection: ProcessEvidence, quote?: string) {
    if (busy) return
    setSource(null); setBusy(true)
    try { setSource({ ...await processClient.evidence(selection.citation), selection, ...(quote ? { quote } : {}) }) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load the cited source.') }
    finally { setBusy(false) }
  }
  async function refresh() {
    setBusy(true)
    try {
      if (pendingGuide.current) {
        const attempt = pendingGuide.current
        try {
          const result = await authoringClient.get(attempt.id)
          if (result.document.conversation?.turns.some(turn => turn.id === attempt.turn.id)) await finishGuide(result, attempt)
          else pendingGuide.current = null
        } catch (failure) {
          if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'draft_not_found') pendingGuide.current = null
          else throw failure
        }
      }
      const [value, history] = await Promise.all([processClient.workspace(), processClient.history(selected)])
      setWorkspace(value); setTurns(history.turns); setHasEarlier(history.hasEarlier); acceptSources(history.sourceSelection); setError('')
      if (pendingRequest.current && value.requests.some(item => item.id === pendingRequest.current!.id)) pendingRequest.current = null
      if (pendingQuestion.current) {
        if (history.turns.some(turn => turn.id === `question:${pendingQuestion.current!.turnId}`)) { setInput(''); clearAttachedSources(); pendingQuestion.current = null }
        else setError('This message is not in saved history yet. Retry to check the same request.')
      }
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load the process workspace.') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    let active = true
    resetSources()
    Promise.all([processClient.workspace(), processClient.history(selected)]).then(([value, history]) => {
      if (active) { setWorkspace(value); setTurns(history.turns); setHasEarlier(history.hasEarlier); acceptSources(history.sourceSelection) }
    }).catch(failure => { if (active) setError(failure.message) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [selected, resetSources, acceptSources])
  useEffect(() => {
    const log = end.current?.parentElement
    if (turns.length && log) { log.scrollTop = showEarlier.current ? 0 : log.scrollHeight; showEarlier.current = false }
  }, [turns])
  useEffect(() => {
    if (!input && !sources.pending && !sources.busy && !busy && !selection.busy && !selection.pending) return
    const leave = (event: BeforeUnloadEvent) => { if (!leaving.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave)
  }, [input, sources.pending, sources.busy, busy, selection.busy, selection.pending])
  function choose(item: ProcessRecord) {
    if (busy || selection.busy || selection.pending || pendingGuide.current || pendingQuestion.current) return
    if (item.id === selected) return
    const url = new URL(window.location.href)
    url.searchParams.set('process', item.id)
    url.searchParams.delete('request'); url.searchParams.delete('review')
    window.location.assign(url.toString())
  }
  async function finishGuide(result: DraftDetail, attempt: PendingGuide) {
    const turn = result.document.conversation?.turns.find(item => item.id === attempt.turn.id)
    if (!turn) throw new Error('The message has not been saved. Refresh the saved state before retrying.')
    if (home && onSavedGuide) {
      pendingGuide.current = null; setInput(''); setSourceVersion(value => value + 1)
      setSources({ session: null, busy: false, pending: false, incomplete: false })
      leaving.current = true; onSavedGuide(result); return
    }
    const [value, history] = await Promise.all([processClient.workspace(), processClient.history(`draft:${result.document.id}`)])
    setWorkspace(value); setSelected(`draft:${result.document.id}`); setPanel('process'); setTurns(history.turns); setHasEarlier(history.hasEarlier); acceptSources(history.sourceSelection)
    replaceWorkflowParams({ process: `draft:${result.document.id}` })
    pendingGuide.current = null; setInput('')
  }
  async function saveGuide(question: string, draftId?: string, revision = 0) {
    let session = sources.session ?? undefined, attachment = discussionAttachment(session)
    if (!pendingGuide.current && !attachment && sourceContext) {
      attachment = (await processClient.sourceDiscussion(sourceContext.id)).attachment
      if (!draftId) session = await discussionTeachingSession(authoringClient, attachment)
      else if (discussionAlreadyRetained((await authoringClient.get(draftId)).document, attachment)) attachment = undefined
    }
    const attempt = pendingGuide.current ?? { text: question, id: draftId ?? session?.capture?.id ?? crypto.randomUUID(), revision, turn: { id: crypto.randomUUID(), message: question, ...(!draftId && !sources.pending && sourceContext ? { origin: { questionId: sourceContext.id } } : {}) }, ...(!draftId && session ? { session } : draftId && attachment ? { attachment } : {}) }
    pendingGuide.current = attempt
    const result = await authoringClient.mutate(attempt.id, { action: 'converse', expectedRevision: attempt.revision, turn: attempt.turn, ...(attempt.session ? { session: attempt.session } : {}), ...(attempt.attachment ? { attachment: attempt.attachment } : {}) })
    await finishGuide(result, attempt)
  }
  function clearAttachedSources() {
    if (!sources.pending) return
    setSourceVersion(value => value + 1)
    setSources({ session: null, busy: false, pending: false, incomplete: false })
  }
  async function saveQuestion(request: ProcessQuestion) {
    pendingQuestion.current = request
    try { await processClient.askSaved(request) }
    catch (failure) { if (processRequestRejected(failure)) pendingQuestion.current = null; throw failure }
    const [value, history] = await Promise.all([processClient.workspace(), processClient.history(request.processId)])
    setWorkspace(value); setTurns(history.turns); setHasEarlier(history.hasEarlier); acceptSources(history.sourceSelection)
    pendingQuestion.current = null; setInput(''); clearAttachedSources()
  }
  async function earlierMessages() {
    if (busy) return
    const first = turns.find(turn => turn.at)
    if (!first) return
    setBusy(true)
    try { const history = await processClient.history(selected, first.id); showEarlier.current = true; setTurns(value => [...history.turns, ...value]); setHasEarlier(history.hasEarlier) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load earlier messages.') }
    finally { setBusy(false) }
  }
  async function exportProcess(id: string, fingerprint: string) {
    const snapshot = await processClient.snapshot(id, fingerprint)
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `proforma-process-${fingerprint.slice(0, 12)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function runRequest(id: string, stop = false, confirmPlanHash?: string) {
    replaceWorkflowParams({ request: id })
    try {
      const completed = await runSavedProcessRequest(authoringClient, id, stop, confirmPlanHash)
      setInput(''); clearAttachedSources()
      if (home && onSavedGuide && completed?.processId?.startsWith('draft:') && completed.originProcessId === null) {
        const saved = await authoringClient.get(completed.processId.slice(6)); leaving.current = true; onSavedGuide(saved)
      }
    } finally {
      const value = await processClient.workspace()
      const saved = value.requests.find(item => item.id === id)
      const processId = value.processes.some(item => item.id === saved?.processId) ? saved!.processId! : selected
      const history = await processClient.history(processId)
      setWorkspace(value); setSelected(processId); setTurns(history.turns); setHasEarlier(history.hasEarlier); acceptSources(history.sourceSelection)
      replaceWorkflowParams({ process: processId || undefined })
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!input.trim() || busy || sources.busy || sources.incomplete || selection.busy || selection.pending || !workspace) return
    const question = input.trim(), id = crypto.randomUUID()
    setBusy(true); setError('')
    try {
      if (activeRequest && /^(continue|resume|stop remaining steps)[.!]?$/i.test(question)) {
        if (sources.pending) throw new Error('Use or remove the unsent attachment before continuing the saved request. Your source is retained here.')
        await runRequest(activeRequest.id, /^stop/i.test(question), activeRequest.status === 'awaiting_review' && !/^stop/i.test(question) ? activeRequest.planHash : undefined); return
      }
      if (pendingGuide.current) { await saveGuide(question); return }
      if (selection.busy || selection.pending) throw new Error('Finish saving the source choice before sending this message.')
      if (selection.value?.unavailable && !sources.pending) throw new Error('Choose or clear the unavailable source before sending this message.')
      if (pendingQuestion.current) { await saveQuestion(pendingQuestion.current); return }
      if (sources.pending && !sources.session) throw new Error('Finish reviewing the attached source before sending.')
      let command: CommandFields | undefined, message: string | undefined
      const requireProcess = () => { if (!process) throw new Error('Choose a process first so this action has an exact source.'); return process }
      if (pending.current?.text === question && pending.current.process === selected) {
        command = pending.current.command; message = 'Saved action recovered.'
      } else if (/^start practice[.!]?$/i.test(question)) {
        const current = requireProcess(); command = { action: 'start_practice', processId: current.id, sourceFingerprint: current.fingerprint }; setPanel('practice')
        message = 'Practice started from the source version shown. Explain what you observed for each step with “Observed: …”. This records practice, not live work or qualification.'
      } else if (/^observed\s*:/i.test(question)) {
        command = practiceObservation(question, attempt); setPanel('practice'); message = 'Your observation is saved against this step and source version.'
      } else if (/^feedback\s*:/i.test(question)) {
        const current = requireProcess(); command = { action: 'feedback', processId: current.id, sourceFingerprint: current.fingerprint, note: question.replace(/^feedback\s*:/i, '').trim() }; setPanel('changes'); message = 'Your feedback is saved in this process’s review queue with its source version.'
      } else if (/^(?:check|show) changes[.!]?$/i.test(question)) {
        if (canContribute) command = { action: 'reconcile' }
        else setWorkspace(await processClient.workspace())
        setPanel('changes'); message = canContribute ? 'Source dependencies and your earlier learning have been checked. Review shows the affected guides and dependency paths.' : 'Current change impact shown. No action was recorded.'
      } else if (/^(dismiss|reopen|resolve)\s*:/i.test(question)) {
        if (!activeIssue) throw new Error('Select a review item before recording a decision.')
        const decision = question.split(':')[0]!.toLowerCase() as 'dismiss' | 'reopen' | 'resolve'
        command = { action: 'decide_issue', issueId: activeIssue.id, evidenceHash: activeIssue.evidenceHash, decision, note: question.slice(question.indexOf(':') + 1).trim() }; message = 'Your decision and reason are saved with the reviewed evidence.'
      } else if (/^export process[.!]?$/i.test(question)) {
        const current = requireProcess(); await exportProcess(current.id, current.fingerprint)
        message = 'Downloaded the versioned process, evidence and proposed automation requests. Execution bindings remain unresolved; importing this snapshot does not activate an agent.'
      } else {
        const query = parseProcessQuestion(question)
        const requestInput = { message: question, expectedRevision: workspace.revision, sourceStateFingerprint: workspace.sourceStateFingerprint,
          processId: process?.id, sourceFingerprint: process?.fingerprint, attemptId: attempt?.status === 'active' ? attempt.id : undefined, issueId: activeIssue?.id, issueFingerprint: activeIssue?.evidenceHash,
          history: turns.slice(-6).map(turn => turn.question.slice(0, 2500)) }
        if (workspace.conversationAvailable && query.question === question && pendingRequest.current?.input.message !== question) pendingRequest.current = { id, input: requestInput, ...(sources.session ? { context: { attachment: discussionAttachment(sources.session)! } } : sourceContext ? { context: { sourceQuestionId: sourceContext.id } } : {}) }
        if (pendingRequest.current) replaceWorkflowParams({ request: pendingRequest.current.id })
        const plan = workspace.conversationAvailable && query.question === question ? await processClient.request(pendingRequest.current!) : { kind: 'ask' as const }
        if (pendingRequest.current && plan.kind !== 'request') replaceWorkflowParams({ request: undefined })
        pendingRequest.current = null
        if (plan.kind === 'request') { await runRequest(plan.request.id); return }
        if (plan.kind === 'ask') { await saveQuestion({ ...query, ...(sources.session ? { attachment: discussionAttachment(sources.session)! } : sourceContext && query.sourceMode !== 'published' ? { sourceQuestionId: sourceContext.id } : {}), processId: process?.id, sourceFingerprint: process?.fingerprint, history: turns.filter(turn => turn.answer).slice(-6).map(turn => turn.answer!.question), turnId: id, message: question }); return }
        else if (plan.kind === 'clarify') message = plan.message
        else if (plan.kind === 'changes') { setWorkspace(await processClient.workspace()); setPanel('changes'); message = 'Current change impact shown. No action was recorded.' }
        else if (plan.kind === 'command') {
          command = plan.command
          message = command.action === 'feedback' ? 'Feedback saved.' : command.action === 'observe_step' ? 'Practice observation saved.' : command.action === 'reconcile' ? 'Source changes checked.' : command.action === 'decide_issue' ? 'Review decision saved.' : 'Practice started.'
          setPanel(command.action === 'feedback' || command.action === 'reconcile' || command.action === 'decide_issue' ? 'changes' : 'practice')
        } else if (plan.kind === 'export') { await exportProcess(plan.processId, plan.sourceFingerprint); message = 'Process definition downloaded. It does not activate an agent.' }
        else if (plan.kind === 'author') { await saveGuide(question, plan.draftId, plan.revision); return }
        else {
          const target = workspace.processes.find(item => item.id === plan.processId)
          if (!target) throw new Error('That process is no longer available. Refresh the workspace.')
          setSelected(target.id); setPanel('process'); setAttemptId(''); setIssueId(''); setTurns([]); setSource(null); pending.current = null
          replaceWorkflowParams({ process: target.id, review: undefined }); message = `Opened ${target.title}.`
        }
      }
      if (command) {
        if (sources.pending) throw new Error('Ask about the attached source or include it in a guide before this action. Your source and message are retained.')
        const previous = pending.current
        const mutation = previous?.text === question && previous.process === selected ? previous.command : { ...command, id, expectedRevision: workspace.revision, conversation: { message: question, ...(process ? { processId: process.id } : {}) } }
        pending.current = { text: question, process: selected, command: mutation }
        const result = await processClient.command(mutation)
        setWorkspace(result); if (command.action === 'start_practice') setAttemptId(result.receipt.resultId ?? '')
        const history = await processClient.history(selected)
        setTurns(history.turns); setHasEarlier(history.hasEarlier); acceptSources(history.sourceSelection); pending.current = null; setInput(''); return
      }
      setTurns(value => [...value, { id, question, message, processFingerprint: process?.fingerprint }]); setInput('')
    } catch (failure) { if (processRequestRejected(failure)) pendingRequest.current = null; setError(failure instanceof Error ? failure.message : 'Could not complete the request. Your text is retained.') }
    finally { setBusy(false) }
  }
  const showRequestPlan = (activeRequest?.targets?.length ?? 0) > 1 || activeRequest?.status === 'awaiting_review'
  const conversation = workspace && <section className="pw-conversation" id="workflow-discussion" tabIndex={-1} data-reviewing={activeRequest?.status === 'awaiting_review'} aria-label="Process conversation">{!home && <div className="pw-chat-heading"><MessageSquare size={18} aria-hidden="true" /><h3>Discuss this workflow</h3></div>}{!home && !turns.length && <p className="pw-chat-intro">Ask about a step, prepare a change, or record what you noticed. Answers keep their sources.</p>}<div className="pw-turns" aria-live="polite">{hasEarlier && <button type="button" disabled={busy} className="pw-earlier" onClick={() => void earlierMessages()}>Earlier messages</button>}{turns.map(turn => <article key={turn.id}>{turn.at && <time dateTime={turn.at}>{new Date(turn.at).toLocaleString()}</time>}<p className="pw-question">{turn.question}</p>{turn.message && <p>{turn.message}</p>}{turn.requestSteps && <ol className="pw-request-steps" aria-label="Request steps">{turn.requestSteps.map(step => <li key={step.id}>{step.processId ? <a href={workflowHref('processes', { process: step.processId })}>{step.title}</a> : <strong>{step.title}</strong>}<p>{step.message}</p>{step.sourceTitle && <small>Source: {step.sourceTitle}</small>}<small>{step.status === 'ready' ? 'In progress' : label(step.status)}</small></li>)}</ol>}{turn.automation && <div className="pw-macro"><strong>Proposed macro · not executable</strong><p>{turn.automation.name}</p><ol>{turn.automation.steps.map((step, index) => <li key={index}>{step.instruction} · {step.expectedResult}</li>)}</ol></div>}{turn.guideId && <a href={workflowHref('drafts', { draft: turn.guideId })}>Review guide</a>}{turn.answer && <ProcessAnswerView answer={turn.answer} stale={turn.answer.sourceStateFingerprint !== workspace.sourceStateFingerprint || !!turn.processFingerprint && turn.processFingerprint !== process?.fingerprint} inspect={(selection, quote) => void inspect(selection, quote)} />}</article>)}{busy && <p role="status">Loading…</p>}<div ref={end} /></div>{source && <SourceInspector source={source} onClose={() => setSource(null)} />}<form onSubmit={submit}><label htmlFor="pw-message" className={home ? 'sr-only' : undefined}>{home ? 'Message ProForma' : 'Message'}</label><div className={`pw-composer${home ? ' process-composer' : ''}`}>{!sources.pending && <SourceContext control={selection} scope={selected ? { processId: selected } : {}} disabled={busy || !!pendingGuide.current || !!pendingQuestion.current || !!pendingRequest.current} onReload={() => void refresh()} />}<textarea id="pw-message" aria-label={home ? 'Message ProForma' : process ? 'Ask a question or describe what you observed' : 'Ask about a process, role or application'} rows={2} disabled={busy || sources.busy || !!pendingGuide.current || !!pendingQuestion.current || !!pendingRequest.current} value={input} maxLength={CONVERSATION_MESSAGE_LIMIT} onChange={event => setInput(event.target.value)} placeholder={home ? 'Ask about your processes, explain a task, or create a guide…' : process ? 'Who is responsible for the handoff?' : 'What happens when a referral arrives?'} onKeyDown={event => { if (home && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />{home && canContribute && <ConversationSources key={sourceVersion} client={authoringClient} disabled={busy || !!pendingGuide.current || !!pendingQuestion.current || !!pendingRequest.current} onChange={setSources} />}{home ? <div className="process-send-row"><small>Enter to send · Shift + Enter for a new line</small><button type="submit" aria-label="Send →" title="Send" disabled={busy || sources.busy || sources.incomplete || selection.busy || !!selection.pending || !input.trim()}><ArrowUp size={19} aria-hidden="true" /></button></div> : <button type="submit" disabled={busy || selection.busy || !!selection.pending || !input.trim()}>Send</button>}</div><details className="pw-command-help"><summary>Things you can ask</summary>{canContribute && <p>start practice · observed: … · feedback: … · check changes · export process</p>}<p>sources only: … · working draft: … · published only: …</p></details></form></section>
  return <div className={`pw-workspace${home ? ' pw-home' : process ? ' pw-reading' : ' pw-browsing'}`}>
    {!home && <div className="pw-toolbar">{process ? <a href={workflowHref('processes', Object.fromEntries(['find', 'kind', 'owner'].flatMap(key => workflowParams().get(key) ? [[key, workflowParams().get(key)!]] : [])))}><ArrowLeft size={16} aria-hidden="true" /> All workflows</a> : null}<a href={workflowHref('drafts', { action: 'teach' })}>Write a workflow <ArrowRight size={15} aria-hidden="true" /></a></div>}
    {!home && process && <nav className="pw-mobile-tools" aria-label="Workflow and conversation"><a href="#workflow-details">Steps & handoffs</a><a href="#workflow-discussion">Conversation</a></nav>}
    {error && <div role="alert" className="pw-error">{error} <button type="button" disabled={busy} onClick={async () => { await refresh(); pending.current = null }}>Refresh saved state</button></div>}
    {!workspace ? <p role="status">{error ? 'The process workspace is unavailable.' : 'Loading processes and source evidence…'}</p> : <div className="pw-layout">
      {!home && !process && <ProcessDirectory processes={workspace.processes} onChoose={choose} disabled={busy || !!pendingGuide.current || !!pendingQuestion.current || !!pendingRequest.current} />}
      {!home && process && <aside className="pw-outline" aria-label="Workflow outline"><span><ListChecks size={17} aria-hidden="true" /> In this workflow</span><ol>{process.steps.map((step, index) => <li key={step.id}><a href={`#workflow-step-${index + 1}`} onClick={() => setPanel('process')}><small>{String(index + 1).padStart(2, '0')}</small>{step.action}</a></li>)}</ol><a className="pw-outline-source" href={workflowHref('knowledge', { entity: process.source.nodeId })}>Sources & connections <ArrowRight size={14} aria-hidden="true" /></a></aside>}
      <div className="pw-main" data-planning={showRequestPlan}>
        {(home || showRequestPlan) && conversation}
        {(process || panel === 'changes') && <section className="pw-context" id="workflow-details" tabIndex={-1} aria-label="Process context">
          {process ? <><div className="pw-source-line"><span className="pf-status" data-state={process.status}>{processStatus(process.status)}</span><span>{label(process.grounding)}</span><span>{process.revision ? `Revision ${process.revision}` : 'Mapped source'}</span></div><h2>{process.title}</h2>{process.description && <p>{process.description}</p>}<nav className="pw-tabs" aria-label="Process views">{(['process', 'practice', 'changes'] as const).map(view => <button type="button" key={view} aria-current={panel === view ? 'page' : undefined} onClick={() => setPanel(view)}>{view === 'process' ? 'Steps & handoffs' : view === 'practice' ? `Practice (${attempts.length})` : `Review (${issues.filter(item => item.status === 'open').length})`}</button>)}</nav>
            {panel === 'process' && <><dl className="pw-facts"><div><dt>Starts when</dt><dd>{process.trigger || 'Not yet explained'}</dd></div><div><dt>Responsible role</dt><dd>{process.ownerRole || 'Not yet established'}</dd></div><div><dt>Handoff</dt><dd>{process.handoff || 'Not yet explained'}</dd></div></dl>{(process.prerequisites || process.applicability) && <details className="pw-preparation"><summary>Before you start</summary>{process.prerequisites && <p>{process.prerequisites}</p>}{process.applicability && <p>{process.applicability}</p>}</details>}<ol className="pw-flow">{process.steps.map((step, index) => <li key={step.id} id={`workflow-step-${index + 1}`}><span className="pw-step-number">{index + 1}</span><div><h3>{step.action || 'Action needs explanation'}</h3><p>{[step.role, step.system].filter(Boolean).join(' · ') || 'Role and application need review'}</p>{step.expectedResult && <p><b>Expected:</b> {step.expectedResult}</p>}{process.visuals?.[step.id]&&<CaptureImage visual={process.visuals[step.id]!}/>}</div></li>)}</ol>{process.completionCriteria && <div className="pw-outcome"><h3>Complete when</h3><p>{process.completionCriteria}</p></div>}{process.exceptions && <details className="pw-exceptions"><summary>Exceptions & stops</summary><p>{process.exceptions}</p></details>}{process.flowOrigin === 'explicit' && <FlowSummary flow={process.flow} steps={process.steps} />}{!process.steps.length && <p>The source identifies this process but does not contain a step sequence yet.</p>}<details className="pw-evidence"><summary>Connected evidence · {process.connections.length} links</summary>{process.connections.map(link => <a key={link.id} href={workflowHref('knowledge', { entity: link.nodeId, type: link.type })}><strong>{link.title}</strong><span>{label(link.predicate)} · {label(link.status)} · {label(link.freshness)}</span></a>)}<p>Source: {process.source.nodeId} · {process.source.fingerprint.slice(0, 12)} · {process.source.pointer}</p></details><div className="pw-context-actions"><a href={process.source.draftId ? workflowHref('drafts', { draft: process.source.draftId }) : workflowHref('knowledge', { entity: process.id, type: process.kind })}>{process.source.draftId ? 'Edit guide' : 'View source'} →</a></div></>}
            {panel === 'practice' && <PracticePanel attempts={attempts} attempt={attempt} onChoose={setAttemptId} />}
            {panel === 'changes' && <div className="pw-issues"><ChangeImpact report={workspace.changeImpact} processId={selected} focus /><p>Type “check changes” or “feedback: …”.</p>{issues.map(issue => <article key={issue.id} data-selected={issue.id === issueId}><button type="button" onClick={() => setIssueId(issue.id)} aria-pressed={issue.id === issueId}><strong>{issue.title}</strong><span>{label(issue.status)}</span></button><p>{issue.detail}</p>{issue.reportedSource && <p><a href={workflowHref('training', { publication: issue.reportedSource.citation.publicationId! })}>Reported against {issue.reportedSource.title} · published revision {issue.reportedSource.contentRevision}</a> · {label(issue.reportedSource.status)} when reported</p>}{issue.proposal && <ReviewProposal proposal={issue.proposal} issueId={issue.id} freshness={issue.freshness} />}<details><summary>Evidence & decisions</summary><p>{issue.evidenceHash.slice(0, 12)}</p><ul>{issue.history.map((entry, index) => <li key={index}>{label(entry.decision)} · {entry.actor.name}: {entry.note}</li>)}</ul></details></article>)}{!issues.length && <p>No current findings or feedback for this process.</p>}{activeIssue && workspace.permissions.includes('review') && <p>Selected: <b>{activeIssue.title}</b>. Type “dismiss: reason”, “reopen: reason”{['feedback', 'routine_proposal'].includes(activeIssue.kind) ? ' or “resolve: reason”' : '. Correct the source to clear this finding'}.</p>}</div>}
          </> : panel === 'changes' ? <ChangeImpact report={workspace.changeImpact} processId={selected} /> : <p>Select a process or ask a question below.</p>}
        </section>}
        {!home && !showRequestPlan && conversation}
      </div>
    </div>}
  </div>
}
