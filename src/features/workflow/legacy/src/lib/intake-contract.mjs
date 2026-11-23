import { emptySop, emptySopStep, renderSop, validateSop, sopGaps } from './sop-contract.mjs'
import { validateMediaReference } from './media-contract.mjs'
import { validateFileReference, fileLocation } from './file-contract.mjs'

export const INTAKE_LIMITS = Object.freeze({ text: 12000, steps: 40 })
const fields = { audience: 160, purpose: 2000, trigger: 2000, applicability: 2000, ownerRole: 160, prerequisites: 2000, completionCriteria: 2000, exceptions: 2000, handoff: 2000 }
const stepFields = { action: 2000, role: 160, expectedResult: 2000, system: 160 }
const fail = message => { throw new Error(message) }
function shape(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('The source or extracted sections contain unsupported fields.')
}
function text(value, limit, label) {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`Check ${label}; the maximum length is ${limit} characters.`)
  return value
}
export function validateIntakeSource(value) {
  shape(value, ['schemaVersion', 'title', 'reference', 'text', 'file', 'media'])
  if (value.schemaVersion !== 1) fail('This source version is unsupported.')
  const source = { schemaVersion: 1, title: text(value.title, 160, 'title').trim(), reference: text(value.reference, 1000, 'source reference').trim(), text: text(value.text, INTAKE_LIMITS.text, 'source text') }
  if (!source.title || !source.reference || source.text.trim().length < 20) fail('Add a title, source reference and at least 20 characters of instructions.')
  if ('file' in value) source.file = validateFileReference(value.file)
  if ('media' in value) { if ('file' in value) fail('Keep a recording and document as separate sources.'); source.media = validateMediaReference(value.media) }
  return source
}
export function emptySelection() {
  return { ...Object.fromEntries(Object.keys(fields).map(key => [key, ''])), steps: [] }
}
export function validateIntakeSelection(value, input) {
  const source = validateIntakeSource(input)
  shape(value, [...Object.keys(fields), 'steps'])
  const exact = (quote, limit, key) => {
    const result = text(quote, limit, key).trim()
    if (result && !source.text.includes(result)) fail(`The extracted ${key} does not match the source. Keep the original text and organize it again.`)
    return result
  }
  const selection = Object.fromEntries(Object.entries(fields).map(([key, limit]) => [key, exact(value[key], limit, key)]))
  if (!Array.isArray(value.steps) || value.steps.length > INTAKE_LIMITS.steps) fail('Extract up to 40 steps at a time.')
  selection.steps = value.steps.map(step => {
    shape(step, Object.keys(stepFields))
    const result = Object.fromEntries(Object.entries(stepFields).map(([key, limit]) => [key, exact(step[key], limit, `step ${key}`)]))
    if (!result.action) fail('Each extracted step needs an action from the source.')
    return result
  })
  return selection
}

// A transparent fallback: explicit headings and numbered/bulleted actions only.
// Narrative text remains in the retained source rather than becoming invented steps.
export function selectLiteralSource(input) {
  const source = validateIntakeSource(input), result = emptySelection()
  const labels = { audience: 'audience', purpose: 'purpose', trigger: 'trigger', 'when to start': 'trigger', applicability: 'applicability', 'where this applies': 'applicability', 'owner role': 'ownerRole', 'accountable role': 'ownerRole', prerequisites: 'prerequisites', 'before starting': 'prerequisites', 'completion criteria': 'completionCriteria', exceptions: 'exceptions', 'exceptions and escalation': 'exceptions', handoff: 'handoff' }
  for (const line of source.text.split(/\r?\n/)) {
    const field = /^\s*([a-z &]+):\s*(.+)$/i.exec(line)
    if (field && labels[field[1].toLowerCase()] && !result[labels[field[1].toLowerCase()]]) {
      const key = labels[field[1].toLowerCase()], value = field[2].trim()
      if (value.length <= fields[key]) result[key] = value
      continue
    }
    const step = /^\s*(?:\d+[.)]|[-*•])\s+(.+)$/.exec(line)
    if (step) {
      if (step[1].trim().length > 2000 || result.steps.length >= INTAKE_LIMITS.steps) fail('Organize up to 40 steps, with at most 2,000 characters per action. Split this source before continuing.')
      result.steps.push({ action: step[1].trim(), role: '', expectedResult: '', system: '' })
    }
  }
  return validateIntakeSelection(result, source)
}
export function intakeContent(input, extracted, makeId) {
  const source = validateIntakeSource(input), selection = validateIntakeSelection(extracted, source)
  const sop = emptySop()
  for (const key of Object.keys(fields)) if (key in sop) sop[key] = selection[key]
  sop.sourceNotes = source.text
  sop.steps = selection.steps.map(step => {
    const location = fileLocation(source, source.text.indexOf(step.action), step.action.length)
    return { ...emptySopStep(makeId()), ...step, evidenceReference: location ? `${source.reference} · lines ${location.lineStart}–${location.lineEnd}` : source.reference }
  })
  const checked = validateSop(sop)
  return { title: source.title, kind: 'procedure', audience: selection.audience, purpose: selection.purpose, sourceReference: source.reference, sop: checked, body: renderSop(checked) }
}
export function intakeEvidence(input, extracted) {
  const source = validateIntakeSource(input), selection = validateIntakeSelection(extracted, source)
  const citations = []
  const cite = (path, quote) => {
    if (!quote) return
    const start = source.text.indexOf(quote), location = fileLocation(source, start, quote.length)
    citations.push({ path, quote, start, ...(location ? { location } : {}) })
  }
  for (const key of Object.keys(fields)) cite(key, selection[key])
  selection.steps.forEach((step, index) => { for (const key of Object.keys(stepFields)) cite(`steps/${index}/${key}`, step[key]) })
  return { schemaVersion: 1, source, selection, citations }
}
export function intakeQuestions(content) {
  if (!content.sop) return []
  const prompts = { Audience: 'Who will use this procedure?', Purpose: 'What should this procedure achieve?', 'When to start': 'What event starts this process?', 'Where this applies': 'Which teams, locations or situations does this cover?', 'Accountable role': 'Which role maintains this procedure?', 'Before starting': 'What must be available before starting?', 'Completion criteria': 'How will someone know the whole process is complete?', 'Exceptions and escalation': 'When should someone stop, take a different path or escalate?', Handoff: 'Who receives the result, and how do they accept it?', 'At least one step': 'What is the first action someone should take?' }
  return [...(!content.audience ? ['Audience'] : []), ...(!content.purpose ? ['Purpose'] : []), ...sopGaps(content.sop)].map(gap => {
    const step = /^Step (\d+): (.+)$/.exec(gap)
    return { field: gap, question: prompts[gap] ?? (step ? `Step ${step[1]}: ${step[2] === 'responsible role' ? 'who performs this action?' : step[2] === 'expected result' ? 'what result should they check?' : 'what should they do?'}` : gap) }
  })
}

export function suggestKnowledgeConnections(document, graph) {
  const body = document.content.body, suggestions = []
  const predicates = { role: 'for_role', workflow: 'documents_workflow', application: 'uses_application', policy: 'governed_by' }
  for (const node of graph.nodes) {
    const predicate = predicates[node.type]
    if (!predicate || node.origin !== 'library' || !graph.predicates[predicate]?.includes(node.type)) continue
    if (graph.proposals.some(item => item.source.draftId === document.id && item.targetId === node.id && item.predicate === predicate && !['withdrawn', 'rejected'].includes(item.status))) continue
    const names = [node.title]
    // Stable source IDs retain their current display titles, with bounded app aliases.
    if (node.id === 'application:alamopoc') names.push('Carebook')
    if (node.type === 'application' && /^Alamo /i.test(node.title)) names.push(node.title.replace(/^Alamo /i, ''))
    let match
    for (const name of names.filter(name => name.length >= 4)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const found = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').exec(body)
      if (found) { match = found; break }
    }
    if (!match) continue
    const start = Math.max(body.lastIndexOf('\n', match.index) + 1, match.index - 180)
    const end = Math.min(body.indexOf('\n', match.index) < 0 ? body.length : body.indexOf('\n', match.index), match.index + match[0].length + 180)
    const quote = body.slice(start, end).trim(), quoteStart = body.indexOf(quote, start)
    suggestions.push({ targetId: node.id, targetTitle: node.title, predicate, quote, quoteStart, rationale: `The saved guide mentions ${node.title}. Confirm that this mention supports the selected relationship.` })
  }
  return suggestions.sort((a, b) => a.targetTitle.localeCompare(b.targetTitle)).slice(0, 12)
}
