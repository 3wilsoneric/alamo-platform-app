import CaptureImage from './CaptureImage'
import type {WorkflowCapture} from '@/lib/capture-types'
import type { StructuredSop } from '@/lib/sop-types'
import FlowSummary from './FlowSummary'
import './guide-content.css'

export default function GuideContent({ body, sop, capture, focusPath = '' }: { body: string; sop?: StructuredSop | undefined; capture?:WorkflowCapture|undefined; focusPath?: string | undefined }) {
  if (!sop) return <pre className="guide-text">{body}</pre>
  return <div className="guide-content">
    <dl>{[['Starts when', sop.trigger], ['Applies to', sop.applicability], ['Accountable role', sop.ownerRole], ['Before starting', sop.prerequisites]].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
    <ol className="guide-steps">{sop.steps.map((step, index) => {const visual=capture?.steps.find(item=>item.id===step.captureStepId)?.visual;return <li key={step.id} data-source-selected={focusPath.startsWith(`/sop/steps/${index}/`)}><span>{index + 1}</span><div><h3>{step.action}</h3><p>{[step.role, step.system].filter(Boolean).join(' · ')}</p><p><b>Expected:</b> {step.expectedResult}</p>{step.evidenceReference && <p>Reference: {step.evidenceReference}</p>}</div>{visual&&<CaptureImage visual={visual}/>}</li>})}</ol>
    {sop.flow && <FlowSummary flow={sop.flow} steps={sop.steps} focusPath={focusPath} />}
    <dl>{[['Complete when', sop.completionCriteria], ['Exceptions & escalation', sop.exceptions], ['Handoff', sop.handoff]].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
    {sop.sourceNotes && <details><summary>Source notes</summary><pre className="guide-text">{sop.sourceNotes}</pre></details>}
    <details className="guide-original"><summary>Saved source text</summary><pre className="guide-text">{body}</pre></details>
  </div>
}
