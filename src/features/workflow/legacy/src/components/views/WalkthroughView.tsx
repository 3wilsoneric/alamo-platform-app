'use client'

import { useState } from 'react'
import { mockProcedures } from '@/lib/data'
import type { Procedure, WalkthroughLaunchContext, WalkthroughSession } from '@/lib/types'
import HR from '@/components/ui/HR'
import Status from '@/components/ui/Status'
import WalkthroughRunner from '@/components/walkthrough/WalkthroughRunner'

type Stage = 'picker' | 'running'

const EMPTY_SESSION: WalkthroughSession = { stepIdx: 0, notes: {}, skipped: new Set(), completed: new Set() }

interface WalkthroughViewProps {
  startProcId?: number | null
  startContext?: WalkthroughLaunchContext | null
}

export default function WalkthroughView({ startProcId, startContext }: WalkthroughViewProps) {
  const [stage, setStage] = useState<Stage>(startProcId ? 'running' : 'picker')
  const [proc, setProc] = useState<Procedure | null>(
    startProcId ? mockProcedures.find((p) => p.id === startProcId) ?? null : null
  )
  const [session, setSession] = useState<WalkthroughSession>(EMPTY_SESSION)

  const selectProc = (procedure: Procedure) => {
    setProc(procedure)
    setSession(EMPTY_SESSION)
    setStage('running')
  }

  const finish = () => {
    setProc(null)
    setStage('picker')
  }

  const exit = () => {
    setSession(EMPTY_SESSION)
    setProc(null)
    setStage('picker')
  }

  if (stage === 'running' && proc) {
    return (
      <WalkthroughRunner
        proc={proc}
        session={session}
        setSession={setSession}
        onFinish={finish}
        onExit={exit}
        launchContext={startContext ?? null}
      />
    )
  }

  return (
    <div className="overflow-y-auto bg-cream" style={{ height: 'calc(100vh - 72px)' }}>
      <div className="max-w-[740px] border-b border-border px-11 pb-6 pt-12">
        <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink3">Walkthrough</div>
        <h1 className="mb-2.5 font-sans text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-ink">
          Select a procedure to begin
        </h1>
        <p className="max-w-[560px] font-sans text-[1rem] leading-[1.65] text-ink2">
          Choose a procedure to jump straight into the guided run. Notes are captured as you go and summarized in the
          completion record.
        </p>
      </div>
      <div className="px-11 pb-20 pt-8">
        {mockProcedures.map((procedure, i, arr) => (
          <div key={procedure.id}>
            <button
              onClick={() => selectProc(procedure)}
              className="flex w-full cursor-pointer items-center gap-5 bg-transparent py-4 text-left transition-colors hover:bg-bg"
            >
              <div className="min-w-[60px] flex-shrink-0 text-right">
                <div className="font-mono text-[10px] text-ink3">{procedure.code}</div>
                <div className="mt-0.5 font-mono text-[9px] text-ink3">{procedure.steps.length} steps</div>
              </div>
              <div className="h-9 w-px flex-shrink-0 bg-border" />
              <div className="flex-1">
                <div className="mb-0.5 font-sans text-[1.02rem] font-semibold tracking-[-0.02em] text-ink">{procedure.title}</div>
                <div className="font-sans text-[12px] text-ink3">
                  {procedure.dept} · {procedure.role}
                </div>
              </div>
              <Status label={procedure.status} variant={procedure.status} />
              <div className="font-mono text-[11px] text-navy">Start →</div>
            </button>
            {i < arr.length - 1 && <HR />}
          </div>
        ))}
      </div>
    </div>
  )
}
