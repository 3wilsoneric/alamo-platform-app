import type { AccountInfo } from "@azure/msal-browser";

function normalizeNamePart(value?: string | null) {
  return value?.trim() || "";
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveNameFromUsername(username?: string | null) {
  const normalized = normalizeNamePart(username);
  if (!normalized) return "";

  const withoutGuestMarker = normalized.replace(/#EXT#.*/i, "");
  const localPart = withoutGuestMarker.split("@")[0]?.trim() || "";
  if (!localPart) return "";

  const cleaned = localPart
    .replace(/_(?:gmail|outlook|hotmail|yahoo|icloud|aol|live|msn|onmicrosoft)\.(?:com|net|org)$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b(?:gmail|outlook|hotmail|yahoo|icloud|aol|live|msn|onmicrosoft|com|net|org|ext)\b/gi, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  return toTitleCase(cleaned);
}

export function getAccountDisplayName(account?: AccountInfo | null) {
  const directName = normalizeNamePart(account?.name);
  if (directName) return directName;

  const givenName = normalizeNamePart(account?.idTokenClaims?.given_name as string | undefined);
  const familyName = normalizeNamePart(account?.idTokenClaims?.family_name as string | undefined);
  const combined = [givenName, familyName].filter(Boolean).join(" ");
  if (combined) return combined;

  const derivedName = deriveNameFromUsername(account?.username);
  if (derivedName) return derivedName;

  return normalizeNamePart(account?.username) || "User";
}

export function getAccountInitials(account?: AccountInfo | null) {
  const displayName = getAccountDisplayName(account);
  const parts = displayName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return "U";
  const firstPart = parts[0];
  if (!firstPart) return "U";
  if (parts.length === 1) return firstPart.slice(0, 2).toUpperCase();

  return `${firstPart[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

export function getAccountRoleLabel(account?: AccountInfo | null) {
  const roles = account?.idTokenClaims?.roles;

  if (Array.isArray(roles) && roles.length > 0) {
    return String(roles[0]);
  }

  return "Alamo Platform User";
}
