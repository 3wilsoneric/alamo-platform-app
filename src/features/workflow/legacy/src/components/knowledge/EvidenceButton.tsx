'use client'

import { useEffect, useRef, useState } from 'react'
import { knowledgeClient } from '@/lib/knowledge-client'
import type { KnowledgeEvidence } from '@/lib/knowledge-types'
import './knowledge.css'

export default function EvidenceButton({ input, label = 'View evidence' }: {
  input: Parameters<typeof knowledgeClient.evidence>[0]; label?: string
}) {
  const [evidence, setEvidence] = useState<KnowledgeEvidence | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (evidence) dialog.current?.showModal() }, [evidence])
  async function open() {
    setBusy(true); setError('')
    try { setEvidence(await knowledgeClient.evidence(input)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Evidence could not be loaded.') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" disabled={busy} onClick={() => void open()}>{busy ? 'Loading evidence…' : label}</button>
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    {evidence && <dialog ref={dialog} className="knowledge-evidence" aria-label="Source evidence" onClose={() => setEvidence(null)}>
      <div className="knowledge-row"><span className="knowledge-eyebrow">Source evidence</span><button type="button" onClick={() => dialog.current?.close()}>Close evidence</button></div>
      <h2>{evidence.title}</h2><p>{evidence.reference}</p>
      <p className="knowledge-muted">{evidence.status.replaceAll('_', ' ')} · Source support does not mean approved policy.</p>
      <dl><dt>Location</dt><dd>{evidence.pointer}</dd>{evidence.digest && <><dt>Source SHA-256</dt><dd>{evidence.digest}</dd></>}</dl>
      <pre>{evidence.excerpt}</pre>
      {evidence.rationale && <p><strong>Author’s rationale:</strong> {evidence.rationale}</p>}
    </dialog>}
  </>
}
