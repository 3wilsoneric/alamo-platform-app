'use client'

import type { AuthoringClient, DraftDetail } from '@/lib/authoring-types'
import ProcessConversation from './ProcessConversation'

export default function TeachingWorkspace(props: {
  detail: DraftDetail; client: AuthoringClient; onSaved: (detail: DraftDetail) => void; onEdit: () => void
  onBusyChange: (busy: boolean) => void; onUnsavedChange: (dirty: boolean) => void; readOnly?: boolean; permissions: string[]
}) {
  return <ProcessConversation {...props} />
}
