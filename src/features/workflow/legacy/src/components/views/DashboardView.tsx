'use client'

import { useState } from 'react'
import { mockProcedures, REPO_DOCS } from '@/lib/data'
import type { NavPage } from '@/lib/types'
import Status from '@/components/ui/Status'

const RECENT_ACTIVITY = [
  { code: 'PRO-041', title: 'Medication Refusal Protocol', employee: 'Sarah Chen', surface: 'Workspace', action: 'Opened', time: '9:14 AM' },
  { code: 'PRO-017', title: 'Crisis De-escalation Protocol', employee: 'Jordan Okafor', surface: 'Walkthrough', action: 'Completed', time: '8:52 AM' },
  { code: 'PRO-003', title: 'Incident Reporting Procedure', employee: 'Maya Torres', surface: 'Procedures', action: 'Reviewed', time: '8:31 AM' },
  { code: 'PRO-028', title: 'Elopement Prevention & Response', employee: 'T. Rivera', surface: 'Workspace', action: 'Opened', time: 'Yesterday' },
  { code: 'PRO-009', title: 'Restraint & Seclusion Policy', employee: 'Dr. K. Patel', surface: 'Documents', action: 'Updated', time: 'Yesterday' },
  { code: 'PRO-041', title: 'Medication Refusal Protocol', employee: 'Elaine Morris', surface: 'Walkthrough', action: 'Completed', time: 'Yesterday' },
]

const SOURCE_QUEUE = REPO_DOCS.filter((doc) => doc.status !== 'active').slice(0, 4)

function ArrowUpRight({ size = 16, className = '' }: { size?: number; className?: string; 'aria-hidden'?: string }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true"><path d="M3.5 12.5 12 4M5.5 4H12v6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function PanelIcon({ kind }: { kind: 'history' | 'document' | 'book' }) {
  const path = kind === 'history'
    ? <><path d="M3 6a5 5 0 1 1-.2 3.4M3 2.7V6h3.3M8 5v3.2l2 1.2" /><path d="M2.8 9.4 2 10.2" /></>
    : kind === 'document'
      ? <><path d="M4 2.5h5.3L12 5.2v8.3H4zM9.3 2.5v2.7H12M6 8h4M6 10.5h4" /></>
      : <><path d="M8 4.2c-1.8-1-3.6-1-5.5-.4v8.4c2-.6 3.7-.5 5.5.5 1.8-1 3.5-1.1 5.5-.5V3.8c-1.9-.6-3.7-.6-5.5.4ZM8 4.2v8.5" /></>
  return <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
}

interface DashboardViewProps {
  onNav: (page: NavPage) => void
}

export default function DashboardView({ onNav }: DashboardViewProps) {
  const [selectedActivity, setSelectedActivity] = useState(0)
  const selected = RECENT_ACTIVITY[selectedActivity] ?? RECENT_ACTIVITY[0]!
  const selectedProcedure = mockProcedures.find((procedure) => procedure.code === selected.code)

  return (
    <div className="workflow-dashboard overflow-y-auto" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="mx-auto max-w-[1600px] px-5 pb-12 pt-7 lg:px-9">
        <div className="dashboard-intro mb-6 flex items-end justify-between gap-5 border-b border-border pb-5">
          <div>
            <div className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[0.13em] text-[#087b60]">Workflow</div>
            <h1 className="font-sans text-[32px] font-bold tracking-[-0.055em] text-ink">Guidance activity</h1>
            <p className="mt-1 font-sans text-[13px] text-ink3">Illustrative procedure use and source review. Not a live activity log.</p>
          </div>
          <button onClick={() => onNav('assist')} className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[#087b60] px-5 py-3 font-sans text-[13px] font-semibold text-white hover:bg-[#086a54]">
            Open workspace <ArrowUpRight size={16} aria-hidden="true" />
          </button>
        </div>

        <section className="dashboard-panel dashboard-panel--blue overflow-hidden">
          <div className="dashboard-panel-header flex flex-wrap items-center justify-between gap-3 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[#c5dceb] bg-[#eaf3f9] text-[#1d5c8c]"><PanelIcon kind="history" /></span>
              <div>
                <h2 className="font-serif text-[22px] font-semibold tracking-[-0.025em] text-ink">Recent procedure use</h2>
                <p className="font-sans text-[12px] text-ink3">What staff opened, completed, or reviewed</p>
              </div>
            </div>
            <button onClick={() => onNav('procedures')} className="inline-flex items-center gap-1 font-sans text-[12px] font-semibold text-[#1d5c8c] hover:underline">
              Browse procedures <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>

          <div className="grid min-w-0 xl:grid-cols-[minmax(0,1.52fr)_minmax(320px,0.78fr)]">
            <div className="min-w-0 xl:border-r xl:border-border">
              <div className="activity-head grid grid-cols-[66px_minmax(0,1.6fr)_100px_88px_72px] gap-2 px-5 py-3 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-ink3">
                <span>Code</span><span>Procedure</span><span>Employee</span><span>Action</span><span>When</span>
              </div>
              {RECENT_ACTIVITY.map((item, index) => (
                <button
                  key={`${item.code}-${item.employee}-${item.time}`}
                  type="button"
                  onClick={() => setSelectedActivity(index)}
                  aria-pressed={selectedActivity === index}
                  data-active={selectedActivity === index}
                  className="activity-row grid w-full grid-cols-[66px_minmax(0,1.6fr)_100px_88px_72px] items-center gap-2 border-l-[3px] px-5 py-4 text-left transition-colors"
                >
                  <span className="font-mono text-[10px] text-ink3">{item.code}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-sans text-[13px] font-semibold text-ink">{item.title}</span>
                    <span className="mt-0.5 block font-sans text-[11px] text-ink3">{item.surface}</span>
                  </span>
                  <span className="font-sans text-[12px] text-ink2">{item.employee}</span>
                  <span className="font-sans text-[11px] font-medium text-[#1d5c8c]">{item.action}</span>
                  <span className="font-sans text-[11px] text-ink3">{item.time}</span>
                </button>
              ))}
            </div>

            <aside className="bg-[#fbfcfd] px-6 py-6" aria-label="Selected procedure activity">
              <div className="mb-5 font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-[#1d5c8c]">Selected activity</div>
              <div className="mb-1 font-mono text-[11px] text-ink3">{selected.code} · {selected.time}</div>
              <h3 className="font-serif text-[25px] font-semibold leading-[1.14] text-ink">{selected.title}</h3>
              <div className="mt-5 grid grid-cols-[70px_1fr] gap-y-2 border-y border-border py-4 font-sans text-[12px]">
                <span className="text-ink3">Staff</span><span className="font-semibold text-ink">{selected.employee}</span>
                <span className="text-ink3">Activity</span><span className="text-ink">{selected.action} in {selected.surface}</span>
              </div>
              <div className="mt-5 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-ink3">Procedure context</div>
              <p className="mt-2 font-sans text-[13px] leading-[1.65] text-ink2">{selectedProcedure?.overview ?? 'Open the procedure library to review the current guidance and supporting material.'}</p>
              <button onClick={() => onNav('procedures')} className="mt-6 inline-flex items-center gap-2 rounded-md border border-[#1d5c8c] px-4 py-2.5 font-sans text-[12px] font-semibold text-[#1d5c8c] hover:bg-[#eef4f8]">
                View procedure <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </aside>
          </div>
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="dashboard-panel dashboard-panel--rust overflow-hidden">
            <div className="dashboard-panel-header flex items-center justify-between gap-3 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[#ecd1c9] bg-[#faeee9] text-[#a4422c]"><PanelIcon kind="document" /></span>
                <h2 className="font-serif text-[21px] font-semibold text-ink">Source review</h2>
              </div>
              <button onClick={() => onNav('documents')} className="inline-flex items-center gap-1 font-sans text-[12px] font-semibold text-[#a4422c] hover:underline">Open documents <ArrowUpRight size={15} aria-hidden="true" /></button>
            </div>
            <div className="divide-y divide-border px-6">
              {SOURCE_QUEUE.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] text-ink3">{doc.code} · {doc.owner}</div>
                    <div className="mt-1 truncate font-sans text-[13px] font-semibold text-ink">{doc.title}</div>
                  </div>
                  <Status label={doc.status} variant={doc.status} />
                </div>
              ))}
            </div>
          </section>

          <section className="dashboard-panel dashboard-panel--plum overflow-hidden">
            <div className="dashboard-panel-header flex items-center justify-between gap-3 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[#e7d0df] bg-[#f5eaf1] text-[#7b2e62]"><PanelIcon kind="book" /></span>
                <h2 className="font-serif text-[21px] font-semibold text-ink">Procedure library</h2>
              </div>
              <button onClick={() => onNav('procedures')} className="inline-flex items-center gap-1 font-sans text-[12px] font-semibold text-[#7b2e62] hover:underline">View all <ArrowUpRight size={15} aria-hidden="true" /></button>
            </div>
            <div className="divide-y divide-border px-6">
              {mockProcedures.slice(0, 4).map((procedure) => (
                <button key={procedure.id} onClick={() => onNav('procedures')} className="flex w-full items-center justify-between gap-4 py-4 text-left hover:text-[#7b2e62]">
                  <span className="min-w-0">
                    <span className="block font-mono text-[10px] text-ink3">{procedure.code} · {procedure.dept}</span>
                    <span className="mt-1 block truncate font-sans text-[13px] font-semibold">{procedure.title}</span>
                  </span>
                  <ArrowUpRight size={16} className="shrink-0 text-[#7b2e62]" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
