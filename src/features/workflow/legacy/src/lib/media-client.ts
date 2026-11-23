import type { AuthoringClient } from './authoring-types'
import type { MediaManifest, MediaReference } from './media-types'
import { MEDIA_LIMITS, validateMediaManifest, validateMediaReference } from './media-contract.mjs'

export async function mediaHash(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), byte => byte.toString(16).padStart(2,'0')).join('')
}
export async function retainRecording(client: AuthoringClient, blob: Blob, details: Omit<MediaReference,'id'|'sha256'|'bytes'|'schemaVersion'>, progress: (value: number) => void) {
  if (blob.size < 32 || blob.size > MEDIA_LIMITS.bytes) throw new Error('Keep the recording under 64 MiB.')
  const bytes = new Uint8Array(await blob.arrayBuffer()), sha256 = await mediaHash(bytes), chunks: MediaManifest['chunks'] = []
  for (let offset = 0; offset < bytes.length; offset += MEDIA_LIMITS.chunkBytes) {
    const part = bytes.subarray(offset,offset + MEDIA_LIMITS.chunkBytes), id = await mediaHash(part)
    let binary = ''
    for (let at = 0; at < part.length; at += 8192) binary += String.fromCharCode(...part.subarray(at,at + 8192))
    const retained = await client.uploadRecordingChunk({ id, base64: btoa(binary) })
    if (retained.id !== id) throw new Error('The uploaded recording part changed. Retry the upload.')
    chunks.push({ id, bytes: part.length }); progress(Math.round((offset + part.length) / bytes.length * 100))
  }
  return client.commitRecording(validateMediaManifest({ ...details, schemaVersion: 1, id: '0'.repeat(64), sha256, bytes: bytes.length, chunks }))
}
export async function readRecording(client: AuthoringClient, reference: MediaReference) {
  const checked = validateMediaReference(reference), manifest = validateMediaManifest(await client.recording(checked.id))
  const { chunks, ...returned } = manifest
  if (JSON.stringify(checked) !== JSON.stringify(returned)) throw new Error('The recording no longer matches this source.')
  const parts: Uint8Array[] = []
  for (const [index, part] of chunks.entries()) {
    const result = await client.recordingPart(checked.id,index), bytes = Uint8Array.from(atob(result.base64), character => character.charCodeAt(0))
    if (result.id !== part.id || bytes.length !== part.bytes || await mediaHash(bytes) !== part.id) throw new Error('A recording part failed its checksum.')
    parts.push(bytes)
  }
  const blob = new Blob(parts as BlobPart[], { type: checked.mimeType })
  if (blob.size !== checked.bytes || await mediaHash(new Uint8Array(await blob.arrayBuffer())) !== checked.sha256) throw new Error('The retained recording failed its checksum.')
  return blob
}
