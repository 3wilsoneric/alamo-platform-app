'use client'

import { useState } from 'react'
import { workflowParams } from '@/lib/workflow-navigation'
import type { AuthoringClient, DraftDetail } from '@/lib/authoring-types'
import ProcessConversation from './ProcessConversation'
import SourceTeachingIntake from './SourceTeachingIntake'

export default function TeachIntake({ client, onCreated, onBusyChange, onUnsavedChange }: {
  client: AuthoringClient; onCreated: (detail: DraftDetail) => void
  onBusyChange: (busy: boolean) => void; onUnsavedChange: (dirty: boolean) => void
}) {
  const [sources, setSources] = useState(() => workflowParams().get('input') === 'source' || (typeof window !== 'undefined' && new URLSearchParams(window.location.hash.slice(1)).has('demonstration'))), [dirty, setDirty] = useState(false)
  function changed(value: boolean) { setDirty(value); onUnsavedChange(value) }
  return <>
    {sources ? <SourceTeachingIntake client={client} onCreated={onCreated} onBusyChange={onBusyChange} onUnsavedChange={changed} /> : <ProcessConversation client={client} onSaved={onCreated} onBusyChange={onBusyChange} onUnsavedChange={changed} />}
    <div className="process-source-entry"><button disabled={dirty} onClick={() => setSources(value => !value)}>{sources ? 'Start with a conversation instead' : 'Paste text or use Pipeline'}</button></div>
  </>
}
