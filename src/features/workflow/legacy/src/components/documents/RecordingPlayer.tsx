'use client'
import { useEffect, useRef, useState } from 'react'
import type { AuthoringClient } from '@/lib/authoring-types'
import type { MediaReference } from '@/lib/media-types'
import { readRecording } from '@/lib/media-client'

export default function RecordingPlayer({ media, client }: { media: MediaReference; client: AuthoringClient }) {
  const [url,setUrl] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const current = useRef(0), retained = useRef('')
  useEffect(() => () => { current.current++; if (retained.current) URL.revokeObjectURL(retained.current) }, [media.id])
  async function load() {
    const generation = ++current.current; setBusy(true); setError('')
    try {
      const blob = await readRecording(client,media)
      if (generation !== current.current) return
      if (retained.current) URL.revokeObjectURL(retained.current)
      retained.current = URL.createObjectURL(blob); setUrl(retained.current)
    } catch (error) { if (generation === current.current) setError(error instanceof Error ? error.message : 'Could not load the recording.') }
    finally { if (generation === current.current) setBusy(false) }
  }
  return <div className="recording-player">
    <p>{media.hasVideo ? 'Screen recording' : 'Voice recording'} · {Math.ceil(media.durationMs / 1000)} seconds{media.hasVideo && !media.hasAudio ? ' · No audio' : ''}</p>
    {!url && <button type="button" disabled={busy} onClick={() => void load()}>{busy ? 'Loading recording…' : 'Load recording'}</button>}
    {url && <>{media.hasVideo ? <video src={url} controls preload="metadata" aria-label="Retained screen recording" /> : <audio src={url} controls preload="metadata" aria-label="Retained voice recording" />}<a href={url} download="proforma-recording.webm">Download recording</a></>}
    {error && <p role="alert">{error}</p>}
  </div>
}
