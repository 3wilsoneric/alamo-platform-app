import { validateIntakeSource } from './intake-contract.mjs'
import { validateCapture, CAPTURE_LIMITS } from './capture-contract.mjs'

export function validateAttachment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['title','source','capture'].includes(key))) throw new Error('Unsupported source attachment fields.')
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160 || /[\u0000-\u001f\u007f]/u.test(input.title)) throw new Error('Give the source a title of up to 160 characters.')
  const result = { title: input.title.trim() }
  if (input.source !== undefined) result.source = validateIntakeSource(input.source)
  if (input.capture !== undefined) {
    if (new TextEncoder().encode(JSON.stringify(input.capture)).length > CAPTURE_LIMITS.bytes) throw new Error('Choose capture metadata smaller than 64 KiB.')
    result.capture = validateCapture(input.capture)
  }
  if (!result.source && !result.capture) throw new Error('Attach a document or reviewed recording.')
  return result
}

export function conversationAttachments(document) {
  return (document.conversation?.turns ?? []).flatMap((turn,index) => turn.attachment ? [{
    ...turn.attachment, id: turn.id, digest: turn.sourceDigest, addedRevision: turn.baseRevision + 1,
    actor: turn.actor, at: turn.at, pointer: `/conversation/turns/${index}/attachment`,
  }] : [])
}

export function assertAttachmentCapture(document, attachment) {
  const captures = [document?.capture?.bundle, ...conversationAttachments(document ?? {}).map(item => item.capture)].filter(Boolean)
  for (const prior of captures) {
    if (prior.id === attachment.capture?.id && JSON.stringify(prior) !== JSON.stringify(attachment.capture)) throw new Error('This recording identifier already has different retained evidence.')
    for (const step of attachment.capture?.steps ?? []) {
      const existing = prior.steps.find(item => item.id === step.id)
      if (existing && JSON.stringify(existing) !== JSON.stringify(step)) throw new Error('A captured action identifier already has different retained evidence.')
    }
  }
}
