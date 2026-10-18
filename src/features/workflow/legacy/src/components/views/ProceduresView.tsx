'use client'

import { useState } from 'react'
import { mockProcedures } from '@/lib/data'
import type { Procedure, WalkthroughLaunchContext } from '@/lib/types'
import HR from '@/components/ui/HR'
import Status from '@/components/ui/Status'
import ProcedureDetail from '@/components/procedures/ProcedureDetail'

const TYPES = ['All', 'Medication', 'Crisis', 'Safety', 'Administrative']
const DEPTS = ['All', ...Array.from(new Set(mockProcedures.map((procedure) => procedure.dept)))]

interface ProceduresViewProps {
  onStartWalkthrough: (proc: Procedure, context?: WalkthroughLaunchContext) => void
}

export default function ProceduresView({ onStartWalkthrough }: ProceduresViewProps) {
  const [selected, setSelected] = useState<Procedure | null>(null)
  const [typeFilter, setTypeFilter] = useState('All')
  const [deptFilter, setDeptFilter] = useState('All')

  if (selected) {
    return <ProcedureDetail proc={selected} onBack={() => setSelected(null)} onStartWalkthrough={onStartWalkthrough} />
  }

  const filtered = mockProcedures.filter((procedure) =>
    (typeFilter === 'All' || procedure.type === typeFilter) &&
    (deptFilter === 'All' || procedure.dept === deptFilter)
  )

  return (
    <div className="workflow-procedures flex overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="procedure-filter w-[192px] flex-shrink-0 overflow-y-auto border-r border-border pt-6">
        <div className="mb-2.5 px-5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink3">Category</div>
        {TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            data-active={typeFilter === type}
            className={`block w-full cursor-pointer border-none border-l-[3px] bg-transparent px-5 py-1.5 text-left font-sans text-[13.5px] ${
              typeFilter === type ? 'font-semibold text-ink' : 'border-l-transparent font-normal text-ink3'
            }`}
          >
            {type}
          </button>
        ))}
        <HR className="mx-5 my-4" />
        <div className="mb-2.5 px-5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink3">Department</div>
        {DEPTS.map((department) => (
          <button
            key={department}
            onClick={() => setDeptFilter(department)}
            data-active={deptFilter === department}
            className={`department-filter block w-full cursor-pointer border-none border-l-[3px] bg-transparent px-5 py-1.5 text-left font-sans text-[13.5px] ${deptFilter === department ? 'font-semibold text-ink' : 'border-l-transparent text-ink3'}`}
          >
            {department}
          </button>
        ))}
      </div>

      <div className="procedure-list flex-1 overflow-y-auto px-6 pt-7 lg:px-9">
        <div className="mb-6 border-b border-border pb-5">
          <div className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.15em] text-[#087b60]">Guidance library / Browse</div>
          <h1 className="font-sans text-[30px] font-semibold tracking-[-0.05em] text-ink">Procedures</h1>
          <div className="mt-1 font-sans text-[13px] text-ink3">
            {filtered.length} procedure{filtered.length !== 1 ? 's' : ''} in this view
          </div>
        </div>
        <div className="procedure-head grid gap-x-4 px-3 py-3" style={{ gridTemplateColumns: '68px 1fr 140px 108px 72px' }}>
          {['Code', 'Title', 'Department', 'Updated', 'Status'].map((heading) => (
            <span key={heading} className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink3">
              {heading}
            </span>
          ))}
        </div>
        {filtered.map((procedure, i) => (
          <div key={procedure.id}>
            <button
              onClick={() => setSelected(procedure)}
              className="procedure-row grid w-full cursor-pointer items-center gap-x-4 bg-transparent px-3 py-4 text-left transition-colors"
              style={{ gridTemplateColumns: '68px 1fr 140px 108px 72px' }}
            >
              <span className="font-mono text-[10px] text-ink3">{procedure.code}</span>
              <span className="font-serif text-[0.975rem] text-ink">{procedure.title}</span>
              <span className="font-sans text-[13px] text-ink3">{procedure.dept}</span>
              <span className="font-mono text-[10px] text-ink3">{procedure.updated_at}</span>
              <Status label={procedure.status} variant={procedure.status} />
            </button>
            {i < filtered.length - 1 && <HR />}
          </div>
        ))}
      </div>
    </div>
  )
}
