import { intakeContent, intakeEvidence } from './intake-contract.mjs'
import { validateCapture, CAPTURE_LIMITS } from './capture-contract.mjs'
import { emptySop, emptySopStep, sopFromCapture, validateSop, renderSop } from './sop-contract.mjs'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const fail = message => { throw new Error(message) }
const shape = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('The teaching session contains unsupported fields.')
}
const text = (value, limit) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`Add an answer of up to ${limit} characters.`)
  return value.trim()
}

export function teachingStart(input) {
  shape(input, ['title', 'source', 'selection', 'capture'])
  const result = { title: text(input.title, 160) }
  if (input.source || input.selection) {
    const evidence = intakeEvidence(input.source, input.selection)
    Object.assign(result, { source: evidence.source, selection: evidence.selection })
  }
  if (input.capture) {
    if (new TextEncoder().encode(JSON.stringify(input.capture)).length > CAPTURE_LIMITS.bytes) fail('Choose a capture smaller than 64 KiB.')
    result.capture = validateCapture(input.capture)
  }
  if (!result.source && !result.capture) fail('Bring written context or a reviewed browser capture to start.')
  return result
}

export function teachingContent(input, makeId) {
  const start = teachingStart(input)
  const content = start.source ? intakeContent(start.source, start.selection, makeId) : {
    title: start.title, kind: 'procedure', audience: '', purpose: '', sourceReference: '', body: '', sop: emptySop(),
  }
  content.title = start.title
  // A demonstration supplies the sequence; written evidence supplies context.
  // Do not silently merge two potentially contradictory action sequences.
  if (start.capture) {
    const reference = `Browser capture ${start.capture.id} · ${start.capture.origin}`
    content.sop.steps = sopFromCapture(start.capture).steps.map((step, index) => ({ ...step, action: start.capture.steps[index].label, evidenceReference: reference }))
    content.sourceReference ||= reference
  }
  content.sop = validateSop(content.sop)
  content.body = renderSop(content.sop)
  return content
}

export function teachingQuestions(content) {
  if (!content.sop) return []
  const questions = []
  const add = (target, value, question, limit = 2000) => { if (!value.trim()) questions.push({ target, question, limit }) }
  add('purpose', content.purpose, 'What should this process achieve?')
  add('audience', content.audience, 'Who needs to follow this process?', 160)
  add('sop.trigger', content.sop.trigger, 'What event tells someone to start?')
  if (!content.sop.steps.length) questions.push({ target: 'first_step', question: 'What is the first action someone takes?', limit: 2000 })
  content.sop.steps.forEach((step, index) => {
    const prefix = `Step ${index + 1}`
    add(`step:${step.id}:action`, step.action, `${prefix}: what should they do?`)
    add(`step:${step.id}:role`, step.role, `${prefix}: who performs this action?`, 160)
    add(`step:${step.id}:expectedResult`, step.expectedResult, `${prefix}: what result should they check?`)
  })
  add('sop.handoff', content.sop.handoff, 'Who receives the result, and how do they accept it?')
  add('sop.exceptions', content.sop.exceptions, 'When should someone stop, take a different path, or escalate?')
  add('sop.completionCriteria', content.sop.completionCriteria, 'How do you know the whole process is complete?')
  add('sop.ownerRole', content.sop.ownerRole, 'Which role is accountable for maintaining this process?', 160)
  add('sop.prerequisites', content.sop.prerequisites, 'What must be available before starting?')
  add('sop.applicability', content.sop.applicability, 'Which teams, locations, or situations does this cover?')
  return questions
}

export function validateTeachingAnswer(input) {
  shape(input, ['id', 'target', 'value'])
  if (!uuid.test(input.id)) fail('The answer needs a stable identifier.')
  return { id: input.id, target: text(input.target, 100), value: text(input.value, 2000) }
}

export function answerTeaching(content, input, actor, at, makeId) {
  const answer = validateTeachingAnswer(input)
  const question = teachingQuestions(content).find(item => item.target === answer.target)
  if (!question) fail('This question has already been answered or its step changed. Load the latest session; your answer is preserved here.')
  answer.value = text(answer.value, question.limit)
  const next = structuredClone(content)
  if (answer.target === 'first_step') next.sop.steps.push({ ...emptySopStep(makeId()), action: answer.value })
  else if (answer.target.startsWith('step:')) {
    const [, id, key] = answer.target.split(':')
    next.sop.steps.find(step => step.id === id)[key] = answer.value
  } else if (answer.target.startsWith('sop.')) next.sop[answer.target.slice(4)] = answer.value
  else next[answer.target] = answer.value
  next.sop = validateSop(next.sop)
  next.body = renderSop(next.sop)
  return { content: next, answer: { ...answer, question: question.question, actor: { ...actor }, at } }
}

export function assertTeachingHistory(history) {
  let prior
  for (const doc of history) {
    const session = doc.teaching
    if (!session) { if (prior) fail('Teaching evidence disappeared.'); continue }
    shape(session, ['schemaVersion', 'startDigest', 'answers'])
    if (session.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(session.startDigest) || !Array.isArray(session.answers) || session.answers.length > 199) fail('Invalid teaching evidence.')
    const ids = new Set()
    for (const answer of session.answers) {
      shape(answer, ['id', 'target', 'value', 'question', 'actor', 'at'])
      validateTeachingAnswer({ id: answer.id, target: answer.target, value: answer.value })
      if (ids.has(answer.id) || !answer.actor?.id || !answer.actor?.name || !Number.isFinite(Date.parse(answer.at))) fail('Invalid teaching answer evidence.')
      text(answer.question, 500); ids.add(answer.id)
    }
    if (prior && (prior.startDigest !== session.startDigest || JSON.stringify(session.answers.slice(0, prior.answers.length)) !== JSON.stringify(prior.answers))) fail('Teaching evidence changed across revisions.')
    prior = session
  }
}
