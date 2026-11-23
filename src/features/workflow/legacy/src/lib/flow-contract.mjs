export const FLOW_LIMITS = Object.freeze({ transitions: 200, branches: 8, visits: 200 });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const temporaryStep = /^new-[1-9][0-9]?$/;
const temporaryPath = /^new-path-[1-9][0-9]{0,2}$/;
const fail = message => { throw new Error(message); };
const shape = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail('A process path contains unsupported fields.');
};
const text = (value, max, field) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail(`Check ${field}; its maximum length is ${max} characters.`);
  return value.trim();
};

/** Draft paths may be incomplete but can never point to missing steps. Temporary
 * references are accepted only in a validated conversation plan, never storage. */
export function validateFlow(value, stepIds, { temporary = false } = {}) {
  shape(value, ['schemaVersion', 'entryStepId', 'transitions']);
  if (value.schemaVersion !== 1) fail('This process path version is not supported.');
  const step = id => typeof id === 'string' && (uuid.test(id) || temporary && temporaryStep.test(id)) && (temporary || stepIds.includes(id));
  if (value.entryStepId !== null && !step(value.entryStepId)) fail('The process entry must reference an existing step.');
  if (!Array.isArray(value.transitions) || value.transitions.length > FLOW_LIMITS.transitions) fail('A process can contain up to 200 paths.');
  const ids = new Set(), outgoing = new Map();
  const transitions = value.transitions.map(path => {
    shape(path, ['id', 'fromStepId', 'toStepId', 'terminal', 'condition', 'handoff']);
    if (typeof path.id !== 'string' || !(uuid.test(path.id) || temporary && temporaryPath.test(path.id)) || ids.has(path.id)) fail('Process paths need unique stable identifiers.');
    ids.add(path.id);
    if (!step(path.fromStepId) || path.toStepId !== null && !step(path.toStepId)) fail('A process path references a missing step. Update its paths before removing a step.');
    if (path.toStepId === null ? !['complete', 'stop'].includes(path.terminal) : path.terminal !== null) fail('A path must continue to a step, finish, or stop.');
    const condition = text(path.condition, 2000, 'path condition');
    const group = outgoing.get(path.fromStepId) ?? [];
    if (condition && group.some(item => item.toLowerCase() === condition.toLowerCase())) fail('Paths from the same step need distinct conditions.');
    group.push(condition); outgoing.set(path.fromStepId, group);
    if (group.length > FLOW_LIMITS.branches) fail('A step can have up to eight alternative paths.');
    let handoff = null;
    if (path.handoff !== null) {
      shape(path.handoff, ['role', 'acceptance']);
      handoff = { role: text(path.handoff.role, 160, 'receiving role'), acceptance: text(path.handoff.acceptance, 2000, 'handoff acceptance') };
    }
    return { id: path.id, fromStepId: path.fromStepId, toStepId: path.toStepId, terminal: path.terminal, condition, handoff };
  });
  return { schemaVersion: 1, entryStepId: value.entryStepId, transitions };
}

export function flowGaps(flow, steps) {
  const gaps = [], outgoing = new Map(steps.map(step => [step.id, flow.transitions.filter(path => path.fromStepId === step.id)]));
  if (!flow.entryStepId) gaps.push('Process entry step');
  for (const [index, step] of steps.entries()) {
    const paths = outgoing.get(step.id);
    if (!paths.length) gaps.push(`Step ${index + 1}: next step or ending`);
    for (const [pathIndex, path] of paths.entries()) {
      if (paths.length > 1 && !path.condition) gaps.push(`Step ${index + 1}, path ${pathIndex + 1}: decision condition`);
      if (path.handoff && (!path.handoff.role || !path.handoff.acceptance)) gaps.push(`Step ${index + 1}, path ${pathIndex + 1}: receiving role and acceptance`);
    }
  }
  const reachable = new Set(), pending = flow.entryStepId ? [flow.entryStepId] : [];
  while (pending.length) {
    const id = pending.pop(); if (reachable.has(id)) continue;
    reachable.add(id);
    for (const path of outgoing.get(id) ?? []) if (path.toStepId) pending.push(path.toStepId);
  }
  if (flow.entryStepId) steps.forEach((step, index) => { if (!reachable.has(step.id)) gaps.push(`Step ${index + 1}: unreachable from the entry`); });
  const canEnd = new Set(flow.transitions.filter(path => path.terminal).map(path => path.fromStepId));
  let changed = true;
  while (changed) {
    changed = false;
    for (const path of flow.transitions) if (canEnd.has(path.toStepId) && !canEnd.has(path.fromStepId)) { canEnd.add(path.fromStepId); changed = true; }
  }
  steps.forEach((step, index) => { if (!canEnd.has(step.id)) gaps.push(`Step ${index + 1}: no route to finish or stop`); });
  return gaps;
}

export function linearFlow(steps) {
  return { schemaVersion: 1, entryStepId: steps[0]?.id ?? null, transitions: steps.map((step, index) => ({
    id: `sequence:${step.id}`, fromStepId: step.id, toStepId: steps[index + 1]?.id ?? null,
    terminal: index === steps.length - 1 ? 'complete' : null, condition: '', handoff: null,
  })) };
}

export function renderFlow(flow, steps) {
  const name = id => { const index = steps.findIndex(step => step.id === id); return index === -1 ? '[Not provided]' : `Step ${index + 1}`; };
  return ['Paths', `Start at: ${name(flow.entryStepId)}`, ...flow.transitions.flatMap(path => [
    `${name(path.fromStepId)} → ${path.toStepId ? name(path.toStepId) : path.terminal === 'stop' ? 'Stop / escalate' : 'Complete'}`,
    ...(path.condition ? [`   When: ${path.condition}`] : []),
    ...(path.handoff ? [`   Receiving role: ${path.handoff.role || '[Not provided]'}`, `   Accepts when: ${path.handoff.acceptance || '[Not provided]'}`] : []),
  ]), ''];
}
