'use client'

import RecordingPlayer from './RecordingPlayer'
import { useState } from 'react'
import type { AuthoringClient } from '@/lib/authoring-types'
import type { IntakeEvidence } from '@/lib/intake-types'
import type { SourceFile } from '@/lib/file-types'

function sectionLabel(path: string) {
  const step = /^steps\/(\d+)\/(.+)$/.exec(path)
  const words = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  if (step) return `Step ${Number(step[1]) + 1} ${words(step[2] ?? '')}`
  const label = words(path)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export default function OriginalSource({ evidence, client }: { evidence: Pick<IntakeEvidence, 'source' | 'citations'>; client: AuthoringClient }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const file: SourceFile | undefined = evidence.source.file
  async function download() {
    if (!file || busy) return
    setBusy(true); setError('')
    try {
      const original = await client.originalFile(file.id)
      const bytes = Uint8Array.from(atob(original.base64), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = original.filename; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setError(error instanceof Error ? error.message : 'The original file could not be downloaded.') }
    finally { setBusy(false) }
  }
  return <div className="source-evidence">
    <p>{file ? file.filename : evidence.source.reference}</p>
    {file && <button type="button" disabled={busy} onClick={() => void download()}>{busy ? 'Downloading…' : 'Download original file'}</button>}
    {error && <p role="alert">{error}</p>}
    {file && <details><summary>File details</summary><p>{file.bytes.toLocaleString()} bytes · SHA-256 {file.sha256}</p></details>}
    {file?.schemaVersion === 2 && <ul>{file.notices.map(notice=><li key={notice}>{notice}</li>)}</ul>}
    {evidence.source.media && <RecordingPlayer key={evidence.source.media.id} media={evidence.source.media} client={client} />}
    {evidence.source.media && <p>Contributor notes; not an automatic transcript.</p>}
    <pre>{evidence.source.text}</pre>
    <ul>{evidence.citations.map(citation => <li key={citation.path}><strong>{sectionLabel(citation.path)}</strong>{citation.location && <span> · {citation.location.unit ? `${citation.location.unit === 'page'?'pages':'extracted paragraphs'} ${citation.location.unitStart}–${citation.location.unitEnd}` : `lines ${citation.location.lineStart}–${citation.location.lineEnd}`}</span>}: “{citation.quote}”</li>)}</ul>
  </div>
}
