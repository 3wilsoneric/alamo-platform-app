import { isSnapshotUnavailableError } from "./snapshot-status.mjs";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";

export class HttpError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} code
   * @param {string} message
   * @param {unknown} [details]
   */
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * @param {number} statusCode
 * @param {string} code
 * @param {string} message
 * @param {unknown} [details]
 */
export function createHttpError(statusCode, code, message, details = null) {
  return new HttpError(statusCode, code, message, details);
}

export function getRequestUrl(req, origin = "https://www.alamoplatform.com") {
  try {
    return new URL(req.url ?? "", origin);
  } catch {
    throw createHttpError(400, "request_url_invalid", "Request URL is invalid.");
  }
}

export function getPublicErrorMessage(error, fallbackMessage) {
  const statusCode = error?.statusCode ?? (isSnapshotUnavailableError(error) ? 503 : 500);
  const isControlled = statusCode < 500 || isSnapshotUnavailableError(error) || String(error?.code ?? "").startsWith("api_");
  if (!isProductionLikeRuntime() || isControlled) {
    return error instanceof Error ? error.message : fallbackMessage;
  }
  return fallbackMessage;
}

export function getApiError(error, fallbackMessage = "Databricks request failed.") {
  const statusCode = error?.statusCode ?? (isSnapshotUnavailableError(error) ? 503 : 500);
  const message = getPublicErrorMessage(error, fallbackMessage);
  const controlled = statusCode < 500 || isSnapshotUnavailableError(error) || String(error?.code ?? "").startsWith("api_");
  const exposeDetails = !isProductionLikeRuntime() || statusCode < 500;
  if (isProductionLikeRuntime() && statusCode >= 500 && message === fallbackMessage) {
    console.error("Platform API request failed.", error);
  }
  return {
    statusCode,
    body: {
      error: message,
      code: !isProductionLikeRuntime() || controlled ? error?.code ?? null : null,
      details: exposeDetails ? error?.details ?? null : null
    }
  };
}
