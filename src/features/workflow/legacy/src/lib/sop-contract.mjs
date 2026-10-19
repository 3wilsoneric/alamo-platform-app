// Shared authoring rules. The stored structure is canonical; body is a projection.
export const SOP_LIMITS = Object.freeze({ steps: 100, section: 2000, role: 160, action: 2000, reference: 1000, notes: 40000, body: 40000 })
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const sections = [
  ['trigger', 'When to start'], ['applicability', 'Where this applies'], ['ownerRole', 'Accountable role'],
  ['prerequisites', 'Before starting'], ['completionCriteria', 'Completion criteria'],
  ['exceptions', 'Exceptions and escalation'], ['handoff', 'Handoff'],
]
const invalid = message => { throw new Error(message) }
const shape = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid('The SOP contains unsupported fields.')
}
const text = (value, limit, field) => {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) invalid(`Check ${field}; its maximum length is ${limit} characters.`)
  return value.trim()
}

export function emptySop() {
  return { schemaVersion: 1, trigger: '', applicability: '', ownerRole: '', prerequisites: '',
    completionCriteria: '', exceptions: '', handoff: '', sourceNotes: '', steps: [] }
}

export function emptySopStep(id) {
  return { id, action: '', expectedResult: '', role: '', system: '', evidenceReference: '' }
}

export function sopFromCapture(capture, sourceNotes = '') {
  return { ...emptySop(), sourceNotes, steps: capture.steps.map(step => ({ ...emptySopStep(step.id),
    captureStepId: step.id, action: `${step.kind === 'click' ? 'Activate' : 'Change'} ${step.control}: “${step.label}”.`,
  })) }
}

export function validateSop(value) {
  shape(value, ['schemaVersion', ...sections.map(([key]) => key), 'sourceNotes', 'steps'])
  if (value.schemaVersion !== 1) invalid('This SOP version is not supported.')
  const sop = { schemaVersion: 1 }
  for (const [key, label] of sections) sop[key] = text(value[key], key === 'ownerRole' ? SOP_LIMITS.role : SOP_LIMITS.section, label)
  sop.sourceNotes = text(value.sourceNotes, SOP_LIMITS.notes, 'source notes')
  if (!Array.isArray(value.steps) || value.steps.length > SOP_LIMITS.steps) invalid('An SOP can contain up to 100 steps.')
  const ids = new Set()
  sop.steps = value.steps.map(step => {
    shape(step, ['id', 'action', 'expectedResult', 'role', 'system', 'evidenceReference', 'captureStepId'])
    if (typeof step.id !== 'string' || !idPattern.test(step.id) || ids.has(step.id)) invalid('SOP steps need unique stable identifiers.')
    ids.add(step.id)
    const normalized = { id: step.id }
    for (const key of ['action', 'expectedResult', 'role', 'system', 'evidenceReference']) {
      normalized[key] = text(step[key], ['role', 'system'].includes(key) ? SOP_LIMITS.role : key === 'evidenceReference' ? SOP_LIMITS.reference : SOP_LIMITS.action, `step ${key}`)
    }
    if ('captureStepId' in step) {
      if (typeof step.captureStepId !== 'string' || !idPattern.test(step.captureStepId)) invalid('A captured step reference is invalid.')
      normalized.captureStepId = step.captureStepId
    }
    return normalized
  })
  if (renderSop(sop).length > SOP_LIMITS.body) invalid('The complete SOP exceeds 40,000 characters. Shorten the sections or source notes before saving.')
  return sop
}

export function sopGaps(sop) {
  const gaps = sections.filter(([key]) => !sop[key].trim()).map(([, label]) => label)
  if (!sop.steps.length) gaps.push('At least one step')
  sop.steps.forEach((step, index) => {
    for (const [key, label] of [['action', 'action'], ['role', 'responsible role'], ['expectedResult', 'expected result']]) {
      if (!step[key].trim()) gaps.push(`Step ${index + 1}: ${label}`)
    }
  })
  return gaps
}

export function renderSop(sop) {
  const shown = value => value.trim() || '[Not provided]'
  return [
    'STRUCTURED SOP — AUTHORING COPY',
    'Review state is recorded separately. This copy does not establish approval.', '',
    ...sections.slice(0, 4).flatMap(([key, label]) => [label, shown(sop[key]), '']),
    'Steps',
    ...(sop.steps.length ? sop.steps.flatMap((step, index) => [
      `${index + 1}. ${shown(step.action)}`,
      `   Responsible role: ${shown(step.role)}`, `   Expected result: ${shown(step.expectedResult)}`,
      ...(step.system.trim() ? [`   System: ${step.system.trim()}`] : []),
      ...(step.evidenceReference.trim() ? [`   Author-supplied reference: ${step.evidenceReference.trim()}`] : []),
      ...(step.captureStepId ? [`   Captured interaction: ${step.captureStepId} (observed label; outcome and policy unverified)`] : []), '',
    ]) : ['[No steps added]', '']),
    ...sections.slice(4).flatMap(([key, label]) => [label, shown(sop[key]), '']),
    ...(sop.sourceNotes.trim() ? ['Source notes / previous instructions', sop.sourceNotes.trim()] : []),
  ].join('\n').trim()
}
