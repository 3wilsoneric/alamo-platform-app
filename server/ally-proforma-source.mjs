import { fileURLToPath } from 'node:url';
import { reportSubject } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { createWorkflowService } from './workflow/service.mjs';
import { createWorkflowAzurePersistence, workflowBlobContainer } from './workflow/azure-persistence.mjs';
import { readCatalogSources } from './workflow/catalog.mjs';

const contentRoot = fileURLToPath(new URL('../src/features/workflow/legacy/', import.meta.url));

// Runs inside the owning ProForma host, under the authenticated Ally source
// grant. The release preserves that host's current modules as external readers.
// This path has read permission only and never invokes guidance generation.
/** @param {{env?: NodeJS.ProcessEnv, persistence?: any, readSources?: Function, createService?: Function}} options */
export function createProformaAnalystSource({ env = process.env, persistence,
  readSources = () => readCatalogSources(contentRoot), createService = createWorkflowService } = {}) {
  return async (input, { subjectId }) => {
    reportSubject(subjectId);
    if (env.WORKFLOW_CONTENT_ENABLED !== 'true') throw Error('ProForma source content is unavailable.');
    const context = { scope: { tenantId: EVERYAGENT_TENANT, workspace: 'workflow' },
      actor: { id: `ally:${EVERYAGENT_TENANT}:${subjectId}`, name: 'Ally organizational reader' }, permissions: ['read'] };
    const source = createService({ persistence: persistence ?? createWorkflowAzurePersistence(workflowBlobContainer(env)), readSources, env });
    return source(context, 'POST', '/processes/analyst', input);
  };
}
