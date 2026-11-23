import CaptureImage from '@/components/documents/CaptureImage'
import type { PracticeAttempt } from '@/lib/process-types'
import { nextPracticeStep } from '@/lib/practice-input'
const label = (value: string) => value.replaceAll('_', ' ')
export default function PracticePanel({ attempts, attempt, onChoose }: { attempts: PracticeAttempt[]; attempt?: PracticeAttempt | undefined; onChoose: (id: string) => void }) {
  const step = nextPracticeStep(attempt), paths = attempt?.flow?.transitions.filter(path => path.fromStepId === step?.id) ?? []
  return <div className="pw-practice">
    <p>Practice only · Source version retained.</p>
    {attempts.length > 1 && <label>Practice attempt<select value={attempt?.id ?? ''} onChange={event => onChoose(event.target.value)}>{attempts.map(item => <option key={item.id} value={item.id}>{new Date(item.startedAt).toLocaleString()} · {label(item.status)}</option>)}</select></label>}
    {attempt ? <>
      <p className="pw-source-line">{label(attempt.status)} · {label(attempt.freshness ?? 'current')} · Process version {attempt.sourceFingerprint.slice(0, 12)}</p>
      {attempt.freshness === 'source_changed' && <p role="status">The guidance changed. This history is retained; start a new practice from the current source.</p>}
      <ol>{attempt.visits ? attempt.visits.map(visit => <li key={visit.id}><h3>{attempt.steps.find(item => item.id === visit.stepId)?.action}</h3><p>{visit.note}</p>{visit.handoffNote && <p>Handoff rehearsal: {visit.handoffNote}</p>}</li>) : attempt.steps.filter(item => attempt.observations[item.id]).map(item => <li key={item.id}><h3>{item.action}</h3><p>{attempt.observations[item.id]!.note}</p></li>)}</ol>
      {step && <section className="pw-practice-current" aria-label="Current practice step"><h3>{step.action}</h3><p>{step.expectedResult}</p>{attempt.visuals?.[step.id]&&<CaptureImage visual={attempt.visuals[step.id]!}/>}
        {paths.length > 1 && <><p>Add a line “Path: condition” to choose:</p><ul>{paths.map(path => <li key={path.id}>{path.condition}</li>)}</ul></>}
        {paths.some(path => path.handoff) && <><p>For a handoff path, add “Handoff: your observation”.</p>{paths.filter(path => path.handoff).map(path => <p key={path.id}>{path.handoff!.role}: {path.handoff!.acceptance}</p>)}</>}
      </section>}
    </> : <p>Send “start practice” in the conversation to rehearse these steps. Your observations stay with this version.</p>}
  </div>
}
