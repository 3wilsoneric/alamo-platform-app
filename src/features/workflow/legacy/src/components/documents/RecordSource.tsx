'use client'
import { Mic } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AuthoringClient } from '@/lib/authoring-types'
import type { IntakeSource } from '@/lib/intake-types'
import { MEDIA_LIMITS } from '@/lib/media-contract.mjs'
import { retainRecording } from '@/lib/media-client'

type Clip = { blob: Blob; url: string; startedAt: string; endedAt: string; durationMs: number; hasVideo: boolean; hasAudio: boolean }
export default function RecordSource({ client, disabled, onAttach, onPending }: { client: AuthoringClient; disabled: boolean; onAttach: (source: IntakeSource) => void; onPending: (value: boolean) => void }) {
  const [open,setOpen] = useState(false), [mode,setMode] = useState<'screen'|'voice'>('screen'), [voice,setVoice] = useState(false)
  const [state,setState] = useState<'idle'|'starting'|'recording'|'paused'|'review'|'uploading'>('idle'), [clip,setClip] = useState<Clip|null>(null)
  const [title,setTitle] = useState('Process recording'), [notes,setNotes] = useState(''), [reviewed,setReviewed] = useState(false), [error,setError] = useState(''), [progress,setProgress] = useState(0)
  const recorder = useRef<MediaRecorder|null>(null), streams = useRef<MediaStream[]>([]), generation = useRef(0), timer = useRef<ReturnType<typeof setTimeout>|null>(null), localUrl = useRef(''), reviewedAt = useRef('')
  const active = state === 'recording' || state === 'paused', locked = state === 'starting' || state === 'uploading'
  useEffect(() => { onPending(open) }, [open,onPending])
  useEffect(() => () => {
    generation.current++
    if (timer.current) clearTimeout(timer.current)
    if (recorder.current?.state !== 'inactive') recorder.current?.stop()
    streams.current.forEach(stream => stream.getTracks().forEach(track => track.stop()))
    if (localUrl.current) URL.revokeObjectURL(localUrl.current)
  }, [])
  function stop() { if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop() }
  function discard() {
    generation.current++; stop(); streams.current.forEach(stream => stream.getTracks().forEach(track => track.stop())); streams.current = []
    if (timer.current) clearTimeout(timer.current)
    if (localUrl.current) URL.revokeObjectURL(localUrl.current)
    localUrl.current = ''; reviewedAt.current = ''; setClip(null); setState('idle'); setReviewed(false); setError(''); setOpen(false)
  }
  async function start() {
    const version = ++generation.current; setState('starting'); setError(''); setReviewed(false)
    const acquired: MediaStream[] = []
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') throw new Error('This browser does not support recording. You can still attach documents and reviewed browser captures.')
      const hasVideo = mode === 'screen', hasAudio = mode === 'voice' || voice
      const mimeType = hasVideo ? 'video/webm' : 'audio/webm'
      if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error('WebM recording is unavailable in this browser. Use a browser with WebM recording support.')
      if (hasVideo) {
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error('Screen sharing is unavailable here. Choose Voice or use a desktop browser.')
        acquired.push(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })); streams.current = acquired
        if (version !== generation.current) { acquired.forEach(stream => stream.getTracks().forEach(track => track.stop())); return }
      }
      if (hasAudio) acquired.push(await navigator.mediaDevices.getUserMedia({ audio: true, video: false }))
      if (version !== generation.current) { acquired.forEach(stream => stream.getTracks().forEach(track => track.stop())); return }
      streams.current = acquired
      const stream = new MediaStream(acquired.flatMap(item => item.getTracks())), media = new MediaRecorder(stream,{ mimeType, videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000 })
      recorder.current = media
      const started = Date.now(), startedAt = new Date(started).toISOString(), parts: Blob[] = []
      let bytes = 0, failed = false, pausedAt = 0, pausedMs = 0
      media.onpause = () => { pausedAt = Date.now() }
      media.onresume = () => { if (pausedAt) pausedMs += Date.now() - pausedAt; pausedAt = 0 }
      media.ondataavailable = event => { if (failed) return; bytes += event.data.size; if (bytes > MEDIA_LIMITS.bytes) { failed = true; setError('The recording exceeded 64 MiB. Record a shorter segment.'); stop() } else { parts.push(event.data); if (bytes > MEDIA_LIMITS.bytes - 2 * MEDIA_LIMITS.chunkBytes) stop() } }
      media.onerror = () => { failed = true; setError('Recording failed. Discard this attempt and try again.'); stop() }
      media.onstop = () => {
        if (timer.current) clearTimeout(timer.current)
        acquired.forEach(item => item.getTracks().forEach(track => track.stop()))
        if (version !== generation.current) return
        if (failed || !bytes) {
          if (!failed) setError('No recording data was captured. Start again and wait for the recording before stopping.')
          setState('idle'); return
        }
        const ended = Date.now(), blob = new Blob(parts,{ type: mimeType }), url = URL.createObjectURL(blob)
        if (localUrl.current) URL.revokeObjectURL(localUrl.current)
        localUrl.current = url
        setClip({ blob,url,startedAt,endedAt:new Date(ended).toISOString(),durationMs:Math.max(1,Math.min(MEDIA_LIMITS.durationMs,ended - started - pausedMs - (pausedAt ? ended - pausedAt : 0))),hasVideo,hasAudio }); setState('review')
      }
      stream.getTracks().forEach(track => track.addEventListener('ended',stop,{ once: true }))
      media.start(1000); setState('recording'); timer.current = setTimeout(stop,MEDIA_LIMITS.durationMs)
    } catch (error) {
      acquired.forEach(stream => stream.getTracks().forEach(track => track.stop()))
      if (version === generation.current) { setState('idle'); setError(error instanceof Error ? error.message : 'Recording could not start.') }
    }
  }
  async function attach() {
    if (!clip || !reviewed || !title.trim() || notes.trim().length < 20) return
    const version = generation.current
    reviewedAt.current ||= new Date().toISOString()
    setState('uploading'); setError(''); setProgress(0)
    try {
      const media = await retainRecording(client,clip.blob,{ mimeType:clip.hasVideo?'video/webm':'audio/webm',startedAt:clip.startedAt,endedAt:clip.endedAt,reviewedAt:reviewedAt.current,durationMs:clip.durationMs,hasVideo:clip.hasVideo,hasAudio:clip.hasAudio },setProgress)
      if (version !== generation.current) return
      onAttach({ schemaVersion:1,title:title.trim(),reference:'Contributor notes accompanying a reviewed recording. These notes are not an automatic transcript or verified outcome.',text:notes.trim(),media }); discard()
    } catch (error) { if (version === generation.current) { setState('review'); setError(error instanceof Error ? error.message : 'Upload failed. Keep this recording here and retry.') } }
  }
  if (!open) return <button type="button" title="Record screen or voice" aria-label="Record" disabled={disabled} onClick={() => setOpen(true)}><Mic size={18} aria-hidden="true" /></button>
  return <div className="record-source" aria-label="Record a source">
    {state === 'idle' && <><label>Record <select aria-label="Recording mode" value={mode} onChange={event => setMode(event.target.value as 'screen'|'voice')}><option value="screen">Screen</option><option value="voice">Voice</option></select></label>
      {mode === 'screen' && <label className="record-source-check"><input type="checkbox" checked={voice} onChange={event => setVoice(event.target.checked)} /> Include microphone</label>}
      <p>Choose what to share. Recording stays in this tab until you review and attach it. Up to 10 minutes or 64 MiB.</p><button type="button" onClick={() => void start()}>Start recording</button></>}
    {state === 'starting' && <p role="status">Choose the screen or microphone to use…</p>}
    {active && <><p role="status">{state === 'paused' ? 'Recording paused. Sharing remains active.' : 'Recording…'}</p><button type="button" onClick={() => { if (state === 'recording') { recorder.current?.pause(); setState('paused') } else { recorder.current?.resume(); setState('recording') } }}>{state === 'paused' ? 'Resume' : 'Pause'}</button><button type="button" onClick={stop}>Stop recording</button></>}
    {clip && <>{clip.hasVideo ? <video src={clip.url} controls aria-label="Review screen recording" /> : <audio src={clip.url} controls aria-label="Review voice recording" />}
      <label>Title <input value={title} maxLength={160} disabled={locked} onChange={event => setTitle(event.target.value)} /></label>
      <label>What should the guide learn from this? <textarea value={notes} maxLength={12000} disabled={locked} onChange={event => setNotes(event.target.value)} /></label>
      <p>The guide uses these notes. Audio and video are retained for review; they are not automatically transcribed or interpreted. This unsaved recording is lost if you close or reload the page.</p>
      <label className="record-source-check"><input type="checkbox" checked={reviewed} disabled={locked} onChange={event => setReviewed(event.target.checked)} /> I reviewed the recording and want to retain it with this guide.</label>
      <button type="button" className="record-source-attach" disabled={!reviewed || !title.trim() || notes.trim().length < 20 || locked} onClick={() => void attach()}>{state === 'uploading' ? `Uploading… ${progress}%` : 'Attach recording'}</button></>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={locked} onClick={discard}>Discard recording</button>
  </div>
}
