import { useEveryAgent } from "../EveryAgentContext";
import { agentTime } from "./EveryAgentResponsibility";

const phases = { queued: "Waiting to start", collect: "Reading sources", validate: "Checking evidence", publish: "Saving results",
  completed: "Completed", failed: "Needs a retry", canceled: "Canceled" };

export default function EveryAgentRuns() {
  const { data, busy, command } = useEveryAgent();
  const tasks = data?.tasks ?? [];
  if (!tasks.length) return null;
  return <details className="everyagent-history everyagent-runs" open={tasks.some(task => task.status === "queued" || task.status === "running")}>
    <summary>Work progress</summary>
    <ul>{tasks.map(task => {
      const skill = data?.skills.find(item => item.id === task.skillId)?.title ?? "Check";
      const assignment = data?.responsibilities.find(item => item.skillId === task.skillId);
      const retryable = task.status === "failed" && assignment && !assignment.paused && assignment.version === task.assignmentVersion &&
        !tasks.some(other => other.previousRunId === task.id || (other.skillId === task.skillId && ["queued", "running"].includes(other.status)));
      return <li key={task.id}>
        <div><span>{skill}</span><span>{phases[task.phase]}</span><time dateTime={task.updatedAt}>{agentTime(task.updatedAt)}</time></div>
        {task.issue && <p>{task.issue}</p>}
        {task.status === "running" || task.status === "queued" ? <button type="button" disabled={busy} aria-label={`Cancel ${skill} check`} onClick={() => { void command({ action: "cancel_run", runId: task.id }).catch(() => {}); }}>Cancel check</button> :
          retryable ? <button type="button" disabled={busy} aria-label={`Retry ${skill} check`} onClick={() => { void command({ action: "retry_run", runId: task.id }).catch(() => {}); }}>Retry check</button> : null}
      </li>;
    })}</ul>
  </details>;
}
