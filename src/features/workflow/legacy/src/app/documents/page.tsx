// → src/app/documents/page.tsx
'use client'

import { useState } from 'react'
import { REPO_DOCS } from '@/lib/data'
import type { Document } from '@/lib/types'
import KnowledgeWorkspace from '@/components/documents/KnowledgeWorkspace'
import DocumentBody from '@/components/documents/DocumentBody'
import HR from '@/components/ui/HR'

const DOC_TYPES = ['All types', ...new Set(REPO_DOCS.map(doc => doc.type))]
const DOC_DEPTS = ['All departments', ...new Set(REPO_DOCS.map(doc => doc.dept))]
const DOC_STATUS = ['All statuses', 'draft', 'review', 'active', 'expiring']

const statusMeta: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: 'text-teal' },
    review: { label: 'In Review', color: 'text-[#E67E22]' },
    expiring: { label: 'Expiring', color: 'text-red' },
    draft: { label: 'Draft', color: 'text-ink3' },
}

const VERSION_HISTORY = [
    { version: '1.7', date: 'Jan 13, 2025', author: 'S. Chen', note: 'Updated step 3 per new MAR system' },
    { version: '1.6', date: 'Aug 4, 2024', author: 'S. Chen', note: 'Minor wording clarifications' },
    { version: '1.5', date: 'Feb 1, 2024', author: 'Dr. K. Patel', note: 'Initial release' },
]

type ViewMode = 'repository' | 'intake' | 'processing'

export default function DocumentsPage() {
    const [view, setView] = useState<ViewMode>('repository')
    const [workspaceOpen, setWorkspaceOpen] = useState(false)
    const [typeFilter, setTypeFilter] = useState('All types')
    const [deptFilter, setDeptFilter] = useState('All departments')
    const [statusFilter, setStatusFilter] = useState('All statuses')
    const [searchQ, setSearchQ] = useState('')
    const [citationRevision, setCitationRevision] = useState(() => new URLSearchParams(window.location.search).get('revision'))
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(() => REPO_DOCS.find(doc => doc.id === new URLSearchParams(window.location.search).get('document')) ?? null)
    const [processingStage, setProcessingStage] = useState(0)
    const [intakeForm, setIntakeForm] = useState({ title: '', code: '', type: 'Policy', dept: 'Clinical', owner: '', effective: '', reviewCycle: '12', notes: '' })

    const stages = ['File received', 'Parsing content', 'Classifying', 'Extracting entities', 'Indexed']

    const filtered = REPO_DOCS.filter(d => {
        if (typeFilter !== 'All types' && d.type !== typeFilter) return false
        if (deptFilter !== 'All departments' && d.dept !== deptFilter) return false
        if (statusFilter !== 'All statuses' && d.status !== statusFilter) return false
        if (searchQ && ![d.title, d.code, d.body ?? ''].join(' ').toLowerCase().includes(searchQ.toLowerCase())) return false
        return true
    })

    const submitIntake = () => {
        setView('processing')
        setProcessingStage(0)
        let s = 0
        const tick = () => { s++; setProcessingStage(s); if (s < 4) setTimeout(tick, 800 + Math.random() * 500) }
        setTimeout(tick, 600)
    }

    // ── Document detail ──────────────────────────────────────────────────────────
    if (selectedDoc) {
        const doc = selectedDoc
        const staleCitation = Boolean(citationRevision && doc.source_revision && citationRevision !== doc.source_revision)
        const sm = statusMeta[doc.status] ?? statusMeta.draft!
        return (
            <div className="overflow-y-auto bg-cream" style={{ height: 'calc(100vh - 54px)' }}>
                <div className="px-5 sm:px-12 pt-9 pb-20 max-w-[880px]">
                    <button onClick={() => setSelectedDoc(null)} className="font-sans text-[13px] text-navy bg-transparent border-none cursor-pointer p-0 mb-7 underline underline-offset-2">
                        ← Document repository
                    </button>
                    <div className="flex items-baseline gap-3 mb-2">
                        <span className="font-mono text-[10.5px] text-ink3">{doc.code}</span>
                        <span className={`font-mono text-[10px] tracking-[0.07em] uppercase ${sm.color}`}>{sm.label}</span>
                    </div>
                    <h1 className="font-serif text-[1.9rem] text-ink font-bold leading-tight mb-2">{doc.title}</h1>
                    <div className="font-mono text-[10px] text-ink3 tracking-[0.04em] mb-7">
                        {doc.type} · {doc.dept} · v{doc.version} · {doc.format}
                    </div>
                    <HR className="mb-6" />

                    <div className="grid grid-cols-2 gap-x-12 mb-8">
                        {[
                            ['Document owner', doc.owner],
                            ['Department', doc.dept],
                            ['Effective date', doc.effective_date],
                            ['Last reviewed', doc.reviewed_at],
                            ['Review due', doc.review_due],
                            ['Current version', `v${doc.version}`],
                            ['File format', doc.format],
                            ['File size', doc.size],
                        ].map(([label, val]) => (
                            <div key={label} className="py-3 border-b border-border">
                                <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1">{label}</div>
                                <div className="font-serif text-[0.95rem] text-ink">{val}</div>
                            </div>
                        ))}
                    </div>

                    <div className="mb-8">
                        {doc.body ? <><div className="mb-6 break-words rounded border border-border bg-bg p-4 text-xs text-ink3">Source: {doc.source_reference}<br />Source updated: {doc.source_updated}</div>{staleCitation ? <div role="alert"><p>This source changed since it was cited. The earlier version is not available here.</p><button className="mt-3 underline" onClick={() => setCitationRevision(doc.source_revision ?? null)}>Read the current version</button></div> : <DocumentBody body={doc.body} />}</> : <>
                        <div className="font-serif text-[1.05rem] font-bold text-ink mb-3.5">Sample version history</div>
                        <div className="border border-border">
                            <div className="grid gap-x-4 px-4 py-2 border-b border-border" style={{ gridTemplateColumns: '60px 110px 140px 1fr' }}>
                                {['Ver.', 'Date', 'Author', 'Note'].map(h => <span key={h} className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase">{h}</span>)}
                            </div>
                            {VERSION_HISTORY.map((v, i, arr) => (
                                <div key={v.version} className={`grid gap-x-4 px-4 py-3 ${i < arr.length - 1 ? 'border-b border-border' : ''} ${i === 0 ? 'bg-light' : 'bg-bg'}`} style={{ gridTemplateColumns: '60px 110px 140px 1fr' }}>
                                    <span className="font-mono text-[10px] text-navy">v{v.version}</span>
                                    <span className="font-mono text-[10px] text-ink3">{v.date}</span>
                                    <span className="font-sans text-[13px] text-ink2">{v.author}</span>
                                    <span className="font-serif text-[0.875rem] text-ink2">{v.note}</span>
                                </div>
                            ))}
                        </div>
                        </>}
                    </div>

                    <div className="flex gap-2.5">
                        {(doc.body ? (staleCitation ? [] : ['Download']) : ['Download', 'Upload new version', 'Archive']).map(action => (
                            <button key={action} onClick={() => { if (!doc.body) return; const url = URL.createObjectURL(new Blob([doc.body], { type: 'text/markdown;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `${doc.code}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }} className={`px-4 py-2 font-sans text-[13px] border cursor-pointer transition-all ${action === 'Download' ? 'bg-navy border-navy text-white font-bold' : 'bg-transparent border-border text-ink2 hover:border-navy'}`}>
                                {action}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    // ── Intake ───────────────────────────────────────────────────────────────────
    if (view === 'intake') {
        return (
            <div className="overflow-y-auto bg-cream" style={{ height: 'calc(100vh - 54px)' }}>
                <div className="px-12 pt-9 pb-20 max-w-[640px]">
                    <button onClick={() => setView('repository')} className="font-sans text-[13px] text-navy bg-transparent border-none cursor-pointer p-0 mb-7 underline underline-offset-2">
                        ← Back to repository
                    </button>
                    <h1 className="font-serif text-[1.75rem] text-ink font-bold mb-7">Add document</h1>
                    <HR className="mb-7" />

                    <div className="border-2 border-dashed border-border px-8 py-8 text-center mb-7 bg-bg cursor-pointer hover:border-navy transition-colors">
                        <div className="font-mono text-[9.5px] text-ink3 tracking-[0.08em] uppercase mb-2">Attach file</div>
                        <div className="font-serif text-[0.9rem] text-ink3">PDF, DOCX, or XLSX · Max 50 MB</div>
                    </div>

                    {[
                        { label: 'Document title', key: 'title', required: true },
                        { label: 'Document code (optional)', key: 'code' },
                    ].map(({ label, key, required }) => (
                        <div key={key} className="mb-4">
                            <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1.5">{label}{required ? ' *' : ''}</div>
                            <input
                                value={intakeForm[key as keyof typeof intakeForm]}
                                onChange={e => setIntakeForm(f => ({ ...f, [key]: e.target.value }))}
                                className="w-full px-3 py-2 bg-bg border border-border font-sans text-[13px] text-ink outline-none focus:border-navy transition-colors"
                            />
                        </div>
                    ))}

                    <div className="mb-4">
                        <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1.5">Type *</div>
                        <select value={intakeForm.type} onChange={e => setIntakeForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 bg-bg border border-border font-sans text-[13px] text-ink outline-none">
                            {['Policy', 'Procedure', 'Training', 'Form', 'Reference', 'Guideline'].map(t => <option key={t}>{t}</option>)}
                        </select>
                    </div>

                    {[
                        { label: 'Department *', key: 'dept' },
                        { label: 'Document owner *', key: 'owner' },
                    ].map(({ label, key }) => (
                        <div key={key} className="mb-4">
                            <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1.5">{label}</div>
                            <input value={intakeForm[key as keyof typeof intakeForm]} onChange={e => setIntakeForm(f => ({ ...f, [key]: e.target.value }))} className="w-full px-3 py-2 bg-bg border border-border font-sans text-[13px] text-ink outline-none focus:border-navy transition-colors" />
                        </div>
                    ))}

                    <div className="mb-4">
                        <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1.5">Effective date *</div>
                        <input type="date" value={intakeForm.effective} onChange={e => setIntakeForm(f => ({ ...f, effective: e.target.value }))} className="w-full px-3 py-2 bg-bg border border-border font-sans text-[13px] text-ink outline-none focus:border-navy transition-colors" />
                    </div>

                    <div className="mb-4">
                        <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1.5">Review cycle</div>
                        <select value={intakeForm.reviewCycle} onChange={e => setIntakeForm(f => ({ ...f, reviewCycle: e.target.value }))} className="w-full px-3 py-2 bg-bg border border-border font-sans text-[13px] text-ink outline-none">
                            {[['6', 'Every 6 months'], ['12', 'Every 12 months'], ['24', 'Every 24 months']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </div>

                    <div className="mb-7">
                        <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1.5">Notes for reviewer</div>
                        <textarea value={intakeForm.notes} onChange={e => setIntakeForm(f => ({ ...f, notes: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-bg border border-border font-serif text-[0.95rem] text-ink outline-none resize-y focus:border-navy transition-colors" />
                    </div>

                    <div className="flex gap-2.5">
                        <button onClick={submitIntake} className="px-6 py-2.5 bg-navy text-white font-sans text-[13px] font-bold tracking-[0.02em] border-none cursor-pointer hover:bg-[#004d73] transition-colors">
                            Submit for review →
                        </button>
                        <button onClick={() => setView('repository')} className="px-4 py-2.5 bg-transparent border border-border font-sans text-[13px] text-ink2 cursor-pointer hover:border-navy transition-colors">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ── Processing ───────────────────────────────────────────────────────────────
    if (view === 'processing') {
        const done = processingStage >= stages.length - 1
        return (
            <div className="overflow-y-auto bg-cream" style={{ height: 'calc(100vh - 54px)' }}>
                <div className="px-12 py-16 max-w-[560px]">
                    <div className="font-mono text-[9.5px] text-ink3 tracking-[0.1em] uppercase mb-6">Processing document</div>
                    <div className="flex flex-col gap-3 mb-9">
                        {stages.map((s, i) => {
                            const complete = i <= processingStage
                            const active = i === processingStage && !done
                            return (
                                <div key={s} className="flex items-center gap-3.5">
                                    <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${complete ? 'bg-teal border-teal' : 'bg-transparent border-border'}`} style={{ border: '1.5px solid' }}>
                                        {complete && <span className="text-white text-[11px] font-bold">✓</span>}
                                    </div>
                                    <span className={`font-serif text-[0.975rem] ${complete ? 'text-ink' : 'text-ink3'} ${active ? 'font-semibold' : ''}`}>{s}</span>
                                    {active && <span className="font-mono text-[9px] text-ink3">…</span>}
                                </div>
                            )
                        })}
                    </div>
                    {done && (
                        <>
                            <div className="border-l-4 border-teal pl-4 mb-7">
                                <div className="font-serif text-[1.05rem] font-bold text-ink mb-1">Document indexed successfully</div>
                                <div className="font-serif text-[0.9rem] text-ink3 leading-relaxed">It will appear in the repository after reviewer approval. Estimated review time: 1–2 business days.</div>
                            </div>
                            <button onClick={() => setView('repository')} className="px-5 py-2.5 bg-navy text-white font-sans text-[13px] font-bold tracking-[0.02em] border-none cursor-pointer">
                                ← Back to repository
                            </button>
                        </>
                    )}
                </div>
            </div>
        )
    }

    // ── Repository ───────────────────────────────────────────────────────────────
    const expiring = REPO_DOCS.filter(d => d.status === 'expiring').length
    const inReview = REPO_DOCS.filter(d => d.status === 'review').length

    return (
        <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 54px)' }}>
            {/* Filter rail */}
            <div className="w-[180px] border-r border-border bg-bg overflow-y-auto flex-shrink-0 py-5">
                <div className="px-4 pb-3">
                    <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search…" className="w-full px-2.5 py-1.5 bg-light border border-border font-sans text-[12.5px] text-ink outline-none focus:border-navy transition-colors" />
                </div>
                <HR className="mb-3" />
                <div className="font-mono text-[8.5px] text-ink3 tracking-[0.12em] uppercase px-4 mb-2">Type</div>
                {DOC_TYPES.map(t => <button key={t} onClick={() => setTypeFilter(t)} className={`block w-full text-left px-4 py-1.5 bg-transparent border-none cursor-pointer font-sans text-[12.5px] border-l-2 ${typeFilter === t ? 'text-ink font-semibold border-l-red' : 'text-ink3 border-l-transparent'}`}>{t}</button>)}
                <HR className="my-2.5" />
                <div className="font-mono text-[8.5px] text-ink3 tracking-[0.12em] uppercase px-4 mb-2">Department</div>
                {DOC_DEPTS.map(d => <button key={d} onClick={() => setDeptFilter(d)} className={`block w-full text-left px-4 py-1.5 bg-transparent border-none cursor-pointer font-sans text-[12.5px] border-l-2 ${deptFilter === d ? 'text-ink font-semibold border-l-red' : 'text-ink3 border-l-transparent'}`}>{d}</button>)}
                <HR className="my-2.5" />
                <div className="font-mono text-[8.5px] text-ink3 tracking-[0.12em] uppercase px-4 mb-2">Status</div>
                {DOC_STATUS.map(s => <button key={s} onClick={() => setStatusFilter(s)} className={`block w-full text-left px-4 py-1.5 bg-transparent border-none cursor-pointer font-sans text-[12.5px] border-l-2 ${statusFilter === s ? 'text-ink font-semibold border-l-red' : 'text-ink3 border-l-transparent'}`}>{s}</button>)}
            </div>

            {/* Main */}
            <div className="flex-1 overflow-y-auto bg-cream">
                <div className="workflow-library-heading bg-bg border-b border-border px-8 py-4 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#087b60]">Source library</div>
                        <h1 className="font-sans text-[29px] font-semibold tracking-[-0.045em] text-ink">Documents</h1>
                        <div className="flex flex-wrap gap-4 text-[12px] text-ink3">
                            <span>{filtered.length} document{filtered.length !== 1 ? 's' : ''}</span>
                            {expiring > 0 && <span className="text-red">{expiring} expiring soon</span>}
                            {inReview > 0 && <span className="text-[#a26720]">{inReview} in review</span>}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setWorkspaceOpen(true)}
                            className="rounded-full border border-[#D7E2FF] bg-[#EEF3FF] px-3.5 py-2 font-sans text-[12px] font-semibold text-navy transition-colors hover:border-navy"
                        >
                            Open linked-note demo
                        </button>
                        <button onClick={() => setView('intake')} className="px-4 py-1.5 bg-navy text-white font-sans text-[12.5px] font-bold tracking-[0.02em] border-none cursor-pointer hover:bg-[#004d73] transition-colors">
                            Intake demo
                        </button>
                        <a href="/workflow?view=drafts" className="px-4 py-1.5 bg-navy text-white font-sans text-[12.5px] font-bold">+ Add draft</a>
                    </div>
                </div>

                <div className="workflow-library-table-wrap mx-8 mt-6 overflow-x-auto rounded-md border border-border bg-bg">
                    <div className="workflow-library-table-head grid gap-x-4 px-4 py-3" style={{ gridTemplateColumns: '130px minmax(220px,1fr) 90px 140px 110px 90px 68px' }}>
                        {['Code', 'Title', 'Type', 'Department', 'Owner', 'Review due', 'Status'].map(h => (
                            <span key={h} className="font-mono text-[9px] text-ink3 tracking-[0.1em] uppercase">{h}</span>
                        ))}
                    </div>
                    {filtered.map((d) => {
                        const sm = statusMeta[d.status] ?? statusMeta.draft!
                        return (
                            <div key={d.id} className="workflow-library-table-row">
                                <button onClick={() => { setCitationRevision(null); setSelectedDoc(d) }} className="grid gap-x-4 w-full px-4 py-4 bg-transparent border-none cursor-pointer text-left items-center hover:bg-[#eef4f7] transition-colors" style={{ gridTemplateColumns: '130px minmax(220px,1fr) 90px 140px 110px 90px 68px' }}>
                                    <span className="break-words font-mono text-[9.5px] text-ink3">{d.code}</span>
                                    <span className="font-serif text-[0.95rem] text-ink">{d.title}</span>
                                    <span className="font-sans text-[12px] text-ink3">{d.type}</span>
                                    <span className="font-sans text-[12px] text-ink3">{d.dept}</span>
                                    <span className="font-sans text-[12px] text-ink3">{d.owner}</span>
                                    <span className="font-mono text-[9.5px] text-ink3">{d.review_due}</span>
                                    <span className={`font-mono text-[9.5px] tracking-[0.05em] uppercase ${sm.color}`}>{sm.label}</span>
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>

            {workspaceOpen ? (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(18,28,45,0.34)] p-4 backdrop-blur-[3px]">
                    <KnowledgeWorkspace onClose={() => setWorkspaceOpen(false)} />
                </div>
            ) : null}
        </div>
    )
}
