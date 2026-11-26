import { EXECUTIVE_REPORT_SOURCE_PATH, reportHash, reportObject, reportSubject, reportJson, validateReportScope } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { createPlatformAgentSourceAuthorizer } from './platform-agent-source-auth.mjs';
import { readPlatformReportSourceGrants } from './platform-agent-source-grants.mjs';
import { authorizePlatformReportSource } from './ally-report-source-grants.mjs';
import { createPlatformReportSources } from './ally-report-source.mjs';
import { mapWithConcurrency } from './ally-data-source.mjs';
import { applyProtectedApiHeaders } from './http-response.mjs';
import { readJsonRequestBody } from './http-body.mjs';
import { createHttpError, HttpError } from './http-error-contract.mjs';

// authorize | authorize-batch | catalog | read | prepare are the deployed engine
// contract and keep their shapes. read-batch, profile and metrics are additive:
// an engine that never sends them observes no change.
const OPERATIONS = ['authorize', 'authorize-batch', 'catalog', 'read', 'prepare', 'read-batch', 'profile', 'metrics'];
// Query rejections for these operations carry only a machine-readable
// correction: {error:{code, field, allowed?}}. No free text or data values.
const STRUCTURED_ERROR_OPERATIONS = new Set(['read', 'read-batch', 'profile', 'metrics']);
export const READ_BATCH_LIMIT = 6;
const READ_BATCH_CONCURRENCY = 3;
// The engine transport accepts 200 KB. Leave room for the envelope.
const READ_BATCH_RESPONSE_BYTES = 180_000;
const corrections = {
  report_source_query_invalid: 'The selected read is invalid. Inspect the source catalog and returned fields, correct the operation or parameters, then retry.',
  report_source_revision_changed: 'The source changed during pagination. Restart this selection from its first page; do not combine the old pages with the new revision.',
  report_source_selection_unavailable: 'This selection is unavailable. Use the source catalog or directory to verify its exact identifiers. This does not establish that the record does not exist.',
};
const IDENTIFIER = /^[A-Za-z0-9_.:\-[\]]{1,80}$/;
const publicError = error => error instanceof HttpError && error.statusCode >= 400 && error.statusCode < 500 ? error : null;

/** Machine-readable query correction. Anything not an identifier is dropped. @param {HttpError} error */
export function structuredQueryError(error) {
  const details = error.details && typeof error.details === 'object' ? /** @type {{field?:unknown,allowed?:unknown}} */ (error.details) : {};
  const code = typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,59}$/.test(error.code) ? error.code : 'query_invalid';
  const field = typeof details.field === 'string' && IDENTIFIER.test(details.field) ? details.field : null;
  const allowed = Array.isArray(details.allowed) ? details.allowed.filter(value => typeof value === 'string' && IDENTIFIER.test(value)).slice(0, 40) : [];
  const body = { error: { code, field, ...(allowed.length ? { allowed } : {}) } };
  while (body.error.allowed && Buffer.byteLength(JSON.stringify(body), 'utf8') > 4000) body.error.allowed.pop();
  return body;
}
const isQueryRejection = error => [400, 422].includes(error.statusCode);
const invalid = (field, allowed) => Object.assign(Error(), { field, allowed });

function validateStep(step, path) {
  try { reportObject(step, ['id', 'capability', 'input']); reportJson(step, 9000); }
  catch { throw invalid(path, ['id', 'capability', 'input']); }
  return step;
}

function validateInput(input) {
  try { reportObject(input, ['version', 'operation', 'subjectId', 'scope', 'step'], ['checks', 'steps', 'query', 'grantRevision', 'catalogEtag']); }
  catch { throw invalid(null, ['version', 'operation', 'subjectId', 'scope', 'step', 'checks', 'steps', 'query', 'grantRevision', 'catalogEtag']); }
  if (input.version !== 1) throw invalid('version');
  if (!OPERATIONS.includes(input.operation)) throw invalid('operation', OPERATIONS);
  try { reportJson(input, 16_000); } catch { throw invalid(null); }
  try { reportSubject(input.subjectId); } catch { throw invalid('subjectId'); }
  try { validateReportScope(input.scope); } catch { throw invalid('scope', ['communityIds', 'from', 'through']); }
  if (input.step !== null) validateStep(input.step, 'step');
  if (['read', 'profile'].includes(input.operation) && input.step === null ||
      ['catalog', 'prepare', 'read-batch', 'metrics', 'authorize-batch'].includes(input.operation) && input.step !== null) throw invalid('step');
  if (input.operation === 'authorize-batch') {
    if (!Array.isArray(input.checks) || !input.checks.length || input.checks.length > 32) throw invalid('checks');
    input.checks.forEach((check, index) => {
      try { reportObject(check, ['scope', 'step']); validateReportScope(check.scope); } catch { throw invalid(`checks[${index}]`); }
      if (check.step !== null) validateStep(check.step, `checks[${index}].step`);
    });
  } else if (input.checks !== undefined) throw invalid('checks');
  if (input.operation === 'read-batch') {
    if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > READ_BATCH_LIMIT) throw invalid('steps');
    input.steps.forEach((step, index) => {
      validateStep(step, `steps[${index}]`);
      if (typeof step.id !== 'string' || !step.id || step.id.length > 80) throw invalid(`steps[${index}].id`);
    });
    if (new Set(input.steps.map(step => step.id)).size !== input.steps.length) throw invalid('steps');
  } else if (input.steps !== undefined) throw invalid('steps');
  if (input.operation === 'profile') {
    if (input.step.capability !== 'platform-data') throw invalid('step.capability', ['platform-data']);
    try { reportObject(input.step.input, ['slice'], ['fields', 'dateField']); } catch { throw invalid('step.input', ['slice', 'fields', 'dateField']); }
  }
  if (input.operation === 'metrics') {
    if (!input.query || typeof input.query !== 'object' || Array.isArray(input.query)) throw invalid('query');
    try { reportJson(input.query, 4000); } catch { throw invalid('query'); }
  } else if (input.query !== undefined) throw invalid('query');
  if (input.grantRevision !== undefined && (typeof input.grantRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.grantRevision))) throw invalid('grantRevision');
  if (input.catalogEtag !== undefined && (input.operation !== 'catalog' || typeof input.catalogEtag !== 'string' || !/^[a-f0-9]{64}$/.test(input.catalogEtag))) throw invalid('catalogEtag');
  return input;
}

export function createPlatformReportSourceHandler({ authorize, readGrants, sources, now = Date.now }) {
  return async (req, res) => {
    applyProtectedApiHeaders(res);
    let operation = null;
    try {
      const identity = await authorize(req);
      if (req.url !== EXECUTIVE_REPORT_SOURCE_PATH) throw createHttpError(404, 'not_found', 'Not found.');
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw createHttpError(405, 'method_not_allowed', 'Method not allowed.'); }
      let input;
      try {
        const body = await readJsonRequestBody(req, 16_000);
        operation = typeof body?.operation === 'string' && OPERATIONS.includes(body.operation) ? body.operation : null;
        input = validateInput(body);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        const details = error && typeof error === 'object' && 'field' in error ? { field: error.field ?? null, allowed: 'allowed' in error ? error.allowed : undefined } : null;
        throw createHttpError(400, 'report_source_request_invalid', 'Choose a valid report source request.', details);
      }
      // The first authorization may use a registry copy validated within the
      // last 30 s. A denial, or a caller-held revision that differs, refreshes
      // immediately; the post-read check below always revalidates with storage.
      let registry = await readGrants();
      let authorization;
      try { authorization = authorizePlatformReportSource(identity, input, registry, now()); }
      catch (error) {
        if (!(error instanceof HttpError) || error.statusCode !== 403) throw error;
        registry = await readGrants({ revalidate: true });
        authorization = authorizePlatformReportSource(identity, input, registry, now());
      }
      if (input.grantRevision !== undefined && input.grantRevision !== authorization.receipt.revision) {
        registry = await readGrants({ revalidate: true });
        authorization = authorizePlatformReportSource(identity, input, registry, now());
      }
      let data = {};
      const batchGrants = selectedRegistry => input.checks.map(check=>{
        try{return authorizePlatformReportSource(identity,{...input,...check},selectedRegistry,now()).receipt;}
        // An invalid metric plan cannot be granted; it is a denial, not an outage.
        catch(error){if(error instanceof HttpError && [400,403].includes(error.statusCode))return null;throw error;}
      });
      const readEvidence = async (selected, allowed) => {
        try { return await sources.read(selected, allowed); }
        catch (error) {
          if (!(error instanceof HttpError) || !Object.hasOwn(corrections, error.code) || ![400,404,409,422].includes(error.statusCode)) throw error;
          return {capability:selected.step.capability,inputHash:reportHash(selected.step.input),scope:selected.scope,
            grantRevision:allowed.receipt.revision,requiresDetail:allowed.grant.detail,
            observedAt:new Date(now()).toISOString(),period:`${selected.scope.from}–${selected.scope.through}`,grain:'unavailable source selection',
            status:'unavailable',coverage:'partial',title:'Read needs correction',answer:null,note:corrections[error.code],
            revision:reportHash({step:selected.step,scope:selected.scope,code:error.code})};
        }
      };
      /** @type {Array<any>} */ const checkedSteps = [];
      const allowStep = step => { checkedSteps.push(step); return authorizePlatformReportSource(identity, { ...input, operation: 'read', step }, registry, now()); };
      if(input.operation==='authorize-batch')data={grants:batchGrants(registry)};
      if (input.operation === 'catalog') {
        const catalog = await sources.catalog(authorization);
        const catalogEtag = reportHash(catalog);
        data = input.catalogEtag === catalogEtag ? { catalog: null, catalogEtag, notModified: true } : { catalog, catalogEtag };
      }
      if (input.operation === 'read') data = { evidence: await readEvidence(input, authorization) };
      const failedStep = (id, error) => {
        const visible = publicError(error);
        if (visible && isQueryRejection(visible)) return { id, ok: false, status: visible.statusCode, ...structuredQueryError(visible) };
        return { id, ok: false, status: visible?.statusCode ?? 503, code: visible?.code ?? null, error: visible?.message ?? 'The report source is temporarily unavailable.' };
      };
      if (input.operation === 'read-batch') {
        // One identity check and one registry lookup for the whole batch. Each
        // step is authorized and fails on its own; none widens another's grant.
        data = { results: await mapWithConcurrency(input.steps, READ_BATCH_CONCURRENCY, async step => {
          const { steps: _steps, ...selected } = { ...input, operation: 'read', step };
          let allowed;
          try { allowed = authorizePlatformReportSource(identity, selected, registry, now()); }
          catch (error) { if (!publicError(error)) throw error; return failedStep(step.id, error); }
          try { return { id: step.id, ok: true, evidence: await readEvidence(selected, allowed) }; }
          catch (error) { return failedStep(step.id, error); }
        }) };
      }
      if (input.operation === 'profile') data = { profile: await sources.profile(input, authorization) };
      if (input.operation === 'metrics') data = { metrics: await sources.metrics(input, authorization, allowStep) };
      if (input.operation === 'prepare') data = await sources.prepare(authorization, async step => {
        const selected = { ...input, operation: 'read', step };
        const allowed = authorizePlatformReportSource(identity, selected, registry, now());
        try { return await sources.read(selected, allowed, { snapshotOnly: true }); }
        catch { return null; } // Optional facts never turn a source outage into zero.
      });
      // Conditional GET: an unchanged registry is a 304, a changed one is read in
      // full. No data leaves under a grant revoked or changed during the read.
      const latestRegistry = await readGrants({ revalidate: true });
      const latest = authorizePlatformReportSource(identity, input, latestRegistry, now());
      if (latest.receipt.revision !== authorization.receipt.revision) throw createHttpError(403, 'report_source_grant_changed', 'Source access changed during this read.');
      if(input.operation==='authorize-batch' && reportHash(data.grants)!==reportHash(batchGrants(latestRegistry)))throw createHttpError(403,'report_source_grant_changed','Source access changed during this read.');
      for (const prepared of data.prepared ?? []) authorizePlatformReportSource(identity, { ...input, step: prepared.step }, latestRegistry, now());
      for (const step of checkedSteps) authorizePlatformReportSource(identity, { ...input, operation: 'read', step }, latestRegistry, now());
      if (input.operation === 'read-batch') {
        let bytes = 0;
        data.results = data.results.map((result, index) => {
          if (!result.ok) return result;
          let receipt = null;
          try { receipt = authorizePlatformReportSource(identity, { ...input, operation: 'read', step: input.steps[index] }, latestRegistry, now()).receipt; }
          catch (error) { if (!publicError(error)) throw error; }
          if (!receipt || receipt.revision !== result.evidence.grantRevision) return { id: result.id, ok: false, status: 403, code: 'report_source_grant_changed', error: 'Source access changed during this read.' };
          bytes += Buffer.byteLength(JSON.stringify(result.evidence), 'utf8');
          if (bytes > READ_BATCH_RESPONSE_BYTES) return { id: result.id, ok: false, status: 413, code: 'report_source_batch_too_large', error: 'This batch response is too large. Retry this step on its own.' };
          return { ...result, grant: receipt };
        });
      }
      res.status(200).json({ version: 1, subjectId: input.subjectId, requestHash: reportHash(input), grant: latest.receipt, ...data });
    } catch (error) {
      const visible = publicError(error);
      if (visible && isQueryRejection(visible) && operation && STRUCTURED_ERROR_OPERATIONS.has(operation)) { res.status(visible.statusCode).json(structuredQueryError(visible)); return; }
      res.status(visible?.statusCode ?? 503).json({ error: visible?.message ?? 'The report source is temporarily unavailable.', code: visible?.code ?? null });
    }
  };
}
let handler;
export async function handlePlatformReportSourceRequest(req, res) {
  if (!process.env.PLATFORM_AGENT_SOURCE_AUDIENCE?.trim()) { applyProtectedApiHeaders(res); res.status(503).json({ error: 'The report source is not configured.' }); return; }
  handler ??= createPlatformReportSourceHandler({ authorize: createPlatformAgentSourceAuthorizer({ audience: process.env.PLATFORM_AGENT_SOURCE_AUDIENCE }),
    readGrants: readPlatformReportSourceGrants, sources: createPlatformReportSources() });
  return handler(req, res);
}
