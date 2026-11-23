'use client'
import {useState} from 'react'
import type {ExtractedDocument,DocumentUnit} from '@/lib/file-types'
import type {IntakeSource} from '@/lib/intake-types'
import type {AuthoringClient} from '@/lib/authoring-types'

export default function DocumentSelection({document,client,onSelected,onBusyChange}:{document:ExtractedDocument;client:AuthoringClient;onSelected:(source:IntakeSource)=>void;onBusyChange:(busy:boolean)=>void}) {
  const [from,setFrom]=useState(1),[to,setTo]=useState(document.units.length),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const selected=document.units.slice(from-1,to),count=selected.map(unit=>unit.text).join('\n\n').length
  const label=(unit:DocumentUnit,index:number)=>{return `${index+1}: ${unit.kind==='page'?'Page':'Paragraph'} ${unit.number}${unit.part>1?` · part ${unit.part}`:''}`}
  async function select(){setBusy(true);onBusyChange(true);setError('');try{const result=await client.selectFile(document.file.id,from,to);if(!result.source)throw new Error('Choose a readable section.');onSelected(result.source)}catch(error){setError(error instanceof Error?error.message:'Could not select these sections.')}finally{setBusy(false);onBusyChange(false)}}
  return <section className="document-selection" aria-label="Document sections">
    <p>{document.file.filename} · {document.units.length} extracted sections</p>
    <ul>{document.notices.map(notice=><li key={notice}>{notice}</li>)}</ul>
    <div className="drafts-field-row"><label>From section<select aria-label="From section" disabled={busy} value={from} onChange={event=>setFrom(Number(event.target.value))}>{document.units.map((unit,index)=><option key={index} value={index+1}>{label(unit,index)}</option>)}</select></label><label>Through section<select aria-label="Through section" disabled={busy} value={to} onChange={event=>setTo(Number(event.target.value))}>{document.units.map((unit,index)=><option key={index} value={index+1}>{label(unit,index)}</option>)}</select></label></div>
    <p>{count.toLocaleString()} / 12,000 characters for this guide</p>
    <details><summary>Preview selected text</summary><pre>{selected.map(unit=>unit.text).join('\n\n')}</pre></details>
    {error&&<p role="alert">{error}</p>}
    <button type="button" disabled={busy||from>to||count>12000||count<20} onClick={()=>void select()}>{busy?'Selecting…':'Use selected sections'}</button>
  </section>
}
