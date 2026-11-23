import type { IntakeSource } from './intake-types.js'
import type { SourceFile, FileLocation } from './file-types.js'
export const FILE_LIMITS: { readonly bytes: number; readonly documentBytes:number; readonly requestBytes:number; readonly recordBytes:number; readonly text: number }
export function validateFileReference(value: unknown): SourceFile
export function fileLocation(source: IntakeSource, start: number, length: number): FileLocation | null
