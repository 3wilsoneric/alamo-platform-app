'use client'
import { useState } from 'react'
import type { DraftRevision } from '@/lib/authoring-types'
import type { KnowledgeGraph } from '@/lib/knowledge-types'
import type { ConnectionSuggestion } from '@/lib/intake-types'
import { suggestKnowledgeConnections } from '@/lib/intake-contract.mjs'
import { relationshipLabel } from '@/lib/knowledge-client'
import '../documents/knowledge-intake.css'

export default function SuggestedConnections({ document, graph, disabled, onChoose }: {
  document: DraftRevision; graph: KnowledgeGraph; disabled: boolean; onChoose: (item: ConnectionSuggestion) => void
}) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const suggestions = suggestKnowledgeConnections(document, graph).filter(item => !dismissed.includes(`${document.revision}:${item.targetId}`))
  if (!suggestions.length || disabled) return null
  return <section className="intake-suggestions" aria-label="Suggested knowledge connections"><h3>Suggested connections</h3><p>Unreviewed matches from this guide.</p>
    {suggestions.map(item => <article key={item.targetId}><strong>{relationshipLabel(item.predicate)} → {item.targetTitle}</strong><blockquote>{item.quote}</blockquote><div className="knowledge-actions">
      <button type="button" onClick={() => onChoose(item)}>Review connection to {item.targetTitle}</button><button type="button" aria-label={`Dismiss suggestion for ${item.targetTitle}`} onClick={() => setDismissed(current => [...current, `${document.revision}:${item.targetId}`])}>Dismiss</button>
    </div></article>)}
  </section>
}
