import type { Demonstration } from './demonstration-types.js'
export const DEMONSTRATION_PROTOCOL: string
export const DEMONSTRATION_LIMIT: number
export function isHandoffId(value: unknown): value is string
export function isPipelineOrigin(origin: string, receiverOrigin: string): boolean
export function validateDemonstration(input: unknown, senderOrigin: string): Demonstration
