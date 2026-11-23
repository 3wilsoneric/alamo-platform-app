import assert from 'node:assert/strict';

export const guidancePaths = Object.freeze({
  process: 'server/workflow/process-service.mjs', service: 'server/workflow/service.mjs',
  api: 'server/workflow-api.mjs', reader: 'server/workflow/guidance-discovery.mjs',
});
export const guidanceSourcePath = 'deploy/proforma-guidance-discovery.mjs';
function insert(source, marker, replacement) {
  assert.equal(typeof source, 'string', 'Missing deployed ProForma source.');
  if (source.includes(replacement)) return source;
  assert.equal(source.split(marker).length, 2, `ProForma integration boundary changed: ${marker.slice(0, 80)}`);
  return source.replace(marker, replacement);
}
// The canonical release owns the image and manifest. This pure helper changes
// only the published-guidance boundary, never identity, grants, or stored data.
export function guidanceOverlay(originals, guidance) {
  const p = guidancePaths;
  assert.equal(typeof guidance, 'string');
  if (originals[p.reader] !== undefined) assert.equal(originals[p.reader], guidance,
    'Installed guidance implementation changed; reconcile it before release.');
  return {
    [p.process]: insert(insert(originals[p.process], "import { processHandoff } from './process-handoff.mjs';",
      "import { processHandoff } from './process-handoff.mjs';\nimport { createGuidanceReader } from './guidance-discovery.mjs';"),
      '  const service = {\n', '  const service = {\n    guidance: createGuidanceReader({ load, assertCurrent, scope, actorId: actor.id }),\n'),
    [p.service]: insert(originals[p.service], "      if (method === 'GET' && pathname === '/processes') result = await processes.workspace();",
      "      if (method === 'POST' && pathname === '/processes/guidance') result = await processes.guidance(input);\n      else if (method === 'GET' && pathname === '/processes') result = await processes.workspace();"),
    [p.api]: insert(insert(originals[p.api], "import { ProcessHandoffError } from './workflow/process-handoff.mjs';",
      "import { ProcessHandoffError } from './workflow/process-handoff.mjs';\nimport { GuidanceError } from './workflow/guidance-discovery.mjs';"),
      'error instanceof ProcessHandoffError', 'error instanceof GuidanceError || error instanceof ProcessHandoffError'),
    [p.reader]: guidance,
  };
}
