import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireApiUser } from "./api-auth.mjs";
import { applyProtectedApiHeaders } from "./http-response.mjs";
import { readJsonRequestBody } from "./http-body.mjs";
import { readCatalogSources } from "./workflow/catalog.mjs";
import { createWorkflowService } from "./workflow/service.mjs";
import { workflowContext } from "./workflow/access.mjs";
import { createWorkflowAzurePersistence, workflowBlobContainer } from "./workflow/azure-persistence.mjs";
import { fail, WorkflowError } from "./workflow/model.mjs";

export const WORKFLOW_API_PREFIX = "/api/platform/workflow/v1";
const contentRoot = fileURLToPath(new URL("../src/features/workflow/legacy/", import.meta.url));
export function isWorkflowApiPath(pathname) { return pathname === WORKFLOW_API_PREFIX || pathname.startsWith(WORKFLOW_API_PREFIX + "/"); }

/** @param {{ authenticate?: Function, env?: NodeJS.ProcessEnv, persistence?: any, readSources?: Function }} options */
export function createWorkflowApiHandler({ authenticate = requireApiUser, env = process.env, persistence, readSources = () => readCatalogSources(path.resolve(contentRoot)) } = {}) {
  return async function handle(req, res) {
    applyProtectedApiHeaders(res);
    let status = 200, result, phase = "authentication";
    try {
      const auth = await authenticate(req), context = workflowContext(auth, env.WORKFLOW_ACCESS_GRANTS_JSON);
      if (env.WORKFLOW_CONTENT_ENABLED !== "true") fail(503, "workflow_unavailable", "Shared Workflow authoring is not enabled on this server.");
      phase = "input";
      const url = new URL(req.url, "http://workflow.internal");
      if (!isWorkflowApiPath(url.pathname)) fail(404, "route_missing", "That Workflow route was not found.");
      if (!["GET", "PUT", "POST"].includes(req.method)) fail(405, "method_not_allowed", "Unsupported Workflow method.");
      let body = {};
      if (req.method !== "GET") {
        if (String(req.headers?.["content-type"] ?? "").split(";")[0]?.trim() !== "application/json") fail(415, "json_required", "Send JSON content.");
        body = await readJsonRequestBody(req, 256 * 1024);
      }
      phase = "storage";
      const storage = persistence ?? createWorkflowAzurePersistence(workflowBlobContainer(env));
      const service = createWorkflowService({ persistence: storage, readSources });
      result = await service(context, req.method, url.pathname.slice(WORKFLOW_API_PREFIX.length), body, url.searchParams);
    } catch (error) {
      const known = error instanceof WorkflowError || (phase !== "storage" && error && typeof error === "object" && "statusCode" in error);
      status = known ? Number("status" in error ? error.status : error.statusCode) : 503;
      result = { error: { code: known && "code" in error ? error.code : "workflow_unavailable", message: known && "message" in error ? error.message : "Workflow storage is unavailable. Keep your text and refresh before retrying." } };
    }
    res.status(status).json(result);
  };
}
export const handleWorkflowApiRequest = createWorkflowApiHandler();
