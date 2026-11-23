import type { PracticeAttempt, ProcessCommand } from './process-types'
export const nextPracticeStep = (attempt?: PracticeAttempt) => attempt?.steps.find(step => attempt.flow ? step.id === attempt.cursor?.stepId : !Object.hasOwn(attempt.observations, step.id))
export function practiceObservation(message: string, attempt?: PracticeAttempt): Omit<Extract<ProcessCommand, { action: 'observe_step' }>, 'id' | 'expectedRevision'> {
  const step = nextPracticeStep(attempt)
  if (!attempt || !step) throw new Error('Start a practice with remaining steps before saving an observation.')
  const lines = message.replace(/^observed\s*:/i, '').trim().split('\n')
  const choices = lines.filter(line => /^path\s*:/i.test(line)), handoffs = lines.filter(line => /^handoff\s*:/i.test(line))
  if (choices.length > 1 || handoffs.length > 1) throw new Error('Use one path choice and one handoff observation per step.')
  const choice = choices[0]?.replace(/^path\s*:/i, '').trim(), handoffNote = handoffs[0]?.replace(/^handoff\s*:/i, '').trim()
  const paths = attempt.flow?.transitions.filter(path => path.fromStepId === step.id) ?? []
  const chosen = choice ? paths.find(path => (path.condition || (path.terminal === 'stop' ? 'Stop' : path.terminal === 'complete' ? 'Complete' : 'Continue')).toLowerCase() === choice.toLowerCase()) : undefined
  if (choice && !chosen) throw new Error('Use the exact path condition shown for this step.')
  return { action: 'observe_step', attemptId: attempt.id, stepId: step.id, note: lines.filter(line => !/^(path|handoff)\s*:/i.test(line)).join('\n'), ...(chosen ? { transitionId: chosen.id } : {}), ...(handoffNote ? { handoffNote } : {}) }
}
