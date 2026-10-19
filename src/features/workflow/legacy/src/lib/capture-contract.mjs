// Portable interchange rules: no browser, model, storage, or identity dependency.
export const CAPTURE_LIMITS = Object.freeze({ steps: 100, bytes: 65536, label: 120, title: 160 })
const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const invalid = message => { throw new Error(message) }
const shape = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) invalid('The capture contains unsupported fields.')
}
const identifier = value => {
  if (typeof value !== 'string' || !idPattern.test(value)) invalid('The capture contains an invalid identifier.')
  return value
}
const text = (value, limit) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) invalid('A capture label or title is missing, too long, or contains control characters.')
  return value.trim()
}
const timestamp = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid('The capture contains an invalid time.')
  return value
}

export function validateCapture(value) {
  shape(value, ['schemaVersion', 'id', 'title', 'origin', 'startedAt', 'endedAt', 'reviewedAt', 'steps'])
  if (value.schemaVersion !== 1) invalid('This capture version is not supported.')
  let url
  try { url = new URL(value.origin) } catch { invalid('The capture needs a website origin.') }
  if (!['http:', 'https:'].includes(url.protocol) || value.origin !== url.origin || value.origin.length > 250) invalid('Only the website origin is allowed; remove URL paths, credentials, queries and fragments.')
  const startedAt = timestamp(value.startedAt), endedAt = timestamp(value.endedAt), reviewedAt = timestamp(value.reviewedAt)
  if (endedAt < startedAt || reviewedAt < endedAt) invalid('The capture times are out of order.')
  if (!Array.isArray(value.steps) || !value.steps.length || value.steps.length > CAPTURE_LIMITS.steps) invalid('Choose a capture with 1–100 steps.')
  const ids = new Set()
  let previousTime = startedAt
  const steps = value.steps.map(step => {
    shape(step, ['id', 'kind', 'label', 'control', 'at'])
    const id = identifier(step.id), at = timestamp(step.at)
    if (ids.has(id)) invalid('Capture step identifiers must be unique.')
    ids.add(id)
    if (!['button', 'link', 'checkbox', 'radio', 'select'].includes(step.control) || !['click', 'change'].includes(step.kind)
      || (step.kind === 'click' && !['button', 'link'].includes(step.control))
      || (step.kind === 'change' && !['checkbox', 'radio', 'select'].includes(step.control))) invalid('The capture contains an unsupported action or control.')
    if (at < previousTime || at > endedAt) invalid('Capture step times are out of order.')
    previousTime = at
    return { id, kind: step.kind, label: text(step.label, CAPTURE_LIMITS.label), control: step.control, at }
  })
  return { schemaVersion: 1, id: identifier(value.id), title: text(value.title, CAPTURE_LIMITS.title), origin: url.origin, startedAt, endedAt, reviewedAt, steps }
}

export function captureToContent(input) {
  const capture = validateCapture(input)
  return {
    title: capture.title, kind: 'procedure', audience: '', purpose: '',
    sourceReference: `Browser capture ${capture.id} · ${capture.origin} · ${capture.startedAt}. Contributor-reviewed labels; unverified process.`,
    body: [
      'CAPTURE-DERIVED DRAFT — PROCESS REVIEW REQUIRED',
      'These steps describe captured interactions. They do not verify successful work or approved company policy.',
      '', 'Prerequisites', '[Describe what must be true before starting.]', '', 'Captured steps',
      ...capture.steps.flatMap((step, index) => [
        `${index + 1}. ${step.kind === 'click' ? 'Activate' : 'Change'} ${step.control}: “${step.label}”.`,
        `   Source: captured step ${index + 1}.`,
      ]),
      '', 'Expected outcome', '[Describe how to verify that the process succeeded.]',
      '', 'Exceptions and handoffs', '[Add decision points, exceptions, and the receiving role.]',
      '', 'Policy and knowledge review', '[Link the applicable roles, workflow, applications, and policies using reviewed evidence.]',
    ].join('\n'),
  }
}
