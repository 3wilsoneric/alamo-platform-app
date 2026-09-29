import { fetchWithApiAuth, readBoundedJsonResponse } from "../../shared/api/authenticatedFetch";
import { validateLicensingLibrary, validateLicensingReport, validateLicensingUpdates } from "../../../shared/licensing-contracts.mjs";

async function readLicensing<T>(path: string, validate: (value: unknown) => T, signal: AbortSignal) {
  return fetchWithApiAuth(path, { signal, cache: "no-store" }, {
    consume: async (response) => {
      if (!response.ok) {
        const message = response.status === 401 || response.status === 403
          ? "Sign in with your Platform account to view licensing reports."
          : response.status === 404 ? "This report is not in the collection."
          : response.status === 400 ? "Choose a listed community or report type."
          : "The licensing collection is unavailable. Please try again.";
        throw new Error(message);
      }
      return validate(await readBoundedJsonResponse<unknown>(response, 2 * 1024 * 1024));
    }
  });
}

export function fetchLicensingLibrary(query: string, signal: AbortSignal) {
  return readLicensing(`/api/platform/licensing?${query}`, validateLicensingLibrary, signal);
}

export function fetchLicensingReport(id: string, signal: AbortSignal) {
  return readLicensing(`/api/platform/licensing/report?id=${encodeURIComponent(id)}`, validateLicensingReport, signal);
}

export function fetchLicensingUpdates(signal: AbortSignal) {
  return readLicensing("/api/platform/licensing/updates", validateLicensingUpdates, signal);
}
