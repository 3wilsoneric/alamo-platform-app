'use client'

import { useEffect, useRef, useState } from 'react'
import { processClient, parseProcessQuestion } from '@/lib/process-client'
import type { ProcessCommand, ProcessHistoryTurn, ProcessQuestion, ProcessEvidence, InspectedSource } from '@/lib/process-types'
import type { LearningDetail, LearningMaterial, LearningWorkspace as LearningState } from '@/lib/learning-types'
import { practiceObservation } from '@/lib/practice-input'
import { workflowHref, workflowParams, replaceWorkflowParams } from '@/lib/workflow-navigation'
import PracticePanel from '@/components/processes/PracticePanel'
import { processStatus } from '@/components/processes/ProcessDirectory'
import ProcessAnswerView from '@/components/processes/ProcessAnswerView'
import SourceInspector from '@/components/processes/SourceInspector'
import ChangeImpact from '@/components/processes/ChangeImpact'
import SourceAttachments from '@/components/documents/SourceAttachments'
import GuideContent from '@/components/documents/GuideContent'
import { usePublishedExecution } from './usePublishedExecution'
import PublishedExecution from './PublishedExecution'
import '../processes/process-workspace.css'
import './learning-workspace.css'

const label = (value: string) => value.replaceAll('_', ' ')
export default function LearningWorkspace() {
  const [state, setState] = useState<LearningState | null>(null), [detail, setDetail] = useState<LearningDetail | null>(null)
  const [role, setRole] = useState(() => workflowParams().get('role') ?? ''), [selected, setSelected] = useState(() => workflowParams().get('publication') ?? '')
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [workspaceBusy, setBusy] = useState(false), [attemptId, setAttemptId] = useState('')
  const [answers, setAnswers] = useState<ProcessHistoryTurn[]>([])
  const [hasEarlier, setHasEarlier] = useState(false)
  const [showImpact, setShowImpact] = useState(false)
  const [source, setSource] = useState<InspectedSource | null>(null)
  const pending = useRef<{ message: string; publication: string; command: ProcessCommand } | null>(null)
  const pendingQuestion = useRef<ProcessQuestion | null>(null)
  const current = state?.materials.find(item => item.id === selected)
  const displayed = detail && current?.fingerprint === detail.fingerprint ? detail : null
  const execution = usePublishedExecution(displayed ? { documentId: displayed.documentId, publicationId: displayed.id, fingerprint: displayed.fingerprint } : null)
  const busy = workspaceBusy || execution.busy
  const materials = state?.materials.filter(item => item.status !== 'superseded' && (!role || item.roles.some(link => link.id === role))) ?? []
  const references = state?.references.filter(item => !role || item.roleIds.includes(role)) ?? []
  const acknowledgements = state?.acknowledgements.filter(item => !selected || item.documentId === current?.documentId) ?? []
  const attempts = state?.attempts.filter(item => item.publicationId === selected) ?? []
  const attempt = attempts.find(item => item.id === attemptId) ?? attempts.at(-1)
  const acknowledged = state?.acknowledgements.find(item => item.publicationId === selected && item.sourceFingerprint === displayed?.fingerprint)
  const materialId = current?.id, materialFingerprint = current?.fingerprint

  async function exportDefinition() {
    if (!displayed) return
    const value = await processClient.snapshot(`publication:${displayed.id}`, displayed.fingerprint)
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `proforma-publication-${displayed.id}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Exported this published version. Macro requests remain proposals.'); setMessage('')
  }
  async function refresh() {
    try { const value = await processClient.learning(); setState(value); if (selected) { const history = await processClient.history(`publication:${selected}`); setAnswers(history.turns); setHasEarlier(history.hasEarlier) }; setError(''); return value }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load learning records.'); return null }
  }
  useEffect(() => { let active = true; processClient.learning().then(value => { if (active) setState(value) }).catch(failure => { if (active) setError(failure.message) }); return () => { active = false } }, [])
  useEffect(() => {
    let active = true
    if (!materialId || !materialFingerprint) return
    Promise.all([processClient.material(materialId, materialFingerprint), processClient.history(`publication:${materialId}`)]).then(([value, history]) => { if (active) { setDetail(value); setAnswers(history.turns); setHasEarlier(history.hasEarlier) } }).catch(failure => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [materialId, materialFingerprint])
  useEffect(() => {
    if (!message) return
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', leave)
    return () => window.removeEventListener('beforeunload', leave)
  }, [message])
  async function reload() {
    setBusy(true)
    try {
      const value = await processClient.learning(), item = value.materials.find(item => item.id === selected)
      const guide = item ? await processClient.material(item.id, item.fingerprint) : null
      const history = item ? await processClient.history(`publication:${item.id}`) : null
      setState(value); setDetail(guide); setAnswers(history?.turns ?? []); setHasEarlier(history?.hasEarlier ?? false); setSource(null); setError(''); pending.current = null
      if (pendingQuestion.current && history?.turns.some(turn => turn.id === `question:${pendingQuestion.current!.turnId}`)) setMessage('')
      pendingQuestion.current = null
      return true
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload saved state.'); return false }
    finally { setBusy(false) }
  }
  function choose(material: LearningMaterial) {
    if (busy || message || pending.current) return
    setSelected(material.id); setDetail(null); setAttemptId(''); setNotice(''); setError(''); setAnswers([]); setSource(null); setShowImpact(false)
    replaceWorkflowParams({ publication: material.id, execution: undefined, run: undefined, runRequest: undefined, runPlan: undefined })
  }
  async function inspect(selection: ProcessEvidence, quote?: string) {
    if (busy) return
    setBusy(true); setSource(null)
    try { setSource({ ...await processClient.evidence(selection.citation), selection, ...(quote ? { quote } : {}) }) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load the cited source.') }
    finally { setBusy(false) }
  }
  async function savedAnswer(request: ProcessQuestion) {
    pendingQuestion.current = request
    await processClient.askSaved(request)
    const refreshed = await refresh()
    if (!refreshed) throw new Error('The answer may be saved. Reload saved state to recover it.')
    pendingQuestion.current = null; setMessage(''); setNotice('')
  }
  async function earlierMessages() {
    setBusy(true)
    try { const history = await processClient.history(`publication:${selected}`, answers[0]?.id); setAnswers(value => [...history.turns, ...value]); setHasEarlier(history.hasEarlier) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load earlier messages.') }
    finally { setBusy(false) }
  }
  async function send(event: React.FormEvent) {
    event.preventDefault()
    if (!state || !displayed || busy || !message.trim()) return
    const text = message.trim(); setBusy(true); setError('')
    try {
      if (execution.recognizes(text)) { if (await execution.send(text)) setMessage(''); return }
      if (pendingQuestion.current) { await savedAnswer(pendingQuestion.current); return }
      let command: ProcessCommand, reply: string
      const envelope = { id: crypto.randomUUID(), expectedRevision: state.revision, conversation: { message: text, processId: `publication:${displayed.id}` } }
      if (pending.current?.message === text && pending.current.publication === selected) {
        command = pending.current.command; reply = 'Saved action recovered.'
      } else if (/^(?:check|show) changes[.!]?$/i.test(text)) {
        setShowImpact(true)
        if (!state.permissions.includes('contribute')) { if (!await reload()) throw new Error('Could not refresh change impact. Your message is retained.'); setNotice('Current change impact shown. No action was recorded.'); setMessage(''); return }
        command = { ...envelope, action: 'reconcile' }; reply = 'Change impact is shown with the source paths and your earlier learning.'
      } else if (/^feedback\s*:/i.test(text)) {
        command = { ...envelope, action: 'feedback', processId: `publication:${displayed.id}`, sourceFingerprint: displayed.fingerprint, note: text.replace(/^feedback\s*:/i, '').trim() }
        reply = 'Feedback saved against this exact published version for process review.'
      } else if (/^i have read this version\.?$/i.test(text)) {
        command = { ...envelope, action: 'acknowledge', publicationId: displayed.id, sourceFingerprint: displayed.fingerprint, statement: 'I have read this version.' }
        reply = 'Your acknowledgement is saved for this published version.'
      } else if (/^export(?: published (?:guide|definition))?[.!]?$/i.test(text)) {
        await exportDefinition(); return
      } else if (/^start practice[.!]?$/i.test(text)) {
        command = { ...envelope, action: 'start_publication_practice', publicationId: displayed.id, sourceFingerprint: displayed.fingerprint }
        reply = 'Practice started. Describe each observation with “Observed: …”.'
      } else if (/^observed\s*:/i.test(text)) {
        command = { ...envelope, ...practiceObservation(text, attempt) }; reply = 'Practice observation saved.'
      } else {
        const query = parseProcessQuestion(text)
        const plan = state.conversationAvailable && query.question === text ? await processClient.plan({ message: text, expectedRevision: state.revision, sourceStateFingerprint: state.sourceStateFingerprint,
          processId: `publication:${displayed.id}`, sourceFingerprint: displayed.fingerprint, attemptId: displayed.status === 'current' && attempt?.status === 'active' ? attempt.id : undefined, history: answers.slice(-6).map(item => item.question.slice(0, 2500)) }) : { kind: 'ask' as const }
        if (plan.kind === 'ask') {
          await savedAnswer({ ...query, processId: `publication:${displayed.id}`, sourceFingerprint: displayed.fingerprint, history: answers.filter(item => item.answer).slice(-6).map(item => item.answer!.question), turnId: envelope.id, message: text })
          return
        }
        if (plan.kind === 'export') { await exportDefinition(); return }
        if (plan.kind === 'changes') { if (!await reload()) throw new Error('Could not refresh change impact. Your message is retained.'); setShowImpact(true); setNotice('Current change impact shown. No action was recorded.'); setMessage(''); return }
        if (plan.kind === 'clarify') { setNotice(plan.message); setMessage(''); return }
        if (plan.kind !== 'command') throw new Error('Open the process workspace to continue that request.')
        command = { ...plan.command, id: envelope.id, conversation: envelope.conversation }
        reply = command.action === 'observe_step' ? 'Practice observation saved.' : command.action === 'reconcile' ? 'Change impact is shown below.' : command.action === 'feedback' ? 'Feedback saved against this published version for process review.' : 'Practice started.'
      }
      if (pending.current?.message === text && pending.current.publication === selected) command = pending.current.command
      pending.current = { message: text, publication: selected, command }
      const result = await processClient.command(command)
      if (command.action === 'reconcile') setShowImpact(true)
      setNotice(reply)
      if (command.action === 'start_publication_practice') setAttemptId(result.receipt.resultId ?? '')
      if (!await refresh()) throw new Error('The action may be saved. Reload saved state to recover it.')
      pending.current = null; setMessage('')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save. Your message is retained.') }
    finally { setBusy(false) }
  }
  const locked = busy || !!message || !!pending.current || !!pendingQuestion.current
  const publishedGuide = displayed && <article className="learning-body" aria-label="Published guidance"><GuideContent body={displayed.content.body} sop={displayed.content.sop} capture={displayed.capture?.bundle} /><SourceAttachments attachments={displayed.attachments ?? []} /></article>
  return <div className="learning-workspace">
    {error && <div role="alert" className="learning-error">{error}<button disabled={busy} onClick={() => void reload()}>Reload saved state</button></div>}
    {!state ? <p role="status">{error ? 'Learning records are unavailable.' : 'Loading guidance…'}</p> : <>
      <div className="learning-filter"><label>Role<select aria-label="Learning role" value={role} disabled={locked} onChange={event => { setRole(event.target.value); setSelected(''); setDetail(null); setAnswers([]); setSource(null); replaceWorkflowParams({ role: event.target.value || undefined, publication: undefined }) }}><option value="">All roles</option>{state.roles.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><small>Filters guidance; does not assign a role.</small></div>
      <div className="learning-layout" data-has-materials={materials.length > 0}>
        <aside aria-label="Learning material"><h2>Published guides</h2>{materials.map(material => <button key={material.id} disabled={locked} aria-current={material.id === selected ? 'true' : undefined} onClick={() => choose(material)}><strong>{material.title}</strong><span>Content revision {material.contentRevision} · {label(material.status)}</span></button>)}{!materials.length && <p>No published guides{role ? ' linked to this role' : ''}.</p>}
          <details className="learning-references" open={!materials.length}><summary>Reference processes ({references.length})</summary>{references.map(item => <a key={item.id} href={workflowHref('processes', { process: item.id })}>{item.title}<span>{processStatus(item.status)}</span></a>)}</details>
        <a className="learning-samples" href={workflowHref('training', { sample: 'lessons' })}>Sample lessons</a></aside>
        <main aria-label="Learning reader">
          {selected && !current ? <p>The selected publication is unavailable in this workspace.</p> : !selected ? <div className="learning-start"><h2>{materials.length ? 'Choose a published guide' : 'Guidance starts with review'}</h2><p>{materials.length ? 'Read the current version, ask questions, and rehearse its steps.' : 'Reference workflows are available below. Documents appear as published guidance after review and publication.'}</p>{!materials.length && <a href={workflowHref('drafts', { status: 'in_review' })}>Open document review →</a>}</div> : !displayed ? <p role="status">Loading the selected publication…</p> : <>
            <div className="learning-version"><span>{label(displayed.status)}</span><span>Content revision {displayed.contentRevision}</span><span>Published {new Date(displayed.publishedAt).toLocaleDateString()}</span></div>
            <h2>{displayed.title}</h2>
            {displayed.status !== 'current' && <p role="status" className="learning-status">{displayed.reason || 'This version has been replaced.'} Reading history is retained; new acknowledgements and practice require current guidance.</p>}
            <details className="learning-impact" open={showImpact || displayed.status !== 'current'}><summary>Changes & earlier learning</summary><ChangeImpact report={state.changeImpact} processId={`draft:${displayed.documentId}`} focus /></details>
            {displayed.roles.length > 0 && <p className="learning-roles">{displayed.roles.map(item => <a key={item.id} href={workflowHref('knowledge', { entity: item.id, type: 'role' })}>{item.title} · {label(item.sourceStatus)}</a>)}</p>}
            {execution.active ? <details className="execution-guide"><summary>Read published steps</summary>{publishedGuide}</details> : publishedGuide}
            {!execution.active && <p className="learning-ack-status">{acknowledged ? `Acknowledged by ${acknowledged.actor.name} on ${new Date(acknowledged.at).toLocaleString()}.` : 'This version has not been acknowledged by you.'}</p>}
            {!execution.active && attempt && <PracticePanel attempts={attempts} attempt={attempt} onChoose={setAttemptId} />}
            {!execution.active && notice && <p role="status">{notice}</p>}
            <PublishedExecution execution={execution} />
            {!execution.active && !!answers.length && <div className="pw-turns learning-answers" aria-live="polite">{hasEarlier && <button type="button" className="pw-earlier" disabled={busy} onClick={() => void earlierMessages()}>Earlier messages</button>}{answers.map(turn => <article key={turn.id}><time dateTime={turn.at}>{new Date(turn.at).toLocaleString()}</time><p className="pw-question">{turn.question}</p>{turn.answer ? <ProcessAnswerView answer={turn.answer} stale={turn.answer.sourceStateFingerprint !== state.sourceStateFingerprint} inspect={(selection, quote) => void inspect(selection, quote)} /> : <p>{turn.message}</p>}</article>)}</div>}
            {source && <SourceInspector source={source} onClose={() => setSource(null)} />}
            <form onSubmit={send}><label htmlFor="learning-message">Message</label><textarea id="learning-message" aria-label="Message about this guide" value={message} maxLength={2500} rows={3} disabled={busy || !!pendingQuestion.current} onChange={event => setMessage(event.target.value)} placeholder={execution.active ? 'Continue this macro…' : 'Ask about this guide…'} /><button disabled={busy || !message.trim()}>Send</button><details className="pw-command-help"><summary>Things you can ask</summary><p>“I have read this version” records reading. “Start practice” records a rehearsal. Neither records competence or a credential.</p><p>check changes · feedback: … · export · sources only: … · published only: … · show macros</p></details></form>
            <a className="learning-source" href={workflowHref('drafts', { draft: displayed.documentId })}>Open guide & review history</a>
            <a className="learning-source" href={workflowHref('processes', { process: `draft:${displayed.documentId}`, review: 'changes' })}>Open process review queue</a>
          </>}
          {acknowledgements.length > 0 && <details className="learning-history"><summary>My acknowledgement history ({acknowledgements.length})</summary>{acknowledgements.map(record => <div key={record.id}><button disabled={locked} onClick={() => { const item = state.materials.find(item => item.id === record.publicationId); if (item) choose(item) }}>{record.title} · Content revision {record.contentRevision}</button><p>{new Date(record.at).toLocaleString()} · {label(record.freshness)}</p><p>{record.statement}</p></div>)}</details>}
        </main>
      </div>
    </>}
  </div>
}
