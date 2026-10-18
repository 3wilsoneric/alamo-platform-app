'use client'

import { useRef, useState } from 'react'
import { QUICK_TAPS, mockProcedures } from '@/lib/data'
import { getProcedureMatchReasons, searchProcedures } from '@/lib/utils'
import type { Procedure, WalkthroughLaunchContext } from '@/lib/types'
import ProcedurePanel from './ProcedurePanel'

interface ClinicalAssistProps {
    onStartWalkthrough: (proc: Procedure, context?: WalkthroughLaunchContext) => void
    onExit?: () => void
}

const NO_MATCH_TIPS = ['Use concrete terms', 'Include the behavior or risk', 'Try a common situation shortcut']
const SUGGESTED_ASKS = [
    'Resident refused evening insulin and is getting agitated',
    'Which procedure applies to a behavioral escalation in the hallway?',
    'What form do I need after a medication refusal?',
]

function BackIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M9.8 3.5L5.3 8L9.8 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    )
}

export default function ClinicalAssist({ onStartWalkthrough, onExit }: ClinicalAssistProps) {
    const [query, setQuery] = useState('')
    const [submitted, setSubmitted] = useState('')
    const [loading, setLoading] = useState(false)
    const [results, setResults] = useState<Procedure[] | null>(null)
    const [disambig, setDisambig] = useState<Procedure[] | null>(null)
    const [activeProcId, setActiveProcId] = useState<number | null>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    const activeProc = activeProcId != null ? mockProcedures.find((p) => p.id === activeProcId) ?? null : null
    const isIdle = results === null && !loading

    const dispatch = (rawQuery: string, procIds: number[] | null = null) => {
        const searchQ = rawQuery.trim()
        if (!searchQ && !procIds) return

        setSubmitted(searchQ)
        setLoading(true)
        setResults(null)
        setDisambig(null)
        setActiveProcId(null)

        setTimeout(() => {
            setLoading(false)
            const matches = procIds
                ? procIds.map((id) => mockProcedures.find((p) => p.id === id)).filter(Boolean) as Procedure[]
                : searchProcedures(searchQ)

            if (matches.length === 0) {
                setResults([])
                return
            }

            setResults(matches)

            if (matches.length === 1) {
                setActiveProcId(matches[0]!.id)
                return
            }

            setDisambig(matches.slice(0, 3))
        }, 420)
    }

    const applySuggestion = (value: string, procIds: number[] | null = null) => {
        setQuery(value)
        dispatch(value, procIds)
    }

    const reset = () => {
        setQuery('')
        setSubmitted('')
        setResults(null)
        setDisambig(null)
        setActiveProcId(null)
        setTimeout(() => inputRef.current?.focus(), 50)
    }

    return (
        <div className="workflow-workspace overflow-y-auto" style={{ height: 'calc(100vh - 64px)' }}>
            <div className="px-5 py-5 lg:px-8">
                <div className="workspace-frame mx-auto min-h-[calc(100vh-106px)] max-w-[1380px]">
                    <div className="workspace-header flex items-center justify-between gap-4 border-b px-7 py-5">
                        <div className="flex items-center gap-3">
                            {onExit && (
                                <button
                                    onClick={onExit}
                                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border transition-colors hover:bg-[#edf4f0]"
                                    aria-label="Back to dashboard"
                                >
                                    <BackIcon />
                                </button>
                            )}
                            <div>
                                <div className="font-sans text-[18px] font-semibold tracking-[-0.03em] text-ink">Workspace</div>
                                <div className="workspace-header-sub font-sans text-[12px] text-ink3">Fast help for patient care, procedures, forms, and training</div>
                            </div>
                        </div>
                        <button
                            onClick={reset}
                            className="cursor-pointer rounded-md border px-4 py-2.5 font-sans text-[13px] transition-colors hover:bg-[#edf4f0]"
                        >
                            New search
                        </button>
                    </div>

                    <div className="workspace-content min-w-0 px-10 py-8">
                        {isIdle && (
                            <div className="flex min-h-full flex-col">
                                <div className="workspace-intro mb-7 pt-7 text-center">
                                    <div className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-[#087b60]">Point-of-care workspace</div>
                                    <div className="mb-2 font-sans text-[2rem] font-semibold tracking-[-0.055em] text-ink">
                                        What do you need help with?
                                    </div>
                                    <div className="font-sans text-[13px] text-ink3">
                                        Describe the situation and Workspace will pull the right procedure, walkthrough, or training.
                                    </div>
                                </div>

                                <div className="workspace-prompt mx-auto w-full max-w-[820px] px-7 py-6">
                                    <textarea
                                        ref={inputRef}
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                dispatch(query)
                                            }
                                        }}
                                        placeholder="Describe the situation or ask a question..."
                                        rows={3}
                                        autoFocus
                                        className="block w-full resize-none border-none bg-transparent px-0 py-0 font-sans text-[16px] leading-[1.55] text-ink outline-none"
                                    />
                                    <div className="mt-6 border-t border-[#d9e0e3] pt-5">
                                        <div className="mb-4 flex flex-wrap gap-2.5">
                                            {SUGGESTED_ASKS.map((item) => (
                                                <button
                                                    key={item}
                                                    onClick={() => applySuggestion(item)}
                                                    className="workspace-suggestion cursor-pointer border px-4 py-2 font-sans text-[13px] text-ink2 transition-colors"
                                                >
                                                    {item}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="font-sans text-[12px] text-ink3">
                                                Ask in plain language.
                                            </div>
                                            <button
                                                onClick={() => dispatch(query)}
                                                disabled={!query.trim()}
                                                className={`rounded-md px-6 py-3 font-sans text-[14px] font-semibold transition-all ${query.trim() ? 'cursor-pointer bg-[#087b60] text-white hover:bg-[#086a54]' : 'cursor-default bg-light text-ink3'}`}
                                            >
                                                Send
                                            </button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}

                        {loading && (
                            <div className="mx-auto flex min-h-full max-w-[980px] items-center justify-center">
                                <div className="w-full rounded-[28px] border border-[#E4EAF4] bg-[#FFFDFC] px-8 py-8 shadow-[0_18px_50px_rgba(17,24,39,0.04)]">
                                    <div className="mb-2 font-sans text-[24px] font-semibold tracking-[-0.04em] text-ink">
                                        Finding the best fit
                                    </div>
                                    <div className="mb-5 font-sans text-[14px] text-ink3">
                                        Pulling the right procedure, walkthrough path, and related materials.
                                    </div>
                                    <div className="mb-6 flex items-center gap-3">
                                        {[0, 1, 2].map((i) => (
                                            <div key={i} className="h-[7px] w-[7px] animate-blink rounded-full bg-ink3" style={{ animationDelay: `${i * 0.18}s` }} />
                                        ))}
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        {[1, 2].map((item) => (
                                            <div key={item} className="rounded-[20px] border border-[#E8EDF5] bg-white px-5 py-5">
                                                <div className="mb-3 h-3 w-24 rounded-full bg-[#E8EDF5]" />
                                                <div className="mb-2 h-3 w-full rounded-full bg-[#E8EDF5]" />
                                                <div className="h-3 w-4/5 rounded-full bg-[#E8EDF5]" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!loading && results !== null && results.length === 0 && (
                            <div className="mx-auto max-w-[980px] pt-10">
                                <div className="rounded-[28px] border border-[#E4EAF4] bg-[#FFFDFC] px-8 py-8 shadow-[0_18px_50px_rgba(17,24,39,0.04)]">
                                    <div className="mb-2 font-sans text-[24px] font-semibold tracking-[-0.04em] text-ink">
                                        No direct match
                                    </div>
                                    <div className="mb-5 font-sans text-[14px] leading-[1.7] text-ink2">
                                        Nothing matched “{submitted}” closely enough. Try a clearer description or choose a common situation below.
                                    </div>
                                    <div className="mb-5 grid gap-3 md:grid-cols-3">
                                        {NO_MATCH_TIPS.map((tip) => (
                                            <div key={tip} className="rounded-[18px] border border-[#E8EDF5] bg-white px-4 py-4 font-sans text-[13px] text-ink2">
                                                {tip}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-2.5">
                                        {QUICK_TAPS.slice(0, 4).map((tap) => (
                                            <button
                                                key={tap.label}
                                                onClick={() => applySuggestion(tap.label, tap.ids)}
                                                className="cursor-pointer rounded-full border border-[#E4EAF4] bg-[#F8FAFD] px-3.5 py-2 font-sans text-[12px] text-ink2 transition-colors hover:bg-white"
                                            >
                                                {tap.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!loading && disambig && !activeProcId && (
                            <div className="mx-auto max-w-[980px] pt-6">
                                <div className="mb-4">
                                    <div className="mb-1 font-sans text-[24px] font-semibold tracking-[-0.04em] text-ink">
                                        Choose the closest fit
                                    </div>
                                    <div className="font-sans text-[14px] text-ink3">
                                        A few procedures could apply to “{submitted}”.
                                    </div>
                                </div>
                                <div className="grid gap-3">
                                    {disambig.map((proc) => (
                                        <button
                                            key={proc.id}
                                            onClick={() => setActiveProcId(proc.id)}
                                            className="cursor-pointer rounded-[24px] border border-[#E4EAF4] bg-white px-5 py-5 text-left shadow-[0_14px_36px_rgba(17,24,39,0.04)] transition-all hover:bg-[#FBFCFE]"
                                        >
                                            <div className="mb-2 flex items-center gap-2.5">
                                                <span className="font-mono text-[10px] text-ink3">{proc.code}</span>
                                                <span className="font-sans text-[12px] text-ink3">{proc.dept}</span>
                                            </div>
                                            <div className="mb-2 font-sans text-[16px] font-semibold text-ink">{proc.title}</div>
                                            <div className="mb-3 font-sans text-[13px] leading-[1.7] text-ink2">{proc.overview}</div>
                                            <div className="flex flex-wrap gap-2">
                                                {getProcedureMatchReasons(submitted, proc).map((reason) => (
                                                    <span
                                                        key={reason}
                                                        className="rounded-full border border-[#E4EAF4] bg-[#F6F8FC] px-3 py-1.5 font-sans text-[12px] text-ink2"
                                                    >
                                                        {reason}
                                                    </span>
                                                ))}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!loading && activeProc && (
                            <div className="pt-4">
                                <ProcedurePanel
                                    proc={activeProc}
                                    query={submitted}
                                    onClear={reset}
                                    onWalkthrough={(proc) => onStartWalkthrough(proc, { source: 'assist', query: submitted })}
                                    onSwitch={setActiveProcId}
                                    otherMatches={results?.filter((p) => p.id !== activeProcId) ?? []}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
