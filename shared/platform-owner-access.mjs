const PLATFORM_OWNER_IDS = new Set([
  "f73371d5-d2b4-48b4-a32b-1edc7c88869f"
]);

const PLATFORM_OWNER_EMAILS = new Set([
  "ericwilsonalamo@outlook.com"
]);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function hasPlatformOwnerAccess(claims) {
  if (!claims || typeof claims !== "object") return false;
  if (PLATFORM_OWNER_IDS.has(normalize(claims.oid))) return true;

  return [claims.preferred_username, claims.email, claims.upn]
    .map(normalize)
    .some((email) => PLATFORM_OWNER_EMAILS.has(email));
}
