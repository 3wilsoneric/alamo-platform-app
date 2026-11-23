'use client'

import { Paperclip } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AuthoringClient } from '@/lib/authoring-types'
import type { TeachingStart } from '@/lib/teaching-types'
import type { IntakeSource, IntakeSelection } from '@/lib/intake-types'
import type { ExtractedDocument } from '@/lib/file-types'
import type { WorkflowCapture } from '@/lib/capture-types'
import { FILE_LIMITS } from '@/lib/file-contract.mjs'
import { VISUAL_LIMITS } from '@/lib/visual-contract.mjs'
import { parseCapturePackage } from '@/lib/capture-contract.mjs'
import RecordSource from './RecordSource'
import RecordingPlayer from './RecordingPlayer'
import DocumentSelection from './DocumentSelection'
import CaptureImage from './CaptureImage'

export type ConversationSourceState = { session: TeachingStart | null; busy: boolean; pending: boolean; incomplete: boolean }

export default function ConversationSources({ client, disabled, onChange }: {
  client: AuthoringClient; disabled: boolean; onChange: (state: ConversationSourceState) => void
}) {
  const [written, setWritten] = useState<{ source: IntakeSource; selection: IntakeSelection } | null>(null)
  const [document, setDocument] = useState<ExtractedDocument | null>(null)
  const [capture, setCapture] = useState<WorkflowCapture | null>(null)
  const [loading, setLoading] = useState(false), [selecting, setSelecting] = useState(false), [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null), version = useRef(0)
  const [recordingPending, setRecordingPending] = useState(false)
  const busy = loading || selecting
  const session = useMemo<TeachingStart | null>(() => {
    if (!written && !capture) return null
    return { title: (capture?.title ?? written!.source.title.replace(/\.(txt|md|markdown|pdf|docx)$/i, '')).slice(0, 160),
      ...(written ?? {}), ...(capture ? { capture } : {}) }
  }, [written, capture])
  useEffect(() => { onChange({ session, busy, pending: !!(session || document || error || busy || recordingPending), incomplete: !!(document || error || busy || recordingPending) }) }, [session, busy, document, error, recordingPending, onChange])
  useEffect(() => () => { version.current++ }, [])

  async function prepare(source: IntakeSource, current = version.current) {
    setLoading(true); setError('')
    try {
      const result = await client.prepare(source, 'literal')
      if (current === version.current) { setWritten({ source, selection: result.selection }); setDocument(null) }
    } catch (error) { if (current === version.current) setError(error instanceof Error ? error.message : 'Could not prepare this source. Remove it or try again.') }
    finally { if (current === version.current) setLoading(false) }
  }
  async function attach(file?: File) {
    if (!file || disabled || busy || recordingPending) return
    const current = ++version.current
    setLoading(true); setError('')
    try {
      if (/\.json$/i.test(file.name)) {
        if (capture) throw new Error('Remove the attached recording before choosing another.')
        if (file.size > VISUAL_LIMITS.packetBytes) throw new Error('Choose a reviewed capture up to 9 MiB with at most 12 images.')
        const parsed = parseCapturePackage(JSON.parse(await file.text()))
        if (parsed.images.length) await client.uploadVisualCapture({ schemaVersion: 1, kind: 'proforma-visual-capture', capture: parsed.capture, images: parsed.images })
        if (current === version.current) setCapture(parsed.capture)
      } else {
        if (!/\.(txt|md|markdown|pdf|docx)$/i.test(file.name)) throw new Error('Choose a text, Markdown, PDF, Word document or reviewed capture JSON.')
        if (written || document) throw new Error('Remove the attached document before choosing another.')
        if (file.size > (/\.(pdf|docx)$/i.test(file.name) ? FILE_LIMITS.documentBytes : FILE_LIMITS.bytes)) throw new Error('Choose PDF or Word up to 4 MiB, or text/Markdown up to 48 KiB.')
        const bytes = new Uint8Array(await file.arrayBuffer())
        let binary = ''
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
        const result = await client.uploadFile(file.name, btoa(binary))
        if (current !== version.current) return
        if (result.document) setDocument(result.document)
        else if (result.source) await prepare(result.source, current)
        else throw new Error('This file contains no readable source.')
      }
    } catch (error) { if (current === version.current) setError(error instanceof Error ? error.message : 'Could not attach this file. Your message is still here.') }
    finally { if (current === version.current) setLoading(false) }
  }

  return <section className="conversation-sources" aria-label="Conversation sources" onDragOver={event => event.preventDefault()} onDrop={event => {
    event.preventDefault()
    if (disabled || busy || recordingPending) return
    if (event.dataTransfer.files.length !== 1) { setError('Add one file at a time.'); return }
    void attach(event.dataTransfer.files[0])
  }}>
    <input ref={picker} hidden type="file" aria-label="Attach source" accept=".txt,.md,.markdown,.pdf,.docx,.json" disabled={disabled || busy || recordingPending} onChange={event => { void attach(event.target.files?.[0]); event.target.value = '' }} />
    <button type="button" title="Attach a document or recording" aria-label="Add document or recording" disabled={disabled || busy || recordingPending || !!(written && capture)} onClick={() => picker.current?.click()}><Paperclip size={18} aria-hidden="true" /></button>
    <small className="sr-only">Or drop a file here.</small>
    <RecordSource client={client} disabled={disabled || busy || !!(written || document)} onPending={setRecordingPending} onAttach={source => void prepare(source)} />
    {busy && <p role="status">Preparing source…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" disabled={disabled || busy || recordingPending} onClick={() => setError('')}>Discard failed attachment</button></div>}
    {document && <div className="conversation-attachment"><DocumentSelection key={document.file.id} document={document} client={client} onSelected={source => void prepare(source)} onBusyChange={setSelecting} />
      <button type="button" disabled={disabled || busy || recordingPending} onClick={() => { version.current++; setDocument(null); setError('') }}>Remove document</button></div>}
    {written && <div className="conversation-attachment"><div><strong>{written.source.file?.filename ?? written.source.title}</strong><button type="button" disabled={disabled || busy || recordingPending} onClick={() => { version.current++; setWritten(null); setError('') }}>Remove document</button></div>
      {written.source.media && <RecordingPlayer key={written.source.media.id} media={written.source.media} client={client} />}
      <details><summary>{written.source.media ? 'Contributor notes' : 'Original text'}</summary><pre>{written.source.text}</pre></details></div>}
    {capture && <div className="conversation-attachment"><div><strong>{capture.title}</strong><button type="button" disabled={disabled || busy || recordingPending} onClick={() => { version.current++; setCapture(null); setError('') }}>Remove recording</button></div>
      <details><summary>{capture.steps.length} reviewed actions</summary><ol>{capture.steps.map(step => <li key={step.id}>{step.label}{step.visual && <CaptureImage visual={step.visual} client={client} />}</li>)}</ol></details></div>}
  </section>
}
