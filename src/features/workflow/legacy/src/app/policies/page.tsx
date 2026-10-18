// → src/app/policies/page.tsx
'use client'

import { useState } from 'react'
import HR from '@/components/ui/HR'

interface Policy {
    id: string
    code: string
    title: string
    dept: string
    owner: string
    version: string
    effective_date: string
    review_due: string
    status: 'active' | 'review' | 'expiring'
    category: string
    summary: string
}

const POLICIES: Policy[] = [
    { id: 'p01', code: 'POL-001', title: 'Admissions & Intake Policy', dept: 'Administration', owner: 'M. Rodriguez', version: '3.1', effective_date: 'Jan 1, 2025', review_due: 'Jan 1, 2026', status: 'active', category: 'Operations', summary: 'Governs the process for admitting new residents, including screening, intake documentation, and initial care planning.' },
    { id: 'p02', code: 'POL-002', title: 'Reportable Events Policy', dept: 'Compliance', owner: 'Compliance', version: '2.2', effective_date: 'Jan 1, 2025', review_due: 'Jan 1, 2026', status: 'active', category: 'Compliance', summary: 'Defines which events must be reported, to whom, and within what timeframe. All staff are required to be familiar with this policy.' },
    { id: 'p03', code: 'POL-007', title: 'Resident Safety Policy', dept: 'Clinical', owner: 'Dr. K. Patel', version: '4.0', effective_date: 'Nov 1, 2024', review_due: 'Nov 1, 2025', status: 'active', category: 'Safety', summary: 'Establishes facility-wide standards for resident safety, including environmental controls, observation requirements, and incident response.' },
    { id: 'p04', code: 'POL-009', title: 'Restraint & Seclusion Policy', dept: 'Clinical', owner: 'Dr. K. Patel', version: '5.2', effective_date: 'Dec 28, 2024', review_due: 'Jun 28, 2025', status: 'review', category: 'Safety', summary: 'Establishes that restraint and seclusion are interventions of last resort. Defines authorization, monitoring, and documentation requirements.' },
    { id: 'p05', code: 'POL-012', title: 'Patient Rights & Autonomy Policy', dept: 'Clinical', owner: 'Dr. K. Patel', version: '2.4', effective_date: 'Dec 1, 2024', review_due: 'Dec 1, 2025', status: 'active', category: 'Rights', summary: 'Outlines resident rights including the right to refuse treatment, participate in care planning, and be free from coercion.' },
    { id: 'p06', code: 'POL-015', title: 'Suicide Prevention Policy', dept: 'Behavioral Health', owner: 'Dr. K. Patel', version: '4.0', effective_date: 'Nov 15, 2024', review_due: 'Nov 15, 2025', status: 'active', category: 'Clinical', summary: 'Defines screening, risk assessment, safety planning, and monitoring protocols for residents at risk of self-harm or suicide.' },
    { id: 'p07', code: 'POL-018', title: 'Confidentiality & HIPAA Compliance', dept: 'Administration', owner: 'M. Rodriguez', version: '3.3', effective_date: 'Jan 1, 2025', review_due: 'Jan 1, 2026', status: 'active', category: 'Compliance', summary: 'Governs the handling, storage, and disclosure of protected health information in compliance with HIPAA regulations.' },
    { id: 'p08', code: 'POL-021', title: 'Medication Management Policy', dept: 'Nursing', owner: 'S. Chen', version: '2.1', effective_date: 'Jan 13, 2025', review_due: 'Jul 13, 2025', status: 'active', category: 'Clinical', summary: 'Covers prescribing, dispensing, administering, and documenting medications including protocols for refusal, errors, and controlled substances.' },
    { id: 'p09', code: 'POL-024', title: 'Staff Competency & Training Policy', dept: 'Human Resources', owner: 'HR Dept.', version: '1.8', effective_date: 'Sep 1, 2024', review_due: 'Sep 1, 2025', status: 'active', category: 'HR', summary: 'Establishes required training, competency verification, and continuing education requirements for all clinical and non-clinical staff.' },
    { id: 'p10', code: 'POL-027', title: 'Grievance & Complaint Resolution', dept: 'Administration', owner: 'M. Rodriguez', version: '2.0', effective_date: 'Oct 15, 2024', review_due: 'Oct 15, 2025', status: 'active', category: 'Rights', summary: 'Establishes the process for residents and families to file grievances and receive timely, documented responses.' },
    { id: 'p11', code: 'POL-031', title: 'Emergency Preparedness Plan', dept: 'Administration', owner: 'M. Rodriguez', version: '2.5', effective_date: 'Aug 1, 2024', review_due: 'Aug 1, 2025', status: 'expiring', category: 'Operations', summary: 'Documents facility procedures for fire, natural disaster, utility failure, and other emergencies including evacuation routes and staff responsibilities.' },
    { id: 'p12', code: 'POL-033', title: 'Infection Control Policy', dept: 'Clinical', owner: 'Dr. K. Patel', version: '3.0', effective_date: 'Jan 1, 2025', review_due: 'Jan 1, 2026', status: 'active', category: 'Safety', summary: 'Establishes standard precautions, isolation protocols, hand hygiene requirements, and outbreak response procedures.' },
]

const CATEGORIES = ['All', 'Clinical', 'Safety', 'Compliance', 'Rights', 'Operations', 'HR']
const DEPTS = ['All departments', 'Administration', 'Behavioral Health', 'Clinical', 'Compliance', 'Human Resources', 'Nursing']
const STATUSES = ['All statuses', 'active', 'review', 'expiring']

const statusMeta: Record<string, { label: string; color: string }> = {
    active: { label: 'Active', color: 'text-teal' },
    review: { label: 'In Review', color: 'text-[#E67E22]' },
    expiring: { label: 'Expiring', color: 'text-red' },
}

export default function PoliciesPage() {
    const [selected, setSelected] = useState<Policy | null>(null)
    const [category, setCategory] = useState('All')
    const [dept, setDept] = useState('All departments')
    const [status, setStatus] = useState('All statuses')
    const [searchQ, setSearchQ] = useState('')

    const filtered = POLICIES.filter(p => {
        if (category !== 'All' && p.category !== category) return false
        if (dept !== 'All departments' && p.dept !== dept) return false
        if (status !== 'All statuses' && p.status !== status) return false
        if (searchQ && !p.title.toLowerCase().includes(searchQ.toLowerCase()) && !p.code.toLowerCase().includes(searchQ.toLowerCase())) return false
        return true
    })

    // ── Policy detail ────────────────────────────────────────────────────────────
    if (selected) {
        const sm = statusMeta[selected.status] ?? statusMeta.review!
        return (
            <div className="overflow-y-auto bg-cream" style={{ height: 'calc(100vh - 54px)' }}>
                <div className="px-12 pt-9 pb-20 max-w-[760px]">
                    <button
                        onClick={() => setSelected(null)}
                        className="font-sans text-[13px] text-navy bg-transparent border-none cursor-pointer p-0 mb-7 underline underline-offset-2 hover:text-ink transition-colors"
                    >
                        ← All policies
                    </button>

                    <div className="flex items-baseline gap-3 mb-2">
                        <span className="font-mono text-[10.5px] text-ink3">{selected.code}</span>
                        <span className={`font-mono text-[10px] tracking-[0.07em] uppercase ${sm.color}`}>{sm.label}</span>
                        <span className="font-mono text-[9px] text-ink3 tracking-[0.05em] uppercase">{selected.category}</span>
                    </div>
                    <h1 className="font-serif text-[1.9rem] text-ink font-bold leading-tight mb-2">{selected.title}</h1>
                    <div className="font-mono text-[10px] text-ink3 tracking-[0.04em] mb-7">
                        {selected.dept} · v{selected.version} · Owner: {selected.owner}
                    </div>

                    <HR className="mb-6" />

                    {/* Summary */}
                    <div className="mb-8">
                        <div className="font-mono text-[9px] text-ink3 tracking-[0.1em] uppercase mb-3">Policy summary</div>
                        <p className="font-serif text-[1.025rem] text-ink2 leading-[1.75]">{selected.summary}</p>
                    </div>

                    {/* Metadata */}
                    <div className="grid grid-cols-2 gap-x-12 mb-8">
                        {[
                            ['Policy owner', selected.owner],
                            ['Department', selected.dept],
                            ['Category', selected.category],
                            ['Effective date', selected.effective_date],
                            ['Review due', selected.review_due],
                            ['Current version', `v${selected.version}`],
                        ].map(([label, val]) => (
                            <div key={label} className="py-3 border-b border-border">
                                <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1">{label}</div>
                                <div className="font-serif text-[0.95rem] text-ink">{val}</div>
                            </div>
                        ))}
                    </div>

                    {/* Review due warning */}
                    {selected.status === 'expiring' && (
                        <div className="mb-8 px-4 py-3 bg-[#fff8f8] border-l-4 border-red">
                            <div className="font-mono text-[9px] text-red tracking-[0.09em] uppercase mb-1 font-semibold">Review overdue</div>
                            <div className="font-serif text-[0.9rem] text-ink2 leading-relaxed">
                                This policy is due for review by {selected.review_due}. Contact the policy owner to initiate the review process.
                            </div>
                        </div>
                    )}
                    {selected.status === 'review' && (
                        <div className="mb-8 px-4 py-3 bg-[#fffaf5] border-l-4 border-[#E67E22]">
                            <div className="font-mono text-[9px] text-[#E67E22] tracking-[0.09em] uppercase mb-1 font-semibold">Under review</div>
                            <div className="font-serif text-[0.9rem] text-ink2 leading-relaxed">
                                This policy is currently being reviewed. The current version remains in effect until a new version is approved.
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2.5">
                        <button className="px-4 py-2 bg-navy text-white font-sans text-[13px] font-bold border-none cursor-pointer hover:bg-[#004d73] transition-colors">
                            Download PDF
                        </button>
                        <button className="px-4 py-2 bg-transparent border border-border font-sans text-[13px] text-ink2 cursor-pointer hover:border-navy transition-colors">
                            Request review
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // ── Policy list ───────────────────────────────────────────────────────────────
    const expiring = POLICIES.filter(p => p.status === 'expiring').length
    const inReview = POLICIES.filter(p => p.status === 'review').length

    return (
        <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 54px)' }}>

            {/* Filter rail */}
            <div className="w-[172px] border-r border-border bg-bg overflow-y-auto flex-shrink-0 py-5">
                <div className="px-4 pb-3">
                    <input
                        value={searchQ}
                        onChange={e => setSearchQ(e.target.value)}
                        placeholder="Search…"
                        className="w-full px-2.5 py-1.5 bg-light border border-border font-sans text-[12.5px] text-ink outline-none focus:border-navy transition-colors"
                    />
                </div>
                <HR className="mb-3" />

                <div className="font-mono text-[8.5px] text-ink3 tracking-[0.12em] uppercase px-4 mb-2">Category</div>
                {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategory(c)} className={`block w-full text-left px-4 py-1.5 bg-transparent border-none cursor-pointer font-sans text-[12.5px] border-l-2 transition-colors ${category === c ? 'text-ink font-semibold border-l-red' : 'text-ink3 border-l-transparent'}`}>
                        {c}
                    </button>
                ))}

                <HR className="my-3 mx-4" />

                <div className="font-mono text-[8.5px] text-ink3 tracking-[0.12em] uppercase px-4 mb-2">Department</div>
                {DEPTS.map(d => (
                    <button key={d} onClick={() => setDept(d)} className={`block w-full text-left px-4 py-1.5 bg-transparent border-none cursor-pointer font-sans text-[12.5px] border-l-2 transition-colors ${dept === d ? 'text-ink font-semibold border-l-red' : 'text-ink3 border-l-transparent'}`}>
                        {d}
                    </button>
                ))}

                <HR className="my-3 mx-4" />

                <div className="font-mono text-[8.5px] text-ink3 tracking-[0.12em] uppercase px-4 mb-2">Status</div>
                {STATUSES.map(s => (
                    <button key={s} onClick={() => setStatus(s)} className={`block w-full text-left px-4 py-1.5 bg-transparent border-none cursor-pointer font-sans text-[12.5px] border-l-2 transition-colors ${status === s ? 'text-ink font-semibold border-l-red' : 'text-ink3 border-l-transparent'}`}>
                        {s}
                    </button>
                ))}
            </div>

            {/* Main */}
            <div className="flex-1 overflow-y-auto bg-cream">
                {/* Toolbar */}
                <div className="workflow-library-heading bg-bg border-b border-border px-8 py-4 sticky top-0 z-10">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#087b60]">Governance library</div>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <h1 className="font-sans text-[29px] font-semibold tracking-[-0.045em] text-ink">Policies</h1>
                        <div className="flex flex-wrap items-center gap-4 text-[12px] text-ink3">
                            <span>{filtered.length} polic{filtered.length !== 1 ? 'ies' : 'y'}</span>
                            {expiring > 0 && <span className="text-red">{expiring} expiring soon</span>}
                            {inReview > 0 && <span className="text-[#a26720]">{inReview} under review</span>}
                        </div>
                    </div>
                </div>

                {/* Table header */}
                <div className="workflow-library-table-wrap mx-8 mt-6 overflow-x-auto rounded-md border border-border bg-bg">
                    <div className="workflow-library-table-head grid gap-x-4 px-4 py-3" style={{ gridTemplateColumns: '72px minmax(220px,1fr) 120px 110px 90px 68px' }}>
                        {['Code', 'Title', 'Category', 'Owner', 'Review due', 'Status'].map(h => (
                            <span key={h} className="font-mono text-[9px] text-ink3 tracking-[0.1em] uppercase">{h}</span>
                        ))}
                    </div>
                    {filtered.length === 0 && (
                        <div className="py-16 text-center">
                            <div className="font-serif text-[1rem] text-ink3">No policies match your filters.</div>
                        </div>
                    )}

                    {filtered.map((p) => {
                        const sm = statusMeta[p.status] ?? statusMeta.review!
                        return (
                            <div key={p.id} className="workflow-library-table-row">
                                <button
                                    onClick={() => setSelected(p)}
                                    className="grid gap-x-4 w-full px-4 py-4 bg-transparent border-none cursor-pointer text-left items-center hover:bg-[#eef4f7] transition-colors group"
                                    style={{ gridTemplateColumns: '72px minmax(220px,1fr) 120px 110px 90px 68px' }}
                                >
                                    <span className="font-mono text-[9.5px] text-ink3">{p.code}</span>
                                    <span className="font-serif text-[0.95rem] text-ink group-hover:text-navy transition-colors">{p.title}</span>
                                    <span className="font-mono text-[9px] text-ink3 tracking-[0.04em]">{p.category}</span>
                                    <span className="font-sans text-[12px] text-ink3">{p.owner}</span>
                                    <span className="font-mono text-[9.5px] text-ink3">{p.review_due}</span>
                                    <span className={`font-mono text-[9.5px] tracking-[0.05em] uppercase ${sm.color}`}>{sm.label}</span>
                                </button>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
