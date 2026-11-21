import { EXECUTIVE_REPORT_SOURCE_PATH, reportHash, reportObject, reportSubject, reportJson, validateReportScope } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { createPlatformAgentSourceAuthorizer } from './platform-agent-source-auth.mjs';
import { readPlatformReportSourceGrants } from './platform-agent-source-grants.mjs';
import { authorizePlatformReportSource } from './ally-report-source-grants.mjs';
import { createPlatformReportSources } from './ally-report-source.mjs';
import { applyProtectedApiHeaders } from './http-response.mjs';
import { readJsonRequestBody } from './http-body.mjs';
import { createHttpError, HttpError } from './http-error-contract.mjs';

export function createPlatformReportSourceHandler({ authorize, readGrants, sources, now = Date.now }) {
  return async (req, res) => {
    applyProtectedApiHeaders(res);
    try {
      const identity = await authorize(req);
      if (req.url !== EXECUTIVE_REPORT_SOURCE_PATH) throw createHttpError(404, 'not_found', 'Not found.');
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw createHttpError(405, 'method_not_allowed', 'Method not allowed.'); }
      let input;
      try {
        input = reportObject(await readJsonRequestBody(req, 16_000), ['version', 'operation', 'subjectId', 'scope', 'step']);
        if (input.version !== 1 || !['authorize', 'catalog', 'read'].includes(input.operation)) throw Error();
        reportSubject(input.subjectId); validateReportScope(input.scope);
        if (input.step !== null) { reportObject(input.step, ['id', 'capability', 'input']); reportJson(input.step, 9000); }
        if (input.operation === 'read' && input.step === null || input.operation === 'catalog' && input.step !== null) throw Error();
      } catch (error) { if (error instanceof HttpError) throw error; throw createHttpError(400, 'report_source_request_invalid', 'Choose a valid report source request.'); }
      const authorization = authorizePlatformReportSource(identity, input, await readGrants(), now());
      let data = {};
      if (input.operation === 'catalog') data = { catalog: await sources.catalog(authorization) };
      if (input.operation === 'read') data = { evidence: await sources.read(input, authorization) };
      const latest = authorizePlatformReportSource(identity, input, await readGrants(), now());
      if (latest.receipt.revision !== authorization.receipt.revision) throw createHttpError(403, 'report_source_grant_changed', 'Source access changed during this read.');
      res.status(200).json({ version: 1, subjectId: input.subjectId, requestHash: reportHash(input), grant: latest.receipt, ...data });
    } catch (error) {
      const publicError = error instanceof HttpError && error.statusCode >= 400 && error.statusCode < 500 ? error : null;
      res.status(publicError?.statusCode ?? 503).json({ error: publicError?.message ?? 'The report source is temporarily unavailable.', code: publicError?.code ?? null });
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
