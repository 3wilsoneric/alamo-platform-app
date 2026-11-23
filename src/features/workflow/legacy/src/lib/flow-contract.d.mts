import type { SopFlow } from './flow-types.js'
import type { SopStep } from './sop-types.js'
export const FLOW_LIMITS: Readonly<{ transitions: number; branches: number; visits: number }>
export function validateFlow(value: unknown, stepIds: string[], options?: { temporary?: boolean }): SopFlow
export function flowGaps(flow: SopFlow, steps: Pick<SopStep, 'id'>[]): string[]
export function linearFlow(steps: Pick<SopStep, 'id'>[]): SopFlow
export function renderFlow(flow: SopFlow, steps: Pick<SopStep, 'id'>[]): string[]
