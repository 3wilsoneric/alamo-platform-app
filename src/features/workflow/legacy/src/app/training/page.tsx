// → src/app/training/page.tsx
'use client'

import { useState } from 'react'
import { VIDEO_LIBRARY, mockProcedures } from '@/lib/data'
import type { Video } from '@/lib/types'
import HR from '@/components/ui/HR'
import VideoPlayer from '@/components/ui/VideoPlayer'

export default function TrainingPage() {
    const [watched, setWatched] = useState<Set<string>>(() => new Set(VIDEO_LIBRARY.filter(v => v.watched).map(v => v.id)))
    const [filterAssigned, setFilterAssigned] = useState(false)
    const [filterSeries, setFilterSeries] = useState('All')
    const [filterDept, setFilterDept] = useState('All')
    const [activeVideo, setActiveVideo] = useState<Video | null>(null)

    const allSeries = ['All', ...Array.from(new Set(VIDEO_LIBRARY.map(v => v.series)))]
    const allDepts = ['All', ...Array.from(new Set(VIDEO_LIBRARY.map(v => v.dept)))]

    const filtered = VIDEO_LIBRARY.filter(v => {
        if (filterAssigned && !v.assigned) return false
        if (filterSeries !== 'All' && v.series !== filterSeries) return false
        if (filterDept !== 'All' && v.dept !== filterDept) return false
        return true
    })

    const assignedTotal = VIDEO_LIBRARY.filter(v => v.assigned).length
    const assignedWatched = VIDEO_LIBRARY.filter(v => v.assigned && watched.has(v.id)).length
    const pct = Math.round((assignedWatched / assignedTotal) * 100)

    const markWatched = (id: string) => setWatched(w => new Set([...w, id]))

    const bySeries = filtered.reduce<Record<string, Video[]>>((acc, v) => {
        ; (acc[v.series] = acc[v.series] || []).push(v)
        return acc
    }, {})

    if (activeVideo) {
        const v = activeVideo
        return (
            <div className="overflow-y-auto bg-cream" style={{ height: 'calc(100vh - 54px)' }}>
                <div className="px-12 pt-9 pb-20 max-w-[760px]">
                    <button onClick={() => setActiveVideo(null)} className="font-sans text-[13px] text-navy bg-transparent border-none cursor-pointer p-0 mb-7 underline underline-offset-2">
                        ← Training library
                    </button>
                    <div className="flex items-baseline gap-2.5 mb-2">
                        <span className="font-mono text-[10px] text-ink3 tracking-[0.06em]">{v.id}</span>
                        {v.assigned && <span className="font-mono text-[9.5px] text-navy tracking-[0.06em] uppercase">Assigned</span>}
                    </div>
                    <h1 className="font-serif text-[1.75rem] text-ink font-bold leading-tight mb-1.5">{v.title}</h1>
                    <div className="font-mono text-[10px] text-ink3 tracking-[0.04em] mb-6">
                        {v.series} · {v.dept} · {v.role} · {v.duration}
                    </div>
                    <HR className="mb-6" />
                    <VideoPlayer video={{ id: v.id, title: v.title, duration: v.duration, ...(v.trn_code ? { trnCode: v.trn_code } : {}) }} onWatched={() => markWatched(v.id)} />
                    <div className="flex gap-7">
                        <div>
                            <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1">Linked procedure</div>
                            <div className="font-serif text-[0.9rem] text-ink">
                                {mockProcedures.find(p => p.code === v.proc_code)?.title ?? v.proc_code}
                            </div>
                        </div>
                        {v.trn_code && (
                            <div>
                                <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1">Training code</div>
                                <div className="font-mono text-[10px] text-navy">{v.trn_code}</div>
                            </div>
                        )}
                        <div>
                            <div className="font-mono text-[9px] text-ink3 tracking-[0.09em] uppercase mb-1">Duration</div>
                            <div className="font-mono text-[10px] text-ink">{v.duration}</div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 54px)' }}>
            {/* Filter rail */}
            <div className="w-[192px] border-r border-border bg-bg overflow-y-auto flex-shrink-0 py-5">
                <div className="px-4 pb-4 border-b border-border mb-4">
                    <div className="font-mono text-[8.5px] text-ink3 tracking-[0.1em] uppercase mb-2">My progress</div>
                    <div className="flex items-baseline gap-1.5 mb-1.5">
                        <span className="font-mono text-[1.4rem] font-semibold text-navy leading-none">{pct}%</span>
                        <span className="font-mono text-[9px] text-ink3">{assignedWatched}/{assignedTotal} assigned</span>
                    </div>
                    <div className="h-1 bg-light">
                        <div className={`h-full transition-[width] duration-300 ${pct === 100 ? 'bg-teal' : 'bg-navy'}`} style={{ width: `${pct}%` }} />
                    </div>
                </div>

                <button onClick={() => setFilterAssigned(f => !f)} className="flex items-center gap-2 w-full px-4 pb-3 bg-transparent border-none cursor-pointer text-left">
                    <div className={`w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 ${filterAssigned ? 'bg-navy border-navy' : 'bg-transparent border-border'}`} style={{ border: '1.5px solid' }}>
                        {filterAssigned && <span className="text-white text-[9px] font-bold leading-none">✓</span>}
                    </div>
                    <span className={`font-sans text-[12.5px] ${filterAssigned ? 'text-ink' : 'text-ink3'}`}>Assigned to me only</span>
                </button>

                <div className="font-mono text-[8.5px] text-ink3 tracking-[0.12em] uppercase px-4 mb-2">Series</div>
                {allSeries.map(s => (
                    <button key={s} onClick={() => setFilterSeries(s)} className={`block w-full text-left px-4 py-1.5 bg-transparent border-none cursor-pointer font-sans text-[12.5px] border-l-2 ${filterSeries === s ? 'text-ink font-semibold border-l-red' : 'text-ink3 border-l-transparent'}`}>
                        {s}
                    </button>
                ))}
                <HR className="mx-4 my-3" />
                <div className="font-mono text-[8.5px] text-ink3 tracking-[0.12em] uppercase px-4 mb-2">Department</div>
                {allDepts.map(d => (
                    <button key={d} onClick={() => setFilterDept(d)} className={`block w-full text-left px-4 py-1.5 bg-transparent border-none cursor-pointer font-sans text-[12.5px] border-l-2 ${filterDept === d ? 'text-ink font-semibold border-l-red' : 'text-ink3 border-l-transparent'}`}>
                        {d}
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto bg-cream">
                <div className="workflow-library-heading bg-bg border-b border-border px-8 py-4 sticky top-0 z-10">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#087b60]">Learning library</div>
                    <div className="flex items-end justify-between gap-4">
                        <h1 className="font-sans text-[29px] font-semibold tracking-[-0.045em] text-ink">Training</h1>
                        <span className="text-[12px] text-ink3">{filtered.length} video{filtered.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                <div className="px-8 pt-7 pb-16">
                    {Object.entries(bySeries).map(([series, videos]) => (
                        <div key={series} className="mb-10">
                            <div className="font-serif text-[1.1rem] font-bold text-ink mb-1">{series}</div>
                            <div className="font-mono text-[9px] text-ink3 tracking-[0.06em] mb-4">{videos.length} video{videos.length !== 1 ? 's' : ''}</div>
                            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                                {videos.map(v => {
                                    const isWatched = watched.has(v.id)
                                    return (
                                        <button key={v.id} onClick={() => setActiveVideo(v)} className={`text-left bg-bg cursor-pointer p-0 overflow-hidden border transition-all hover:border-navy hover:shadow-md ${isWatched ? 'border-[#c8ede9]' : 'border-border'}`}>
                                            <div className="bg-[#0a1520] relative flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
                                                <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, rgba(255,255,255,0.015) 1px, transparent 1px, transparent 40px)' }} />
                                                <div className="w-8 h-8 border border-white/25 rounded-full flex items-center justify-center">
                                                    <span className="block w-0 h-0 border-t-[6px] border-b-[6px] border-l-[10px] border-t-transparent border-b-transparent border-l-white/60 ml-0.5" />
                                                </div>
                                                <div className="absolute bottom-2 right-2.5 font-mono text-[9px] text-white/45 bg-black/40 px-1">{v.duration}</div>
                                                {isWatched && <div className="absolute top-2 right-2.5 bg-teal px-1.5 py-0.5 font-mono text-[8px] text-white tracking-widest">WATCHED</div>}
                                                {v.assigned && !isWatched && <div className="absolute top-2 left-2.5 bg-navy px-1.5 py-0.5 font-mono text-[8px] text-white/70 tracking-widest">ASSIGNED</div>}
                                            </div>
                                            <div className="px-3.5 py-3">
                                                <div className="font-serif text-[0.9rem] text-ink leading-snug mb-1.5 font-semibold">{v.title}</div>
                                                <div className="font-mono text-[9px] text-ink3 tracking-[0.04em]">{v.id} · {v.role}</div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                            <HR className="mt-7" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
