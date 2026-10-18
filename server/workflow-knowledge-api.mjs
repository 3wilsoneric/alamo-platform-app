import { randomUUID } from 'node:crypto';
import { readWorkflowKnowledge, hasEveryAgentAccess } from '@alamo/agent-workflow-knowledge';
import { WORKFLOW_KNOWLEDGE_PATH, validateKnowledgeRequest } from '@alamo/agent-workflow-knowledge/contracts';
import { requireApiUser } from './api-auth.mjs';
import { hasPlatformOwnerAccess } from '../shared/platform-owner-access.mjs';
import { readJsonRequestBody } from './http-body.mjs';
import { applyProtectedApiHeaders } from './http-response.mjs';
import { createWorkflowKnowledgeSource } from './workflow-knowledge-source.mjs';

export function createWorkflowKnowledgeHandler({ authorize = requireApiUser, source = createWorkflowKnowledgeSource() } = {}) {
  return async (req, res) => {
    applyProtectedApiHeaders(res);
    res.setHeader('X-Request-ID', randomUUID());
    try {
      const auth = await authorize(req);
      if (!auth?.authenticated || !auth.claims || !hasPlatformOwnerAccess(auth.claims) || !hasEveryAgentAccess(auth.claims)) {
        res.status(403).json({ code: 'workflow_access_denied', error: 'Workflow knowledge access is unavailable.' }); return;
      }
      if (req.url !== WORKFLOW_KNOWLEDGE_PATH) { res.status(404).json({ error: 'Not found.' }); return; }
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'Method not allowed.' }); return; }
      let input;
      try { input = validateKnowledgeRequest(await readJsonRequestBody(req, 4096)); }
      catch { res.status(400).json({ error: 'Enter a short question or a valid document reference.' }); return; }
      const output = await readWorkflowKnowledge({ request: input, source });
      // Revalidate identity after source I/O. A helper panel or supplied subject
      // never establishes access; the source applies the live owner/pilot gates.
      const fresh = await authorize(req);
      if (!fresh?.authenticated || !fresh.claims || !hasPlatformOwnerAccess(fresh.claims) || !hasEveryAgentAccess(fresh.claims) || fresh.claims.oid !== auth.claims.oid || fresh.claims.tid !== auth.claims.tid) {
        res.status(403).json({ error: 'Workflow knowledge access changed.' }); return;
      }
      res.status(200).json(output);
    } catch (error) {
      const code = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 503;
      const status = [401, 403, 404, 409].includes(code) ? code : 503;
      res.status(status).json({ code: status === 409 ? 'workflow_document_changed' : 'workflow_knowledge_unavailable',
        error: status === 409 ? 'This source changed. Search again for the current version.' : 'Workflow knowledge could not be read. Try again.' });
    }
  };
}
const handler = createWorkflowKnowledgeHandler();
export const handleWorkflowKnowledgeRequest = (req, res) => handler(req, res);
