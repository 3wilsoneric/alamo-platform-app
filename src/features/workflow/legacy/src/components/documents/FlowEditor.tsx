'use client'

import type { SopStep } from '@/lib/sop-types'
import type { SopFlow, FlowTransition } from '@/lib/flow-types'
import { FLOW_LIMITS, linearFlow } from '@/lib/flow-contract.mjs'

export default function FlowEditor({ steps, flow, onChange }: { steps: SopStep[]; flow?: SopFlow | undefined; onChange: (flow: SopFlow) => void }) {
  function change(id: string, patch: Partial<FlowTransition>) {
    if (flow) onChange({ ...flow, transitions: flow.transitions.map(path => path.id === id ? { ...path, ...patch } : path) })
  }
  const options = steps.map((step, index) => <option key={step.id} value={step.id}>{index + 1}. {step.action.slice(0, 75) || 'Untitled step'}</option>)
  return <details className="sop-paths" open={!!flow}>
    <summary>Paths & handoffs</summary>
    {!flow ? <button type="button" disabled={!steps.length} onClick={() => onChange({ ...linearFlow(steps), transitions: linearFlow(steps).transitions.map(path => ({ ...path, id: crypto.randomUUID() })) })}>Define paths from the step order</button> : <>
      <label>First step<select aria-label="Process first step" value={flow.entryStepId ?? ''} onChange={event => onChange({ ...flow, entryStepId: event.target.value || null })}><option value="">Not chosen</option>{options}</select></label>
      {flow.transitions.map((path, index) => <fieldset key={path.id} className="sop-path" aria-label={`Path ${index + 1}`}>
        <legend>Path {index + 1}</legend>
        <div className="drafts-field-row"><label>From<select aria-label={`Path ${index + 1} from`} value={path.fromStepId} onChange={event => change(path.id, { fromStepId: event.target.value })}>{options}</select></label>
          <label>Continue to<select aria-label={`Path ${index + 1} destination`} value={path.toStepId ?? path.terminal ?? ''} onChange={event => change(path.id, ['complete', 'stop'].includes(event.target.value) ? { toStepId: null, terminal: event.target.value as 'complete' | 'stop' } : { toStepId: event.target.value, terminal: null })}>{options}<option value="complete">Complete</option><option value="stop">Stop / escalate</option></select></label></div>
        <label>When<textarea aria-label={`Path ${index + 1} condition`} rows={2} maxLength={2000} value={path.condition} onChange={event => change(path.id, { condition: event.target.value })} placeholder="Condition for taking this path" /></label>
        <label className="sop-handoff-toggle"><input type="checkbox" aria-label={`Path ${index + 1} has a handoff`} checked={!!path.handoff} onChange={event => change(path.id, { handoff: event.target.checked ? { role: '', acceptance: '' } : null })} />Handoff conditions</label>
        {path.handoff && <><label>Receiving role<input aria-label={`Path ${index + 1} receiving role`} maxLength={160} value={path.handoff.role} onChange={event => change(path.id, { handoff: { ...path.handoff!, role: event.target.value } })} /></label><label>Accepts when<textarea aria-label={`Path ${index + 1} acceptance`} rows={2} maxLength={2000} value={path.handoff.acceptance} onChange={event => change(path.id, { handoff: { ...path.handoff!, acceptance: event.target.value } })} /></label></>}
        <button type="button" onClick={() => onChange({ ...flow, transitions: flow.transitions.filter(item => item.id !== path.id) })}>Remove path {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={!steps.length || flow.transitions.length >= FLOW_LIMITS.transitions} onClick={() => onChange({ ...flow, transitions: [...flow.transitions, { id: crypto.randomUUID(), fromStepId: flow.entryStepId ?? steps[0]!.id, toStepId: null, terminal: 'stop', condition: '', handoff: null }] })}>Add path</button>
    </>}
  </details>
}
