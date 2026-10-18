'use client'

import { useMemo, useState } from 'react'
import { mockProcedures } from '@/lib/data'
import type { NavPage } from '@/lib/types'
import Status from '@/components/ui/Status'

const PROCEDURE = mockProcedures[0]!
const SITUATION_TEXT = 'Resident refused evening insulin and is getting agitated.'

function DemoCursor({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute z-20 ${className}`}>
      <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
        <path d="M3 2 16.5 13.2l-6 1.3 2.5 5.8-3 1.3-2.5-5.8-4.4 4.4L3 2Z" fill="#1F2F53" />
        <path d="M3 2 16.5 13.2l-6 1.3 2.5 5.8-3 1.3-2.5-5.8-4.4 4.4L3 2Z" stroke="white" strokeWidth="1" />
      </svg>
    </div>
  )
}

function AssistFrame() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#D7DEF0] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="grid min-h-[420px] grid-cols-[270px_minmax(0,1fr)]">
        <div className="relative border-r border-border bg-white px-4 py-4">
          <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-ink3">Clinical Assist</div>
          <div className="mb-2 font-sans text-[0.98rem] font-semibold text-ink">What&apos;s happening?</div>
          <div className="mb-3 rounded-2xl border border-[#CFE0FF] bg-light px-3 py-3 shadow-[0_0_0_3px_rgba(207,224,255,0.45)]">
            <div className="font-sans text-[0.84rem] leading-relaxed text-ink2">
              {SITUATION_TEXT}
              <span className="ml-0.5 inline-block h-[15px] w-[2px] align-[-2px] bg-[#3657D6]" />
            </div>
          </div>
          <div className="mb-4 inline-flex rounded-xl bg-navy px-3 py-2 font-sans text-[11px] font-semibold text-white">
            Find best-fit procedure
          </div>
          <div className="relative space-y-2">
            {['Medication refusal', 'Behavior escalation', 'Incident note follow-up'].map((item, idx) => (
              <div
                key={item}
                className={`relative rounded-xl border px-3 py-2.5 font-sans text-[0.78rem] ${
                  idx === 0
                    ? 'border-[#CFE0FF] bg-[#EEF3FF] font-semibold text-navy shadow-[0_10px_24px_rgba(54,87,214,0.10)]'
                    : 'border-border bg-light text-ink2'
                }`}
              >
                {idx === 0 ? (
                  <div className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-[#CFE0FF] bg-white shadow-sm" />
                ) : null}
                {item}
              </div>
            ))}
            <DemoCursor className="left-[182px] top-[6px] opacity-100" />
          </div>
        </div>
        <div className="bg-[#F6F8FC] px-5 py-5">
          <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-teal">Knowledge base match</div>
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[9px] text-ink3">{PROCEDURE.code}</span>
            <Status label={PROCEDURE.status} variant={PROCEDURE.status} />
          </div>
          <div className="mb-4 font-sans text-[1.3rem] font-semibold tracking-[-0.03em] text-[#2442B8]">{PROCEDURE.title}</div>
          <div className="mb-4 grid grid-cols-[minmax(0,1fr)_220px] gap-4">
            <div className="rounded-2xl border border-[#CFE0FF] bg-white px-4 py-4">
              <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-ink3">Connected sources</div>
              <div className="space-y-2">
                {[
                  'SOP: Medication refusal protocol',
                  'Policy: resident rights and refusal response',
                  'Guidance path: de-escalation plus observation',
                ].map((step, idx) => (
                  <div key={step} className="flex gap-2">
                    <span className="mt-0.5 font-mono text-[8px] text-red">{idx + 1}</span>
                    <span className="font-sans text-[0.8rem] text-ink2">{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-navy px-4 py-4 text-white">
              <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-white/60">Graph result</div>
              <div className="mb-2 font-sans text-[0.92rem] font-semibold">Launch helper guidance</div>
              <div className="font-sans text-[0.78rem] leading-relaxed text-white/75">
                The system has enough confidence to move from retrieval into guided action.
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-white px-4 py-4">
            <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-ink3">Why it matched</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Trigger', 'Refusal plus rising agitation'],
                ['Risk', 'Behavior could escalate on shift'],
                ['Priority', 'Immediate guidance needed'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-xl border border-border bg-light px-3 py-3">
                  <div className="mb-1 font-sans text-[0.76rem] font-semibold text-ink">{title}</div>
                  <div className="font-sans text-[0.72rem] leading-relaxed text-ink3">{body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function WalkthroughFrame() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#D7DEF0] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="grid min-h-[360px] grid-cols-[230px_minmax(0,1fr)]">
        <div className="border-r border-border bg-white px-4 py-4">
          <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-ink3">Helper mode</div>
          <div className="mb-3 font-sans text-[0.9rem] font-semibold text-ink">Medication refusal guidance</div>
          <div className="space-y-2">
            {['Immediate actions', 'De-escalation cues', 'Monitoring', 'Escalation thresholds', 'Shift follow-up'].map((step, idx) => (
              <div
                key={step}
                className={`rounded-xl border px-3 py-2.5 ${
                  idx === 1
                    ? 'border-[#BFD2FF] bg-[#EEF3FF] shadow-[0_10px_20px_rgba(54,87,214,0.10)]'
                    : 'border-border bg-light'
                }`}
              >
                <div className={`font-sans text-[0.76rem] ${idx === 1 ? 'font-semibold text-navy' : 'text-ink2'}`}>
                  {step}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col bg-[#F6F8FC] px-5 py-5">
          <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-ink3">Guided helper output</div>
          <div className="mb-3 font-sans text-[1.15rem] font-semibold tracking-[-0.03em] text-ink">What to do right now</div>
          <div className="mb-4 rounded-2xl border border-border bg-white px-4 py-4">
            <div className="font-sans text-[0.82rem] leading-relaxed text-ink2">
              Acknowledge the refusal, keep your tone calm, avoid escalating prompts, and monitor the resident before moving into the next escalation step.
            </div>
          </div>
          <div className="mb-4 rounded-2xl border border-[#CFE0FF] bg-white px-4 py-4">
            <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-ink3">Helper callout</div>
            <div className="rounded-xl border border-border bg-light px-3 py-3 font-sans text-[0.78rem] text-ink3">
              Use calm language, confirm the refusal, observe for continued agitation, and escalate only if the behavior keeps rising.
            </div>
          </div>
          <div className="mt-auto flex items-center gap-2">
            <div className="rounded-xl bg-navy px-3 py-2 font-sans text-[11px] font-semibold text-white shadow-[0_12px_24px_rgba(54,87,214,0.24)]">Show next actions</div>
            <div className="rounded-xl border border-border bg-white px-3 py-2 font-sans text-[11px] text-ink2">View source basis</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ElderMarkFrame() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-[#D7DEF0] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div className="flex h-9 items-center gap-2 border-b border-border bg-[#E9EEF8] px-4">
        <div className="h-2 w-2 rounded-full bg-[#FC8A7E]" />
        <div className="h-2 w-2 rounded-full bg-[#F7C45C]" />
        <div className="h-2 w-2 rounded-full bg-[#71C087]" />
        <div className="ml-2 font-mono text-[8px] uppercase tracking-[0.08em] text-ink3">Action summary</div>
      </div>
      <div className="grid min-h-[330px] grid-cols-[minmax(0,1fr)_270px]">
        <div className="px-5 py-5">
          <div className="mb-3 font-sans text-[1.05rem] font-semibold text-ink">Save this guidance to the case</div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {['Recommended next actions', 'Key risk flags', 'Matched workflow + basis', 'Suggested follow-up owner'].map((item) => (
              <div key={item} className="rounded-2xl border border-border bg-light px-4 py-4">
                <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.08em] text-ink3">Included</div>
                <div className="font-sans text-[0.8rem] leading-relaxed text-ink2">{item}</div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border bg-light px-4 py-4">
            <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-ink3">Saved context</div>
            <div className="space-y-2">
              {['Recurring pattern on this case', 'Prior helper recommendations', 'Open follow-up items', 'Shift-to-shift continuity'].map((field, idx) => (
                <div
                  key={field}
                  className={`rounded-xl border bg-white px-3 py-2.5 font-sans text-[0.78rem] ${
                    idx < 2 ? 'border-[#CFE0FF] text-navy shadow-[0_10px_24px_rgba(54,87,214,0.10)]' : 'border-border text-ink2'
                  }`}
                >
                  {field}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border-l border-border bg-[#162033] px-5 py-5">
          <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-white/55">Why save to case</div>
          <div className="space-y-3">
            {[
              'The user leaves with a clean action summary.',
              'The case keeps the matched guidance for later reference.',
              'Future sessions can reuse prior context and patterns.',
              'Over time, the helper becomes more useful for repeat scenarios.',
            ].map((item, idx) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/10 font-mono text-[8px] text-white">
                  {idx + 1}
                </div>
                <div className={`font-sans text-[0.78rem] leading-relaxed text-white/78 ${idx === 0 ? 'animate-pulse' : ''}`}>{item}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4 shadow-[0_12px_28px_rgba(0,0,0,0.22)]">
            <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-white/55">Case action</div>
            <button className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[11px] font-semibold text-[#1F2F53] scale-[1.04]">
              <span className="font-mono text-[10px]">+</span>
              Save to case
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const SLIDES = [
  {
    id: 'situation',
    label: 'Situation',
    title: 'A staff member describes what is happening',
    image: (
      <div className="grid items-stretch gap-5 grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-[28px] border border-[#CFE0FF] bg-[#F5F8FF] px-6 py-6">
          <div className="mb-3 font-mono text-[8px] uppercase tracking-[0.1em] text-ink3">Situation intake</div>
          <div className="mb-3 font-sans text-[0.92rem] font-semibold tracking-[-0.02em] text-ink">What&apos;s happening?</div>
          <div className="mb-4 rounded-[20px] border border-[#CFE0FF] bg-white px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <div className="min-h-[30px] font-sans text-[1rem] leading-relaxed text-ink2">
              {SITUATION_TEXT}
              <span className="ml-0.5 inline-block h-[18px] w-[2px] align-[-3px] bg-[#3657D6]" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Medication refusal', 'Escalation', 'Documentation needed'].map((item) => (
              <div key={item} className="rounded-full border border-[#D9E2F4] bg-white px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-ink3">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[28px] border border-[#BFD2FF] bg-[#EEF3FF] px-5 py-5">
          <div className="mb-2 font-mono text-[8px] uppercase tracking-[0.1em] text-[#6E84BF]">Say this</div>
          <div className="font-sans text-[0.86rem] leading-relaxed text-navy">
            “The user starts with what happened on shift, not a policy lookup.”
          </div>
        </div>
      </div>
    ),
    copy: [
      'The first point of value is plain-language intake. The staff member does not need to know a procedure code, policy number, or document title.',
      'The job of Workflow at this point is to reduce friction. It should let someone describe the situation in operational language and move quickly into the right guidance path.',
    ],
  },
  {
    id: 'assist',
    label: 'Knowledge Base',
    title: 'The knowledge base resolves the best-fit workflow',
    image: <AssistFrame />,
    copy: [
      'This is where Workflow becomes more than a repository. It matches the situation to the best-fit procedure, shows the connected source basis, and makes clear why the procedure applies.',
      'That matters because staff do not just need a title. They need confidence that the guidance is the right fit for the operational situation in front of them.',
    ],
  },
  {
    id: 'walkthrough',
    label: 'Helper',
    title: 'The helper turns knowledge into guided actions',
    image: <WalkthroughFrame />,
    copy: [
      'Once the right procedure is identified, the helper layer turns that knowledge into next actions. This is where Workflow stops being informational and starts being operational.',
      'The point is not to overwhelm the user with the whole SOP. The point is to surface the immediate action, the documentation-sensitive parts, and the safest next move.',
    ],
  },
  {
    id: 'eldermark',
    label: 'Action Summary',
    title: 'The helper closes with a saved action summary',
    image: <ElderMarkFrame />,
    copy: [
      'The action summary matters because useful operational guidance should not disappear when the moment is over. Saving the matched guidance and follow-up context creates continuity.',
      'This is where Workflow starts to become part of the organization’s longer operational memory, rather than just a momentary lookup tool.',
    ],
  },
]

function Arrow({
  direction,
  onClick,
  disabled,
}: {
  direction: 'left' | 'right'
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 w-12 items-center justify-center rounded-full border bg-white shadow-sm transition-colors ${
        disabled
          ? 'cursor-default border-[#E6EBF4] text-[#B5C0D2]'
          : 'cursor-pointer border-[#D9E2F4] text-ink hover:border-[#BFD2FF]'
      }`}
      aria-label={direction === 'left' ? 'Previous slide' : 'Next slide'}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {direction === 'left' ? (
          <path d="M9.8 3.5L5.3 8L9.8 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M6.2 3.5L10.7 8L6.2 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  )
}

interface DemoViewProps {
  onExit: (page: NavPage) => void
}

export default function DemoView({ onExit }: DemoViewProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const slide = SLIDES[activeIndex] ?? SLIDES[0]!
  const progress = useMemo(() => `${activeIndex + 1} / ${SLIDES.length}`, [activeIndex])

  return (
    <div className="min-h-screen bg-[#F6F8FC] text-ink">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(54,87,214,0.09),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(15,157,138,0.06),_transparent_24%),linear-gradient(180deg,_#F9FBFF_0%,_#F4F7FC_100%)]" />
      <div className="relative px-10 py-8">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6E84BF]">Workflow Demo</div>
            <div className="mb-2 font-sans text-[2.35rem] font-semibold tracking-[-0.06em] text-ink">
              One clean story from knowledge base to helper.
            </div>
            <div className="max-w-[640px] font-sans text-[0.98rem] text-ink3">
              Situation in. Knowledge matched. Helper guidance out. Clear follow-through last.
            </div>
          </div>
          <button
            onClick={() => onExit('home')}
            className="cursor-pointer inline-flex items-center gap-2 rounded-full border border-[#D9E2F4] bg-white px-4 py-2.5 font-sans text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-400 hover:text-slate-950"
          >
            <span className="font-mono text-[11px]">←</span>
            Exit demo
          </button>
        </div>

        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              {SLIDES.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setActiveIndex(index)}
                  className={`cursor-pointer rounded-full px-3.5 py-2 font-sans text-[12px] transition-colors ${
                    index === activeIndex
                      ? 'bg-[#111111] text-white'
                      : 'border border-[#D9E2F4] bg-white text-ink2'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="font-mono text-[11px] text-ink3">{progress}</div>
          </div>

          <div className="grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-4">
            <div className="flex justify-center">
              <Arrow direction="left" onClick={() => setActiveIndex((current) => Math.max(0, current - 1))} disabled={activeIndex === 0} />
            </div>

            <div className="rounded-[32px] border border-[#D9E2F4] bg-white px-7 py-7 shadow-[0_12px_48px_rgba(22,32,51,0.05)]">
              <div className="mb-5 flex items-start justify-between gap-6">
                <div>
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6E84BF]">{slide.label}</div>
                  <div className="mb-1.5 font-sans text-[1.55rem] font-semibold tracking-[-0.04em] text-ink">{slide.title}</div>
                </div>
                <div className="font-mono text-[34px] leading-none tracking-[-0.06em] text-[#B7C8EE]">
                  0{activeIndex + 1}
                </div>
              </div>
              {slide.image}
            </div>

            <div className="flex justify-center">
              <Arrow direction="right" onClick={() => setActiveIndex((current) => Math.min(SLIDES.length - 1, current + 1))} disabled={activeIndex === SLIDES.length - 1} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[980px] rounded-[28px] border border-[#DCE5F3] bg-white px-7 py-7 shadow-[0_18px_50px_rgba(22,32,51,0.05)]">
          <div className="mb-4 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6E84BF]">Explanation</div>
          <div className="mb-5 font-sans text-[1.35rem] font-semibold tracking-[-0.04em] text-ink">{slide.title}</div>
          <div className="space-y-4">
            {slide.copy.map((paragraph) => (
              <p key={paragraph} className="font-sans text-[14px] leading-[1.8] text-ink2">
                {paragraph}
              </p>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
