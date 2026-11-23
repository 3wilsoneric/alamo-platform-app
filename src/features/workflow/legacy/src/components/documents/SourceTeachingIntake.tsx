'use client'

import { useEffect, useRef, useState } from 'react'
import type { AuthoringClient, DraftContent, DraftDetail } from '@/lib/authoring-types'
import type { WorkflowCapture } from '@/lib/capture-types'
import type { IntakeSource } from '@/lib/intake-types'
import type { ExtractedDocument } from '@/lib/file-types'
import CaptureImage from './CaptureImage'
import {VISUAL_LIMITS} from '@/lib/visual-contract.mjs'
import DocumentSelection from './DocumentSelection'
import { FILE_LIMITS } from '@/lib/file-contract.mjs'
import type { TeachingStart } from '@/lib/teaching-types'
import { parseCapturePackage } from '@/lib/capture-contract.mjs'
import { teachingContent } from '@/lib/teaching-contract.mjs'
import { useDemonstrationHandoff } from './useDemonstrationHandoff'
import type { Demonstration } from '@/lib/demonstration-types'
import './teaching-workspace.css'

export default function SourceTeachingIntake({ client, onCreated, onBusyChange, onUnsavedChange }: {
  client: AuthoringClient; onCreated: (detail: DraftDetail) => void;
  onBusyChange: (busy: boolean) => void; onUnsavedChange: (dirty: boolean) => void
}) {
  const [title, setTitle] = useState(''), [reference, setReference] = useState('Contributor explanation in ProForma'), [text, setText] = useState('')
  const [fileSource, setFileSource] = useState<IntakeSource | null>(null)
  const [extractedDocument, setExtractedDocument] = useState<ExtractedDocument | null>(null)
  const [captureImages,setCaptureImages]=useState<{id:string;base64:string}[]>([])
  const [capture, setCapture] = useState<WorkflowCapture | null>(null)
  const [prepared, setPrepared] = useState<{ session: TeachingStart; content: DraftContent; notice: string } | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [checked, setChecked] = useState(false)
  const [incoming, setIncoming] = useState<Demonstration | null>(null)
  const handoffStatus = useDemonstrationHandoff(setIncoming)
  const attempt = useRef<string | null>(null), fileVersion = useRef(0)
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  useEffect(() => { onUnsavedChange(!!(title || text || capture || incoming || extractedDocument || busy)) }, [title, text, capture, incoming, extractedDocument, busy, onUnsavedChange])
  useEffect(() => () => { fileVersion.current += 1 }, [])
  const valid = !extractedDocument && !!title.trim() && (!!capture || text.trim().length >= 20) && (!text.trim() || (text.trim().length >= 20 && !!reference.trim()))
  async function loadCapture(file?: File) {
    const version = ++fileVersion.current
    setError(''); setCapture(null);setCaptureImages([])
    if (!file) return
    if (file.size > VISUAL_LIMITS.packetBytes) { setError('Choose a capture up to 9 MiB, with at most 12 reviewed images.'); return }
    setBusy(true)
    try {
      const result = parseCapturePackage(JSON.parse(await file.text()))
      if (fileVersion.current === version) { setCapture(result.capture);setCaptureImages(result.images);setTitle(current => current || result.capture.title) }
    } catch (error) { if (fileVersion.current === version) setError(error instanceof Error ? error.message : 'Could not read this capture.') }
    finally { if (fileVersion.current === version) setBusy(false) }
  }
  async function loadSource(file?: File) {
    if (!file || busy) return
    if (file.size > (/\.(pdf|docx)$/i.test(file.name)?FILE_LIMITS.documentBytes:FILE_LIMITS.bytes)) { setError('Choose PDF or DOCX up to 4 MiB, or text/Markdown up to 48 KiB.'); return }
    setBusy(true); setError('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
      const base64 = btoa(binary)
      const result = await client.uploadFile(file.name, base64)
      if (result.document) setExtractedDocument(result.document)
      else if(result.source) applySource(result.source)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not retain this file. Your existing source is still here.') }
    finally { setBusy(false) }
  }
  function applySource(source:IntakeSource) {
    setFileSource(source);setText(source.text);setReference(source.reference);setExtractedDocument(null)
    setTitle(current=>current||source.title.replace(/\.(txt|md|markdown|pdf|docx)$/i,''))
  }
  async function prepare(method: 'auto' | 'literal') {
    if (busy || !valid) return
    setBusy(true); setError('')
    try {
      const session: TeachingStart = { title: title.trim(), ...(capture ? { capture } : {}) }
      let notice = 'The reviewed capture supplies the action sequence. Outcomes and responsibilities still need your explanation.'
      if (text.trim()) {
        const source = fileSource ?? { schemaVersion: 1 as const, title: title.trim(), reference, text }
        const result = await client.prepare(source, method)
        Object.assign(session, { source, selection: result.selection }); notice = result.notice
      }
      setPrepared({ session, content: teachingContent(session, () => crypto.randomUUID()), notice }); setChecked(false)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not prepare this process. Your evidence is still here.') }
    finally { setBusy(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ title, reference, text, fileSource, capture, prepared }, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'proforma-teaching-evidence.json'; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function start(recover = false) {
    if (!prepared || !checked || busy) return
    attempt.current ??= capture?.id ?? crypto.randomUUID()
    setBusy(true); setError('')
    try {
      if(!recover && captureImages.length && prepared.session.capture) await client.uploadVisualCapture({schemaVersion:1,kind:'proforma-visual-capture',capture:prepared.session.capture,images:captureImages})
      const result = recover ? await client.get(attempt.current) : await client.mutate(attempt.current, { action: 'start_teaching', expectedRevision: 0, session: prepared.session })
      onBusyChange(false); onUnsavedChange(false); onCreated(result)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the session. Keep the evidence here and retry.') }
    finally { setBusy(false) }
  }
  function acceptIncoming() {
    if (!incoming || busy || attempt.current) return
    setCaptureImages([]);setFileSource(null); setExtractedDocument(null); setTitle(incoming.capture.title); setCapture(incoming.capture); setText(incoming.context);
    setReference('Contributor explanation during a Pipeline demonstration');
    setPrepared(null); setChecked(false); setIncoming(null);
  }
  return <section className="teach-intake" aria-label="Add source">
    {handoffStatus && <p role="status" className="teach-transfer-status">{handoffStatus}</p>}
    {incoming && <div className="teach-transfer"><div><div className="drafts-eyebrow">From Pipeline</div><h3>{incoming.capture.title}</h3><p>{incoming.capture.steps.length} reviewed actions{incoming.context ? ' and your explanations' : ''} are ready.</p></div><button disabled={busy || !!attempt.current} className="drafts-primary" onClick={acceptIncoming}>{title || text || capture ? 'Replace this unsaved starting point' : 'Use this demonstration'}</button></div>}
    {error && <div className="drafts-alert" role="alert"><p>{error}</p><button onClick={download}>Download session evidence</button>{attempt.current && <button disabled={busy} onClick={() => void start(true)}>Check for saved session</button>}</div>}
    {busy && <p role="status">{prepared ? 'Saving your session…' : 'Preparing the process…'}</p>}
    {!prepared ? <div className="teach-start-layout"><form onSubmit={event => { event.preventDefault(); void prepare('auto') }}><fieldset disabled={busy || !!incoming}>
      <label>What process are you teaching?<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="Prepare a referral handoff" /></label>
      {capture && <div className="teach-capture"><div className="drafts-eyebrow">Demonstration attached</div><strong>{capture.title}</strong><p>{capture.steps.length} captured actions · {capture.origin}</p><ol>{capture.steps.map(step => <li key={step.id}>{step.label}{step.visual&&<CaptureImage visual={step.visual} base64={captureImages.find(image=>image.id===step.visual?.id)?.base64} client={client}/>}</li>)}</ol><button type="button" onClick={() => {setCapture(null);setCaptureImages([])}}>Remove capture</button></div>}
      <label className="teach-file-picker">{fileSource ? 'Replace source file' : 'Choose source file'}<input aria-label="Source file" type="file" accept=".txt,.md,.markdown,.pdf,.docx" onChange={event => { void loadSource(event.target.files?.[0]); event.target.value = '' }} /></label>
      <small>PDF or DOCX up to 4 MiB; text or Markdown up to 48 KiB. Originals retained.</small>
      {extractedDocument&&<><DocumentSelection key={extractedDocument.file.id} document={extractedDocument} client={client} onSelected={applySource} onBusyChange={setBusy}/><button type="button" onClick={()=>setExtractedDocument(null)}>Keep previous source</button></>}
      {fileSource?.file?.schemaVersion===2&&<ul>{fileSource.file.notices.map(notice=><li key={notice}>{notice}</li>)}</ul>}
      {fileSource?.file && <p className="teach-file-attached">{fileSource.file.filename} · {fileSource.file.bytes.toLocaleString()} bytes <button type="button" onClick={() => { setFileSource(null); setText(''); setReference('Contributor explanation in ProForma') }}>Remove file</button></p>}
      <label>Written context<textarea aria-label="Written context" readOnly={!!fileSource} className="teach-story-input" rows={9} maxLength={12000} value={text} onChange={event => setText(event.target.value)} placeholder={capture ? 'Add anything the demonstration did not show: why you made a decision, what you checked, or who takes over.' : 'Walk me through the task. What starts it? What do you do and why? What tells you it worked?\n\nYou can also paste instructions you already have.'} /></label>
      <div className="teach-source-line"><span>{text.length.toLocaleString()} / 12,000</span><details><summary>Source details</summary><label>Where did this context come from?<input readOnly={!!fileSource} maxLength={1000} value={reference} onChange={event => setReference(event.target.value)} /></label><small>Links identify sources; their contents are not fetched.</small></details></div>
      <div className="drafts-actions"><button type="submit" className="drafts-primary" disabled={!valid}>Preview guide →</button></div>
      <details className="teach-existing-source"><summary>Use an existing recording or structured source</summary>
        <label>Reviewed browser capture<input type="file" accept=".json,application/json" onChange={event => void loadCapture(event.target.files?.[0])} /></label>
        <button type="button" disabled={!valid || !text.trim()} onClick={() => void prepare('literal')}>Use explicit headings & steps</button>
      </details>
      <details className="teach-existing-source"><summary>Record in Pipeline</summary><ol><li>Open a referral workspace.</li><li>Choose <strong>Demonstrate for ProForma</strong>.</li><li>Review your actions and continue here.</li></ol><a href="https://alamo-pipeline.com" target="_blank" rel="noopener noreferrer">Open Pipeline ↗</a><p>Owner pilot · Navigation and explanations only.</p></details>
    </fieldset></form></div> : <div className="teach-prepared">
      <div className="teach-preview-heading"><div><h3>{prepared.content.title}</h3></div><span className="drafts-badge">Draft</span></div>
      {prepared.content.purpose && <p>{prepared.content.purpose}</p>}
      <ol className="teach-preview-steps">{prepared.content.sop?.steps.map((step, index) => <li key={step.id}><span>{String(index + 1).padStart(2, '0')}</span><div>{step.action}<small>{step.captureStepId ? 'Observed action · outcome unverified' : 'Selected source passage'}</small></div></li>)}</ol>
      {!prepared.content.sop?.steps.length && <p>No steps extracted.</p>}
      <details className="capture-preview"><summary>Review sources & extracted sections</summary><p>{prepared.notice}</p>{text && <><p>{reference}</p><pre>{text}</pre></>}{capture && <ol>{capture.steps.map(step => <li key={step.id}>{step.label}{step.visual&&<CaptureImage visual={step.visual} base64={captureImages.find(image=>image.id===step.visual?.id)?.base64} client={client}/>}</li>)}</ol>}<pre>{prepared.content.body}</pre></details>
      <label className="teach-check"><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} /><span>I checked the evidence and draft sections, including capture labels and images for sensitive information.</span></label>
      <div className="drafts-actions"><button className="drafts-primary" disabled={busy || !checked} onClick={() => void start()}>Open guide</button><button disabled={busy || !!attempt.current} onClick={() => { setPrepared(null); setChecked(false) }}>Back to evidence</button></div>
    </div>}
  </section>
}
