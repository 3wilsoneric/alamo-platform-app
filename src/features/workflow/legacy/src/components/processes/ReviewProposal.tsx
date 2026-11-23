import type { MaintenanceProposal } from '@/lib/maintenance-types'
import { workflowHref } from '@/lib/workflow-navigation'

export default function ReviewProposal({ proposal, issueId, freshness }: { proposal: MaintenanceProposal; issueId: string; freshness?: string | undefined }) {
  return <div className="pw-proposal">
    <p>{freshness === 'source_changed' ? 'The source changed after this proposal. Check the current evidence before revising the guide.' : 'Proposed changes · the guide has not been changed.'}</p>
    <ol>{proposal.changes.map((change, index) => <li key={index}><p>{change.instruction}</p><blockquote>{change.evidence.quote}</blockquote></li>)}</ol>
    {proposal.source.source.draftId && <a href={workflowHref('drafts', { draft: proposal.source.source.draftId, maintenance: issueId })}>Open guide to revise →</a>}
  </div>
}
