'use client'
import type { usePublishedExecution } from './usePublishedExecution'

const stage = (value: string) => ({ human: 'Person', 'assessor-handoff': 'Handoff draft', 'assessment-answer-quality': 'Answer-quality review', 'assessor-clarification': 'Clarification draft' }[value] ?? value)
export default function PublishedExecution({ execution }: { execution: ReturnType<typeof usePublishedExecution> }) {
  if (!execution.active) return null
  const { configuration: config, discovery, chat } = execution
  return <section className="published-execution" aria-label="Published process automation" aria-live="polite">
    <p className="learning-version">Fictional data · Draft preparation only</p>
    {execution.error && <p role="alert">{execution.error} Your message is retained for retry.</p>}
    {execution.notice && <p role="status">{execution.notice}</p>}
    {execution.canCancel && <button type="button" onClick={() => void execution.cancel()}>Stop run</button>}
    {discovery && !config && <>
      <ol>{discovery.macros.map(macro => <li key={macro.id}><strong>{macro.request.name}</strong><p>{macro.request.intent}</p></li>)}</ol>
      {!!discovery.configurations.length && <details><summary>Saved configurations</summary><ol>{discovery.configurations.map(item => <li key={item.id}>{item.status} · {item.enabled ? 'enabled' : 'paused'} · {item.available ? 'current' : 'source unavailable'} · revision {item.revision}</li>)}</ol><p>Type “Open configuration 1” to inspect one.</p></details>}
    </>}
    {config && <>
      <p>Mapping revision {config.revision} · {config.status} · {config.enabled ? 'enabled' : 'paused'}</p>
      {!config.available ? <p>Its source or configuration is unavailable. An approved mapping can still be paused with “Pause macro”.</p> : <>
        <strong>{config.macro?.name}</strong>
        <ol>{config.macro?.steps.map((step, index) => <li key={index}><p>{step.instruction}</p><small>{stage(config.stepBindings?.find(s => s.stepIndex === index)?.stage ?? 'human')} · {step.system}</small><p>Expected: {step.expectedResult}</p></li>)}</ol>
        <details><summary>What the engine will do</summary><ol>{config.capability?.phases.map(item => <li key={item}>{item}</li>)}</ol><p>Human steps and receiving acceptance remain outstanding. Nothing is sent or changed in the source application.</p><ul>{config.macro?.stopConditions.map(item => <li key={item}>{item}</li>)}</ul></details>
        {!chat && <p>{config.status === 'pending' ? 'Review the steps, then type “Approve mapping” or “Reject mapping”. To change a step: “Map step 2 to human”.' : config.status === 'approved' ? config.enabled ? 'Type “Start macro” to open a fictional run, or “Pause macro”.' : 'Type “Enable macro” when ready to allow fictional runs.' : 'This mapping was rejected. Show macros to prepare another.'}</p>}
      </>}
      {!!config.history?.length && <details><summary>Mapping history</summary><ol>{config.history.map(item => <li key={item.revision}>Revision {item.revision}: {item.status}, {item.enabled ? 'enabled' : 'paused'} · {new Date(item.at).toLocaleString()}</li>)}</ol></details>}
    </>}
    {chat && <div className="pw-turns">{chat.turns.map(turn => <article key={turn.id}><p className="pw-question">{turn.text}</p>{turn.answer?.paragraphs.map((item, index) => <p key={index}>{item.text}</p>)}<small>{turn.status}</small>{turn.draftReview && <p>{turn.draftReview.decision ? `Draft ${turn.draftReview.decision === 'accept' ? 'accepted' : 'rejected'}.` : 'Review this draft, then type “Accept this draft” or “Reject this draft”.'}</p>}</article>)}</div>}
    <p className="process-muted">Type “Back to guide” to return to questions and practice.</p>
  </section>
}
