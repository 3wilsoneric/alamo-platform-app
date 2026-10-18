'use client'

import { C, F } from '@/lib/tokens'
import type { Procedure, WalkthroughLaunchContext } from '@/lib/types'
import HR from '@/components/ui/HR'
import Status from '@/components/ui/Status'
import VideoPlayer from '@/components/ui/VideoPlayer'
import StepInstructions from '@/components/procedures/StepInstructions'

interface ProcedureDetailProps {
    proc: Procedure
    onBack: () => void
    onStartWalkthrough: (proc: Procedure, context?: WalkthroughLaunchContext) => void
}

export default function ProcedureDetail({ proc, onBack, onStartWalkthrough }: ProcedureDetailProps) {
    return (
        <div className="workflow-procedure-detail" style={{ overflowY: 'auto', height: 'calc(100vh - 54px)', background: C.bgCream }}>
            <div className="workflow-procedure-sheet" style={{ padding: '36px 48px 80px', maxWidth: 780 }}>
                <button onClick={onBack} style={{ fontFamily: F.sans, fontSize: 13, color: C.navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 28, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    ← All procedures
                </button>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 10.5, color: C.ink3 }}>{proc.code}</span>
                    <Status label={proc.status} variant={proc.status} />
                </div>
                <h1 className="workflow-procedure-title" style={{ fontFamily: F.serif, fontSize: '2rem', color: C.ink, fontWeight: 700, lineHeight: 1.2, marginBottom: 8 }}>{proc.title}</h1>
                <div style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: '0.04em', marginBottom: 28 }}>
                    {proc.dept} · {proc.role} · Updated {proc.updated_at}
                </div>
                <HR className="mb-7" />

                {proc.video && (
                    <>
                        <div style={{ fontFamily: F.mono, fontSize: 9, color: C.ink3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Training video</div>
                        <VideoPlayer video={proc.video} />
                    </>
                )}

                <p className="workflow-procedure-overview" style={{ fontFamily: F.serif, fontSize: '1.05rem', color: C.ink2, lineHeight: 1.75, maxWidth: 600, marginBottom: 28 }}>{proc.overview}</p>

                <div style={{ marginBottom: 32 }}>
                    {proc.steps.map((step, i) => (
                        <div key={step.id} style={{ display: 'flex', gap: 0, marginBottom: 0 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, marginRight: 20 }}>
                                <div style={{ fontFamily: F.mono, fontSize: 10.5, color: C.red, fontWeight: 600, marginTop: 14 }}>{String(i + 1).padStart(2, '0')}</div>
                                {i < proc.steps.length - 1 && <div style={{ width: 1, flex: 1, background: C.border, marginTop: 6, minHeight: 16 }} />}
                            </div>
                            <div className="workflow-procedure-step" style={{ flex: 1, background: C.bg, borderLeft: `3px solid ${C.navy}`, padding: '12px 16px', marginBottom: 8 }}>
                                <div style={{ fontFamily: F.serif, fontSize: '0.95rem', fontWeight: 700, color: C.ink, marginBottom: 4 }}>{step.title}</div>
                                <StepInstructions step={step} />
                                {step.caution && <p className="mt-3 text-[13px] leading-relaxed text-ink2"><strong>If blocked: </strong>{step.caution}</p>}
                            </div>
                        </div>
                    ))}
                </div>

                <HR className="mb-7" />
                <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                    <button className="workflow-procedure-start"
                        onClick={() => onStartWalkthrough(proc, { source: 'procedures' })}
                        style={{ padding: '10px 22px', background: C.navy, border: 'none', cursor: 'pointer', fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: 'white', letterSpacing: '0.02em' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#004d73')}
                        onMouseLeave={e => (e.currentTarget.style.background = C.navy)}
                    >
                        Begin guided walkthrough →
                    </button>
                </div>

                <div>
                    <div style={{ fontFamily: F.serif, fontSize: '1.1rem', fontWeight: 700, color: C.ink, marginBottom: 14 }}>Required resources</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        {proc.resources.map(r => (
                            <div key={r.code} style={{ padding: '14px 15px', border: `1px solid ${C.border}`, background: C.bg, cursor: 'pointer', transition: 'border-color 0.12s' }}
                                onMouseEnter={e => (e.currentTarget.style.borderColor = C.navy)}
                                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                            >
                                <div style={{ fontFamily: F.mono, fontSize: 9, color: C.red, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>{r.type}</div>
                                <div style={{ fontFamily: F.serif, fontSize: '0.9rem', color: C.ink, fontWeight: 700, lineHeight: 1.3, marginBottom: 5 }}>{r.label}</div>
                                <div style={{ fontFamily: F.mono, fontSize: 9.5, color: C.ink3 }}>{r.code}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
