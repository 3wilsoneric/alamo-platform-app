import type { WorkflowCapture } from './capture-types'
import type { DraftContent } from './authoring-types'
export const CAPTURE_LIMITS: Readonly<{ steps: number; bytes: number; label: number; title: number }>
export function validateCapture(value: unknown): WorkflowCapture
export function captureToContent(value: unknown): DraftContent
