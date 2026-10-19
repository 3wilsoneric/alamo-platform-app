'use client'

import { useEffect, useRef, useState } from 'react'
import { CAPTURE_LIMITS, captureToContent, validateCapture } from '@/lib/capture-contract.mjs'
import type { WorkflowCapture } from '@/lib/capture-types'
import type { AuthoringClient, DraftDetail } from '@/lib/authoring-types'

export default function CaptureImport({ client, onCreated, onUnsavedChange, onBusyChange }: {
  client: AuthoringClient
  onCreated: (detail: DraftDetail) => void
  onUnsavedChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
}) {
  const [capture, setCapture] = useState<WorkflowCapture | null>(null)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const attempt = useRef(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; attempt.current += 1 } }, [])
  useEffect(() => { onUnsavedChange(!!capture) }, [capture, onUnsavedChange])

  async function load(file?: File) {
    const version = ++attempt.current
    setError(''); setCapture(null); setConfirmed(false)
    if (!file) return
    if (file.size > CAPTURE_LIMITS.bytes) { setError('Choose a capture smaller than 64 KiB.'); return }
    try {
      const result = validateCapture(JSON.parse(await file.text()))
      if (version === attempt.current && mounted.current) setCapture(result)
    } catch (error) {
      if (version === attempt.current && mounted.current) setError(error instanceof SyntaxError ? 'Choose a valid Workflow capture JSON file.' : error instanceof Error ? error.message : 'The capture could not be read.')
    }
  }

  async function create() {
    if (!capture || !confirmed || busy) return
    setBusy(true); onBusyChange(true); setError('')
    try {
      const result = await client.mutate(capture.id, { action: 'import_capture', expectedRevision: 0, capture })
      onUnsavedChange(false)
      onCreated(result)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The capture could not be saved. Keep this file and retry.')
    } finally { if (mounted.current) setBusy(false); onBusyChange(false) }
  }

  return <section className="drafts-editor capture-import" aria-label="Import a browser capture">
    <div className="drafts-eyebrow">Capture → draft</div>
    <h2>Turn captured steps into a guide</h2>
    <p>Import a file from the Alamo Workflow browser recorder. Inspect the steps, then create an editable procedure with its original capture attached.</p>
    <p className="drafts-preview">Text capture preview · Button, link and selection actions · Screenshots and AI writing are planned.</p>
    <label>Workflow capture file<input type="file" accept=".json,application/json" disabled={busy} onChange={event => void load(event.target.files?.[0])} /></label>
    <small>Capture files stay in this browser until you choose Create draft from capture. Only reviewed labels and the website origin are accepted; input values and full URLs are unsupported.</small>
    {error && <p className="drafts-alert" role="alert">{error}</p>}
    {capture && <>
      <div className="capture-summary"><strong>{capture.title}</strong><span>{capture.steps.length} steps · {capture.origin}</span><small>Recorded {new Date(capture.startedAt).toLocaleString()}</small></div>
      <ol className="capture-steps">{capture.steps.map(step => <li key={step.id}><strong>{step.kind === 'click' ? 'Activate' : 'Change'} {step.control}: {step.label}</strong></li>)}</ol>
      <details className="capture-preview"><summary>Preview the generated draft</summary><pre>{captureToContent(capture).body}</pre></details>
      <label className="capture-consent"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
        <span>I reviewed these labels for sensitive information. This capture is a draft source, not approved instructions.</span></label>
      <button className="drafts-primary" disabled={busy || !confirmed} onClick={() => void create()}>{busy ? 'Saving capture…' : 'Create draft from capture'}</button>
      <p className="drafts-muted">The same capture imports once. Retry safely if a save is interrupted. Add the audience, purpose, expected outcome and exceptions before submitting for review.</p>
    </>}
  </section>
}
