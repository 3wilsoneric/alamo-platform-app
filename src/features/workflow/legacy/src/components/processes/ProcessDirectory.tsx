'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, FileText, ListChecks, Search, Workflow } from 'lucide-react'
import type { ProcessRecord } from '@/lib/process-types'
import { workflowHref, workflowParams, replaceWorkflowParams } from '@/lib/workflow-navigation'

export function processStatus(status: string) {
  return ({ 'draft-reference': 'Reference · needs review', 'draft_reference': 'Reference · needs review', 'published-needs-review': 'Published · needs review', in_review: 'In review', draft: 'Draft', approved: 'Approved', published: 'Published', retracted: 'Withdrawn' } as Record<string, string>)[status] ?? status.replaceAll('_', ' ').replaceAll('-', ' ')
}

/** A view of the existing process records; it creates no new content or authority. */
export default function ProcessDirectory({ processes, onChoose, disabled = false, compact = false }: {
  processes: ProcessRecord[]; onChoose?: (process: ProcessRecord) => void; disabled?: boolean; compact?: boolean
}) {
  const [query, setQuery] = useState(() => compact ? '' : workflowParams().get('find') ?? '')
  const [kind, setKind] = useState(() => compact ? 'all' : workflowParams().get('kind') ?? 'all')
  const [role, setRole] = useState(() => compact ? 'all' : workflowParams().get('owner') ?? 'all')
  const filters = { ...(query ? { find: query } : {}), ...(kind !== 'all' ? { kind } : {}), ...(role !== 'all' ? { owner: role } : {}) }
  useEffect(() => {
    if (!compact) replaceWorkflowParams({ find: query || undefined, kind: kind === 'all' ? undefined : kind, owner: role === 'all' ? undefined : role })
  }, [compact, query, kind, role])
  const roles = [...new Set(processes.map(item => item.ownerRole).filter(Boolean))].sort()
  const filtered = processes.filter(item => (role === 'all' || item.ownerRole === role)
    && (kind === 'all' || (kind === 'authored' ? item.origin === 'draft' : item.kind === kind))
    && `${item.title} ${item.trigger} ${item.ownerRole} ${item.connections.map(link => link.title).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const displayed = compact ? filtered.slice(0, 6) : filtered
  return <section className={`pf-directory${compact ? ' pf-directory--compact' : ''}`} aria-label="Workflow library">
    <div className="pf-directory-heading"><h2 className={compact ? undefined : 'sr-only'}>{compact ? 'Workflows' : 'Workflow library'}</h2>
      <a href={workflowHref(compact ? 'processes' : 'procedures', compact ? filters : {})}>{compact ? 'Browse all' : 'Procedure walkthroughs'} <ArrowRight size={15} aria-hidden="true" /></a>
    </div>
    <div className="pf-directory-controls">
      <label className="pf-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Find a process</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a workflow, role or application" /></label>
      {!compact && <label className="pf-role-filter"><span className="sr-only">Filter by responsible role</span><select value={role} onChange={event => setRole(event.target.value)}><option value="all">All roles</option>{roles.map(value => <option key={value}>{value}</option>)}</select></label>}
    </div>
    <div className="pf-directory-filters" aria-label="Workflow types">
      {([['all', 'All'], ['workflow', 'Workflows'], ['procedure', 'Procedures'], ['authored', 'Your documents']] as const).map(([value, title]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{title}</button>)}
      <span aria-live="polite">{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</span>
    </div>
    <div className="pf-register-labels" aria-hidden="true"><span>Workflow</span><span>Responsible role</span><span>Status</span><span /></div>
    <ul className="pf-register">
      {displayed.map(item => {
        const Icon = item.origin === 'draft' ? FileText : item.kind === 'procedure' ? ListChecks : Workflow
        const content = <><span className="pf-register-title"><span className="pf-record-icon" data-kind={item.kind}><Icon size={21} aria-hidden="true" /></span><span><strong>{item.title}</strong><small>{item.steps.length ? `${item.steps.length} steps` : 'Steps not defined'}{item.trigger ? ` · ${item.trigger}` : ''}</small></span></span><span className="pf-register-role">{item.ownerRole || 'Owner not defined'}</span><span className="pf-status" data-state={item.status}>{processStatus(item.status)}</span><ArrowRight className="pf-register-arrow" size={18} aria-hidden="true" /></>
        return <li key={item.id}>{onChoose ? <button type="button" disabled={disabled} onClick={() => onChoose(item)}>{content}</button> : <a href={workflowHref('processes', { process: item.id })}>{content}</a>}</li>
      })}
    </ul>
    {!filtered.length && <div className="pf-no-results"><p>No workflows match these filters.</p><button type="button" onClick={() => { setQuery(''); setKind('all'); setRole('all') }}>Clear filters</button></div>}
    {compact && filtered.length > displayed.length && <a className="pf-directory-more" href={workflowHref('processes', filters)}>View all {filtered.length} results <ArrowRight size={16} aria-hidden="true" /></a>}
  </section>
}
