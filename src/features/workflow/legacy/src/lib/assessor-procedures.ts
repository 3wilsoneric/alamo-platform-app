import pack from '../../content/assessor/procedures.v1.json'
import type { Procedure } from './types'

// Authored content uses the existing library and walkthrough renderer. Completion
// in that renderer remains local learning progress, never a Pipeline receipt.
export const assessorProcedures: Procedure[] = pack.procedures.map((procedure) => ({
  id: procedure.procedureId,
  code: procedure.code,
  title: procedure.title,
  dept: 'Admissions',
  role: 'Assessor',
  type: 'Administrative',
  updated_at: 'Oct 17, 2026',
  status: 'review',
  learning_only: true,
  overview: `When: ${procedure.trigger} Outcome: ${procedure.outcome} Before starting: ${procedure.preconditions.join(' ')} This is a procedure for review; the walkthrough records learning progress only.`,
  tags: procedure.tags,
  video: null,
  steps: procedure.steps.map((step, index) => ({
    id: step.id,
    procedure_id: procedure.procedureId,
    order: index + 1,
    title: step.title,
    body: step.action,
    clickpath: step.clickpath,
    expected_result: step.expectedResult,
    note_prompt: 'Learning note: what needs clarification? Use fictional examples; omit client identifiers.',
    caution: step.exception,
    video: null,
  })),
  resources: [
    { type: 'Application', label: 'Pipeline — use the correct referral', code: 'pipeline' },
    { type: 'Workflow', label: 'Assessor work model', code: procedure.id },
  ],
}))
