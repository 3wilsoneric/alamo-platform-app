'use client'

import { useEffect, useState } from 'react'
import { knowledgeClient, relationshipLabel } from '@/lib/knowledge-client'
import type { KnowledgeEdge, KnowledgeGraph, KnowledgeImpact, KnowledgeNode } from '@/lib/knowledge-types'
import EvidenceButton from './EvidenceButton'
import './knowledge.css'

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Knowledge could not be loaded.'
const displayType = (type: string) => type === 'skill' ? 'Skill design' : type.charAt(0).toUpperCase() + type.slice(1)
const statusLabel = (node: KnowledgeNode) => node.origin === 'library' ? 'Library draft' : ({ draft: 'Saved draft', in_review: 'Submitted for review', approved: 'Approved document', published: 'Published document' } as Record<string, string>)[node.status] ?? node.status
const dateLabel = (date: string) => new Date(date).toLocaleString()

function ConnectionMap({ selected, edges, nodes, onSelect }: { selected: KnowledgeNode; edges: KnowledgeEdge[]; nodes: Map<string, KnowledgeNode>; onSelect: (id: string) => void }) {
  const distinct = [...new Map(edges.map(edge => { const id = edge.from === selected.id ? edge.to : edge.from; return [id, { node: nodes.get(id), edge }] })).values()].filter(item => item.node)
  // Start with one of each relationship so the small map represents different kinds of connections.
  const representatives = [...new Map(distinct.map(item => [item.edge.predicate, item])).values()]
  const nearby = [...representatives, ...distinct.filter(item => !representatives.includes(item))].slice(0, 6)
  const points = [{ x: 15, y: 17 }, { x: 85, y: 17 }, { x: 15, y: 50 }, { x: 85, y: 50 }, { x: 15, y: 83 }, { x: 85, y: 83 }]
  return <figure className="knowledge-map-wrap">
    <div className="knowledge-map" aria-label="Nearby knowledge map">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {nearby.map((item, i) => <line key={item.node!.id} x1="50" y1="50" x2={points[i]!.x} y2={points[i]!.y} className={item.edge.origin === 'proposal' ? 'proposed' : ''} />)}
      </svg>
      <div className="knowledge-map-center"><span>{displayType(selected.type)}</span><strong>{selected.title}</strong></div>
      {nearby.map((item, i) => <button type="button" className="knowledge-map-node" key={item.node!.id} style={{ left: `${points[i]!.x}%`, top: `${points[i]!.y}%` }} onClick={() => onSelect(item.node!.id)} title={item.node!.title}>
        <span>{displayType(item.node!.type)}</span><strong>{item.node!.title}</strong></button>)}
      {!nearby.length && <p className="knowledge-map-empty">Connect this draft to a role, workflow, or source to start its map.</p>}
    </div>
    <figcaption>{nearby.length} of {distinct.length} connected entities shown. All relationships and their direction appear below.</figcaption>
  </figure>
}

export default function KnowledgeView() {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectedId, setSelectedId] = useState('role:assessor')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [tab, setTab] = useState<'explore' | 'review' | 'changes'>('explore')
  const [baseline, setBaseline] = useState('')
  const [impact, setImpact] = useState<KnowledgeImpact | null>(null)
  const [comparing, setComparing] = useState(false)
  useEffect(() => {
    let active = true
    knowledgeClient.graph().then(result => { if (active) setGraph(result) }).catch(error => { if (active) setError(messageOf(error)) })
    return () => { active = false }
  }, [])
  async function refresh() {
    setBusy(true); setError('')
    try { setGraph(await knowledgeClient.graph()); setImpact(null) }
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
  const selected = nodes.get(selectedId)
  const visible = graph?.nodes.filter(node => (type === 'all' || node.type === type) && `${node.title} ${node.description} ${node.id}`.toLowerCase().includes(query.toLowerCase())) ?? []
  const connections = graph?.edges.filter(edge => edge.from === selectedId || edge.to === selectedId) ?? []
  const proposals = graph?.proposals.filter(item => ['proposed', 'approved'].includes(item.status)) ?? []
  const stale = proposals.filter(item => item.freshness === 'needs_review')
  const select = (id: string) => { setSelectedId(id); setTab('explore') }
  return <section className="knowledge-workspace" aria-label="Knowledge explorer">
    <header className="knowledge-heading"><div><span className="knowledge-eyebrow">Connected knowledge</span><h1>The knowledge behind the work.</h1><p>Explore how roles, procedures, workflows, and tools connect—and see the source behind each relationship.</p></div>
      <button onClick={() => void refresh()} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh knowledge'}</button></header>
    <p className="knowledge-preview">Shared Workflow · Owner-only pilot · Library content retains its draft and review labels. Proposed links are unapproved.</p>
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    {!graph ? <div className="knowledge-empty"><h2>{error ? 'Knowledge storage is unavailable' : 'Building the source map…'}</h2><p>{error ? 'Verify your sign-in and retry. The source library remains available in Documents.' : 'Reading versioned library sources and saved drafts.'}</p></div> : <>
      <div className="knowledge-stats"><div><strong>{graph.nodes.length}</strong><span>Connected entities</span></div><div><strong>{graph.edges.filter(edge => edge.origin === 'library').length}</strong><span>Library relationships</span></div><div><strong>{proposals.length}</strong><span>Authored connections</span></div><div><strong>{stale.length}</strong><span>Changed evidence</span></div></div>
      <nav className="knowledge-tabs" aria-label="Knowledge views"><button aria-current={tab === 'explore' ? 'page' : undefined} onClick={() => setTab('explore')}>Explore</button><button aria-current={tab === 'review' ? 'page' : undefined} onClick={() => setTab('review')}>Authored links ({proposals.length})</button><button aria-current={tab === 'changes' ? 'page' : undefined} onClick={() => setTab('changes')}>Source changes</button></nav>
      {tab === 'explore' && <div className="knowledge-layout"><aside className="knowledge-directory" aria-label="Knowledge entities">
        <label>Find knowledge<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Role, procedure, topic…" /></label>
        <label>Entity type<select aria-label="Entity type" value={type} onChange={event => setType(event.target.value)}><option value="all">All types</option>{[...new Set(graph.nodes.map(node => node.type))].sort().map(type => <option key={type} value={type}>{displayType(type)}</option>)}</select></label>
        <p className="knowledge-muted">{visible.length} matches{visible.length > 60 ? ' · First 60 shown' : ''}</p>
        <div className="knowledge-entity-list">{visible.slice(0, 60).map(node => <button key={node.id} aria-current={selectedId === node.id ? 'true' : undefined} onClick={() => select(node.id)}><span>{displayType(node.type)}{node.origin === 'draft' ? ' · Saved draft' : ''}</span><strong>{node.title}</strong></button>)}</div>
        {!visible.length && <p>No matches. Try a broader search.</p>}
      </aside><div className="knowledge-detail">{selected ? <>
        <header className="knowledge-entity-heading"><div className="knowledge-row"><span className="knowledge-badge">{displayType(selected.type)} · {statusLabel(selected)}</span><EvidenceButton label="View entity source" input={{ snapshotId: graph.snapshot.id, nodeId: selected.id }} /></div>
          <h2>{selected.title}</h2><p>{selected.description}</p><small>{selected.grounding.replaceAll('-', ' ')}</small></header>
        <ConnectionMap selected={selected} nodes={nodes} edges={connections} onSelect={select} />
        <div className="knowledge-section-heading"><h3>Relationships <span>{connections.length}</span></h3><p>Follow a connection or inspect its evidence.</p></div>
        <div className="knowledge-connections">{connections.map(edge => { const outgoing = edge.from === selected.id, other = nodes.get(outgoing ? edge.to : edge.from); return <article key={edge.id} className="knowledge-connection">
          <div><span className="knowledge-relation">{outgoing ? '→' : '←'} {relationshipLabel(edge.predicate)}{!outgoing ? ' · incoming' : ''}</span>
            <button className="knowledge-text-button" onClick={() => select(other?.id ?? selected.id)} disabled={!other}>{other?.title ?? 'Entity unavailable'}</button>
            <small>{other ? displayType(other.type) : 'Missing source'} · {edge.origin === 'proposal' ? `${edge.status === 'approved' ? 'Connection approved' : 'Proposed'}${edge.freshness === 'needs_review' ? ' · Evidence changed' : ''}` : 'Library draft'} · {edge.grounding.replaceAll('-', ' ')}</small></div>
          <EvidenceButton input={edge.proposalId ? { proposalId: edge.proposalId, side: 'source' } : { snapshotId: graph.snapshot.id, edgeId: edge.id }} /></article> })}</div>
        {!connections.length && <div className="knowledge-empty"><p>No connections yet. Open this document in Drafts & review to propose one.</p><a href="/workflow?view=drafts">Open drafts →</a></div>}
      </> : <div className="knowledge-empty"><h2>Choose an entity</h2><p>Select a record to explore its connections.</p></div>}</div></div>}
      {tab === 'review' && <section className="knowledge-panel"><h2>Authored connections and decisions</h2><p>Each proposal cites a saved draft revision and a specific target. Evidence changes flag a link for another look; they never approve it.</p>
        {!proposals.length && <div className="knowledge-empty"><h3>Build knowledge as you write</h3><p>Save a draft, then use Knowledge connections to link it to a role, workflow, or source.</p><a href="/workflow?view=drafts">Open drafts →</a></div>}
        {proposals.map(item => <article className="knowledge-proposal" key={item.id}><span className={`knowledge-badge ${item.freshness === 'needs_review' ? 'knowledge-warning' : ''}`}>{item.freshness === 'needs_review' ? 'Evidence changed · Needs review' : item.status === 'approved' ? 'Connection approved' : 'Proposed · Unapproved'}</span>
          <h3><button className="knowledge-text-button" onClick={() => select(`draft:${item.source.draftId}`)}>{nodes.get(`draft:${item.source.draftId}`)?.title ?? 'Source draft'}</button> → {item.targetTitle}</h3><p>{relationshipLabel(item.predicate)} · Draft revision {item.source.revision}</p><blockquote>{item.source.quote}</blockquote><p>{item.rationale}</p>
          {item.staleReasons.map(reason => <p className="knowledge-warning-text" key={reason}>{reason}</p>)}
          <div className="knowledge-actions"><EvidenceButton label="View quoted source" input={{ proposalId: item.id, side: 'source' }} /><EvidenceButton label="View cited target" input={{ proposalId: item.id, side: 'target' }} /></div></article>)}
      </section>}
      {tab === 'changes' && <section className="knowledge-panel"><h2>What changed in the source library?</h2><p>Library snapshots are retained when knowledge is loaded. Compare an earlier snapshot to find changed records and potential dependencies.</p>
        <div className="knowledge-actions"><label>Compare with snapshot<select value={baseline} onChange={event => { setBaseline(event.target.value); setImpact(null) }}><option value="">Choose a previous snapshot</option>{graph.archives.filter(item => item.id !== graph.snapshot.id).map(item => <option value={item.id} key={item.id}>{dateLabel(item.capturedAt)} · {item.id.slice(0, 8)}</option>)}</select></label><button disabled={!baseline || comparing} onClick={() => void compare()}>{comparing ? 'Comparing…' : 'Compare sources'}</button></div>
        {graph.archives.length === 1 && <p className="knowledge-empty">This is the first library snapshot. After a source changes, refresh knowledge to retain a new snapshot and compare it here.</p>}
        {impact && <div className="knowledge-impact" role="status"><h3>{impact.changed.length} changed entities · {impact.affected.length} potential dependencies</h3><p>{impact.notice}</p>
          <ul>{impact.changed.map(item => <li key={item.id}>{item.change}: {item.title}</li>)}</ul><h3>Potential dependencies</h3><ul>{impact.affected.map(item => <li key={item.id}><button className="knowledge-text-button" disabled={!nodes.has(item.id)} onClick={() => select(item.id)}>{item.title}</button> · {item.depth} relationship {item.depth === 1 ? 'step' : 'steps'} away</li>)}</ul></div>}
        <h3 className="knowledge-source-heading">Current source snapshots</h3>{graph.snapshot.sources.map(source => <div className="knowledge-source" key={source.id}><strong>{source.title}</strong><span>Revision {source.revision} · {source.path}</span><code>{source.digest.slice(0, 16)}</code></div>)}
      </section>}
    </>}
  </section>
}
