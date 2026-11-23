import type { MediaManifest, MediaReference } from './media-types.js'
export const MEDIA_LIMITS: Readonly<{ chunkBytes: number; bytes: number; chunks: number; durationMs: number; requestBytes: number }>
export function validateMediaReference(value: unknown): MediaReference
export function validateMediaManifest(value: unknown): MediaManifest
