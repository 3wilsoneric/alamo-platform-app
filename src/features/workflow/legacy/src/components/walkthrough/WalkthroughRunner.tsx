// → src/components/walkthrough/WalkthroughRunner.tsx
'use client'

import { useRef, useEffect } from 'react'
import type { Procedure, WalkthroughLaunchContext, WalkthroughSession } from '@/lib/types'
import HR from '@/components/ui/HR'
import VideoPlayer from '@/components/ui/VideoPlayer'
import StepInstructions from '@/components/procedures/StepInstructions'

interface WalkthroughRunnerProps {
    proc: Procedure
    session: WalkthroughSession
    setSession: React.Dispatch<React.SetStateAction<WalkthroughSession>>
    onFinish: () => void
    onExit: () => void
    launchContext?: WalkthroughLaunchContext | null
}

export default function WalkthroughRunner({ proc, session, setSession, onFinish, onExit, launchContext }: WalkthroughRunnerProps) {
    const { stepIdx, notes, skipped, completed } = session
    const totalSteps = proc.steps.length
    const isDone = stepIdx >= totalSteps
    const currentStep = proc.steps[stepIdx]
    const noteRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => { noteRef.current?.focus() }, [stepIdx])

    const setNote = (val: string) =>
        setSession(s => currentStep ? ({ ...s, notes: { ...s.notes, [currentStep.id]: val } }) : s)

    const advance = (skip = false) => {
        const newCompleted = new Set(completed)
        const newSkipped = new Set(skipped)
        if (!currentStep) return
        if (skip) newSkipped.add(currentStep.id)
        else newCompleted.add(currentStep.id)
        setSession(s => ({ ...s, stepIdx: stepIdx + 1, completed: newCompleted, skipped: newSkipped }))
    }

    const goBack = () => setSession(s => ({ ...s, stepIdx: Math.max(0, stepIdx - 1) }))
    const progressPct = Math.round((completed.size / totalSteps) * 100)

    // ── Completion screen ────────────────────────────────────────────────────────
    if (isDone) {
        const completedSteps = proc.steps.filter(s => completed.has(s.id))
        const skippedSteps = proc.steps.filter(s => skipped.has(s.id))
        const notedSteps = proc.steps.filter(s => notes[s.id]?.trim())
        const notePreview = notedSteps.slice(0, 3)
        const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

        return (
            <div className="overflow-y-auto bg-cream" style={{ height: 'calc(100vh - 72px)' }}>
                <div className="px-12 pt-10 pb-20 max-w-[740px]">
                    <div className="border-l-4 border-teal pl-5 mb-9">
                        <div className="font-mono text-[10px] text-teal tracking-[0.1em] uppercase mb-1.5">Walkthrough complete</div>
                        <h1 className="font-sans text-[1.75rem] text-ink font-semibold tracking-[-0.03em] leading-tight mb-1.5">{proc.title}</h1>
                        <div className="font-mono text-[10px] text-ink3 tracking-[0.04em]">{proc.code} · Local session · {now}</div>
                        {proc.learning_only && <p className="mt-3 text-[13px] text-ink2">Learning progress only. This session does not verify work in Pipeline and is not saved as a training record.</p>}
                    </div>

                    <div className="flex rounded-[24px] border border-border overflow-hidden mb-8 bg-white shadow-[0_10px_40px_rgba(22,32,51,0.04)]">
                        {[
                            { val: completedSteps.length, label: 'Completed', color: 'text-teal' },
                            { val: skippedSteps.length, label: 'Skipped', color: skippedSteps.length > 0 ? 'text-[#E67E22]' : 'text-ink3' },
                            { val: notedSteps.length, label: 'With notes', color: 'text-ink3' },
                        ].map(({ val, label, color }, i, arr) => (
                            <div key={label} className={`flex-1 px-4 py-4 bg-bg ${i < arr.length - 1 ? 'border-r border-border' : ''}`}>
                                <div className={`font-mono text-[1.6rem] font-semibold leading-none ${color}`}>{val}</div>
                                <div className="font-mono text-[9px] text-ink3 tracking-[0.08em] uppercase mt-1">{label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="border border-border bg-white rounded-[24px] px-5 py-5 mb-8 shadow-[0_10px_40px_rgba(22,32,51,0.04)]">
                        <div className="font-mono text-[9px] text-ink3 tracking-[0.1em] uppercase mb-3">Session record</div>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-4">
                            <div>
                                <div className="font-mono text-[9px] text-ink3 tracking-[0.08em] uppercase mb-1">Triggered from</div>
                                <div className="font-serif text-[0.95rem] text-ink">{launchContext?.source === 'assist' ? 'Clinical Assist' : 'Procedure library'}</div>
                            </div>
                            <div>
                                <div className="font-mono text-[9px] text-ink3 tracking-[0.08em] uppercase mb-1">Original situation</div>
                                <div className="font-serif text-[0.95rem] text-ink">{launchContext?.query || 'Manual SOP selection'}</div>
                            </div>
                        </div>
                        <div className="font-mono text-[9px] text-ink3 tracking-[0.08em] uppercase mb-2">Session summary</div>
                        <div className="font-serif text-[0.95rem] text-ink2 leading-relaxed">
                            The {proc.code} walkthrough ended with {completedSteps.length} step{completedSteps.length === 1 ? '' : 's'} marked complete{skippedSteps.length > 0 ? ` and ${skippedSteps.length} skipped` : ''}. This session contains notes for {notedSteps.length} step{notedSteps.length === 1 ? '' : 's'}.
                        </div>
                    </div>

                    <HR className="mb-7" />

                    {notePreview.length > 0 && (
                        <div className="mb-9">
                            <div className="font-sans text-[1.1rem] font-semibold tracking-[-0.02em] text-ink mb-4">Captured notes</div>
                            <div className="flex flex-col gap-3">
                                {notePreview.map((step, idx) => (
                                    <div key={step.id} className="border border-border bg-white rounded-[20px] px-4 py-3.5 shadow-[0_10px_30px_rgba(22,32,51,0.04)]">
                                        <div className="font-mono text-[9px] text-ink3 tracking-[0.08em] uppercase mb-1.5">Step {String(proc.steps.findIndex(s => s.id === step.id) + 1).padStart(2, '0')} {idx === 0 ? 'highlight' : 'note'}</div>
                                        <div className="font-sans text-[0.95rem] text-ink font-semibold mb-1">{step.title}</div>
                                        <div className="font-sans text-[0.9rem] text-ink2 leading-relaxed">{notes[step.id]}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="mb-9">
                        <div className="font-sans text-[1.1rem] font-semibold tracking-[-0.02em] text-ink mb-4">Step log</div>
                        {proc.steps.map((step, i, arr) => {
                            const done = completed.has(step.id)
                            const skip = skipped.has(step.id)
                            const note = notes[step.id]
                            return (
                                <div key={step.id}>
                                    <div className="py-3.5 flex gap-4">
                                        <div className="flex-shrink-0 mt-0.5">
                                            <div className={`w-5 h-5 border flex items-center justify-center ${done ? 'border-teal bg-teal' : skip ? 'border-[#E67E22]' : 'border-border'}`} style={{ borderWidth: '1.5px' }}>
                                                {done && <span className="text-white text-[11px] font-bold">✓</span>}
                                                {skip && <span className="text-[#E67E22] text-[11px] font-bold">—</span>}
                                            </div>
                                        </div>
                                        <div className="flex-1">
                                            <div className={`flex items-baseline gap-2.5 ${note ? 'mb-1.5' : ''}`}>
                                                <span className="font-mono text-[9.5px] text-ink3">{String(i + 1).padStart(2, '0')}</span>
                                                <span className={`font-serif text-[0.975rem] ${done ? 'text-ink' : 'text-ink3'}`}>{step.title}</span>
                                                {skip && <span className="font-mono text-[9px] text-[#E67E22] tracking-[0.07em]">skipped</span>}
                                            </div>
                                            {note && <div className="font-serif text-[0.875rem] text-ink2 leading-relaxed pl-5 border-l-2 border-border mt-1.5">{note}</div>}
                                        </div>
                                    </div>
                                    {i < arr.length - 1 && <HR />}
                                </div>
                            )
                        })}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onFinish} className="px-5 py-2.5 bg-navy text-white font-sans text-[13px] font-bold tracking-[0.02em] border-none cursor-pointer">
                            ← Back to procedures
                        </button>
                        <button
                            onClick={() => setSession({ stepIdx: 0, notes: {}, skipped: new Set(), completed: new Set() })}
                            className="px-5 py-2.5 bg-transparent border border-border font-sans text-[13px] text-ink2 cursor-pointer hover:border-navy transition-colors"
                        >
                            Run again
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (!currentStep) return null

    // ── Runner ───────────────────────────────────────────────────────────────────
    return (
        <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 72px)' }}>

            {/* Step list */}
            <div className="w-[260px] border-r border-border bg-white overflow-y-auto flex-shrink-0">
                <div className="px-4 pt-4 pb-3.5 border-b border-border">
                    <div className="font-mono text-[9px] text-ink3 tracking-[0.1em] uppercase mb-1.5">{proc.code}</div>
                    <div className="font-sans text-[0.98rem] font-semibold text-ink leading-snug mb-3 tracking-[-0.02em]">{proc.title}</div>
                    <div className="h-[3px] bg-light mb-1.5">
                        <div className="h-full bg-teal transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="font-mono text-[9px] text-ink3 tracking-[0.05em]">{completed.size} of {totalSteps} completed</div>
                </div>
                <div className="py-2">
                    {proc.steps.map((s, i) => {
                        const isCurrent = i === stepIdx
                        const isDone = completed.has(s.id)
                        const isSkipped = skipped.has(s.id)
                        return (
                            <button key={s.id} onClick={() => setSession(ss => ({ ...ss, stepIdx: i }))} className={`flex gap-3 w-full text-left px-4 py-2.5 border-none cursor-pointer transition-colors border-l-[3px] ${isCurrent ? 'bg-light border-l-navy' : 'bg-transparent border-l-transparent hover:bg-light/50'}`}>
                                <div className="flex-shrink-0 mt-0.5">
                                    <div className={`w-[18px] h-[18px] flex items-center justify-center ${isDone ? 'bg-teal border-teal' : 'bg-transparent'}`} style={{ border: `1.5px solid ${isDone ? '#00A7B5' : isSkipped ? '#E67E22' : isCurrent ? '#003D5B' : '#E0E0E0'}` }}>
                                        {isDone && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                                        {isSkipped && <span className="text-[#E67E22] text-[10px] font-bold leading-none">—</span>}
                                        {!isDone && !isSkipped && <span className={`font-mono text-[8px] ${isCurrent ? 'text-navy' : 'text-ink3'}`}>{i + 1}</span>}
                                    </div>
                                </div>
                                <span className={`font-sans text-[12.5px] leading-snug ${isCurrent ? 'text-ink font-semibold' : isDone || isSkipped ? 'text-ink3' : 'text-ink2'}`}>
                                    {s.title}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Step body */}
            <div className="flex-1 overflow-y-auto bg-cream flex flex-col">
                <div className="flex-1 px-12 pt-10 pb-8 max-w-[760px]">
                    <div className="font-mono text-[10px] text-ink3 tracking-[0.1em] uppercase mb-3.5">
                        Step {stepIdx + 1} of {totalSteps}
                    </div>
                    <h2 className="font-sans text-[1.7rem] font-semibold tracking-[-0.03em] text-ink leading-tight mb-5">{currentStep.title}</h2>
                    {proc.learning_only && <p className="mb-4 text-[12px] text-ink3">Learning progress only · Verify actual work in Pipeline.</p>}

                    {currentStep.caution && (
                        <div className="mb-5 px-4 py-3 bg-[#fff8f8] border-l-4 border-red">
                            <div className="font-mono text-[9px] text-red tracking-[0.09em] uppercase mb-1 font-semibold">Caution</div>
                            <div className="font-serif text-[0.9rem] text-ink2 leading-relaxed">{currentStep.caution}</div>
                        </div>
                    )}

                    <div className="bg-white rounded-[24px] border border-border px-5 py-5 mb-5 shadow-[0_10px_30px_rgba(22,32,51,0.04)]">
                        <StepInstructions step={currentStep} />
                    </div>

                    {currentStep.video && (
                        <div className="mb-5">
                            <div className="font-mono text-[9px] text-ink3 tracking-[0.1em] uppercase mb-2">Step video</div>
                            <VideoPlayer video={currentStep.video} compact />
                        </div>
                    )}

                    <div className="mb-6">
                        <div className="font-mono text-[9px] text-ink3 tracking-[0.08em] uppercase mb-2">
                            Document: {currentStep.note_prompt}
                        </div>
                        <textarea
                            ref={noteRef}
                            value={notes[currentStep.id] ?? ''}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Add your note here…"
                            rows={4}
                            className="w-full px-3.5 py-3 bg-white border border-border font-sans text-[0.975rem] text-ink outline-none resize-y leading-relaxed focus:border-navy transition-colors rounded-2xl"
                        />
                    </div>
                </div>

                {/* Action bar */}
                <div className="sticky bottom-0 bg-white/95 border-t border-border px-12 py-3.5 flex items-center gap-2.5 backdrop-blur-sm">
                    <button
                        onClick={() => advance(false)}
                        className="px-5 py-2.5 rounded-xl bg-navy text-white font-sans text-[13px] font-bold tracking-[0.02em] border-none cursor-pointer hover:opacity-95 transition-opacity"
                    >
                        {stepIdx < totalSteps - 1 ? 'Mark complete & continue →' : 'Complete walkthrough →'}
                    </button>
                    {stepIdx > 0 && (
                        <button onClick={goBack} className="px-4 py-2.5 rounded-xl bg-transparent border border-border font-sans text-[13px] text-ink2 cursor-pointer hover:border-navy transition-colors">
                            ← Back
                        </button>
                    )}
                    <button onClick={() => advance(true)} className="px-4 py-2.5 bg-transparent border-none font-sans text-[13px] text-ink3 cursor-pointer underline underline-offset-2 ml-auto">Skip</button>
                    <button onClick={onExit} className="px-4 py-2.5 bg-transparent border-none font-sans text-[13px] text-ink3 cursor-pointer underline underline-offset-2">Exit</button>
                </div>
            </div>
        </div>
    )
}
