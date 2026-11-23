'use client'

import { AttachmentContent } from '@/components/documents/SourceAttachments'
import type { SourceSelectionInput } from '@/lib/process-types'
import type { useSourceSelection } from './useSourceSelection'

export default function SourceContext({ control, disabled, scope, onReload }: {
  control: ReturnType<typeof useSourceSelection>; disabled: boolean
  scope: Pick<SourceSelectionInput, 'processId' | 'conversationId'>; onReload: () => void
}) {
  const { value, original, busy, pending, error } = control
  if (!value || !value.sources.length && !value.unavailable && !error) return null
  const locked = disabled || busy || !!pending
  return <section className="question-source-context" aria-label="Conversation source selection">
    {value.active && <div role="region" aria-label="Active source context">
      <span>Using <strong>{value.active.title}</strong></span>
      <button type="button" disabled={locked} onClick={() => void control.inspect()}>View original</button>
      <button type="button" disabled={locked} aria-label="Clear source context" onClick={() => void control.change(null, scope)}>×</button>
    </div>}
    {value.unavailable && <p role="alert">The selected source is unavailable. Choose another source or clear the selection before continuing.</p>}
    {(!value.active || value.sources.length > 1) && <label>Source context<select aria-label="Source context" disabled={locked} value={value.active?.id ?? ''} onChange={event => void control.change(event.target.value || null, scope)}>
      <option value="">No conversation source</option>
      {value.sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}
    </select></label>}
    {value.unavailable && <button type="button" disabled={locked} onClick={() => void control.change(null, scope)}>Clear source context</button>}
    {error && <div role="alert"><p>{error}</p>{pending && <button type="button" disabled={disabled || busy} onClick={() => void control.change(pending.sourceQuestionId, scope)}>Retry source choice</button>}<button type="button" disabled={disabled || busy} onClick={onReload}>Reload conversation sources</button></div>}
    {original && <div role="region" aria-label="Retained conversation source"><strong>{original.title}</strong><p>Retained evidence · Unreviewed source</p><AttachmentContent attachment={original.attachment} /><button type="button" onClick={control.close}>Close original</button></div>}
  </section>
}
