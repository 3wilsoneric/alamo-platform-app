'use client'

import { useEffect, useRef, useState } from 'react'
import type { AuthoringClient, DraftDetail } from '@/lib/authoring-types'
import type { IntakePrepared, IntakeSource } from '@/lib/intake-types'
import { INTAKE_LIMITS, intakeQuestions } from '@/lib/intake-contract.mjs'
import './knowledge-intake.css'

export default function KnowledgeIntake({ client, onCreated, onBusyChange, onUnsavedChange, onCapture }: {
  client: AuthoringClient; onCreated: (detail: DraftDetail) => void; onBusyChange: (busy: boolean) => void;
  onUnsavedChange: (dirty: boolean) => void; onCapture: () => void
}) {
  const [source, setSource] = useState<IntakeSource>({ schemaVersion: 1, title: '', reference: '', text: '' })
  const [prepared, setPrepared] = useState<IntakePrepared | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)
  const attempt = useRef<string | null>(null)
  const dirty = !!(source.title || source.reference || source.text)
  useEffect(() => { onUnsavedChange(dirty || busy) }, [dirty, busy, onUnsavedChange])
  useEffect(() => { onBusyChange(busy) }, [busy, onBusyChange])
  function update(key: 'title' | 'reference' | 'text', value: string) {
    setSource(current => ({ ...current, [key]: value })); setPrepared(null); setChecked(false); setError('')
  }
  async function prepare(method: 'auto' | 'literal') {
    if (busy) return
    setBusy(true); setError('')
    try { setPrepared(await client.prepare(source, method)); setChecked(false) }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not organize the source. Your text is preserved.') }
    finally { setBusy(false) }
  }
  async function create() {
    if (!prepared || !checked || busy) return
    setBusy(true); setError(''); attempt.current ??= crypto.randomUUID()
    try {
      const result = await client.mutate(attempt.current, { action: 'import_source', expectedRevision: 0, source, selection: prepared.selection })
      // The parent unmounts this panel; clear its busy state synchronously.
      onBusyChange(false); onUnsavedChange(false); onCreated(result)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the draft. Retry with this source; your text is preserved.') }
    finally { setBusy(false) }
  }
  async function recover() {
    if (!attempt.current || busy) return
    setBusy(true); setError('')
    try { const result = await client.get(attempt.current); onBusyChange(false); onUnsavedChange(false); onCreated(result) }
    catch { setError('No saved draft could be loaded yet. Keep your source here and retry creation, or download a copy.') }
    finally { setBusy(false) }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([`${source.title}\n${source.reference}\n\n${source.text}`], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'proforma-source.txt'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const questions = prepared ? intakeQuestions(prepared.content) : []
  const valid = !!source.title.trim() && !!source.reference.trim() && source.text.trim().length >= 20
  return <section className="knowledge-intake" aria-label="Add knowledge">
    <ol className="intake-progress" aria-label="Intake progress"><li aria-current={!prepared ? 'step' : undefined}>1 · Bring a source</li><li aria-current={prepared ? 'step' : undefined}>2 · Check the guide</li><li>3 · Connect & review</li></ol>
    {error && <div className="drafts-alert" role="alert"><p>{error}</p><button type="button" onClick={download}>Download source text</button>{attempt.current && <button type="button" disabled={busy} onClick={() => void recover()}>Check for saved draft</button>}</div>}
    {busy && <p role="status">{prepared ? 'Saving the source and draft…' : 'Organizing your source…'}</p>}
    {!prepared ? <form onSubmit={event => { event.preventDefault(); void prepare('auto') }}><fieldset disabled={busy}>
      <label>Guide title<input required maxLength={160} value={source.title} onChange={event => update('title', event.target.value)} placeholder="For example, review a new referral" /></label>
      <label>Source title or reference<input aria-label="Source title or reference" required maxLength={1000} value={source.reference} onChange={event => update('reference', event.target.value)} placeholder="Document title, version, meeting notes or source URL" /><small>A reference identifies your source. URLs are not fetched.</small></label>
      <label>Source instructions<textarea aria-label="Source instructions" required rows={12} maxLength={INTAKE_LIMITS.text} value={source.text} onChange={event => update('text', event.target.value)} placeholder="Paste the process, including who does what, systems used, decisions and handoffs. Keep important conditions and exceptions." /><small>{source.text.length.toLocaleString()} / {INTAKE_LIMITS.text.toLocaleString()} characters · Original text is retained when you create the draft.</small></label>
      <p className="intake-note">AI organization uses the configured server provider to select source passages. Missing information stays blank for you to complete.</p>
      <div className="drafts-actions"><button type="submit" className="drafts-primary" disabled={!valid}>Organize source</button><button type="button" disabled={!valid} onClick={() => void prepare('literal')}>Organize without AI</button></div>
    </fieldset><div className="intake-alternative"><button type="button" disabled={busy} onClick={onCapture}>Use a browser capture</button></div></form> : <div>
      <div className="intake-result"><span className="drafts-badge">{prepared.method === 'ai-extraction' ? 'AI extraction · Check against source' : 'Source extraction · No AI used'}</span><h3>{prepared.content.title}</h3><p>{prepared.notice}</p>
        <p>{prepared.content.sop?.steps.length ?? 0} extracted steps · {questions.length} details to complete</p>
        <ol className="intake-steps">{prepared.content.sop?.steps.map((step, index) => <li key={step.id}><strong>{index + 1}. {step.action}</strong><p>Responsible role: {step.role || 'Needs your input'}</p><p>Expected result: {step.expectedResult || 'Needs your input'}</p>{step.system && <p>System: {step.system}</p>}</li>)}</ol>
        {!prepared.content.sop?.steps.length && <p>No explicit actions were extracted. Create the draft to add steps alongside your retained source.</p>}
        <details className="capture-preview"><summary>Compare original source</summary><pre>{source.text}</pre></details>
        <details className="capture-preview"><summary>Preview all SOP sections</summary><pre>{prepared.content.body}</pre></details>
      </div>
      {!!questions.length && <section className="intake-questions" aria-label="Questions to complete the SOP"><h3>Missing details</h3><ul>{questions.slice(0, 8).map(item => <li key={item.field}>{item.question}</li>)}</ul>{questions.length > 8 && <p>Plus {questions.length - 8} questions available in the editor.</p>}</section>}
      <label className="intake-check"><input type="checkbox" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)} /><span>I have checked the extracted sections against the source.</span></label>
      <div className="drafts-actions"><button type="button" className="drafts-primary" disabled={busy || !checked} onClick={() => void create()}>Create SOP draft</button><button type="button" disabled={busy} onClick={() => { setPrepared(null); setChecked(false) }}>Back to source</button></div>
      <p className="intake-note">Next: complete the guide and review suggested connections. Creating a draft does not approve or publish it.</p>
    </div>}
  </section>
}
