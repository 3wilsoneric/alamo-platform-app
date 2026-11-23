'use client'
/* eslint-disable @next/next/no-img-element -- Private authenticated blob URLs must not pass through an image proxy. */
import {authoringClient} from '@/lib/authoring-client'
import {useEffect,useState} from 'react'
import type {CaptureVisual} from '@/lib/visual-types'
import type {AuthoringClient} from '@/lib/authoring-types'

export default function CaptureImage({visual,client=authoringClient,base64}:{visual:CaptureVisual;client?:AuthoringClient;base64?:string|undefined}) {
  const [open,setOpen]=useState(false),[url,setUrl]=useState(''),[error,setError]=useState('')
  useEffect(()=>{
    if(!open)return
    let active=true,objectUrl=''
    async function load(){try{
      const bytes=base64??(await client.visual(visual.id)).base64
      objectUrl=URL.createObjectURL(new Blob([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],{type:'image/png'}))
      if(active)setUrl(objectUrl);else URL.revokeObjectURL(objectUrl)
    }catch{if(active)setError('The reviewed screenshot is unavailable.')}}
    void load()
    return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[open,visual.id,base64,client])
  return <details className="capture-image" onToggle={event=>{setOpen(event.currentTarget.open);if(!event.currentTarget.open){setUrl('');setError('')}}}><summary>Screenshot · {visual.width} × {visual.height}</summary>
    {error&&<p role="alert">{error}</p>}{open&&url&&<><a href={url} target="_blank" rel="noreferrer"><img src={url} width={visual.width} height={visual.height} alt="Contributor-reviewed screenshot for this captured step" /></a><a href={url} download={`proforma-${visual.id.slice(0,12)}.png`}>Download reviewed image</a></>}
    <small>{visual.cropped?'Cropped · ':''}{visual.resized?'Resized · ':''}{visual.redactions} redaction(s) · Reviewed {new Date(visual.reviewedAt).toLocaleString()}</small>
  </details>
}
