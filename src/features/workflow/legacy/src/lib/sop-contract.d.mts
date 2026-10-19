import type { StructuredSop, SopStep } from './sop-types'
import type { WorkflowCapture } from './capture-types'

export const SOP_LIMITS: Readonly<{ steps: number; section: number; role: number; action: number; reference: number; notes: number; body: number }>
export function emptySop(): StructuredSop
export function emptySopStep(id: string): SopStep
export function sopFromCapture(capture: WorkflowCapture, sourceNotes?: string): StructuredSop
export function validateSop(value: unknown): StructuredSop
export function sopGaps(sop: StructuredSop): string[]
export function renderSop(sop: StructuredSop): string
