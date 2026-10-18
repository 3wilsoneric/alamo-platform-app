import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const mode = process.argv[2]
assert(['--write', '--check'].includes(mode), 'Use --write or --check')
const root = new URL('../src/features/workflow/legacy/', import.meta.url)
const paths = ['content/roles/role-library.v1.json', 'content/imports/alamoagent-skills.v1.json', 'content/assessor/procedures.v1.json']
const texts = await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')))
const [roles, skills, procedures] = texts.map(text => JSON.parse(text))
assert.equal(roles.ownerApplication, 'workflow')
assert.equal(skills.ownerApplication, 'alamoagent')
assert.equal(skills.executionEnabled, false)
assert.equal(procedures.status, 'review')
const roleMap = new Map(roles.roles.map(role => [role.id, role]))
const appMap = new Map(roles.applications.map(app => [app.id, app.name]))
const records = []
const list = values => values.map(value => `- ${value}`).join('\n')
const steps = values => values.map((value, index) => `${index + 1}. ${value}`).join('\n')
const section = (title, content) => `## ${title}\n\n${content}`
const sourceText = (ids, sources) => list(ids.map(id => `${sources[id].title} — ${sources[id].basis}. Source reference: ${sources[id].path}`))
const roleName = id => { assert(roleMap.has(id), `Unknown role: ${id}`); return roleMap.get(id).title }
const roleId = id => `role:${id}`
const skillId = id => `skill:${id}`
const workflowId = id => `workflow:${id}`
function add(record) {
  const document = { ...record, body: `# ${record.title}\n\n${record.notice}\n\n${record.body}`, linkedIds: [...new Set(record.linkedIds)] };
  records.push({ ...document, revision: createHash("sha256").update(JSON.stringify(document)).digest("hex") });
}

for (const role of roles.roles) {
  assert.equal(role.reviewStatus, 'draft-not-reviewed')
  add({ id: roleId(role.id), code: `ROLE-${role.id}`, title: role.title, kind: 'role', ownerApplication: 'workflow', version: roles.revision, updated: roles.updated,
    sourceFile: paths[0], sourceId: role.id, summary: role.mission, folder: 'Roles', tags: ['role', 'draft', ...role.applications],
    notice: `Draft role definition owned by Alamo Workflow. ${role.grounding === 'inferred-role-split' ? 'Inferred role split; confirm duties and ownership with staff.' : 'Role family supported by source documentation; actual staff ownership remains unverified.'} This is not an employee assignment or permission grant.`,
    linkedIds: [...role.workflows.map(flow => workflowId(flow.id)), ...role.sharedSkillIds.map(skillId)],
    body: [section('Purpose', role.mission), section('Scope', role.scope), section('Applications', list(role.applications.map(id => appMap.get(id)))),
      section('Working rhythm', list(role.cadence)), section('Knowledge and learning', list(role.knowledge)), section('Workflow summaries', list(role.workflows.map(flow => `${flow.title}: ${flow.trigger}`))),
      section('Knowledge objects', list(role.objects)), section('Proposed measures', list(role.measures)), section('Questions for staff review', list(role.questions)), section('Evidence and source basis', sourceText(role.sources, roles.sources))].join('\n\n') })
  for (const flow of role.workflows) add({ id: workflowId(flow.id), code: `FLOW-${flow.id}`, title: flow.title, kind: 'workflow', ownerApplication: 'workflow', version: roles.revision, updated: roles.updated,
    sourceFile: paths[0], sourceId: flow.id, summary: `${role.title}: ${flow.trigger}`, folder: `Workflows/${role.title}`, tags: ['workflow', 'draft', ...role.applications],
    notice: `Draft human workflow owned by Alamo Workflow. ${flow.grounding === 'inferred' ? 'Inferred; requires staff validation.' : 'Supported by source documentation; implementation can be partial.'} This summary does not approve an SOP or confirm work in the source app.`,
    linkedIds: [roleId(role.id), ...flow.handoffTo.map(roleId), ...flow.skillIds.map(skillId)],
    body: [section('Responsible role family', role.title), section('Trigger', flow.trigger), section('Inputs to check', list(flow.inputs)), section('Working path', steps(flow.steps)),
      section('Source outcome to verify', flow.sourceOutcome), section('Handoff partners', list(flow.handoffTo.map(roleName))), section('Exception and recovery', flow.exception),
      section('Agent skill references', list(flow.skillIds)), section('Source basis', sourceText(role.sources, roles.sources))].join('\n\n') })
}
for (const skill of skills.skills) {
  assert.equal(skill.reviewStatus, 'draft-not-reviewed')
  assert.equal(skill.activation, 'not-enabled-by-library')
  add({ id: skillId(skill.id), code: `SKILL-${skill.id}`, title: skill.title, kind: 'skill', ownerApplication: 'alamoagent', version: skill.version, updated: skills.updated,
    sourceFile: paths[1], sourceId: skill.id, summary: skill.trigger, folder: `Agent references/${skill.family}`, tags: ['skill', 'read-only', skill.implementation, ...skill.applications],
    notice: `Read-only reference imported from AlamoAgent, which owns this skill. ${skill.implementation === 'local-synthetic' ? 'Implemented for local synthetic use only.' : 'Design only; no executable binding.'} This document cannot activate a skill. Evaluation cases below are specifications, not test results.`,
    linkedIds: skill.ownerRoleIds.map(roleId),
    body: [section('Trigger', skill.trigger), section('Proposed business reviewers', list(skill.ownerRoleIds.map(roleName))), section('Required context', list(skill.inputs)),
      section('Bounded work', steps(skill.steps)), section('Draft output fields', list(skill.outputFields)), section('Human review', skill.humanReview), section('Completion evidence', skill.completion),
      section('Stop conditions', list(skill.stopConditions)), section('Dependencies', list(skill.dependencies)), section('Proposed evaluation cases', steps(skill.evaluationCases)), section('Source basis', sourceText(skill.sources, skills.sources))].join('\n\n') })
}
for (const procedure of procedures.procedures) add({ id: `procedure:${procedure.id}`, code: procedure.code, title: procedure.title, kind: 'procedure', ownerApplication: 'workflow', version: procedure.version, updated: procedures.authoredAt,
  sourceFile: paths[2], sourceId: procedure.id, summary: procedure.trigger, folder: 'Procedures/Assessor', tags: ['assessor', 'procedure', 'review', ...procedure.tags],
  notice: 'Authored assessor procedure for review, owned by Alamo Workflow. Not approved clinical policy. Walkthrough progress is learning only; it does not confirm a source-system action. Use fictional examples for practice.',
  linkedIds: [roleId('assessor')],
  body: [section('When to use', procedure.trigger), section('Expected outcome', procedure.outcome), section('Before starting', list(procedure.preconditions)),
    ...procedure.steps.map((step, index) => section(`${index + 1}. ${step.title}`, [
      `Where to go: ${step.clickpath.join(' → ')}`, step.action, `Expected result: ${step.expectedResult}`,
      step.exception ? `Exception: ${step.exception}` : null, `Source: ${step.application} / ${step.sourceRef} (${step.binding})`,
    ].filter(Boolean).join('\n\n'))), section('Exceptions', list(procedure.exceptions)),
    section('Agent and human responsibilities', typeof procedure.agent === 'string' ? procedure.agent : Object.entries(procedure.agent).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('; ') : value}`).join('\n\n'))].join('\n\n') })

const ids = new Set(records.map(record => record.id))
assert.equal(ids.size, records.length, 'Duplicate document IDs')
assert.equal(new Set(records.map(record => record.code)).size, records.length, 'Duplicate document codes')
for (const record of records) {
  assert(record.body.length > 100 && record.sourceId && record.summary)
  for (const target of record.linkedIds) assert(ids.has(target), `Dangling link ${record.id} -> ${target}`)
  assert(['workflow', 'alamoagent'].includes(record.ownerApplication))
}
const counts = { roles: roles.roles.length, workflows: roles.roles.reduce((count, role) => count + role.workflows.length, 0), skills: skills.skills.length,
  procedures: procedures.procedures.length, steps: procedures.procedures.reduce((count, procedure) => count + procedure.steps.length, 0) }
const bundle = { schemaVersion: 1, generated: true, status: 'draft-reference-content', counts,
  sources: paths.map((path, index) => ({ path, sha256: createHash('sha256').update(texts[index]).digest('hex') })), records }
const destination = new URL('content/library/documents.v1.json', root)
const serialized = JSON.stringify(bundle, null, 2) + '\n'
if (mode === '--write') { await mkdir(new URL('content/library/', root), { recursive: true }); await writeFile(destination, serialized) }
else assert.equal(await readFile(destination, 'utf8'), serialized, 'Library content is stale; run npm run workflow:refresh-library')
console.log(`${mode === '--write' ? 'Prepared' : 'Verified'} ${records.length} source-linked documents/knowledge entries: ${JSON.stringify(counts)}. No approvals or execution enabled.`)
