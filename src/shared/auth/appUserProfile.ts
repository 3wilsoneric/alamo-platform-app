import type { AccountInfo } from "@azure/msal-browser";
import { useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { isE2EAuthBypassEnabled } from "../../app/auth/authConfig";
import {
  getAccountDisplayName,
  getAccountInitials,
  getAccountRoleLabel
} from "./userProfile";
import {
  readJsonStorage,
  writeJsonStorage
} from "../storage/browserStorage";

const PROFILE_STORAGE_PREFIX = "alamo-platform:user-profile:";
const PROFILE_TEXT_LIMITS = {
  accountId: 512,
  identifier: 512,
  email: 512,
  name: 256,
  detail: 512,
  role: 256
} as const;

export interface AppUserProfile {
  profileVersion: 1;
  source: "entra-token";
  homeAccountId: string;
  entraOid: string | null;
  tenantId: string | null;
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  phone: string;
  roleLabel: string;
  avatarStyle: "initials";
  notificationSettings: {
    emailDigest: boolean;
    reportAlerts: boolean;
    systemAlerts: boolean;
    weeklyReports: boolean;
    realtime: boolean;
  };
  onboardingCompleted: true;
  createdAt: string;
  updatedAt: string;
}

export type AppUserProfileUpdate = Partial<
  Pick<AppUserProfile, "displayName" | "firstName" | "lastName" | "jobTitle" | "department" | "phone">
>;

function normalize(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function boundedText(value: unknown, maximumLength: number) {
  const text = normalize(value);
  return text.length <= maximumLength ? text : text.slice(0, maximumLength);
}

function boundedNullableText(value: unknown, maximumLength: number) {
  if (value === null) return null;
  const text = boundedText(value, maximumLength);
  return text || null;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function sanitizeStoredProfile(value: unknown, account: AccountInfo): AppUserProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<AppUserProfile>;
  const notifications = candidate.notificationSettings;
  if (
    candidate.profileVersion !== 1 ||
    candidate.source !== "entra-token" ||
    candidate.homeAccountId !== account.homeAccountId ||
    candidate.homeAccountId.length > PROFILE_TEXT_LIMITS.accountId ||
    candidate.avatarStyle !== "initials" ||
    candidate.onboardingCompleted !== true ||
    !notifications ||
    typeof notifications !== "object" ||
    typeof notifications.emailDigest !== "boolean" ||
    typeof notifications.reportAlerts !== "boolean" ||
    typeof notifications.systemAlerts !== "boolean" ||
    typeof notifications.weeklyReports !== "boolean" ||
    typeof notifications.realtime !== "boolean" ||
    !isValidTimestamp(candidate.createdAt) ||
    !isValidTimestamp(candidate.updatedAt)
  ) {
    return null;
  }

  return {
    profileVersion: 1,
    source: "entra-token",
    homeAccountId: boundedText(candidate.homeAccountId, PROFILE_TEXT_LIMITS.accountId),
    entraOid: boundedNullableText(candidate.entraOid, PROFILE_TEXT_LIMITS.identifier),
    tenantId: boundedNullableText(candidate.tenantId, PROFILE_TEXT_LIMITS.identifier),
    email: boundedText(candidate.email, PROFILE_TEXT_LIMITS.email),
    displayName: boundedText(candidate.displayName, PROFILE_TEXT_LIMITS.name),
    firstName: boundedText(candidate.firstName, PROFILE_TEXT_LIMITS.name),
    lastName: boundedText(candidate.lastName, PROFILE_TEXT_LIMITS.name),
    jobTitle: boundedText(candidate.jobTitle, PROFILE_TEXT_LIMITS.detail),
    department: boundedText(candidate.department, PROFILE_TEXT_LIMITS.detail),
    phone: boundedText(candidate.phone, PROFILE_TEXT_LIMITS.detail),
    roleLabel: boundedText(candidate.roleLabel, PROFILE_TEXT_LIMITS.role),
    avatarStyle: "initials",
    notificationSettings: {
      emailDigest: notifications.emailDigest,
      reportAlerts: notifications.reportAlerts,
      systemAlerts: notifications.systemAlerts,
      weeklyReports: notifications.weeklyReports,
      realtime: notifications.realtime
    },
    onboardingCompleted: true,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  };
}

function getStorageKey(account: AccountInfo) {
  return `${PROFILE_STORAGE_PREFIX}${account.homeAccountId}`;
}

function splitDisplayName(displayName: string) {
  const parts = displayName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : ""
  };
}

function readStoredProfile(account: AccountInfo): AppUserProfile | null {
  if (typeof window === "undefined") return null;

  const parsed = readJsonStorage<unknown>(getStorageKey(account), {
    fallback: null,
    label: "app user profile"
  });
  return sanitizeStoredProfile(parsed, account);
}

function writeStoredProfile(account: AccountInfo, profile: AppUserProfile) {
  if (typeof window === "undefined") return;
  writeJsonStorage(getStorageKey(account), profile, { label: "app user profile" });
}

function buildProfileFromAccount(account: AccountInfo): AppUserProfile {
  const displayName = getAccountDisplayName(account);
  const splitName = splitDisplayName(displayName);
  const claims = account.idTokenClaims ?? {};
  const firstName = boundedText(claims.given_name, PROFILE_TEXT_LIMITS.name) || splitName.firstName;
  const lastName = boundedText(claims.family_name, PROFILE_TEXT_LIMITS.name) || splitName.lastName;
  const email =
    boundedText(claims.email, PROFILE_TEXT_LIMITS.email) ||
    boundedText(claims.preferred_username, PROFILE_TEXT_LIMITS.email) ||
    boundedText(account.username, PROFILE_TEXT_LIMITS.email);
  const now = new Date().toISOString();

  return {
    profileVersion: 1,
    source: "entra-token",
    homeAccountId: boundedText(account.homeAccountId, PROFILE_TEXT_LIMITS.accountId),
    entraOid: boundedNullableText(claims.oid, PROFILE_TEXT_LIMITS.identifier) || boundedNullableText(claims.sub, PROFILE_TEXT_LIMITS.identifier),
    tenantId: boundedNullableText(claims.tid, PROFILE_TEXT_LIMITS.identifier) || boundedNullableText(account.tenantId, PROFILE_TEXT_LIMITS.identifier),
    email,
    displayName: boundedText(displayName, PROFILE_TEXT_LIMITS.name),
    firstName,
    lastName,
    jobTitle: "",
    department: "",
    phone: "",
    roleLabel: boundedText(getAccountRoleLabel(account), PROFILE_TEXT_LIMITS.role),
    avatarStyle: "initials",
    notificationSettings: {
      emailDigest: true,
      reportAlerts: true,
      systemAlerts: true,
      weeklyReports: true,
      realtime: false
    },
    onboardingCompleted: true,
    createdAt: now,
    updatedAt: now
  };
}

function getOrCreateProfile(account: AccountInfo) {
  const stored = readStoredProfile(account);
  if (stored) {
    const refreshed = buildProfileFromAccount(account);
    const next: AppUserProfile = {
      ...stored,
      homeAccountId: refreshed.homeAccountId,
      entraOid: refreshed.entraOid,
      tenantId: refreshed.tenantId,
      email: refreshed.email,
      displayName: refreshed.displayName,
      firstName: refreshed.firstName,
      lastName: refreshed.lastName,
      roleLabel: refreshed.roleLabel,
      updatedAt:
        stored.displayName !== refreshed.displayName ||
        stored.firstName !== refreshed.firstName ||
        stored.lastName !== refreshed.lastName ||
        stored.email !== refreshed.email ||
        stored.roleLabel !== refreshed.roleLabel ||
        stored.entraOid !== refreshed.entraOid ||
        stored.tenantId !== refreshed.tenantId
          ? new Date().toISOString()
          : stored.updatedAt
    };

    writeStoredProfile(account, next);
    return next;
  }

  const profile = buildProfileFromAccount(account);
  writeStoredProfile(account, profile);
  return profile;
}

function getAppProfileInitials(profile: AppUserProfile | null, account?: AccountInfo | null) {
  if (profile?.displayName) {
    const parts = profile.displayName.split(/\s+/).filter(Boolean);
    const firstPart = parts[0];
    if (parts.length === 1 && firstPart) return firstPart.slice(0, 2).toUpperCase();
    const secondPart = parts[1];
    if (firstPart && secondPart) return `${firstPart[0] ?? ""}${secondPart[0] ?? ""}`.toUpperCase();
  }

  return getAccountInitials(account);
}

export function useCurrentUserProfile() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0] ?? null;
  const useBypassProfile = isE2EAuthBypassEnabled && !account;
  const [profile, setProfile] = useState<AppUserProfile | null>(() =>
    account ? getOrCreateProfile(account) : null
  );

  useEffect(() => {
    if (!account) {
      setProfile(null);
      return;
    }

    setProfile(getOrCreateProfile(account));
  }, [account]);

  const updateProfile = useMemo(
    () =>
      (updates: AppUserProfileUpdate) => {
        if (!account) return null;

        const current = getOrCreateProfile(account);
        const sanitizedUpdates: AppUserProfileUpdate = Object.fromEntries(
          Object.entries(updates).map(([key, value]) => [
            key,
            boundedText(value, key === "displayName" || key === "firstName" || key === "lastName"
              ? PROFILE_TEXT_LIMITS.name
              : PROFILE_TEXT_LIMITS.detail)
          ])
        );
        const next: AppUserProfile = {
          ...current,
          ...sanitizedUpdates,
          updatedAt: new Date().toISOString()
        };
        writeStoredProfile(account, next);
        setProfile(next);
        return next;
      },
    [account]
  );

  return {
    account,
    profile,
    initials: useBypassProfile ? "QA" : getAppProfileInitials(profile, account),
    displayName: useBypassProfile ? "QA Operator" : profile?.displayName || getAccountDisplayName(account),
    roleLabel: useBypassProfile ? "Browser Mission" : profile?.roleLabel || getAccountRoleLabel(account),
    updateProfile
  };
}
