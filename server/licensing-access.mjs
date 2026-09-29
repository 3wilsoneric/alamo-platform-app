import { hasLicensingAccess } from "../shared/licensing-access.mjs";
import { createHttpError } from "./http-errors.mjs";

export function assertLicensingAccess(authContext) {
  if (authContext?.authenticated !== true ||
      authContext.mode !== "entra-delegated" ||
      !hasLicensingAccess(authContext.claims)) {
    throw createHttpError(404, "not_found", "Not found.");
  }
}
