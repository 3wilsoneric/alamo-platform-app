'use client'

import { useState } from 'react'
import { emptySopStep, SOP_LIMITS } from '@/lib/sop-contract.mjs'
import type { SopStep, StructuredSop } from '@/lib/sop-types'
import FlowEditor from './FlowEditor'

const sections = [
  { key: 'trigger', label: 'When to start', help: 'What event or request starts this procedure?' },
  { key: 'applicability', label: 'Where this applies', help: 'Which situations, teams or locations does this cover?' },
  { key: 'prerequisites', label: 'Before starting', help: 'List required inputs, access, equipment or checks. Explain if none apply.' },
] as const
const closingSections = [
  { key: 'completionCriteria', label: 'Completion criteria', help: 'How will someone verify that the whole procedure is complete?' },
  { key: 'exceptions', label: 'Exceptions and escalation', help: 'What can go wrong or require a different path? State when to stop and who to contact.' },
  { key: 'handoff', label: 'Handoff', help: 'Who receives the result, what do they need, and how do they accept it? Explain if no handoff applies.' },
] as const

export default function SopEditor({ sop, onChange, documentMode = false }: { sop: StructuredSop; onChange: (value: StructuredSop) => void; documentMode?: boolean }) {
  const [removed, setRemoved] = useState<{ step: SopStep; index: number } | null>(null)
  const [pathError, setPathError] = useState('')
  const field = (key: keyof StructuredSop, value: string) => onChange({ ...sop, [key]: value })
  const stepField = (id: string, key: keyof SopStep, value: string) => onChange({ ...sop, steps: sop.steps.map(step => step.id === id ? { ...step, [key]: value } : step) })
  function move(index: number, offset: number) {
    const steps = [...sop.steps]
    const current = steps[index], adjacent = steps[index + offset]
    if (!current || !adjacent) return
    ;[steps[index], steps[index + offset]] = [adjacent, current]
    onChange({ ...sop, steps })
  }
  const closingFields = <><FlowEditor steps={sop.steps} flow={sop.flow} onChange={flow => { setPathError(''); onChange({ ...sop, schemaVersion: 2, flow }) }} />
    {closingSections.map(({ key, label, help }) => <label key={key}>{label}<textarea aria-label={label} rows={2} maxLength={SOP_LIMITS.section} value={sop[key]} onChange={event => field(key, event.target.value)} placeholder={help} /></label>)}</>
  const contextFields = <><label>Accountable role<input aria-label="Accountable role" aria-describedby="sop-owner-help" maxLength={SOP_LIMITS.role} value={sop.ownerRole} onChange={event => field('ownerRole', event.target.value)} placeholder="Which role maintains this procedure?" /><small id="sop-owner-help">A role description does not assign a person or grant access.</small></label>
    {sections.map(({ key, label, help }) => <label key={key}>{label}<textarea aria-label={label} rows={2} maxLength={SOP_LIMITS.section} value={sop[key]} onChange={event => field(key, event.target.value)} placeholder={help} /></label>)}</>
  return <div className="sop-editor">
    {pathError && <p role="alert">{pathError}</p>}
    {documentMode ? <details className="sop-context"><summary>When, where and who</summary>{contextFields}</details> : contextFields}
    <div className="sop-step-heading"><h3>Steps <span>({sop.steps.length})</span></h3></div>
    {!sop.steps.length && <p className="drafts-muted">Add the first action someone should take.</p>}
    <ol className="sop-steps">
      {sop.steps.map((step, index) => <li key={step.id} className="sop-step" aria-label={`Step ${index + 1}`}>
        <div className="sop-step-bar"><h3>Step {index + 1}</h3><div className="drafts-actions">
          <button type="button" aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
          <button type="button" aria-label={`Move step ${index + 1} down`} disabled={index === sop.steps.length - 1} onClick={() => move(index, 1)}>↓</button>
          <button type="button" aria-label={`Remove step ${index + 1}`} onClick={() => {
            if (sop.flow?.entryStepId === step.id || sop.flow?.transitions.some(path => path.fromStepId === step.id || path.toStepId === step.id)) { setPathError('Update the paths referencing this step before removing it.'); return }
            setPathError(''); setRemoved({ step, index }); onChange({ ...sop, steps: sop.steps.filter(item => item.id !== step.id) })
          }}>Remove</button>
        </div></div>
        <label>Action<textarea aria-label={`Step ${index + 1} action`} rows={2} maxLength={SOP_LIMITS.action} value={step.action} onChange={event => stepField(step.id, 'action', event.target.value)} placeholder="What should someone do? Include any condition that changes the action." /></label>
        <label>Expected result<textarea aria-label={`Step ${index + 1} expected result`} rows={2} maxLength={SOP_LIMITS.action} value={step.expectedResult} onChange={event => stepField(step.id, 'expectedResult', event.target.value)} placeholder="What should be true after this action, and how can someone check?" /></label>
        {documentMode ? <details className="sop-step-properties"><summary>{[step.role, step.system].filter(Boolean).join(" · ") || "Role, system and reference"}</summary><div className="drafts-field-row"><label>Responsible role<input aria-label={`Step ${index + 1} responsible role`} maxLength={SOP_LIMITS.role} value={step.role} onChange={event => stepField(step.id, 'role', event.target.value)} /></label>
          <label>System or tool <small>Optional</small><input aria-label={`Step ${index + 1} system`} maxLength={SOP_LIMITS.role} value={step.system} onChange={event => stepField(step.id, 'system', event.target.value)} /></label></div>
        <label>Supporting reference <small>Optional</small><input aria-label={`Step ${index + 1} supporting reference`} maxLength={SOP_LIMITS.reference} value={step.evidenceReference} onChange={event => stepField(step.id, 'evidenceReference', event.target.value)} placeholder="Source title, section or evidence location" /><small>This is an author-supplied reference. Propose verified source connections after saving.</small></label></details> : <><div className="drafts-field-row"><label>Responsible role<input aria-label={`Step ${index + 1} responsible role`} maxLength={SOP_LIMITS.role} value={step.role} onChange={event => stepField(step.id, 'role', event.target.value)} /></label>
          <label>System or tool <small>Optional</small><input aria-label={`Step ${index + 1} system`} maxLength={SOP_LIMITS.role} value={step.system} onChange={event => stepField(step.id, 'system', event.target.value)} /></label></div>
        <label>Supporting reference <small>Optional</small><input aria-label={`Step ${index + 1} supporting reference`} maxLength={SOP_LIMITS.reference} value={step.evidenceReference} onChange={event => stepField(step.id, 'evidenceReference', event.target.value)} placeholder="Source title, section or evidence location" /><small>This is an author-supplied reference. Propose verified source connections after saving.</small></label></>}
        {step.captureStepId && <p className="sop-source-note">Linked to the original captured interaction. Its label does not verify the expected result or establish policy.</p>}
      </li>)}
    </ol>
    <div className="drafts-actions sop-add"><button type="button" disabled={sop.steps.length >= SOP_LIMITS.steps} onClick={() => onChange({ ...sop, steps: [...sop.steps, emptySopStep(crypto.randomUUID())] })}>+ Add step</button>
      {removed && <button type="button" disabled={sop.steps.length >= SOP_LIMITS.steps} onClick={() => { const steps = [...sop.steps]; steps.splice(Math.min(removed.index, steps.length), 0, removed.step); onChange({ ...sop, steps }); setRemoved(null) }}>Undo last removal</button>}
      {sop.steps.length >= SOP_LIMITS.steps && <small>This preview supports up to 100 steps.</small>}
    </div>
    {documentMode ? <details className="sop-context"><summary>Paths, completion and handoff</summary>{closingFields}</details> : closingFields}
    <details className="sop-notes"><summary>Source notes and previous instructions</summary><p>Keep reference material here while you organize the steps. These notes appear in the guide preview.</p>
      <label>Source notes<textarea aria-label="Source notes" rows={5} maxLength={SOP_LIMITS.notes} value={sop.sourceNotes} onChange={event => field('sourceNotes', event.target.value)} /></label>
    </details>
  </div>
}
