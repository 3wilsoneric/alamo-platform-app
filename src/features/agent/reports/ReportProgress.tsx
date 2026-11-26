import { useEffect, useState } from 'react';
import { reportStatus, type ExecutiveReport } from './reportClient';
import { countFinished, currentStep, formatElapsed, mergeSteps, type LiveStep } from './reportLive';

/** Live progress for a running answer: status, the step Ally is on, how many
 * sources are done and how long it has been working. */
export default function ReportProgress({report, liveSteps, stopping}: {report: ExecutiveReport; liveSteps: LiveStep[]; stopping: boolean}) {
  const steps = mergeSteps(report.sourceProgress ?? [], liveSteps);
  const step = currentStep(steps);
  const total = Math.max(report.totalSources, steps.length), done = Math.min(total, Math.max(report.completedSources, countFinished(steps)));
  const createdAt = report.versions.find(v => v.version === report.selectedVersion)?.createdAt;
  const startedAt = createdAt ? Date.parse(createdAt) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <div className="ally-thread-progress ally-thread-progress--live">
    <span className="ally-working-dot" aria-hidden="true"/>
    <span role="status" className="ally-progress-summary">
      <span>{stopping ? 'Stopping…' : reportStatus(report.status)}</span>
      {total > 0 && <span className="ally-progress-count">{done}/{total}<span className="sr-only"> sources read</span></span>}
      {!stopping && step && <span className="ally-progress-step" title={step.title}>{step.title}</span>}
    </span>
    {Number.isFinite(startedAt) && <span className="ally-progress-elapsed" aria-hidden="true">{formatElapsed(now - startedAt)}</span>}
  </div>;
}
