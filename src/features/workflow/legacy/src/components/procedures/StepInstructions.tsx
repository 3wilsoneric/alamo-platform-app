import type { ProcedureStep } from '@/lib/types'

export default function StepInstructions({ step }: { step: ProcedureStep }) {
  return (
    <div className="font-sans text-[0.95rem] leading-[1.7] text-ink2">
      {step.clickpath && (
        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink3">Where to go</div>
          <p className="m-0 font-medium text-ink">{step.clickpath.join(' → ')}</p>
        </div>
      )}
      <p className="m-0">{step.body}</p>
      {step.expected_result && (
        <div className="mt-3 border-l-2 border-teal pl-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink3">Expected result</div>
          <p className="m-0">{step.expected_result}</p>
        </div>
      )}
    </div>
  )
}
