'use client'
import PracticePanel from '@/components/processes/PracticePanel'
import ChangeImpact from '@/components/processes/ChangeImpact'
import CaptureImage from './CaptureImage'
import GuidePageEditor from './GuidePageEditor'
import { useGuideQuestions } from './useGuideQuestions'
import { discussionAttachment, discussionAlreadyRetained, discussionTeachingSession } from './discussion-sources'
import SourceContext from '@/components/processes/SourceContext'
import ProcessAnswerView from '@/components/processes/ProcessAnswerView'
import SourceInspector from '@/components/processes/SourceInspector'
import { workflowHref } from '@/lib/workflow-navigation'
import { ArrowUp, FilePenLine, PanelRightClose, PanelRightOpen } from 'lucide-react'
import SourceAttachments from './SourceAttachments'
import { conversationAttachments } from '@/lib/attachment-contract.mjs'
import ConversationSources, { type ConversationSourceState } from './ConversationSources'
import type { TeachingStart } from '@/lib/teaching-types'

import OriginalSource from './OriginalSource'
import { useMaintenanceProposal } from './useMaintenanceProposal'

import FlowSummary from './FlowSummary'

import { useEffect, useRef, useState } from 'react'
import type { AuthoringClient, DraftDetail } from '@/lib/authoring-types'
import { CONVERSATION_MESSAGE_LIMIT, validateConversationInput } from '@/lib/conversation-contract.mjs'
import type { ConversationInput, ConversationTurn, SourceAttachment } from '@/lib/conversation-types'
import DraftKnowledgeLinks from '@/components/knowledge/DraftKnowledgeLinks'
import { useHandoffConversation, handoffRehearsalAvailable } from './useHandoffConversation'
import './process-conversation.css'

export default function ProcessConversation({ detail, client, onSaved, onBusyChange, onUnsavedChange, onEdit, readOnly = false, permissions = [] }: {
  detail?: DraftDetail; client: AuthoringClient; onSaved: (detail: DraftDetail) => void
  onBusyChange: (value: boolean) => void; onUnsavedChange: (value: boolean) => void
  onEdit?: () => void; readOnly?: boolean; permissions?: string[]
}) {
  const [recovered, setRecovered] = useState<DraftDetail | null>(null)
  const doc = (recovered ?? detail)?.document, locked = readOnly || (!!doc && doc.state !== 'draft')
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const maintenanceNotice = useMaintenanceProposal(doc?.id, setMessage)
  const [linksDirty, setLinksDirty] = useState(false)
  const [editing, setEditing] = useState(false), [editorDirty, setEditorDirty] = useState(false), [editorBusy, setEditorBusy] = useState(false), [chatOpen, setChatOpen] = useState(true)
  const [mobilePane, setMobilePane] = useState<'guide' | 'chat'>('chat')
  const [sources, setSources] = useState<ConversationSourceState>({ session: null, busy: false, pending: false, incomplete: false })
  const [attachmentVersion, setAttachmentVersion] = useState(0)
  const [pending, setPending] = useState<{ id: string; revision: number; turn: ConversationInput; session?: TeachingStart; attachment?: SourceAttachment } | null>(null)
  const [rebase, setRebase] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null), transcript = useRef<HTMLDivElement>(null), showEarlier = useRef(false)
  const turns = doc?.conversation?.turns ?? []
  const questions = useGuideQuestions(doc, client)
  const requestPending = !!pending || !!questions.pending
  const timeline = [...turns.map(turn => ({ kind: 'guide' as const, at: turn.at, id: turn.id, turn })),
    ...questions.turns.map(turn => ({ kind: 'question' as const, at: turn.at, id: turn.id, turn }))]
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  const handoff = useHandoffConversation(), working = busy || handoff.busy || sources.busy || editorBusy || questions.busy
  useEffect(() => { onBusyChange(working) }, [working, onBusyChange])
  useEffect(() => { onUnsavedChange(!!message || requestPending || linksDirty || editorDirty || working || !!handoff.pending || sources.pending) }, [message, requestPending, linksDirty, editorDirty, working, handoff.pending, doc, sources.pending, onUnsavedChange])
  useEffect(() => { transcript.current?.scrollTo({ top: showEarlier.current ? 0 : transcript.current.scrollHeight, behavior: 'instant' }); showEarlier.current = false }, [turns.length, questions.turns.length, handoff.chat?.version])
  useEffect(() => {
    const element = transcript.current
    if (!element) return
    const observer = new ResizeObserver(() => { element.scrollTop = element.scrollHeight })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  async function reloadConversation() {
    if (working) return
    setBusy(true); setError('')
    try {
      const [latest, recoveredQuestion] = await Promise.all([doc ? client.get(doc.id) : null, questions.refresh()])
      if (recoveredQuestion) { setMessage(''); clearAttachedSources() }
      if (latest && doc && latest.document.revision !== doc.revision) {
        if (!recoveredQuestion && message) { setRecovered(latest); setRebase(true); setError('The current guide is loaded. Review it before sending your retained message again.') }
        else { setRecovered(null); onSaved(latest) }
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not reload the guide and conversation.') }
    finally { setBusy(false) }
  }
  function clearAttachedSources() {
    if (!sources.pending) return
    setAttachmentVersion(value => value + 1)
    setSources({ session: null, busy: false, pending: false, incomplete: false })
  }
  async function send(recover = false) {
    if (working || (locked && !doc) || linksDirty || editing || sources.incomplete || (!requestPending && !handoff.pending && !message.trim()) || rebase) return
    if (!recover && !requestPending && !sources.pending && !locked && handoff.recognizes(message)) {
      if (await handoff.send(message)) setMessage('')
      return
    }
    setBusy(true); setError('')
    try {
      const routed = !pending ? await questions.route(message.trim(), discussionAttachment(sources.session)) : 'author'
      if (routed !== 'author') {
        setMessage(''); clearAttachedSources()
        if (typeof routed === 'object') onSaved(await client.get(routed.guideId))
        else if (doc) { const latest = await client.get(doc.id); if (latest.document.revision !== doc.revision) onSaved(latest) }
        requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); return
      }
      if (locked) throw new Error('This guide is read only. Questions are available; return it to draft with contribution access before editing.')
      let attachment = discussionAttachment(sources.session), session = sources.session ?? undefined
      if (!pending && !attachment) {
        attachment = await questions.retainedAttachment()
        if (!doc && attachment) session = await discussionTeachingSession(client, attachment)
      }
      if (attachment && discussionAlreadyRetained(doc, attachment)) attachment = undefined
      const origin = !doc ? questions.origin() : undefined
      const attempt: NonNullable<typeof pending> = pending ?? { id: doc?.id ?? session?.capture?.id ?? crypto.randomUUID(), revision: doc?.revision ?? 0, turn: { id: crypto.randomUUID(), message: message.trim(), ...(origin ? { origin } : {}) }, ...(!doc && session ? { session } : doc && attachment ? { attachment } : {}) }
      setPending(attempt)
      validateConversationInput(attempt.turn)
      const result = recover ? await client.get(attempt.id) : await client.mutate(attempt.id, { action: 'converse', expectedRevision: attempt.revision, turn: attempt.turn, ...(attempt.session ? { session: attempt.session } : {}), ...(attempt.attachment ? { attachment:attempt.attachment } : {}) })
      const saved = result.document.conversation?.turns.some(turn => turn.id === attempt.turn.id)
      if (!saved) {
        setPending(null); setRebase(true); setRecovered(result)
        setError(attempt.session ? 'This recording already has a saved guide. Your new attachment was not added. Download a copy to keep it, then review the existing guide before continuing with your message and sources.' : attempt.attachment ? 'The guide changed before this message could be saved. Your attachment and message are still here. Review the latest guide before trying again.' : 'The saved conversation is loaded. Your message was not accepted; review the updated guide before sending it again.')
      } else { setMessage(''); setPending(null); setRecovered(null); setAttachmentVersion(value => value + 1); setSources({ session: null, busy: false, pending: false, incomplete: false }); onSaved(result) }
      requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
    } catch (error) { setError(error instanceof Error ? error.message : 'Your message could not be saved. It is still here to retry.') }
    finally { setBusy(false) }
  }
  function download(value: unknown, filename: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function macro(turn: ConversationTurn) {
    const request = turn.automation
    if (!request) return null
    return <article className="process-macro" aria-label="Proposed macro">
      <div className="process-overline">Macro request · not executable</div><h4>{request.name}</h4><p>{request.intent}</p>
      {!!request.inputs.length && <p><strong>Inputs:</strong> {request.inputs.join(' · ')}</p>}
      <ol>{request.steps.map((step, index) => <li key={index}>{step.instruction}{step.system && <small>{step.system}</small>}{step.expectedResult && <small>Check: {step.expectedResult}</small>}</li>)}</ol>
      {!!request.stopConditions.length && <p><strong>Stop when:</strong> {request.stopConditions.join('; ')}</p>}
      <p className="process-muted">Saved as a proposed request. {handoffRehearsalAvailable ? 'For the supported handoff rehearsal, type “Try fictional handoff”. Real referrals are not connected here.' : 'An authorized AlamoAgent connection is required before this request can run.'}</p>
      <button onClick={() => download({ schemaVersion: 1, kind: 'proforma.automation-request', status: 'proposed', source: { documentId: doc?.id, revision: turn.baseRevision + 1, turnId: turn.id }, request }, 'proforma-macro-request.json')}>Export request for AlamoAgent</button>
    </article>
  }
  return <section className="process-conversation" data-has-guide={!!doc} data-chat-open={chatOpen || !doc} data-mobile-pane={editing ? 'guide' : mobilePane} aria-label="ProForma conversation">
    <header className="process-heading"><div><h2 className="sr-only">{doc?.content.title ?? 'New guide'}</h2><p>{doc ? `${doc.state === 'draft' ? 'Draft' : doc.state.replaceAll('_', ' ')} · Revision ${doc.revision}` : ''}</p></div>
      <div className="process-heading-actions">
      {doc && !locked && <button type="button" aria-label="Edit guide in place" disabled={editing || rebase || working || !!message || requestPending || !!handoff.pending || linksDirty || sources.pending} onClick={() => setEditing(true)}><FilePenLine size={16} aria-hidden="true" /> Edit</button>}
      {onEdit && <button aria-label="Open guide editor & review" disabled={editing || rebase || working || !!message || requestPending || !!handoff.pending || linksDirty || sources.pending} onClick={onEdit}>Review</button>}
      {doc && <button type="button" className="process-desktop-chat-toggle" aria-label={chatOpen ? 'Hide conversation' : 'Show conversation'} aria-expanded={chatOpen} onClick={() => setChatOpen(value => !value)}>{chatOpen ? <PanelRightClose size={17} aria-hidden="true" /> : <PanelRightOpen size={17} aria-hidden="true" />}<span>Chat</span></button>}
      </div>
      {doc && <div className="process-mobile-panes" role="group" aria-label="Guide and conversation">
        <button type="button" aria-pressed={editing || mobilePane === 'guide'} onClick={() => setMobilePane('guide')}>Guide</button>
        <button type="button" aria-pressed={!editing && mobilePane === 'chat'} disabled={editing} onClick={() => { setChatOpen(true); setMobilePane('chat') }}>Chat</button>
        {editing && <small>Save or discard edits to chat.</small>}
      </div>}
    </header>
    <div className="process-conversation-layout">
      <div className="process-chat" hidden={!!doc && !chatOpen}>
        <div className="process-transcript" ref={transcript} role="log" aria-label="Process conversation" aria-live="polite">
          {questions.hasEarlier && <button type="button" disabled={working} onClick={() => { showEarlier.current = true; void questions.earlier() }}>Earlier messages</button>}
          {doc?.teaching?.answers.map(answer => <div className="process-previous" key={answer.id}><small>Earlier explanation · {answer.actor.name}</small><p>{answer.question}</p><blockquote>{answer.value}</blockquote></div>)}
          {timeline.map(item => { if (item.kind === 'question') { const turn = item.turn; return <div key={turn.id} className="process-turn">
            {turn.question && <div className="process-message process-message-user"><span className="process-speaker">You</span><p>{turn.question}</p></div>}
            <div className="process-message process-message-assistant"><span className="process-speaker">ProForma</span>
              {turn.requestSteps && <ol className="pw-request-steps" aria-label="Request steps">{turn.requestSteps.map(step => <li key={step.id}><strong>{step.title}</strong><p>{step.message}</p>{step.sourceTitle && <small>Source: {step.sourceTitle}</small>}<small>{step.status}</small></li>)}</ol>}
              {turn.answer ? <ProcessAnswerView answer={turn.answer} stale={questions.stale(turn)} inspect={(selection, quote) => void questions.inspect(selection, quote)} /> : <p>{turn.message}</p>}
            </div></div> }; const turn = item.turn; return <div key={turn.id} className="process-turn">
            <div className="process-message process-message-user"><span className="process-speaker">{turn.actor.name}</span><p>{turn.message}</p>{turn.attachment && <small>Source attached: {turn.attachment.title}</small>}</div>
            <div className="process-message process-message-assistant"><span className="process-speaker">ProForma</span><p>{turn.reply}</p>{turn.contextNotice && <p className="process-muted">{turn.contextNotice}</p>}
              {turn.changes.length > 0 && <details className="process-changes"><summary>{turn.changes.length} guide changes saved · Revision {turn.baseRevision + 1}</summary><ul>{turn.changes.map((change, index) => <li key={index}><strong>{change.type === 'set_flow' ? 'Updated paths' : change.type === 'add_step' ? 'Added step' : change.type === 'remove_step' ? 'Removed step' : change.target}</strong>{change.type === 'set_flow' ? <span>{change.value.transitions.length} paths</span> : change.value && <span>{change.value}</span>}</li>)}</ul></details>}
              {macro(turn)}
            </div>
          </div> })}
          {questions.attempt && <section aria-label="Guide practice"><PracticePanel attempts={questions.attempts} attempt={questions.attempt} onChoose={questions.chooseAttempt} /></section>}
          {questions.changeImpact && <ChangeImpact report={questions.changeImpact} {...(doc ? { processId: `draft:${doc.id}` } : {})} focus />}
          {questions.notice && <p role="status">{questions.notice}</p>}
          {questions.source && <SourceInspector source={questions.source} onClose={questions.closeSource} />}
          {handoff.active && <section className="process-handoff" aria-label="Referral handoff macro">
            <div className="process-overline">AlamoAgent / Referral handoff · fictional rehearsal</div>
            <p>Quality review → your review decision → handoff draft. This uses a fixed fictional referral; no real records are read or changed.</p>
            {handoff.chat?.turns.map(turn => <div className="process-turn" key={turn.id}>
              <div className="process-message process-message-user"><span className="process-speaker">Macro request</span><p>{turn.text}</p></div>
              <div className="process-message process-message-assistant"><span className="process-speaker">AlamoAgent · {turn.status}</span>{turn.answer?.paragraphs.map((paragraph, index) => <p key={index}>{paragraph.text}</p>)}
                {turn.draftReview && <div className="process-review-receipt"><strong>{turn.draftReview.decision ? `Draft ${turn.draftReview.decision === 'accept' ? 'accepted' : 'rejected'}` : 'Draft awaiting your review'}</strong><small>Version {turn.draftReview.artifactRevision.slice(0, 12)}</small>
                  {!turn.draftReview.decision && <p>After inspecting this draft, type <strong>Accept this draft</strong> or <strong>Reject this draft</strong>. Your decision applies to this saved version. Acceptance does not establish clinical sufficiency or send a handoff.</p>}
                </div>}
              </div>
            </div>)}
            <p className="process-muted">After accepting the quality draft, ask “Prepare the handoff draft”. Type “Back to guide” to return to ProForma.</p>
            {handoff.error && <div role="alert" className="drafts-alert"><p>{handoff.error}</p><button disabled={working} onClick={() => void handoff.reload()}>Reload saved macro</button><button disabled={working} onClick={() => { handoff.leave(); setMessage('') }}>Return to guide</button></div>}
          </section>}
          {working && <p role="status" className="process-thinking">{handoff.busy ? 'AlamoAgent is preparing the draft…' : 'Working with your guide…'}</p>}
        </div>
        {maintenanceNotice && <p role="status" className="process-muted">{maintenanceNotice}</p>}
        {(error || questions.error) && <div className="drafts-alert" role="alert"><p>{error || questions.error}</p><div className="drafts-actions">
          <button onClick={() => download({ document: doc, pending, message, unsavedSources: sources.session }, 'proforma-conversation-copy.json')}>Download a copy</button>
          {pending && <button disabled={busy} onClick={() => void send(true)}>Check saved message</button>}
          {!pending && (doc || questions.pending) && <button disabled={working} onClick={() => void reloadConversation()}>{questions.pending ? 'Check saved message' : 'Reload guide and conversation'}</button>}
          {doc && !pending && <a href={workflowHref('processes', { process: `draft:${doc.id}` })}>Open process conversation</a>}
          {rebase && <button onClick={() => { if (recovered && detail?.document.id === recovered.document.id) { onSaved(recovered); setRecovered(null) }; setRebase(false); setError('') }}>I reviewed the latest guide</button>}
          {!busy && <button onClick={() => { setPending(null); questions.discard(); setMessage(''); setRebase(false); setError('') }}>Discard unsent message</button>}
        </div></div>}
        <form className="process-composer" onSubmit={event => { event.preventDefault(); void send() }}>
          {!sources.pending && <SourceContext control={questions.sources} scope={questions.sourceScope} disabled={busy || requestPending || editing} onReload={() => void reloadConversation()} />}
          {!handoff.active && !locked && <ConversationSources key={attachmentVersion} client={client} disabled={working || requestPending || locked || editing} onChange={setSources} />}
          <label htmlFor="process-message" className="sr-only">Message ProForma</label>
          <textarea id="process-message" data-proposal={!!maintenanceNotice && !!message} ref={input} rows={4} maxLength={handoff.active ? 4000 : CONVERSATION_MESSAGE_LIMIT} value={message} disabled={working || (locked && !doc) || requestPending || !!handoff.pending || linksDirty || editing} onChange={event => setMessage(event.target.value)} placeholder={locked ? 'Ask about this guide and its sources…' : handoff.active ? 'Review the draft or ask AlamoAgent to continue…' : doc ? 'Describe a change or ask about this guide…' : 'Describe a process, paste notes, or explain what needs to happen…'} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
          <div className="process-send-row"><small>{editing ? 'Save or discard document edits to continue chatting.' : locked ? 'Guide is read only' : handoff.active ? 'Talking to AlamoAgent · fictional handoff' : 'Enter to send · Shift + Enter for a new line'}</small><button type="submit" aria-label={requestPending || handoff.pending ? 'Retry message' : 'Send →'} title={requestPending || handoff.pending ? 'Retry message' : 'Send'} className="drafts-primary" disabled={working || (locked && !doc) || linksDirty || editing || rebase || sources.incomplete || (!requestPending && !handoff.pending && !message.trim())}><ArrowUp size={19} aria-hidden="true" /></button></div>
        </form>
      </div>
      <aside className="process-artifact" aria-label="Guide alongside conversation">
        {doc && editing ? <GuidePageEditor key={`${doc.id}:${doc.revision}`} document={doc} client={client} readOnly={locked} onDirtyChange={setEditorDirty} onBusyChange={setEditorBusy} onCancel={() => { setEditing(false); setEditorDirty(false) }} onSaved={result => { setEditing(false); setEditorDirty(false); onSaved(result) }} /> : doc ? <><h3>{doc.content.title}</h3>{doc.content.purpose && <p>{doc.content.purpose}</p>}
          <dl>{[['Audience', doc.content.audience], ['Starts when', doc.content.sop?.trigger], ['Owner', doc.content.sop?.ownerRole]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <ol className="process-guide-steps">{doc.content.sop?.steps.map(step => <li key={step.id}><h4>{step.action || 'Action to explain'}</h4>{step.role && <small>{step.role}{step.system ? ` · ${step.system}` : ''}</small>}<p>{step.expectedResult || 'Expected result still to explain.'}</p></li>)}</ol>
          {doc.content.sop?.flow && <FlowSummary flow={doc.content.sop.flow} steps={doc.content.sop.steps} />}
          {!doc.content.sop?.steps.length && <p className="process-muted">No steps yet.</p>}
          <dl>{[['Handoff', doc.content.sop?.handoff], ['Exceptions', doc.content.sop?.exceptions], ['Complete when', doc.content.sop?.completionCriteria]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <details className="process-evidence"><summary>Sources & knowledge connections</summary>
            {doc.intake && <OriginalSource evidence={doc.intake} client={client} />}
            {doc.capture && <><h4>Original demonstration</h4><ol>{doc.capture.bundle.steps.map(step => <li key={step.id}>{step.label}{step.visual&&<CaptureImage visual={step.visual} client={client}/>}</li>)}</ol></>}
            <SourceAttachments attachments={conversationAttachments(doc)} client={client} />
            <DraftKnowledgeLinks permissions={permissions} document={doc} disabled={working || editing || requestPending || !!handoff.pending || !!message || locked || sources.pending} onUnsavedChange={setLinksDirty} />
          </details>
        </> : <div className="process-artifact-empty"><p>No guide yet.</p>{handoffRehearsalAvailable && <p className="process-muted">To rehearse the first macro with a connected AlamoAgent sandbox, type “Try fictional handoff”.</p>}</div>}
      </aside>
    </div>
  </section>
}
