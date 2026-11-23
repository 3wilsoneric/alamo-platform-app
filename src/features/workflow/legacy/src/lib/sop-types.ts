import type { SopFlow } from './flow-types.js'
export type SopStep = {
  id: string
  action: string
  expectedResult: string
  role: string
  system: string
  evidenceReference: string
  captureStepId?: string
}

export type StructuredSop = {
  schemaVersion: 1 | 2
  flow?: SopFlow
  trigger: string
  applicability: string
  ownerRole: string
  prerequisites: string
  completionCriteria: string
  exceptions: string
  handoff: string
  sourceNotes: string
  steps: SopStep[]
}
