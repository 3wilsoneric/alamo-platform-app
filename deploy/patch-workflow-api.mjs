import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const importLine = 'import { handleWorkflowApiRequest, isWorkflowApiPath } from "../server/workflow-api.mjs";';
const routeLine = '  if (isWorkflowApiPath(requestPath)) { await handleWorkflowApiRequest(req, res); return; }';
const pathLine = '  const requestPath = String(req.url ?? "").split("?", 1)[0] ?? "";';

export function patchWorkflowApi(source) {
  if (source.includes(importLine) && source.includes(routeLine)) return source;
  if (source.includes('workflow-api.mjs') || source.includes('isWorkflowApiPath')) throw new Error('Unexpected partial Workflow API integration.');
  const entry = 'export default async function handler(req, res) {\n' + pathLine;
  if (source.split(entry).length !== 2) throw new Error('Production API no longer exposes the expected request-path boundary.');
  return importLine + '\n' + source.replace(entry, entry + '\n' + routeLine);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.argv[2] ?? '/app/api/platform.js';
  writeFileSync(filename, patchWorkflowApi(readFileSync(filename, 'utf8')));
}
