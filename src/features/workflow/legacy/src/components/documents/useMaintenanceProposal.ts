import { useEffect, useState } from 'react'
import { processClient } from '@/lib/process-client'
import { workflowParams } from '@/lib/workflow-navigation'

export function useMaintenanceProposal(documentId: string | undefined, setMessage: React.Dispatch<React.SetStateAction<string>>) {
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const issueId = workflowParams().get('maintenance')
    if (!documentId || !issueId) return
    let alive = true
    void processClient.workspace().then(workspace => {
      if (!alive) return
      const issue = workspace.issues.find(item => item.id === issueId && item.processId === `draft:${documentId}`)
      if (!issue?.proposal || issue.status !== 'open' || issue.freshness !== 'current') {
        setNotice('This proposal is no longer open against the current source. Review it in Processes before using it.'); return
      }
      const request = `Proposed revision:\n\n${issue.proposal.changes.map((change, index) => `${index + 1}. ${change.instruction}\nCurrent source: ${JSON.stringify(change.evidence.quote)}`).join('\n\n')}\n\nAsk me about unsupported policy or missing decisions before adding them.`
      if (request.length > 12000) { setNotice('This proposal is too large for one message. Review and discuss its changes in smaller groups.'); return }
      setMessage(current => current || request)
      setNotice('The proposed changes are in the message field. Edit them before sending; nothing has been applied.')
    }).catch(() => { if (alive) setNotice('The proposal could not be loaded. Your guide has not changed. Return to its review item and retry.') })
    return () => { alive = false }
  }, [documentId, setMessage])
  return notice
}
