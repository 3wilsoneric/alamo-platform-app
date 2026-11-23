import type { ChangeImpact as Report } from '@/lib/process-types'
import { workflowHref } from '@/lib/workflow-navigation'

const label = (value: string) => value.replaceAll('_', ' ')
export default function ChangeImpact({ report, processId, focus = false }: { report: Report; processId?: string; focus?: boolean }) {
  const publications = focus && processId ? report.publications.filter(guide => guide.processId === processId || guide.findings.some(finding => finding.path.some(item => item.nodeId === processId))) : report.publications
  const affected = new Set([...publications.map(guide => guide.processId), ...(processId ? [processId] : [])])
  const connections = focus ? report.connections.filter(link => affected.has(link.from) || affected.has(link.to)) : report.connections
  const learning = focus ? report.learning.filter(record => affected.has(record.processId)) : report.learning
  const { limits } = report
  return <section className="pw-impact" aria-label="Change impact">
    <p>{focus ? 'For this guide and its dependents' : 'Across this workspace'}: {publications.length} published guides, {connections.length} connections and {learning.length} of your learning records need review.</p>
    {report.truncated && <p role="status">The report reached a limit. Additional impact may remain.</p>}
    {publications.map(guide => <details key={guide.id} className="pw-impact-guide" open={guide.processId === processId}>
      <summary>{guide.title}<small>Published revision {guide.contentRevision} · {label(guide.status)}</small></summary>
      {guide.findings.map((finding, index) => <div key={index} className="pw-impact-path"><p>{finding.reason}</p><ol aria-label="Dependency path">{finding.path.map((item, step) => <li key={`${item.nodeId}:${step}`}>
        {item.predicate && <small>{label(item.predicate)} · {item.relationshipStatus === 'approved' ? 'approved connection' : `unreviewed connection (${item.relationshipStatus ?? 'unknown'})`}</small>}
        {item.available ? <a href={item.publicationId ? workflowHref('training', { publication: item.publicationId }) : workflowHref('knowledge', { entity: item.nodeId })}>{item.title}</a> : <span>{item.title}</span>}
        <small>{label(item.sourceStatus)}</small>
        {item.expectedFingerprint && <details><summary>Source versions</summary><p>Referenced: <code>{item.expectedFingerprint}</code></p><p>Current: <code>{item.currentFingerprint ?? 'Unavailable'}</code></p></details>}
      </li>)}</ol></div>)}
      <a href={workflowHref('drafts', { draft: guide.processId.slice('draft:'.length) })}>Review guide</a>
    </details>)}
    {connections.length > 0 && <details><summary>Changed connections ({connections.length})</summary><ul>{connections.map(link => <li key={link.id}>
      {link.sourceTitle} → {link.targetTitle}<small>{label(link.predicate)} · {label(link.status)} · {label(link.freshness)}</small>
      {link.status !== 'approved' && <p>Possible impact only. This relationship has not been approved.</p>}
      {link.sourceAvailable && <a href={workflowHref('knowledge', { entity: link.from })}>Inspect connection</a>}
    </li>)}</ul></details>}
    {learning.length > 0 && <details open><summary>Your earlier learning ({learning.length})</summary><ul>{learning.map(record => <li key={`${record.kind}:${record.id}`}>
      <a href={record.publicationId ? workflowHref('training', { publication: record.publicationId }) : workflowHref('processes', { process: record.processId })}>{record.title}</a>
      <small>{label(record.kind)} · {label(record.reason)} · {new Date(record.at).toLocaleDateString()}</small>
    </li>)}</ul><p>These records remain in your history. Review the changed guidance before relying on earlier practice or acknowledgement.</p></details>}
    <details><summary>Coverage</summary><p>Published dependencies use the same currency check as reading and practice. Paths are representative; shared dependencies are checked once per guide. A guide-level dependency does not establish which individual steps need editing. Changed draft connections are reported directly; unreviewed links do not invalidate approved guidance.</p>
      <p>Per guide: {limits.traversal.depth} levels, {limits.traversal.documents} documents, {limits.traversal.connections} connections, {limits.traversal.findings} findings. Report: {limits.publications} guides, {limits.connections} connections, {limits.learning} personal learning records. Sources outside this authorized workspace are not examined.</p></details>
  </section>
}
