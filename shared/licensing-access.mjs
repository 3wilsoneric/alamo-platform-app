// Tenant-local Entra guest objects verified for Betty Dominici and Raj Thandi.
// Names, email addresses, and broad administrator roles do not grant access.
const LICENSING_TENANT_ID = "d72d9036-cff8-4f5f-a6fa-d698f621d420";
const LICENSING_USER_IDS = new Set([
  "424b21d4-605a-43a6-8dff-2a89a846e698",
  "75099b5b-5f7d-437f-8e3b-181f1fea1653"
]);

export function hasLicensingAccess(claims) {
  if (!claims || typeof claims !== "object") return false;
  const tenant = typeof claims.tid === "string" ? claims.tid.toLowerCase() : "";
  const objectId = typeof claims.oid === "string" ? claims.oid.toLowerCase() : "";
  return tenant === LICENSING_TENANT_ID && LICENSING_USER_IDS.has(objectId);
}
