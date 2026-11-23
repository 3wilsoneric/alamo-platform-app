'use client'
import type { AuthoringClient } from '@/lib/authoring-types'
import type { RetainedAttachment, SourceAttachment } from '@/lib/conversation-types'
import { authoringClient } from '@/lib/authoring-client'
import OriginalSource from './OriginalSource'
import CaptureImage from './CaptureImage'

export function AttachmentContent({ attachment, client = authoringClient }: { attachment: SourceAttachment; client?: AuthoringClient }) {
  return <>
    {attachment.source && <OriginalSource evidence={{ source: attachment.source, citations: [] }} client={client} />}
    {attachment.capture && <ol>{attachment.capture.steps.map(step => <li key={step.id}>{step.label}{step.visual && <CaptureImage visual={step.visual} client={client} />}</li>)}</ol>}
  </>
}

export default function SourceAttachments({ attachments, client = authoringClient }: { attachments: RetainedAttachment[]; client?: AuthoringClient }) {
  if (!attachments.length) return null
  return <section className="process-evidence" aria-label="Added sources">{attachments.map(item => <details key={item.id}>
    <summary>{item.title} · Added in revision {item.addedRevision}</summary>
    <p className="process-muted">Attached by {item.actor.name}. Retained source evidence; attaching it does not approve its guidance.</p>
    <AttachmentContent attachment={item} client={client} />
  </details>)}</section>
}
