export type MediaReference = { schemaVersion: 1; id: string; sha256: string; bytes: number; mimeType: 'video/webm' | 'audio/webm'; durationMs: number; hasVideo: boolean; hasAudio: boolean; startedAt: string; endedAt: string; reviewedAt: string }
export type MediaManifest = MediaReference & { chunks: { id: string; bytes: number }[] }
export type MediaChunk = { id: string; base64: string }
