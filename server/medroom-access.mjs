import { hasMedroomAccess } from "../shared/medroom-access.mjs";
import { createHttpError } from "./http-errors.mjs";

export function assertMedroomAccess(authContext) {
  if (authContext?.authenticated === false && authContext?.mode === "explicit-development-bypass") return;
  if (authContext?.authenticated !== true || authContext.mode !== "entra-delegated" || !hasMedroomAccess(authContext.claims)) {
    throw createHttpError(404, "not_found", "Not found.");
  }
}
