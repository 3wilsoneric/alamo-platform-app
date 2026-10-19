import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
export const CATALOG_SOURCES = [
  { id: 'roles', path: 'content/roles/role-library.v1.json', title: 'Workflow role library' },
  { id: 'skills', path: 'content/imports/alamoagent-skills.v1.json', title: 'AlamoAgent skill snapshot' },
  { id: 'procedures', path: 'content/assessor/procedures.v1.json', title: 'Assessor procedure pack' },
]
export async function readCatalogSources(repositoryRoot) {
  return Promise.all(CATALOG_SOURCES.map(async source => ({ ...source, text: await readFile(path.join(repositoryRoot, source.path), 'utf8') })))
}
export function atPointer(document, pointer) {
  if (pointer === '') return document
  if (!pointer.startsWith('/')) throw new Error('Invalid source pointer')
  return pointer.slice(1).split('/').reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], document)
}

export function buildKnowledgeCatalog(inputs) {
  const byId = new Map(inputs.map(source => [source.id, { ...source, data: JSON.parse(source.text), digest: digest(source.text) }]))
  const roles = byId.get('roles').data
  const skills = byId.get('skills').data
  const procedures = byId.get('procedures').data
  if (roles.ownerApplication !== 'workflow' || skills.ownerApplication !== 'alamoagent' || skills.executionEnabled !== false || procedures.status !== 'review') throw new Error('Unsupported source authority')
  const nodes = [], edges = []
  function anchor(sourceId, pointer) {
    const source = byId.get(sourceId), value = atPointer(source.data, pointer)
    if (value === undefined) throw new Error('Unresolved source anchor')
    return { sourceId, digest: source.digest, pointer, valueHash: digest(value) }
  }
  function node(id, type, title, description, evidence, grounding = 'explicit-reference', origin = 'library') {
    const record = { id, type, title, description, evidence, grounding, origin, status: 'draft-reference' }
    nodes.push({ ...record, fingerprint: digest({ id, type, title, description, grounding, valueHash: evidence.valueHash }) })
  }
  function edge(from, predicate, to, evidence, grounding = 'explicit-reference') {
    edges.push({ id: `edge:${digest([from, predicate, to]).slice(0, 24)}`, from, predicate, to, evidence, grounding, status: 'draft-reference', origin: 'library' })
  }
  roles.applications.forEach((app, i) => node(`application:${app.id}`, 'application', app.name, app.relationship, anchor('roles', `/applications/${i}`)))
  roles.roles.forEach((role, ri) => {
    if (role.reviewStatus !== 'draft-not-reviewed') throw new Error('Role review state must be preserved')
    const base = `/roles/${ri}`, roleId = `role:${role.id}`
    node(roleId, 'role', role.title, role.mission, anchor('roles', base), role.grounding)
    role.applications.forEach((app, i) => edge(roleId, 'uses_application', `application:${app}`, anchor('roles', `${base}/applications/${i}`), role.grounding))
    role.knowledge.forEach((topic, i) => {
      const id = `topic:${role.id}:${digest(topic).slice(0, 16)}`, evidence = anchor('roles', `${base}/knowledge/${i}`)
      node(id, 'topic', topic, `Learning topic listed for ${role.title}.`, evidence, role.grounding)
      edge(roleId, 'needs_knowledge', id, evidence, role.grounding)
    })
    role.workflows.forEach((flow, fi) => {
      const flowId = `workflow:${flow.id}`, pointer = `${base}/workflows/${fi}`
      node(flowId, 'workflow', flow.title, flow.trigger, anchor('roles', pointer), flow.grounding)
      edge(roleId, 'performs', flowId, anchor('roles', `${pointer}/id`), flow.grounding)
      flow.handoffTo.forEach((target, i) => edge(flowId, 'hands_off_to', `role:${target}`, anchor('roles', `${pointer}/handoffTo/${i}`), flow.grounding))
      flow.skillIds.forEach((target, i) => edge(flowId, 'references_skill', `skill:${target}`, anchor('roles', `${pointer}/skillIds/${i}`), flow.grounding))
    })
    role.sharedSkillIds.forEach((target, i) => edge(roleId, 'references_skill', `skill:${target}`, anchor('roles', `${base}/sharedSkillIds/${i}`), role.grounding))
  })
  skills.skills.forEach((skill, i) => {
    if (skill.reviewStatus !== 'draft-not-reviewed' || skill.activation !== 'not-enabled-by-library') throw new Error('Skill authority changed')
    const id = `skill:${skill.id}`, base = `/skills/${i}`
    node(id, 'skill', skill.title, `${skill.trigger} Read-only ${skill.implementation} design; not activated.`, anchor('skills', base), skill.implementation)
    skill.applications.forEach((app, ai) => edge(id, 'uses_application', `application:${app}`, anchor('skills', `${base}/applications/${ai}`)))
  })
  procedures.procedures.forEach((proc, pi) => {
    const id = `procedure:${proc.id}`, base = `/procedures/${pi}`
    node(id, 'procedure', proc.title, proc.trigger, anchor('procedures', base), 'authored-for-review')
    const assessorTag = proc.tags.indexOf('assessor')
    if (assessorTag >= 0) edge('role:assessor', 'has_guidance', id, anchor('procedures', `${base}/tags/${assessorTag}`), 'explicit-role-tag')
    proc.steps.forEach((step, si) => {
      const stepId = `step:${step.id}`, pointer = `${base}/steps/${si}`
      node(stepId, 'step', step.title, step.action, anchor('procedures', pointer), step.binding)
      edge(id, 'has_step', stepId, anchor('procedures', `${pointer}/id`))
      if (roles.applications.some(app => app.id === step.application)) edge(stepId, 'uses_application', `application:${step.application}`, anchor('procedures', `${pointer}/application`), step.binding)
    })
  })
  const ids = new Set(nodes.map(node => node.id)), edgeIds = new Set(edges.map(edge => edge.id))
  if (ids.size !== nodes.length || edgeIds.size !== edges.length || edges.some(edge => !ids.has(edge.from) || !ids.has(edge.to))) throw new Error('Duplicate or unresolved graph identities')
  const sources = inputs.map(input => { const s = byId.get(input.id); return { id: s.id, path: s.path, title: s.title, digest: s.digest, revision: String(s.data.revision ?? s.data.version), status: s.data.status ?? 'draft-not-reviewed' } })
  return { schemaVersion: 1, projectionVersion: 1, id: digest({ projectionVersion: 1, sources }), sources, nodes, edges }
}

export function compareKnowledgeCatalogs(previous, current) {
  const before = new Map(previous.nodes.map(node => [node.id, node])), after = new Map(current.nodes.map(node => [node.id, node]))
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(id => before.get(id)?.fingerprint !== after.get(id)?.fingerprint)
    .map(id => ({ id, title: (after.get(id) ?? before.get(id)).title, change: !before.has(id) ? 'added' : !after.has(id) ? 'removed' : 'changed' }))
  const visited = new Set(changed.map(node => node.id)), affected = []
  let frontier = new Set(visited)
  const edges = [...previous.edges, ...current.edges]
  for (let depth = 1; depth <= 3; depth++) {
    const next = new Set()
    for (const edge of edges) if (frontier.has(edge.to) && !visited.has(edge.from)) {
      visited.add(edge.from); next.add(edge.from)
      affected.push({ id: edge.from, title: (after.get(edge.from) ?? before.get(edge.from)).title, depth })
    }
    frontier = next
  }
  return { baseline: previous.id, current: current.id, changed, affected, maxDepth: 3,
    notice: 'Potential dependencies within three incoming relationship steps. This is a review aid, not a complete impact assessment.' }
}
