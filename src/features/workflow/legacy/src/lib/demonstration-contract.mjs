import { validateCapture, CAPTURE_LIMITS } from './capture-contract.mjs'

// A browser handoff contains reviewed process evidence, never credentials or app records.
export const DEMONSTRATION_PROTOCOL = 'proforma.demonstration.v1'
export const DEMONSTRATION_LIMIT = CAPTURE_LIMITS.bytes + 24000
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
export const isHandoffId = value => typeof value === 'string' && uuid.test(value)
export function isPipelineOrigin(origin, receiverOrigin) {
  if (origin === 'https://alamo-pipeline.com') return true
  try {
    const source = new URL(origin), receiver = new URL(receiverOrigin)
    return source.origin === origin && source.protocol === 'http:' && receiver.protocol === 'http:'
      && ['127.0.0.1', 'localhost'].includes(source.hostname) && source.hostname === receiver.hostname
  } catch { return false }
}
export function validateDemonstration(input, senderOrigin) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['schemaVersion', 'capture', 'context'].includes(key))
    || input.schemaVersion !== 1) throw new Error('This demonstration version is not supported.')
  if (new TextEncoder().encode(JSON.stringify(input)).length > DEMONSTRATION_LIMIT) throw new Error('This demonstration is too large.')
  const capture = validateCapture(input.capture)
  if (capture.origin !== senderOrigin) throw new Error('The demonstration source does not match its sender.')
  if (new TextEncoder().encode(JSON.stringify(capture)).length > CAPTURE_LIMITS.bytes) throw new Error('The capture exceeds 64 KiB.')
  if (typeof input.context !== 'string' || input.context.length > 12000
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input.context)) throw new Error('Keep the process explanation within 12,000 characters.')
  return { schemaVersion: 1, capture, context: input.context.trim() }
}
