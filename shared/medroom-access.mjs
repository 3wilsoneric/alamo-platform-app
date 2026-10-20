// Owner-only while the med-room dashboard is being validated. Do not inherit
// Licensing's wider Raj/Betty/Eric scope or broad administrator roles.
const TENANT_ID = "d72d9036-cff8-4f5f-a6fa-d698f621d420";
const OWNER_OBJECT_ID = "f73371d5-d2b4-48b4-a32b-1edc7c88869f";

export function hasMedroomAccess(claims) {
  return String(claims?.tid ?? "").toLowerCase() === TENANT_ID &&
    String(claims?.oid ?? "").toLowerCase() === OWNER_OBJECT_ID;
}
