'use client'

import { useRef, useState } from 'react'
import roleCatalog from '../../../content/roles/role-library.v1.json'
import skillSnapshot from '../../../content/imports/alamoagent-skills.v1.json'

type Role = (typeof roleCatalog.roles)[number]
type Skill = (typeof skillSnapshot.skills)[number]
type LibraryTab = 'roles' | 'skills'

const roleById = new Map(roleCatalog.roles.map((role) => [role.id, role]))
const skillById = new Map(skillSnapshot.skills.map((skill) => [skill.id, skill]))
const appById = new Map(roleCatalog.applications.map((app) => [app.id, app.name]))

function sourceLabels(ids: string[], sourceMap: Record<string, { title: string; basis: string }>) {
  return ids.map((id) => {
    const source = sourceMap[id]
    return source ? `${source.title} · ${source.basis}` : id
  })
}

function groundingLabel(value: string) {
  return value === 'source-supported-role-family'
    ? 'Source-supported family'
    : 'Inferred role split'
}

function matchRole(role: Role, query: string) {
  return [
    role.title,
    role.mission,
    role.scope,
    ...role.knowledge,
    ...role.workflows.flatMap((flow) => [flow.title, flow.trigger, ...flow.steps]),
  ].join(' ').toLowerCase().includes(query)
}

function matchSkill(skill: Skill, query: string) {
  return [
    skill.title,
    skill.family,
    skill.trigger,
    ...skill.inputs,
    ...skill.steps,
    ...skill.ownerRoleIds.map((id) => roleById.get(id)?.title ?? id),
  ].join(' ').toLowerCase().includes(query)
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#59716c]">{children}</h3>
}

function List({ items }: { items: string[] }) {
  return <ul className="space-y-1.5 pl-4 text-[13px] leading-6 text-[#42515a] marker:text-[#087b60] list-disc">{items.map((item) => <li key={item}>{item}</li>)}</ul>
}

function InfoBlock({ title, items }: { title: string; items: string[] }) {
  return <section><Label>{title}</Label><List items={items} /></section>
}

export default function RoleSkillLibraryView() {
  const [tab, setTab] = useState<LibraryTab>('roles')
  const [query, setQuery] = useState('')
  const [appFilter, setAppFilter] = useState('all')
  const [selectedRoleId, setSelectedRoleId] = useState(roleCatalog.roles[0]!.id)
  const [selectedSkillId, setSelectedSkillId] = useState(skillSnapshot.skills[0]!.id)
  const [mobileDetail, setMobileDetail] = useState(false)
  const listRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLElement>(null)

  const normalizedQuery = query.trim().toLowerCase()
  const roles = roleCatalog.roles.filter((role) =>
    (appFilter === 'all' || role.applications.includes(appFilter)) && matchRole(role, normalizedQuery)
  )
  const skills = skillSnapshot.skills.filter((skill) =>
    (appFilter === 'all' || skill.applications.includes(appFilter)) && matchSkill(skill, normalizedQuery)
  )
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0]
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId) ?? skills[0]

  function revealDetail() {
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function revealList() {
    setMobileDetail(false)
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function openRole(id: string) {
    setTab('roles')
    setQuery('')
    setAppFilter('all')
    setSelectedRoleId(id)
    setMobileDetail(true)
    revealDetail()
  }

  function openSkill(id: string) {
    setTab('skills')
    setQuery('')
    setAppFilter('all')
    setSelectedSkillId(id)
    setMobileDetail(true)
    revealDetail()
  }

  return (
    <div className="h-[calc(100vh-64px)] overflow-y-auto bg-[#f3f5f6] text-[#1d2931]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-7 lg:px-9">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-[#d6dfe0] pb-5">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#087b60]">Alamo Workflow / Learning</p>
            <h1 className="text-[27px] font-semibold tracking-[-0.04em]">Roles & skills</h1>
            <p className="mt-1 max-w-[720px] text-[13px] leading-5 text-[#617079]">Find the work a role handles, its handoffs, learning topics, and proposed agent skill designs.</p>
          </div>
          <span className="rounded-full border border-[#d9cbaa] bg-[#faf6ed] px-3 py-1.5 text-[11px] font-semibold text-[#806124]">Role drafts · rev {roleCatalog.revision}</span>
        </div>

        <div className="mb-5 rounded-md border-l-[3px] border-[#987b41] bg-[#fffdf8] px-4 py-3 text-[12px] leading-5 text-[#565b59]">
          Workflow owns draft roles, workflows, and learning. AlamoAgent skill cards are imported read-only (rev {skillSnapshot.revision}). These are not approved procedures, staff assignments, permission grants, or enabled agents. Alamo Workforce owns staff and credential records.
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border border-[#d6dfe0] bg-white p-1" aria-label="Library type">
            {(['roles', 'skills'] as const).map((item) => <button
              key={item}
              type="button"
              onClick={() => { setTab(item); setMobileDetail(false) }}
              aria-pressed={tab === item}
              className={`rounded px-4 py-2 text-[13px] font-semibold capitalize transition-colors ${tab === item ? 'bg-[#e4f1e9] text-[#075d47]' : 'text-[#5c6a73] hover:bg-[#f3f6f5]'}`}
            >{item === 'roles' ? 'Roles' : 'Agent skills'} <span className="ml-1 text-[11px] font-normal opacity-70">{item === 'roles' ? roleCatalog.roles.length : skillSnapshot.skills.length}</span></button>)}
          </div>
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setMobileDetail(false) }}
            placeholder={tab === 'roles' ? 'Search roles, work, or knowledge…' : 'Search skills, inputs, or owners…'}
            aria-label={`Search ${tab}`}
            className="min-w-[230px] flex-1 rounded-md border border-[#cfd9da] bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#087b60]"
          />
          <select value={appFilter} onChange={(event) => { setAppFilter(event.target.value); setMobileDetail(false) }} aria-label="Filter by application" className="rounded-md border border-[#cfd9da] bg-white px-3 py-2.5 text-[13px] text-[#324149]">
            <option value="all">All applications</option>
            {roleCatalog.applications.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
          </select>
        </div>

        <div className="grid min-h-[610px] gap-4 md:grid-cols-[minmax(250px,330px)_minmax(0,1fr)]">
          <aside ref={listRef} className={`${mobileDetail ? 'hidden md:block' : ''} overflow-hidden rounded-lg border border-[#d6dfe0] bg-white`} aria-label={`${tab} list`}>
            <div className="border-b border-[#dfe5e5] bg-[#f8faf9] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#5b6c70]">
              {tab === 'roles' ? `${roles.length} role families` : `${skills.length} skill cards`}
            </div>
            <div className="max-h-[720px] overflow-y-auto p-2">
              {(tab === 'roles' ? roles : skills).length === 0 && <p className="p-4 text-[13px] text-[#677780]">No matches. Try a different term or application.</p>}
              {tab === 'roles' && roles.map((role) => <button key={role.id} type="button" onClick={() => { setSelectedRoleId(role.id); setMobileDetail(true); revealDetail() }} aria-current={selectedRole?.id === role.id ? 'true' : undefined} className={`mb-1 w-full rounded-md border-l-[3px] px-3 py-3 text-left transition-colors ${selectedRole?.id === role.id ? 'border-[#087b60] bg-[#e9f4ef]' : 'border-transparent hover:bg-[#f4f7f6]'}`}>
                <span className="block text-[13px] font-semibold leading-5">{role.title}</span>
                <span className="mt-1 block text-[11px] leading-4 text-[#677780]">{role.workflows.length} workflows · {groundingLabel(role.grounding)}</span>
              </button>)}
              {tab === 'skills' && skills.map((skill) => <button key={skill.id} type="button" onClick={() => { setSelectedSkillId(skill.id); setMobileDetail(true); revealDetail() }} aria-current={selectedSkill?.id === skill.id ? 'true' : undefined} className={`mb-1 w-full rounded-md border-l-[3px] px-3 py-3 text-left transition-colors ${selectedSkill?.id === skill.id ? 'border-[#087b60] bg-[#e9f4ef]' : 'border-transparent hover:bg-[#f4f7f6]'}`}>
                <span className="block text-[13px] font-semibold leading-5">{skill.title}</span>
                <span className="mt-1 block text-[11px] leading-4 text-[#677780]">{skill.family} · {skill.implementation === 'local-synthetic' ? 'Local synthetic' : 'Design only'}</span>
              </button>)}
            </div>
          </aside>

          <main ref={detailRef} className={`${mobileDetail ? '' : 'hidden md:block'} min-w-0 rounded-lg border border-[#d6dfe0] bg-white`}>
            <button type="button" onClick={revealList} className="m-4 text-[12px] font-semibold text-[#087b60] md:hidden">← Back to {tab}</button>
            {tab === 'roles' && selectedRole && <RoleDetail role={selectedRole} onOpenRole={openRole} onOpenSkill={openSkill} />}
            {tab === 'skills' && selectedSkill && <SkillDetail skill={selectedSkill} onOpenRole={openRole} />}
            {((tab === 'roles' && !selectedRole) || (tab === 'skills' && !selectedSkill)) && <p className="p-6 text-[13px] text-[#677780]">No item selected.</p>}
          </main>
        </div>
      </div>
    </div>
  )
}

function RoleDetail({ role, onOpenRole, onOpenSkill }: { role: Role; onOpenRole: (id: string) => void; onOpenSkill: (id: string) => void }) {
  return <div className="p-5 sm:p-7">
    <div className="border-b border-[#e0e6e6] pb-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#087b60]">Role family · {groundingLabel(role.grounding)} · Needs review</p>
      <h2 className="mt-2 text-[25px] font-semibold leading-tight tracking-[-0.035em]">{role.title}</h2>
      <p className="mt-3 max-w-[850px] text-[14px] leading-6 text-[#45545b]">{role.mission}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{role.applications.map((id) => <span key={id} className="rounded border border-[#dce6e2] bg-[#f5f9f7] px-2 py-1 text-[11px] text-[#326153]">{appById.get(id) ?? id}</span>)}</div>
    </div>
    <div className="grid gap-6 border-b border-[#e0e6e6] py-5 lg:grid-cols-2">
      <section><Label>Scope</Label><p className="text-[13px] leading-6 text-[#42515a]">{role.scope}</p></section>
      <InfoBlock title="Working rhythm" items={role.cadence} />
      <InfoBlock title="What this role needs to know" items={role.knowledge} />
      <InfoBlock title="Proposed measures" items={role.measures} />
    </div>
    <section className="py-5">
      <div className="mb-3 flex items-end justify-between gap-3"><div><Label>Workflows & handoffs</Label><p className="text-[12px] text-[#718087]">Open a workflow to see its trigger, path, evidence, and next owner.</p></div><span className="text-[12px] text-[#718087]">{role.workflows.length} workflows</span></div>
      <div className="space-y-2">{role.workflows.map((flow, index) => <details key={flow.id} open={index === 0 ? true : undefined} className="group rounded-md border border-[#dce3e3] bg-[#fbfcfc] px-4 py-3">
        <summary className="cursor-pointer list-none font-semibold text-[14px] text-[#26363d] [&::-webkit-details-marker]:hidden"><span className="mr-3 text-[11px] font-mono text-[#76858b]">{String(index + 1).padStart(2, '0')}</span>{flow.title}<span className="float-right text-[#7f8b8e] group-open:rotate-180">⌄</span><span className="mt-1 block pl-7 text-[11px] font-normal text-[#728087]">{flow.grounding === 'source-supported' ? 'Source-supported workflow' : 'Inferred workflow - staff review needed'}</span></summary>
        <div className="mt-4 grid gap-4 border-t border-[#e2e8e8] pt-4 lg:grid-cols-2">
          <section><Label>Trigger</Label><p className="text-[13px] leading-5 text-[#42515a]">{flow.trigger}</p></section>
          <InfoBlock title="Inputs to check" items={flow.inputs} />
          <div className="lg:col-span-2"><InfoBlock title="Working path" items={flow.steps} /></div>
          <section><Label>Source outcome to verify</Label><p className="text-[13px] leading-6 text-[#42515a]">{flow.sourceOutcome}</p></section>
          <section><Label>Exception / stop</Label><p className="text-[13px] leading-6 text-[#42515a]">{flow.exception}</p></section>
          <section><Label>Handoff partners</Label><div className="flex flex-wrap gap-2">{flow.handoffTo.length ? flow.handoffTo.map((id) => <button key={id} type="button" onClick={() => onOpenRole(id)} className="rounded border border-[#cddddd] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#0b6654] hover:bg-[#eaf4ef]">{roleById.get(id)?.title ?? id} ↗</button>) : <span className="text-[12px] text-[#718087]">None listed</span>}</div></section>
          <section><Label>Linked skill designs</Label><div className="flex flex-wrap gap-2">{flow.skillIds.map((id) => <button key={id} type="button" onClick={() => onOpenSkill(id)} className="rounded border border-[#cddddd] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#0b6654] hover:bg-[#eaf4ef]">{skillById.get(id)?.title ?? id} ↗</button>)}</div></section>
        </div>
      </details>)}</div>
    </section>
    <div className="grid gap-6 border-t border-[#e0e6e6] py-5 lg:grid-cols-2">
      <section><Label>Shared assistance designs</Label><div className="flex flex-wrap gap-2">{role.sharedSkillIds.map((id) => <button key={id} type="button" onClick={() => onOpenSkill(id)} className="rounded border border-[#cddddd] px-2.5 py-1.5 text-[12px] text-[#0b6654] hover:bg-[#eaf4ef]">{skillById.get(id)?.title ?? id} ↗</button>)}</div></section>
      <InfoBlock title="Questions for staff review" items={role.questions} />
      <InfoBlock title="Source basis" items={sourceLabels(role.sources, roleCatalog.sources)} />
    </div>
  </div>
}

function SkillDetail({ skill, onOpenRole }: { skill: Skill; onOpenRole: (id: string) => void }) {
  return <div className="p-5 sm:p-7">
    <div className="border-b border-[#e0e6e6] pb-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#087b60]">Skill design · {skill.family} · v{skill.version}</p>
      <h2 className="mt-2 text-[25px] font-semibold leading-tight tracking-[-0.035em]">{skill.title}</h2>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span className="rounded border border-[#d9cbaa] bg-[#faf6ed] px-2 py-1 text-[#806124]">Draft · needs review</span>
        <span className="rounded border border-[#cddddd] bg-[#f2f7f5] px-2 py-1 text-[#326153]">{skill.implementation === 'local-synthetic' ? 'Local synthetic only' : 'Design only'}</span>
        <span className="rounded border border-[#dce3e3] px-2 py-1 text-[#607078]">Not enabled by this library</span>
      </div>
      <p className="mt-4 text-[14px] leading-6 text-[#45545b]">{skill.trigger}</p>
    </div>
    <div className="grid gap-6 border-b border-[#e0e6e6] py-5 lg:grid-cols-2">
      <section><Label>Proposed owner roles</Label><div className="flex flex-wrap gap-2">{skill.ownerRoleIds.map((id) => <button key={id} type="button" onClick={() => onOpenRole(id)} className="rounded border border-[#cddddd] px-2.5 py-1.5 text-[12px] text-[#0b6654] hover:bg-[#eaf4ef]">{roleById.get(id)?.title ?? id} ↗</button>)}</div></section>
      <section><Label>Application context</Label><div className="flex flex-wrap gap-1.5">{skill.applications.map((id) => <span key={id} className="rounded border border-[#dce6e2] bg-[#f5f9f7] px-2 py-1 text-[11px] text-[#326153]">{appById.get(id) ?? id}</span>)}</div></section>
      <InfoBlock title="Required context" items={skill.inputs} />
      <InfoBlock title="Bounded work" items={skill.steps} />
      <InfoBlock title="Draft output fields" items={skill.outputFields} />
      <InfoBlock title="Dependencies" items={skill.dependencies} />
      <section><Label>Human review</Label><p className="text-[13px] leading-6 text-[#42515a]">{skill.humanReview}</p></section>
      <section><Label>Completion evidence</Label><p className="text-[13px] leading-6 text-[#42515a]">{skill.completion}</p></section>
      <InfoBlock title="Stop conditions" items={skill.stopConditions} />
      <InfoBlock title="Proposed evaluation cases, not test results" items={skill.evaluationCases} />
      <InfoBlock title="Source basis" items={sourceLabels(skill.sources, skillSnapshot.sources)} />
    </div>
    <p className="pt-4 text-[12px] leading-5 text-[#68777d]">A card does not register an agent tool, grant source-system access, or establish approval. Exact source actions require separate app contracts and human authorization.</p>
  </div>
}
