// Reads the aggregate summary the Alamo Workforce application publishes for the
// authenticated Alamo Platform. Contract: docs/platform/workforce-zone.md.
// Workforce owns staff, credential, and hiring records; the summary carries
// counts and job titles only, never staff or applicant names.

const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
// The Workforce app scales to zero when idle and takes longer than the request
// timeout to wake, so retry soon: the next attempt usually reaches a warm app.
const FAILURE_RETRY_MS = 15_000;
const MAX_COMMUNITIES = 40;
const MAX_ROLES = 40;
const MAX_OPEN_POSITIONS = 400;
const MAX_EXPIRATION_GROUPS = 100;

const TOTAL_FIELDS = Object.freeze([
  "active", "onboarding", "onLeave", "openRoles", "applicants", "phase1", "phase2", "phase3",
  "expired", "expiring", "missing", "staffBlockedFromScheduling"
]);
const POSITION_COUNT_FIELDS = Object.freeze(["openings", "daysOpen", "phase1", "phase2", "phase3"]);
// A relative Workforce location for one role; no scheme, host, or traversal.
const POSITION_PATH = /^\/hiring\?position=[0-9a-f-]{36}$/;

/** @type {{ value: any, expiresAt: number, promise: Promise<any> | null }} */
let cache = { value: null, expiresAt: 0, promise: null };

function getConfig() {
  const url = process.env.WORKFORCE_SUMMARY_URL?.trim();
  const token = process.env.WORKFORCE_SUMMARY_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function text(value, maximumLength = 120) {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function isoCalendarDate(value) {
  const normalized = text(value, 10);
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) && Number.isFinite(Date.parse(`${normalized}T00:00:00.000Z`))
    ? normalized
    : null;
}

function normalizeTotals(source) {
  if (!source || typeof source !== "object") return null;
  const totals = {};
  for (const field of TOTAL_FIELDS) {
    const value = count(source[field]);
    if (value == null) return null;
    totals[field] = value;
  }
  const rate = source.complianceRate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) return null;
  if (totals.phase1 + totals.phase2 + totals.phase3 !== totals.applicants) return null;
  return { ...totals, complianceRate: rate };
}

function normalizeRows(rows, maximum, nameOf) {
  if (!Array.isArray(rows) || rows.length > maximum) return null;
  const normalized = rows.map((row) => {
    const name = nameOf(row);
    const totals = normalizeTotals(row?.totals);
    return name && totals ? { ...name, totals } : null;
  });
  return normalized.some((row) => row === null) ? null : normalized;
}

function normalizeOpenPosition(row, workforceOrigin) {
  const title = text(row?.title, 160);
  const discipline = text(row?.discipline, 60);
  const community = text(row?.community, 80);
  const roleLabel = text(row?.roleLabel, 80);
  const openedOn = isoCalendarDate(row?.openedOn);
  if (!title || !discipline || !community || !roleLabel || !openedOn) return null;
  const counts = {};
  for (const field of POSITION_COUNT_FIELDS) {
    const value = count(row[field]);
    if (value == null) return null;
    counts[field] = value;
  }
  const url = workforceOrigin && typeof row.path === "string" && POSITION_PATH.test(row.path) ? `${workforceOrigin}${row.path}` : null;
  return { title, discipline, community, roleLabel, openedOn, url, ...counts };
}

function normalizeExpirations(rows) {
  // Added after schemaVersion 1 shipped; older producers omit it.
  if (rows === undefined) return [];
  if (!Array.isArray(rows) || rows.length > MAX_EXPIRATION_GROUPS) return null;
  const normalized = rows.map((row) => {
    const community = text(row?.community, 80);
    const label = text(row?.label, 120);
    const expiresOn = isoCalendarDate(row?.expiresOn);
    const people = count(row?.people);
    return community && label && expiresOn && people && typeof row.blocksScheduling === "boolean"
      ? { community, label, expiresOn, people, blocksScheduling: row.blocksScheduling }
      : null;
  });
  return normalized.some((row) => row === null) ? null : normalized;
}

/**
 * Validates every field; any contract violation rejects the whole summary so
 * the page never renders partially trusted numbers.
 * @param {any} payload
 * @param {string | null} [workforceOrigin]
 */
export function normalizeWorkforceSummary(payload, workforceOrigin = null) {
  if (payload?.schemaVersion !== 1 || !payload.overview || typeof payload.overview !== "object") return null;
  const overview = payload.overview;
  const asOf = isoCalendarDate(overview.asOf);
  const generatedAt = text(payload.generatedAt, 40);
  const portfolio = normalizeTotals(overview.portfolio);
  const communities = normalizeRows(overview.communities, MAX_COMMUNITIES, (row) => {
    const community = text(row?.community, 80);
    return community ? { community } : null;
  });
  const roles = normalizeRows(overview.roles, MAX_ROLES, (row) => {
    const discipline = text(row?.discipline, 60);
    const label = text(row?.label, 80);
    return discipline && label ? { discipline, label } : null;
  });
  const positions = Array.isArray(overview.openPositions) && overview.openPositions.length <= MAX_OPEN_POSITIONS
    ? overview.openPositions.map((row) => normalizeOpenPosition(row, workforceOrigin))
    : null;
  const phaseNames = [1, 2, 3].map((phase) => text(overview.phaseNames?.[String(phase)], 60));
  const upcomingExpirations = normalizeExpirations(overview.upcomingExpirations);
  if (
    !asOf || !generatedAt || !Number.isFinite(Date.parse(generatedAt)) || !portfolio || !communities || !roles ||
    !positions || positions.some((position) => position === null) || phaseNames.some((name) => !name) || !upcomingExpirations
  ) {
    return null;
  }

  return {
    status: "connected",
    // Sample data unless the producer explicitly says otherwise, so an older or
    // malformed producer can never present placeholder numbers as real.
    placeholderData: payload.placeholderData !== false,
    workforceUrl: workforceOrigin,
    asOf,
    generatedAt,
    phaseNames,
    portfolio,
    communities,
    roles,
    openPositions: positions,
    upcomingExpirations
  };
}

/**
 * The view every signed-in Platform user may see: hiring by role only. It carries
 * role names, open-role titles with their community and openings, and applicant
 * counts by phase. Staffing levels, credential health, and links into the
 * Workforce app stay in the owner-only dashboard.
 * @param {any} summary
 */
export function buildWorkforceRoleOverview(summary) {
  if (summary?.status !== "connected") return { status: summary?.status === "unavailable" ? "unavailable" : "not_connected" };
  const positionsByRole = new Map();
  for (const position of summary.openPositions) {
    const list = positionsByRole.get(position.discipline) ?? [];
    list.push({
      title: position.title,
      community: position.community,
      openings: position.openings,
      phase1: position.phase1,
      phase2: position.phase2,
      phase3: position.phase3
    });
    positionsByRole.set(position.discipline, list);
  }
  const roles = summary.roles
    .map((role) => ({
      discipline: role.discipline,
      label: role.label,
      openRoles: role.totals.openRoles,
      applicants: role.totals.applicants,
      phase1: role.totals.phase1,
      phase2: role.totals.phase2,
      phase3: role.totals.phase3,
      positions: (positionsByRole.get(role.discipline) ?? []).sort((a, b) => b.openings - a.openings || a.title.localeCompare(b.title))
    }))
    .sort((a, b) => b.openRoles - a.openRoles || b.applicants - a.applicants || a.label.localeCompare(b.label));
  return {
    status: "connected",
    placeholderData: summary.placeholderData,
    asOf: summary.asOf,
    phaseNames: summary.phaseNames,
    roles: roles.filter((role) => role.openRoles > 0 || role.applicants > 0),
    rolesWithoutHiring: roles.filter((role) => role.openRoles === 0 && role.applicants === 0).map((role) => role.label)
  };
}

async function fetchSummary(config) {
  const response = await fetch(config.url, {
    headers: { accept: "application/json", authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Workforce summary returned ${response.status}`);
  const summary = normalizeWorkforceSummary(await response.json(), new URL(config.url).origin);
  if (!summary) throw new Error("Workforce summary did not match the contract");
  return summary;
}

/**
 * Never throws: the page shows a connection notice when Workforce is not
 * configured or unreachable, and retries after a short back-off.
 */
export async function getWorkforceSummary() {
  const config = getConfig();
  if (!config) return { status: "not_connected" };
  if (cache.value && cache.expiresAt > Date.now()) return cache.value;
  if (!cache.promise) {
    cache.promise = fetchSummary(config)
      .then((value) => {
        cache = { value, expiresAt: Date.now() + CACHE_TTL_MS, promise: null };
        return value;
      })
      .catch((error) => {
        console.warn("Workforce summary unavailable:", error instanceof Error ? error.message : error);
        // Keep serving the last good summary through a failed refresh.
        const value = cache.value?.status === "connected" ? cache.value : { status: "unavailable" };
        cache = { value, expiresAt: Date.now() + FAILURE_RETRY_MS, promise: null };
        return value;
      });
  }
  return cache.promise;
}
