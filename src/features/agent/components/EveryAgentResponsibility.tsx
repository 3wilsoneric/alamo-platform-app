import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Pause, Play, Settings2 } from "lucide-react";
import type { EveryAgentSkill } from "../../../../shared/everyagent-catalog.mjs";
import type { EveryAgentCommand, EveryAgentResponsibility as Responsibility } from "../../../../shared/everyagent-contracts.mjs";

export function agentTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "Not checked yet";
}

export default function EveryAgentResponsibility({ skill, responsibility, busy, onCommand }: {
  skill: EveryAgentSkill; responsibility: Responsibility; busy: boolean;
  onCommand: (command: EveryAgentCommand) => Promise<void>;
}) {
  const [settings, setSettings] = useState(false);
  const [scope, setScope] = useState(responsibility.communityIds);
  const update = (paused: boolean, communityIds = responsibility.communityIds) => onCommand({
    action: "configure", skillId: skill.id, expectedVersion: responsibility.version, paused, communityIds
  });
  return <article className="everyagent-responsibility" aria-label={skill.responsibility}>
    <div className="everyagent-row"><span className="everyagent-eyebrow">{skill.applicationName}</span>
      <span className={responsibility.issue ? "everyagent-status everyagent-status--attention" : "everyagent-status"}>{responsibility.paused ? "Paused" : responsibility.issue ? "Needs attention" : "Watching"}</span></div>
    <h3>{skill.title}</h3>
    <p className="everyagent-scope">{skill.scope === "organization" ? "Organization summary" : `${responsibility.communityIds.length} communities`}</p>
    <p className="everyagent-cadence">{skill.cadence}</p>
    <dl><div><dt>Last checked</dt><dd>{agentTime(responsibility.lastChecked)}</dd></div>
      <div><dt>Source updated</dt><dd>{agentTime(responsibility.sourceCheckedAt)}</dd></div></dl>
    {responsibility.issue && <p role="status" className="everyagent-issue">{responsibility.issue}</p>}
    <div className="everyagent-controls">
      <Link to={skill.href}>Open {skill.title}<ArrowUpRight size={15} aria-hidden="true" /></Link>
      <button disabled={busy} onClick={() => { void update(!responsibility.paused).catch(() => {}); }} type="button">{responsibility.paused ? <Play size={14} /> : <Pause size={14} />}{responsibility.paused ? "Resume" : "Pause"}</button>
      {skill.communities.length > 0 && <button type="button" aria-label={`Configure ${skill.title}`} aria-expanded={settings} onClick={() => { setScope(responsibility.communityIds); setSettings(!settings); }}><Settings2 size={16} /></button>}
    </div>
    {settings && <form className="everyagent-settings" onSubmit={event => { event.preventDefault(); void update(responsibility.paused, scope).then(() => setSettings(false)).catch(() => {}); }}>
      <fieldset><legend>Communities to watch</legend>{skill.communities.map(community => <label key={community.id}><input type="checkbox" checked={scope.includes(community.id)} onChange={event => setScope(current => event.target.checked ? [...current, community.id] : current.filter(id => id !== community.id))} />{community.name}</label>)}</fieldset>
      <p>Pausing or changing scope affects your AlamoAgent monitoring. Shared source collection continues.</p>
      <button type="submit" disabled={busy || !scope.length}>Save scope</button>
    </form>}
  </article>;
}
