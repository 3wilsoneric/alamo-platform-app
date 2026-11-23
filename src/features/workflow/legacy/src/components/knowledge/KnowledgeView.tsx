'use client'

import { useEffect, useState } from 'react'
import { knowledgeClient, relationshipLabel } from '@/lib/knowledge-client'
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeImpact, KnowledgeNode } from '@/lib/knowledge-types'
import { workflowHref, workflowParams, replaceWorkflowParams } from '@/lib/workflow-navigation'
import assessorLibrary from '../../../content/assessor/procedures.v1.json'
import EvidenceButton from './EvidenceButton'
import { processClient } from '@/lib/process-client'
import SopStarter from './SopStarter'
import './knowledge.css'

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Knowledge could not be loaded.'
const displayType = (type: string) => ({ data_schema: 'Table schema', data_column: 'Column', sop_starter: 'SOP starter', skill: 'Skill design', pipeline_field: 'Assessment field', pipeline_section: 'Assessment section', pipeline_domain: 'Pipeline area' } as Record<string, string>)[type] ?? (type.charAt(0).toUpperCase() + type.slice(1)).replaceAll('_', ' ')
const statusLabel = (node: KnowledgeNode) => node.id.startsWith('pipeline:') ? 'Source definition · Unreviewed' : ['data_schema', 'data_column'].includes(node.type) ? 'Observed schema · Meaning unreviewed' : node.origin === 'library' ? 'Library draft' : ({ draft: 'Saved draft', in_review: 'Submitted for review', approved: 'Approved document', published: 'Published document', retracted: 'Retracted', 'published-needs-review': 'Published · Needs review', 'source-reference': 'Retained evidence · Unapproved' } as Record<string, string>)[node.status] ?? node.status.replaceAll('_', ' ')
const edgeLabel = (edge: KnowledgeEdge) => edge.origin === 'library' ? 'Library draft' : edge.status === 'suggested' ? 'Suggested match · Unreviewed' : edge.origin === 'projection' ? (edge.predicate === 'has_evidence' ? 'Source evidence · Unapproved' : `Authored structure · ${edge.status.replaceAll('-', ' ').replaceAll('_', ' ')}`) : `${edge.status === 'approved' ? 'Connection approved' : 'Proposed'}${edge.freshness === 'needs_review' ? ' · Evidence changed' : ''}`
const dateLabel = (date: string) => new Date(date).toLocaleString()


export default function KnowledgeView() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState(() => workflowParams().get('entity') ?? 'role:assessor')
  const [query, setQuery] = useState(() => workflowParams().get('q') ?? '')
  const [type, setType] = useState(() => workflowParams().get('type') ?? (workflowParams().has('entity') ? 'all' : 'role'))
  const [limit, setLimit] = useState(60)
  const [trail, setTrail] = useState<string[]>([])
  const [pocScope, setPocScope] = useState(() => workflowParams().get('scope') === 'poc')
  const [tab, setTab] = useState<'explore' | 'review' | 'changes'>(() => { const value = workflowParams().get('tab'); return value === 'review' || value === 'changes' ? value : 'explore' })
  const [baseline, setBaseline] = useState('')
  const [impact, setImpact] = useState<KnowledgeImpact | null>(null)
  const [comparing, setComparing] = useState(false)
  useEffect(() => {
    let active = true
    processClient.graph().then(result => { if (active) setGraph(result) }).catch(error => { if (active) setError(messageOf(error)) })
    return () => { active = false }
  }, [])
  async function refresh() {
    setBusy(true); setError('')
    try { setGraph(await processClient.graph()); setImpact(null) }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }
  async function compare() {
    if (!baseline) return
    setComparing(true); setError('')
    try { setImpact(await knowledgeClient.impact(baseline)) }
    catch (error) { setError(messageOf(error)) }
    finally { setComparing(false) }
  }
  const nodes = new Map(graph?.nodes.map(node => [node.id, node]))
  const pocRoles = new Set(graph?.edges.filter(edge => edge.to === 'application:alamopoc' && edge.predicate === 'uses_application').map(edge => edge.from))
  const visible = graph?.nodes.filter(node => (!pocScope || node.id.startsWith('ontology:') || node.id.startsWith('poc:') || node.id.startsWith('workflow:poc-') || node.id === 'application:alamopoc' || pocRoles.has(node.id)) && (type === 'all' || node.type === type) && `${node.title} ${node.description} ${node.id}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const selected = selectedId ? visible.find(node => node.id === selectedId) : visible[0]
  const procedure = selected?.type === 'procedure' ? assessorLibrary.procedures.find(item => `procedure:${item.id}` === selected.id) : undefined
  const connections = graph?.edges.filter(edge => edge.from === selected?.id || edge.to === selected?.id) ?? []
  const nextTypes = selected?.type === 'application' ? ['role'] : selected?.type === 'role' || selected?.type === 'operating_area' ? ['workflow'] : selected?.type === 'workflow' ? ['sop_starter', 'procedure'] : []
  const nextSteps = [...new Map(connections.map(edge => { const other = nodes.get(edge.from === selected?.id ? edge.to : edge.from); return [other?.id, other] })).values()].filter((node): node is KnowledgeNode => !!node && nextTypes.includes(node.type))
  useEffect(() => {
    if (graph) replaceWorkflowParams({ view: 'knowledge', entity: selected?.id ?? (selectedId || undefined), type, q: query || undefined, scope: pocScope ? 'poc' : undefined, tab: tab === 'explore' ? undefined : tab })
  }, [graph, selected?.id, selectedId, type, query, pocScope, tab])
  const proposals = graph?.proposals.filter(item => ['proposed', 'approved'].includes(item.status)) ?? []
  const stale = proposals.filter(item => item.freshness === 'needs_review')
  const select = (id: string, remember = true) => {
    if (remember && selected && selected.id !== id) setTrail(current => [...current, selected.id].slice(-12))
    const node = nodes.get(id)
    setSelectedId(id); setQuery(''); setType(node?.type ?? 'all'); setLimit(60); setTab('explore')
    if (!(id.startsWith('ontology:') || id.startsWith('poc:') || id.startsWith('workflow:poc-') || id === 'application:alamopoc' || pocRoles.has(id))) setPocScope(false)
  }
  const filterType = (value: string) => { setTrail([]); setType(value); setSelectedId(''); setQuery(''); setLimit(60) }
  return <section className="knowledge-workspace" aria-label="Knowledge explorer">
    <header className="knowledge-heading">
      <button onClick={() => void refresh()} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh knowledge'}</button></header>
    <p className="knowledge-preview">Source material and proposed connections. Review labels show what has been verified.</p>
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    {!graph ? <div className="knowledge-empty"><h2>{error ? 'Knowledge storage is unavailable' : 'Building the source map…'}</h2><p>{error ? 'Verify your sign-in and retry. The source library remains available in Documents.' : 'Reading versioned library sources and saved drafts.'}</p></div> : <>
      <p className="knowledge-catalog-summary">{graph.nodes.length.toLocaleString()} source records · {stale.length} authored links with changed evidence</p>
      <nav className="knowledge-tabs" aria-label="Knowledge views"><button aria-current={tab === 'explore' && !pocScope && type !== 'application' ? 'page' : undefined} onClick={() => { setTab('explore'); setPocScope(false); filterType('role') }}>Explore</button><button aria-current={tab === 'explore' && (pocScope || type === 'application') ? 'page' : undefined} onClick={() => { setTab('explore'); setPocScope(false); filterType('application') }}>Applications</button><button aria-current={tab === 'review' ? 'page' : undefined} onClick={() => setTab('review')}>Authored links ({proposals.length})</button><button aria-current={tab === 'changes' ? 'page' : undefined} onClick={() => setTab('changes')}>Source changes</button></nav>
      {tab === 'explore' && pocScope && <nav className="knowledge-poc-nav" aria-label="Carelog context areas"><p>Carelog operating map</p>{([['operating_area', 'Operating areas'], ['role', 'Roles'], ['workflow', 'Workflows'], ['sop_starter', 'SOP starters'], ['module', 'Software'], ['data_entity', 'Data'], ['data_finding', 'Live findings'], ['review_question', 'Review questions']] as const).map(([value, label]) => <button key={value} aria-pressed={type === value} onClick={() => filterType(value!)}>{label}</button>)}</nav>}
      {tab === 'explore' && <div className="knowledge-layout"><aside className="knowledge-directory" aria-label="Knowledge entities">
        <label>Find knowledge<input value={query} onChange={event => { setTrail([]); setQuery(event.target.value); setSelectedId(''); setLimit(60) }} placeholder="Role, procedure, topic…" /></label>
        <label>Entity type<select aria-label="Entity type" value={type} onChange={event => { setTrail([]); setType(event.target.value); setSelectedId(''); setLimit(60) }}><option value="all">All types</option>{[...new Set(graph.nodes.map(node => node.type))].sort().map(type => <option key={type} value={type}>{displayType(type)}</option>)}</select></label>
        <p className="knowledge-muted">{visible.length} matches{visible.length > limit ? ` · First ${limit} shown` : ''}</p>
        <div className="knowledge-entity-list">{visible.slice(0, limit).map(node => <button key={node.id} aria-current={selected?.id === node.id ? 'true' : undefined} onClick={() => select(node.id)}><span>{displayType(node.type)}{node.origin !== 'library' ? ` · ${statusLabel(node)}` : ''}</span><strong>{node.title}</strong></button>)}</div>
        {visible.length > limit && <button onClick={() => setLimit(value => value + 60)}>Show more results</button>}
        {!visible.length && <p>No matches. Try a broader search.</p>}
      </aside><div className="knowledge-detail">{selected ? <>
        {trail.length > 0 && <div className="knowledge-next"><button onClick={() => { const previous = trail[trail.length - 1]; setTrail(current => current.slice(0, -1)); if (previous) select(previous, false) }}>← Back to {nodes.get(trail[trail.length - 1]!)?.title ?? 'previous item'}</button></div>}
        <header className="knowledge-entity-heading"><div className="knowledge-row"><span className="knowledge-badge">{displayType(selected.type)} · {statusLabel(selected)}</span><EvidenceButton key={`${selected.id}:${selected.citation?.revision ?? graph.snapshot.id}`} label="View entity source" {...(selected.citation ? { citation: selected.citation } : { input: { snapshotId: graph.snapshot.id, nodeId: selected.id } })} /></div>
          <h2>{selected.title}</h2>{selected.description && !['principal-app', 'adjacent-authoritative-source'].includes(selected.description) && <p>{selected.description}</p>}<small>{selected.grounding.replaceAll('-', ' ')}</small></header>
        {selected.type === 'application' && selected.id === 'application:alamopoc' && <div className="knowledge-next"><button onClick={() => { setPocScope(true); filterType('operating_area') }}>Explore Carelog operating map →</button></div>}
        {selected.type === 'workflow' && <div className="knowledge-next"><a href={workflowHref('drafts', { action: 'sop' })}>Write an SOP →</a></div>}
        {procedure && <div className="knowledge-next"><a href={workflowHref('procedures', { procedure: String(procedure.procedureId) })}>Read the procedure & open its walkthrough →</a></div>}
        {selected.type === 'sop_starter' && <SopStarter key={`${graph.snapshot.id}:${selected.id}`} snapshotId={graph.snapshot.id} nodeId={selected.id} />}
        {nextSteps.length > 0 && <section className="knowledge-next" aria-label="Continue this process"><h3>Related guidance</h3>{nextSteps.slice(0, 6).map(node => <button key={node.id} onClick={() => select(node.id)}><small>{displayType(node.type)}</small><strong>{node.title} →</strong></button>)}</section>}
        {selected.process && <div className="knowledge-next" aria-label="Owning guide"><span>{selected.process.title} · Revision {selected.process.revision}</span><a href={workflowHref('processes', { process: selected.process.id })}>Open process →</a><a href={workflowHref('drafts', { draft: selected.process.documentId })}>Open current guide →</a></div>}
        <div className="knowledge-section-heading"><h3>How this connects <span>{connections.length}</span></h3></div>
        <div className="knowledge-connections">{connections.map(edge => { const outgoing = edge.from === selected.id, other = nodes.get(outgoing ? edge.to : edge.from); return <article key={edge.id} className="knowledge-connection">
          <div><span className="knowledge-relation">{outgoing ? selected.title : other?.title ?? 'Unavailable source'} <b>{relationshipLabel(edge.predicate).toLowerCase()}</b> {outgoing ? other?.title ?? 'Unavailable source' : selected.title}</span>
            <button className="knowledge-text-button" onClick={() => select(other?.id ?? selected.id)} disabled={!other}>Open {other?.title ?? 'unavailable record'} →</button>
            <small>{other ? displayType(other.type) : 'Missing source'} · {edgeLabel(edge)} · {edge.grounding.replaceAll('-', ' ')}</small></div>
          <EvidenceButton key={`${edge.id}:${edge.citation?.revision ?? graph.snapshot.id}`} {...(edge.citation ? { citation: edge.citation } : { input: edge.proposalId ? { proposalId: edge.proposalId, side: 'source' as const } : { snapshotId: graph.snapshot.id, edgeId: edge.id } })} /></article> })}</div>
        {!connections.length && <div className="knowledge-empty"><p>No connections yet. Open this document in Drafts & review to propose one.</p><a href="/workflow?view=drafts">Open drafts →</a></div>}
      </> : <div className="knowledge-empty"><p>{selectedId ? 'This entity is unavailable in the current map or filters. Choose another record or refresh.' : 'Select a record.'}</p></div>}</div></div>}
      {tab === 'review' && <section className="knowledge-panel"><h2 className="sr-only">Connections and decisions</h2>
        {!proposals.length && <div className="knowledge-empty"><h3>No proposed connections</h3><a href="/workflow?view=drafts">Open drafts →</a></div>}
        {proposals.map(item => <article className="knowledge-proposal" key={item.id}><span className={`knowledge-badge ${item.freshness === 'needs_review' ? 'knowledge-warning' : ''}`}>{item.freshness === 'needs_review' ? 'Evidence changed · Needs review' : item.status === 'approved' ? 'Connection approved' : 'Proposed · Unapproved'}</span>
          <h3><button className="knowledge-text-button" onClick={() => select(`draft:${item.source.draftId}`)}>{nodes.get(`draft:${item.source.draftId}`)?.title ?? 'Source draft'}</button> → {item.targetTitle}</h3><p>{relationshipLabel(item.predicate)} · Draft revision {item.source.revision}</p><blockquote>{item.source.quote}</blockquote><p>{item.rationale}</p>
          {item.staleReasons.map(reason => <p className="knowledge-warning-text" key={reason}>{reason}</p>)}
          <div className="knowledge-actions"><EvidenceButton label="View quoted source" input={{ proposalId: item.id, side: 'source' }} /><EvidenceButton label="View cited target" input={{ proposalId: item.id, side: 'target' }} /></div></article>)}
      </section>}
      {tab === 'changes' && <section className="knowledge-panel"><h2 className="sr-only">Source changes</h2><p>Compare reference library snapshots here. For guide revisions and their dependencies, <a href={workflowHref('processes')}>open process review</a>.</p>
        <div className="knowledge-actions"><label>Compare with snapshot<select value={baseline} onChange={event => { setBaseline(event.target.value); setImpact(null) }}><option value="">Choose a previous snapshot</option>{graph.archives.filter(item => item.id !== graph.snapshot.id).map(item => <option value={item.id} key={item.id}>{dateLabel(item.capturedAt)} · {item.id.slice(0, 8)}</option>)}</select></label><button disabled={!baseline || comparing} onClick={() => void compare()}>{comparing ? 'Comparing…' : 'Compare sources'}</button></div>
        {graph.archives.length === 1 && <p className="knowledge-empty">This is the first library snapshot. After a source changes, refresh knowledge to retain a new snapshot and compare it here.</p>}
        {impact && <div className="knowledge-impact" role="status"><h3>{impact.changed.length} changed entities · {impact.affected.length} potential dependencies</h3><p>{impact.notice}</p>
          <ul>{impact.changed.map(item => <li key={item.id}>{item.change}: {item.title}</li>)}</ul><h3>Potential dependencies</h3><ul>{impact.affected.map(item => <li key={item.id}><button className="knowledge-text-button" disabled={!nodes.has(item.id)} onClick={() => select(item.id)}>{item.title}</button> · {item.depth} relationship {item.depth === 1 ? 'step' : 'steps'} away</li>)}</ul></div>}
        <h3 className="knowledge-source-heading">Current source snapshots</h3>{graph.snapshot.sources.map(source => <div className="knowledge-source" key={source.id}><strong>{source.title}</strong><span>Revision {source.revision} · {source.path}</span><code>{source.digest.slice(0, 16)}</code></div>)}
      </section>}
    </>}
  </section>
}
