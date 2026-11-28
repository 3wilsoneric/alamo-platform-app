import assert from 'node:assert/strict';

export const analystPaths = Object.freeze({process:'server/workflow/process-service.mjs',service:'server/workflow/service.mjs',reader:'server/workflow/analyst-reader.mjs'});
export const analystSourcePath='deploy/proforma-analyst-reader.mjs';
function insert(source,before,after) {
  assert.equal(typeof source,'string');
  if(source.includes(after))return source;
  assert.equal(source.split(before).length,2,`ProForma analytical boundary changed: ${before.slice(0,70)}`);
  return source.replace(before,after);
}
export function analystOverlay(originals,reader) {
  const p=analystPaths;
  if(originals[p.reader]!==undefined)assert.equal(originals[p.reader],reader,'Reconcile the installed ProForma analyst reader.');
  const process=insert(insert(originals[p.process],"import { knowledgeSources } from './knowledge-sources.mjs';",
    "import { knowledgeSources } from './knowledge-sources.mjs';\nimport { createAnalystReader } from './analyst-reader.mjs';"),
    '  const service = {\n',
    "  const service = {\n    analyst: createAnalystReader({ load, assertCurrent, sources: knowledgeSources, originals: (records, processId) => loadOriginals(records, readSource, processId), retrieve: retrieveKnowledge, evidence: citation => service.evidence(citation) }),\n");
  const service=insert(insert(originals[p.service],"      if (method === 'POST' && pathname === '/processes/guidance') result = await processes.guidance(input);",
    "      if (method === 'POST' && pathname === '/processes/analyst') result = await processes.analyst(input);\n      else if (method === 'POST' && pathname === '/processes/guidance') result = await processes.guidance(input);"),
    '    if (changed) {',"    if (changed && pathname !== '/processes/analyst') {");
  return {[p.process]:process,[p.service]:service,[p.reader]:reader};
}
