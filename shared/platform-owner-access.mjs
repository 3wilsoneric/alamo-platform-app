const PLATFORM_OWNER_IDS = new Set([
  "f73371d5-d2b4-48b4-a32b-1edc7c88869f"
]);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function hasPlatformOwnerAccess(claims) {
  if (!claims || typeof claims !== "object") return false;
  return PLATFORM_OWNER_IDS.has(normalize(claims.oid));
}
