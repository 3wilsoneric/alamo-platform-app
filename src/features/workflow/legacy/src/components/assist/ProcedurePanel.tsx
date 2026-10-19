'use client'

import { getProcedureMatchReasons } from '@/lib/utils'
import type { Procedure, StepVideo } from '@/lib/types'
import Status from '@/components/ui/Status'

interface ProcedurePanelProps {
    proc: Procedure
    query: string
    onClear: () => void
    onWalkthrough: (proc: Procedure) => void
    onSwitch: (id: number) => void
    otherMatches: Procedure[]
}

function collectVideos(proc: Procedure): StepVideo[] {
    const videos = [proc.video, ...proc.steps.map((step) => step.video)].filter(Boolean) as StepVideo[]
    const seen = new Set<string>()

    return videos.filter((video) => {
        if (seen.has(video.id)) return false
        seen.add(video.id)
        return true
    })
}

export default function ProcedurePanel({ proc, query, onClear, onWalkthrough, onSwitch, otherMatches }: ProcedurePanelProps) {
    const matchReasons = getProcedureMatchReasons(query, proc)
    const immediateSteps = proc.steps.slice(0, 3)
    const videos = collectVideos(proc)
    const documentationSteps = proc.steps.filter((step) => step.note_prompt).slice(0, 3)

    return (
        <div className="mx-auto w-full max-w-[1180px]">
            <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="font-mono text-[10px] text-ink3">{proc.code}</span>
                    <Status label={proc.status} variant={proc.status} />
                    <span className="truncate font-sans text-[15px] font-semibold text-ink">{proc.title}</span>
                </div>
                <button
                    onClick={onClear}
                    className="cursor-pointer rounded-full border border-[#E4EAF4] bg-white px-3.5 py-2 font-sans text-[12px] text-ink2 transition-colors hover:bg-[#F6F8FC]"
                >
                    New search
                </button>
            </div>

            <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
                <section className="rounded-[24px] border border-[#E4EAF4] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,24,39,0.04)]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="font-sans text-[1rem] font-semibold tracking-[-0.02em] text-ink">Best match</div>
                        <div className="font-sans text-[12px] text-ink3">{proc.dept} · {proc.role}</div>
                    </div>
                    <p className="mb-4 max-w-[760px] font-sans text-[14px] leading-[1.7] text-ink2">{proc.overview}</p>
                    <div className="mb-4 flex flex-wrap gap-2">
                        {matchReasons.map((reason) => (
                            <span
                                key={reason}
                                className="rounded-full border border-[#E4EAF4] bg-[#F6F8FC] px-3 py-1.5 font-sans text-[12px] text-ink2"
                            >
                                {reason}
                            </span>
                        ))}
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        {immediateSteps.map((step, index) => (
                            <div key={step.id} className="rounded-[18px] border border-[#E8EDF5] bg-[#FBFCFE] px-4 py-4">
                                <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.08em] text-ink3">
                                    Step {index + 1}
                                </div>
                                <div className="mb-1 font-sans text-[13px] font-semibold text-ink">{step.title}</div>
                                <div className="font-sans text-[12px] leading-[1.65] text-ink3">{step.body}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-[24px] border border-[#E4EAF4] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,24,39,0.04)]">
                    <div className="mb-3 font-sans text-[1rem] font-semibold tracking-[-0.02em] text-ink">Next move</div>
                    <div className="mb-4 font-sans text-[13px] leading-[1.7] text-ink2">
                        Start the walkthrough if you need step-by-step guidance, or use the overview video first if you just need a quick refresher.
                    </div>
                    <div className="grid gap-2.5">
                        <button
                            onClick={() => onWalkthrough(proc)}
                            className="cursor-pointer rounded-[18px] border-none bg-navy px-4 py-3 text-left font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-95"
                        >
                            Start walkthrough
                        </button>
                        {videos[0] && (
                            <div className="rounded-[18px] border border-[#E8EDF5] bg-[#FBFCFE] px-4 py-3">
                                <div className="mb-1 font-sans text-[13px] font-semibold text-ink">Watch overview</div>
                                <div className="font-sans text-[12px] leading-[1.6] text-ink2">
                                    {videos[0].title} · {videos[0].duration}
                                </div>
                            </div>
                        )}
                        <div className="rounded-[18px] border border-[#E8EDF5] bg-[#FBFCFE] px-4 py-3">
                            <div className="mb-1 font-sans text-[13px] font-semibold text-ink">Be ready to capture</div>
                            <div className="font-sans text-[12px] leading-[1.6] text-ink2">
                                Time of event, resident response, who was notified, and follow-up observations.
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="rounded-[24px] border border-[#E4EAF4] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,24,39,0.04)]">
                    <div className="mb-3 font-sans text-[1rem] font-semibold tracking-[-0.02em] text-ink">Documentation and forms</div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-[18px] border border-[#E8EDF5] bg-[#FBFCFE] px-4 py-4">
                            <div className="mb-2 font-sans text-[13px] font-semibold text-ink">Documentation prompts</div>
                            <div className="grid gap-2">
                                {documentationSteps.map((step) => (
                                    <div key={step.id} className="font-sans text-[12px] leading-[1.65] text-ink2">
                                        <span className="font-medium text-ink">{step.title}:</span> {step.note_prompt}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-[18px] border border-[#E8EDF5] bg-[#FBFCFE] px-4 py-4">
                            <div className="mb-2 font-sans text-[13px] font-semibold text-ink">Needed resources</div>
                            <div className="grid gap-2">
                                {proc.resources.map((resource) => (
                                    <div key={resource.code} className="flex items-center justify-between gap-3 font-sans text-[12px]">
                                        <span className="text-ink">{resource.label}</span>
                                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-ink3">
                                            {resource.code}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-[24px] border border-[#E4EAF4] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,24,39,0.04)]">
                    <div className="mb-3 font-sans text-[1rem] font-semibold tracking-[-0.02em] text-ink">Videos</div>
                    <div className="grid gap-2.5">
                        {videos.length === 0 && (
                            <div className="rounded-[18px] border border-[#E8EDF5] bg-[#FBFCFE] px-4 py-4 font-sans text-[12px] text-ink3">
                                No linked video for this procedure yet.
                            </div>
                        )}
                        {videos.map((video) => (
                            <div key={video.id} className="rounded-[18px] border border-[#E8EDF5] bg-[#FBFCFE] px-4 py-4">
                                <div className="mb-1 font-sans text-[13px] font-semibold text-ink">{video.title}</div>
                                <div className="font-sans text-[12px] text-ink3">{video.duration}</div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {otherMatches.length > 0 && (
                <section className="mt-5 rounded-[24px] border border-[#E4EAF4] bg-white px-5 py-5 shadow-[0_16px_40px_rgba(17,24,39,0.04)]">
                    <div className="mb-3 font-sans text-[1rem] font-semibold tracking-[-0.02em] text-ink">Other likely procedures</div>
                    <div className="flex flex-wrap gap-2.5">
                        {otherMatches.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => onSwitch(item.id)}
                                className="cursor-pointer rounded-full border border-[#E4EAF4] bg-[#F6F8FC] px-3.5 py-2 font-sans text-[12px] text-ink transition-colors hover:bg-white"
                            >
                                {item.code} · {item.title}
                            </button>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
