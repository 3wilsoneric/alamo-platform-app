'use client'
import { useEffect, useRef, useState } from 'react'
import { DEMONSTRATION_PROTOCOL, isHandoffId, isPipelineOrigin, validateDemonstration } from '@/lib/demonstration-contract.mjs'
import type { Demonstration } from '@/lib/demonstration-types'

export function useDemonstrationHandoff(onReceive: (value: Demonstration) => void) {
  const receive = useRef(onReceive)
  useEffect(() => { receive.current = onReceive }, [onReceive])
  const [status, setStatus] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const id = params.get('demonstration'), origin = params.get('from') ?? ''
    if (!id) return
    const sender = window.opener
    const valid = isHandoffId(id) && isPipelineOrigin(origin, window.location.origin) && sender
    // This state mirrors the browser-only opener connection after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(valid ? 'Waiting for your reviewed Pipeline demonstration. Keep its tab open. Sign in here if needed, then retry from Pipeline.' : 'Return to Pipeline and choose Continue in ProForma to reconnect this demonstration.')
    if (!valid) return
    let received = false
    const ready = () => sender.postMessage({ protocol: DEMONSTRATION_PROTOCOL, type: 'ready', id }, origin)
    const listener = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== sender || event.data?.protocol !== DEMONSTRATION_PROTOCOL
        || event.data?.type !== 'demonstration' || event.data?.id !== id) return
      try {
        if (!received) {
          const result = validateDemonstration(event.data.payload, origin)
          receive.current(result); received = true
          setStatus('Pipeline demonstration received. Review the guide before saving.')
          // Evidence stays in memory; the URL carries only the one-use handshake.
          window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
        }
        sender.postMessage({ protocol: DEMONSTRATION_PROTOCOL, type: 'received', id }, origin)
      } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not accept this demonstration.') }
    }
    window.addEventListener('message', listener)
    ready()
    const timer = window.setInterval(() => { if (!received) ready() }, 1500)
    return () => { window.removeEventListener('message', listener); clearInterval(timer) }
  }, [])
  return status
}
