'use client'

import { useEffect, useRef, useState } from 'react'
import { knowledgeClient } from '@/lib/knowledge-client'
import type { KnowledgeEvidence } from '@/lib/knowledge-types'
import { processClient } from '@/lib/process-client'
import type { ProcessCitation, ProcessSource } from '@/lib/process-types'
import SourceInspector from '@/components/processes/SourceInspector'
import './knowledge.css'

type Props = { label?: string } & ({ input: Parameters<typeof knowledgeClient.evidence>[0]; citation?: never } | { citation: ProcessCitation; input?: never })

export default function EvidenceButton({ input, citation, label = 'View evidence' }: Props) {
  const [evidence, setEvidence] = useState<KnowledgeEvidence | null>(null)
  const [source, setSource] = useState<ProcessSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (evidence || source) dialog.current?.showModal() }, [evidence, source])
  async function open() {
    setBusy(true); setError('')
    try {
      if (citation) setSource(await processClient.evidence(citation))
      else setEvidence(await knowledgeClient.evidence(input))
    }
    catch (error) { setError(error instanceof Error ? error.message : 'Evidence could not be loaded.') }
    finally { setBusy(false) }
  }
  return <>
    <button ref={trigger} type="button" disabled={busy} onClick={() => void open()}>{busy ? 'Loading evidence…' : label}</button>
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    {(evidence || source) && <dialog ref={dialog} className="knowledge-evidence" aria-label="Source evidence" onClose={() => { setEvidence(null); setSource(null); trigger.current?.focus() }}>
      {source ? <SourceInspector source={source} manageFocus={false} onClose={() => dialog.current?.close()} /> : evidence && <>
      <div className="knowledge-row"><span className="knowledge-eyebrow">Source evidence</span><button type="button" onClick={() => dialog.current?.close()}>Close evidence</button></div>
      <h2>{evidence.title}</h2><p>{evidence.reference}</p>
      <p className="knowledge-muted">{evidence.status.replaceAll('_', ' ')} · Source support does not mean approved policy.</p>
      <dl><dt>Location</dt><dd>{evidence.pointer}</dd>{evidence.digest && <><dt>Source SHA-256</dt><dd>{evidence.digest}</dd></>}</dl>
      <pre>{evidence.excerpt}</pre>
      {evidence.rationale && <p><strong>Author’s rationale:</strong> {evidence.rationale}</p>}
      </>}
    </dialog>}
  </>
}
