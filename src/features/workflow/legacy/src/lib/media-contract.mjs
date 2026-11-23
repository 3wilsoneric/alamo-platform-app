// Reviewed media metadata is portable; bytes remain in the owning private store.
export const MEDIA_LIMITS = Object.freeze({ chunkBytes: 1048576, bytes: 64 * 1048576, chunks: 64, durationMs: 600000, requestBytes: 2 * 1048576 })
const hash = /^[a-f0-9]{64}$/
const keys = ['schemaVersion','id','sha256','bytes','mimeType','durationMs','hasVideo','hasAudio','startedAt','endedAt','reviewedAt']
export function validateMediaReference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value)) || value.schemaVersion !== 1 || !hash.test(value.id) || !hash.test(value.sha256) || !Number.isSafeInteger(value.bytes) || value.bytes < 32 || value.bytes > MEDIA_LIMITS.bytes || !Number.isSafeInteger(value.durationMs) || value.durationMs < 1 || value.durationMs > MEDIA_LIMITS.durationMs || typeof value.hasAudio !== 'boolean' || typeof value.hasVideo !== 'boolean' || !['video/webm','audio/webm'].includes(value.mimeType) || value.hasVideo !== (value.mimeType === 'video/webm') || (!value.hasAudio && !value.hasVideo)) throw new Error('Choose a reviewed WebM recording up to 10 minutes and 64 MiB.')
  for (const key of ['startedAt','endedAt','reviewedAt']) if (typeof value[key] !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value[key]) || !Number.isFinite(Date.parse(value[key])) || new Date(value[key]).toISOString() !== value[key]) throw new Error('The recording times are invalid.')
  if (value.endedAt < value.startedAt || value.reviewedAt < value.endedAt || Date.parse(value.endedAt) - Date.parse(value.startedAt) > MEDIA_LIMITS.durationMs + 10000 || value.durationMs > Date.parse(value.endedAt) - Date.parse(value.startedAt) + 1000) throw new Error('Review the recording after stopping it, within the capture limits.')
  return Object.fromEntries(keys.map(key => [key,value[key]]))
}
export function validateMediaManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => ![...keys,'chunks'].includes(key))) throw new Error('Unsupported recording fields.')
  const reference = validateMediaReference(Object.fromEntries(keys.map(key => [key,value[key]])))
  if (!Array.isArray(value.chunks) || !value.chunks.length || value.chunks.length > MEDIA_LIMITS.chunks) throw new Error('The recording parts are invalid.')
  let bytes = 0
  const chunks = value.chunks.map((part,index) => {
    if (!part || Object.keys(part).some(key => !['id','bytes'].includes(key)) || !hash.test(part.id) || !Number.isSafeInteger(part.bytes) || part.bytes < 1 || part.bytes > MEDIA_LIMITS.chunkBytes || index < value.chunks.length - 1 && part.bytes !== MEDIA_LIMITS.chunkBytes) throw new Error('The recording parts are incomplete or out of order.')
    bytes += part.bytes; return { id: part.id, bytes: part.bytes }
  })
  if (bytes !== reference.bytes) throw new Error('The recording size does not match its parts.')
  return { ...reference, chunks }
}
