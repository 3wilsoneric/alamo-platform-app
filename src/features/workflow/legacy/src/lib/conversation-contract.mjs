import { emptySopStep, validateSop, renderSop } from './sop-contract.mjs'
import { validateFlow } from './flow-contract.mjs'
import { validateAttachment, assertAttachmentCapture } from './attachment-contract.mjs'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
export const CONVERSATION_MESSAGE_LIMIT = 12000
const fail = message => { throw new Error(message) }
const shape = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('Unsupported conversation fields.')
}
const text = (value, max, empty = false) => {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`Use text of up to ${max} characters.`)
  return value.trim()
}
export function validateConversationInput(input) {
  shape(input, ['id', 'message', 'origin'])
  if (!uuid.test(input.id)) fail('A stable message identifier is required.')
  let origin
  if (input.origin !== undefined) {
    shape(input.origin, ['conversationId', 'questionId'])
    const keys = Object.keys(input.origin)
    if (keys.length !== 1 || !uuid.test(input.origin[keys[0]])) fail('Choose one retained conversation origin.')
    origin = { ...input.origin }
  }
  return { id: input.id, message: text(input.message, CONVERSATION_MESSAGE_LIMIT), ...(origin ? { origin } : {}) }
}
const fields = { title: 160, audience: 160, purpose: 2000, sourceReference: 1000,
  'sop.trigger': 2000, 'sop.applicability': 2000, 'sop.ownerRole': 160, 'sop.prerequisites': 2000,
  'sop.completionCriteria': 2000, 'sop.exceptions': 2000, 'sop.handoff': 2000 }
const stepFields = { action: 2000, role: 160, expectedResult: 2000, system: 160 }
export function validateConversationPlan(input) {
  shape(input, ['reply', 'changes', 'automation'])
  const reply = text(input.reply, 4000)
  if (!Array.isArray(input.changes) || input.changes.length > 40) fail('Too many guide changes in one message.')
  const changes = input.changes.map(change => {
    shape(change, ['type', 'target', 'value'])
    const target = text(change.target, 120)
    if (!['set', 'add_step', 'remove_step', 'set_flow'].includes(change.type)) fail('Unsupported guide action.')
    if (change.type === 'set_flow') {
      if (target !== 'sop.flow') fail('Choose the process paths to update.')
      return { type: 'set_flow', target, value: validateFlow(change.value, [], { temporary: true }) }
    }
    if (change.type === 'set') {
      const parts = target.split(':')
      const limit = Object.hasOwn(fields, target) ? fields[target] : parts.length === 3 && parts[0] === 'step' && Object.hasOwn(stepFields, parts[2]) ? stepFields[parts[2]] : 0
      if (!limit) fail('That guide field cannot be changed in conversation.')
      return { type: change.type, target, value: text(change.value, limit, true) }
    }
    if (change.type === 'add_step' && !/^new-[1-9][0-9]?$/.test(target)) fail('New steps need a temporary identifier.')
    if (change.type === 'remove_step' && (!uuid.test(target) || change.value !== '')) fail('Choose an existing step to remove.')
    return { type: change.type, target, value: text(change.value, 2000, change.type === 'remove_step') }
  })
  let automation = null
  if (input.automation !== null) {
    const a = input.automation
    shape(a, ['name', 'intent', 'inputs', 'steps', 'stopConditions'])
    const list = values => {
      if (!Array.isArray(values) || values.length > 20) fail('Too many automation requirements.')
      return values.map(value => text(value, 500))
    }
    if (!Array.isArray(a.steps) || !a.steps.length || a.steps.length > 20) fail('Describe between one and twenty macro steps.')
    automation = { name: text(a.name, 160), intent: text(a.intent, 2000), inputs: list(a.inputs),
      steps: a.steps.map(step => { shape(step, ['instruction', 'system', 'expectedResult']); return { instruction: text(step.instruction, 2000), system: text(step.system, 160, true), expectedResult: text(step.expectedResult, 2000, true) } }), stopConditions: list(a.stopConditions) }
  }
  return { reply, changes, automation }
}
export function applyConversationPlan(content, input, makeId) {
  const plan = validateConversationPlan(input), next = structuredClone(content), added = new Map(), changed = new Set()
  if (!next.sop || next.kind !== 'procedure') fail('Conversation currently edits structured procedure drafts.')
  for (const change of plan.changes) {
    const key = `${change.type}:${change.target}`
    if (changed.has(key)) fail('A guide field was changed twice in one response.')
    changed.add(key)
    if (change.type === 'set_flow') continue
    if (change.type === 'add_step') {
      const id = makeId(); added.set(change.target, id)
      next.sop.steps.push({ ...emptySopStep(id), action: change.value })
    } else if (change.type === 'remove_step') {
      if (!next.sop.steps.some(step => step.id === change.target)) fail('A step changed while this message was being prepared.')
      next.sop.steps = next.sop.steps.filter(step => step.id !== change.target)
    } else if (change.target.startsWith('step:')) {
      const [, reference, field] = change.target.split(':'), id = added.get(reference) ?? reference
      const step = next.sop.steps.find(step => step.id === id)
      if (!step) fail('A step changed while this message was being prepared.')
      step[field] = change.value
    } else if (change.target.startsWith('sop.')) next.sop[change.target.slice(4)] = change.value
    else next[change.target] = change.value
  }
  const flowChange = plan.changes.find(change => change.type === 'set_flow')
  if (flowChange) {
    const stepId = reference => reference === null ? null : added.get(reference) ?? reference
    next.sop.schemaVersion = 2
    next.sop.flow = { ...flowChange.value, entryStepId: stepId(flowChange.value.entryStepId), transitions: flowChange.value.transitions.map(path => ({ ...path,
      id: path.id.startsWith('new-path-') ? makeId() : path.id, fromStepId: stepId(path.fromStepId), toStepId: stepId(path.toStepId),
    })) }
  }
  next.sop = validateSop(next.sop); next.body = renderSop(next.sop)
  return { content: next, plan }
}
export function assertConversationHistory(history, fingerprint) {
  let prior = []
  for (const doc of history) {
    if (!doc.conversation) { if (prior.length) fail('Conversation history disappeared.'); continue }
    shape(doc.conversation, ['schemaVersion', 'turns'])
    const { turns } = doc.conversation
    if (doc.conversation.schemaVersion !== 1 || !Array.isArray(turns) || turns.length > 200) fail('Invalid conversation history.')
    const ids = new Set()
    for (const turn of turns) {
      shape(turn, ['id', 'message', 'reply', 'changes', 'automation', 'actor', 'at', 'baseRevision', 'sourceDigest', 'attachment', 'contextNotice', 'origin'])
      if (turn.contextNotice !== undefined) text(turn.contextNotice, 1000)
      validateConversationInput({ id: turn.id, message: turn.message, ...(turn.origin !== undefined ? { origin: turn.origin } : {}) })
      if (turn.origin && turn.baseRevision !== 0) fail('A conversation origin belongs to guide creation.')
      validateConversationPlan({ reply: turn.reply, changes: turn.changes, automation: turn.automation })
      if (ids.has(turn.id) || !turn.actor?.id || !turn.actor?.name || !Number.isFinite(Date.parse(turn.at)) || !Number.isSafeInteger(turn.baseRevision) || turn.baseRevision < 0 || turn.baseRevision >= doc.revision) fail('Invalid conversation evidence.')
      if (turn.attachment !== undefined) {
        const attachment = validateAttachment(turn.attachment)
        if (turn.baseRevision < 1 || typeof fingerprint !== 'function' || turn.sourceDigest !== fingerprint(attachment)) fail('Conversation attachment evidence changed.')
        assertAttachmentCapture({ ...doc, conversation: { turns: turns.filter(item => item.id !== turn.id) } }, attachment)
      } else if ((turn.sourceDigest !== undefined || turn.baseRevision === 0 && doc.teaching) && (typeof turn.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/.test(turn.sourceDigest) || turn.baseRevision !== 0 || turn.sourceDigest !== doc.teaching?.startDigest)) fail('Conversation source evidence changed.')
      ids.add(turn.id)
    }
    if (JSON.stringify(turns.slice(0, prior.length)) !== JSON.stringify(prior)) fail('Conversation evidence changed across revisions.')
    prior = turns
  }
}
