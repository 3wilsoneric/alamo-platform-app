import type { SopFlow } from '@/lib/flow-types'

export default function FlowSummary({ flow, steps, focusPath = '' }: { flow: SopFlow; steps: { id: string; action: string }[]; focusPath?: string | undefined }) {
  const stepName = (id: string | null) => {
    const index = steps.findIndex(step => step.id === id)
    return index < 0 ? 'Not chosen' : `Step ${index + 1}`
  }
  return <section className="sop-flow-summary" aria-label="Process paths">
    <h3>Paths</h3><p>Start: {stepName(flow.entryStepId)}</p>
    <ul>{flow.transitions.map((path, index) => <li key={path.id} data-source-selected={focusPath.startsWith(`/sop/flow/transitions/${index}/`)}>
      <strong>{stepName(path.fromStepId)} → {path.toStepId ? stepName(path.toStepId) : path.terminal === 'stop' ? 'Stop / escalate' : 'Complete'}</strong>
      {path.condition && <p>{path.condition}</p>}
      {path.handoff && <p>{path.handoff.role || 'Receiving role needed'} · {path.handoff.acceptance || 'Acceptance condition needed'}</p>}
    </li>)}</ul>
  </section>
}
