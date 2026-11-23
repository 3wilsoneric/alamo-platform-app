'use client'

import CaptureImage from './CaptureImage'
import {VISUAL_LIMITS} from '@/lib/visual-contract.mjs'
import { useEffect, useRef, useState } from 'react'
import { captureToContent, parseCapturePackage } from '@/lib/capture-contract.mjs'
import type { WorkflowCapture } from '@/lib/capture-types'
import type { AuthoringClient, DraftDetail } from '@/lib/authoring-types'

export default function CaptureImport({ client, onCreated, onUnsavedChange, onBusyChange }: {
  client: AuthoringClient
  onCreated: (detail: DraftDetail) => void
  onUnsavedChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [capture, setCapture] = useState<WorkflowCapture | null>(null)
  const [images,setImages]=useState<{id:string;base64:string}[]>([])
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const attempt = useRef(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attempt.current += 1 } }, [])
  useEffect(() => { onUnsavedChange(!!capture) }, [capture, onUnsavedChange])

  async function load(file?: File) {
    const version = ++attempt.current
    setError(''); setCapture(null); setImages([]); setConfirmed(false)
    if (!file) return
    if (file.size > VISUAL_LIMITS.packetBytes) { setError('Choose a capture up to 9 MiB, with at most 12 reviewed images.'); return }
    try {
      const result = parseCapturePackage(JSON.parse(await file.text()))
      if (version === attempt.current && mounted.current) {setCapture(result.capture);setImages(result.images)}
    } catch (error) {
      if (version === attempt.current && mounted.current) setError(error instanceof SyntaxError ? 'Choose a valid ProForma capture JSON file.' : error instanceof Error ? error.message : 'The capture could not be read.')
    }
  }

  async function create() {
    if (!capture || !confirmed || busy) return
    setBusy(true); onBusyChange(true); setError('')
    try {
      if(images.length) await client.uploadVisualCapture({schemaVersion:1,kind:'proforma-visual-capture',capture,images})
      const result = await client.mutate(capture.id, { action: 'import_capture', expectedRevision: 0, capture })
      onUnsavedChange(false)
      onCreated(result)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The capture could not be saved. Keep this file and retry.')
    } finally { if (mounted.current) setBusy(false); onBusyChange(false) }
  }

  return <section className="drafts-editor capture-import" aria-label="Import a browser capture">
    <label>ProForma capture file<input type="file" accept=".json,application/json" disabled={busy} onChange={event => void load(event.target.files?.[0])} /></label>
    <small>Capture files stay in this browser until you choose Create draft from capture. Reviewed images are uploaded only when you create the draft.</small>
    {error && <p className="drafts-alert" role="alert">{error}</p>}
    {capture && <>
      <div className="capture-summary"><strong>{capture.title}</strong><span>{capture.steps.length} steps · {capture.origin}</span><small>Recorded {new Date(capture.startedAt).toLocaleString()}</small></div>
      <ol className="capture-steps">{capture.steps.map(step => <li key={step.id}><strong>{step.kind === 'click' ? 'Activate' : 'Change'} {step.control}: {step.label}</strong>{step.visual&&<CaptureImage visual={step.visual} base64={images.find(image=>image.id===step.visual?.id)?.base64} client={client}/>}</li>)}</ol>
      <details className="capture-preview"><summary>Preview the generated draft</summary><pre>{captureToContent(capture).body}</pre></details>
      <label className="capture-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
        <span>I reviewed these labels and images for sensitive information. This capture is a draft source, not approved instructions.</span></label>
      <button className="drafts-primary" disabled={busy || !confirmed} onClick={() => void create()}>{busy ? 'Saving capture…' : 'Create draft from capture'}</button>
      <p className="drafts-muted">The same capture imports once. Retry safely if a save is interrupted. Add the audience, purpose, expected outcome and exceptions before submitting for review.</p>
    </>}
  </section>
}
