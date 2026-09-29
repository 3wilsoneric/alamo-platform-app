import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import handler from "../api/platform.js";
import { LICENSING_COMMUNITIES, licensingTextForDisplay, validateLicensingLibrary, validateLicensingReport, validateLicensingUpdates } from "../shared/licensing-contracts.mjs";
import { queryLicensingLibrary, validateLicensingBaseline, validateLicensingBundle } from "../server/licensing-library.mjs";
import { usesLicensingAzureStorage } from "../server/licensing-storage.mjs";
import { analyzeLicensingReport } from "../shared/licensing-analysis.mjs";
import { hasLicensingAccess } from "../shared/licensing-access.mjs";
import { assertLicensingAccess } from "../server/licensing-access.mjs";

const communities = LICENSING_COMMUNITIES.map((c) => ({ ...c,
  licensedName: `${c.name} licensed facility`, licenseStatus: "Licensed", reportCount: 1, complaintCount: 0,
  sourceUrl: `https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/${c.licenseNumber}` }));
const reports = communities.map((c, index) => {
  const text = index === 0 ? "Resident rights and medication records were reviewed." : "Annual inspection narrative.";
  return { id: `${c.licenseNumber}-${String(index).padStart(32, "0")}`, facilityId: c.facilityId,
    licenseNumber: c.licenseNumber, title: "FACILITY EVALUATION REPORT", reportType: "Inspection",
    reportDate: "2026-09-23", controlNumber: null, sourceUrl: c.sourceUrl,
    textSha256: createHash("sha256").update(text).digest("hex"), retrievedAt: "2026-09-28T19:00:00Z", text };
});
reports.push({ ...reports[0], id: `${communities[0].licenseNumber}-${"a".repeat(32)}`, reportType: "Other" });
communities[0].reportCount += 1;
const baseline = validateLicensingBaseline({ version: "licensing-baseline-v1", runId: "test-run",
  collectedAt: "2026-09-28T19:00:00Z", monitoring: "not_scheduled", totalReports: reports.length, communities, reports });
const query = (search) => queryLicensingLibrary(baseline, new URL(`https://alamoplatform.com/api/platform/licensing?${search}`));

assert.equal(query("").reports.length, 5);
assert.equal(query("community=337").reports.length, 2, "same-day reports must remain distinct");
assert.equal(query("community=337&type=Inspection").reports.length, 1);
assert.equal(query("q=RESIDENT+rights").reports.length, 2, "search must include full text and all query terms");
assert.equal(query("q=resident+missingword").reports.length, 0);
assert.equal(query("q=unmatched").totalReports, 5, "filtered counts must not overwrite baseline totals");
assert.ok(query("").reports.every((r) => !Object.hasOwn(r, "text")), "list API must omit full report bodies");
for (const search of ["community=unknown", "type=unknown", "outcome=unknown", "topic=unknown", "focus=unknown", "year=bad", `q=${"a".repeat(201)}`]) {
  assert.throws(() => query(search), (e) => e.statusCode === 400);
}

const investigation = { ...reports[0], reportType: "Complaint", text: `Unsubstantiated
ALLEGATION(S):
Staff did not give prescribed medication.
INVESTIGATION FINDINGS:
The allegation is unsubstantiated. No deficiencies cited during visit.
SUPERVISORS NAME: Example
Page: 1 of 1` };
const unsubstantiated = analyzeLicensingReport(investigation);
assert.equal(unsubstantiated.summary.outcome, "Unsubstantiated");
assert.equal(unsubstantiated.summary.citationCount, 0);
assert.equal(unsubstantiated.summary.noDeficiencies, true);
assert.equal(unsubstantiated.allegations[0].page, 1);
assert.ok(unsubstantiated.summary.topics.includes("Medication"));
assert.ok(!unsubstantiated.summary.outcomes.includes("Substantiated"), "substring matching must not turn unsubstantiated into substantiated");
const mixed = analyzeLicensingReport({ ...investigation, text: investigation.text + "\nSubstantiated\nNARRATIVE\nA separate allegation was substantiated.\nPage: 2 of 2" });
assert.equal(mixed.summary.outcome, "Mixed findings");
assert.deepEqual(mixed.summary.outcomes, ["Unsubstantiated", "Substantiated"]);
const form = { ...reports[0], text: `NARRATIVE
This visit examined building conditions.
SUPERVISORS NAME: Example
Page: 1 of 2
DEFICIENCY INFORMATION FOR THIS PAGE:
Type B
Section Cited
CCR
80087(a)
Building and Grounds
Deficient Practice Statement
Based on observation, a door was in disrepair.
POC Due Date: 01/03/2024
Plan of Correction
Administrator agreed to repair the door.
Section Cited
Deficient Practice Statement
POC Due Date:
Plan of Correction
Failure to correct the cited deficiency may result in a penalty.
Page: 2 of 2` };
const citation = analyzeLicensingReport(form);
assert.equal(citation.summary.citationCount, 1, "empty form slots must not become citations");
assert.equal(citation.citations[0].regulation, "80087(a)");
assert.equal(citation.citations[0].dueDate, "2024-01-03");
assert.equal(citation.citations[0].correction, "Administrator agreed to repair the door.");
assert.equal(citation.citations[0].page, 2);
assert.ok(!JSON.stringify(citation).includes("overdue"), "a historical POC date does not establish current status");
const legacy = analyzeLicensingReport({ ...form, text: `NARRATIVE\nA visit took place.\nPage: 1 of 2\nDEFICIENCY INFORMATION FOR THIS PAGE:\nType A\n04/08/2026\nSection Cited\nCCR\n80087(a)\nRegulation text.\nAdministrator will repair the equipment.\nBased on observation, equipment was broken.\nFailure to correct\nPage: 2 of 2` });
assert.equal(legacy.citations[0].type, "Type A");
assert.equal(legacy.citations[0].correction, "Administrator will repair the equipment.");
const splitPlan = analyzeLicensingReport({ ...form, text: `NARRATIVE\nA visit took place.\nPage: 1 of 2\nDEFICIENCY INFORMATION FOR THIS PAGE:\nDeficiency Dismissed\nType B\n01/30/2026\nSection Cited\nCCR\n80012\nAdministrator agreed to train staff on\nBased on interviews, records were inaccurate.\nreporting and send attendance by the POC date.\nFailure to correct\nPage: 2 of 2` });
assert.equal(splitPlan.citations[0].correction, "Administrator agreed to train staff on reporting and send attendance by the POC date.");
assert.equal(splitPlan.citations[0].disposition, "Deficiency Dismissed");
const analyzedFixture = { ...baseline, reports: [investigation, form] };
assert.equal(queryLicensingLibrary(analyzedFixture, new URL("https://example.test/?outcome=Substantiated")).reports.length, 0);
assert.equal(queryLicensingLibrary(analyzedFixture, new URL("https://example.test/?focus=citations")).reports.length, 1);
assert.equal(queryLicensingLibrary(analyzedFixture, new URL("https://example.test/?topic=Medication")).reports.length, 1);
assert.equal(queryLicensingLibrary(analyzedFixture, new URL("https://example.test/?q=show+me+not+substantiated+medication+at+San+Pablo")).reports.length, 1);
assert.equal(queryLicensingLibrary(analyzedFixture, new URL("https://example.test/?q=no+deficiencies")).reports[0].id, investigation.id);
assert.equal(queryLicensingLibrary(analyzedFixture, new URL("https://example.test/?q=medication+at+Turlock")).reports.length, 0);
const failedUpdates = { version: "licensing-updates-v1", status: "failed", lastChecked: baseline.collectedAt, lastSuccessful: baseline.collectedAt, alerts: [] };
assert.equal(validateLicensingUpdates(failedUpdates).status, "failed");
assert.equal(validateLicensingBundle({ version: "licensing-bundle-v1", baseline, updates: failedUpdates }).updates.status, "failed");
assert.throws(() => validateLicensingBundle({ version: "licensing-bundle-v1", baseline, updates: { ...failedUpdates, lastSuccessful: "2020-01-01T00:00:00Z" } }));
const oldNodeEnv = process.env.NODE_ENV;
const oldSource = process.env.LICENSING_STORAGE_READ_SOURCE;
process.env.NODE_ENV = "production";
process.env.LICENSING_STORAGE_READ_SOURCE = "local";
assert.equal(usesLicensingAzureStorage(), true, "production cannot silently fall back to local evidence");
if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
if (oldSource === undefined) delete process.env.LICENSING_STORAGE_READ_SOURCE; else process.env.LICENSING_STORAGE_READ_SOURCE = oldSource;
assert.throws(() => validateLicensingUpdates({ version: "licensing-updates-v1", status: "complete", alerts: [{ reportId: "../../private" }] }));
assert.throws(() => validateLicensingBaseline({ ...baseline, reports: baseline.reports.slice(1) }));
assert.throws(() => validateLicensingBaseline({ ...baseline, reports: baseline.reports.map((r) => ({ ...r, text: "tampered" })) }));
assert.throws(() => validateLicensingReport({ ...reports[0], sourceUrl: "javascript:alert(1)" }));
assert.throws(() => validateLicensingReport({ ...reports[0], reportDate: "2026-02-30" }));
assert.throws(() => validateLicensingLibrary({ ...baseline, reports: [reports[0], reports[0]] }));
assert.throws(() => validateLicensingLibrary({ ...baseline, communities: [communities[0], communities[0], ...communities.slice(2)] }));
for (const count of [4, 7, 9, 13, 25, 32]) {
  const source = `<meta name="robots" content="noindex">\nNARRATIVE\n${Array.from({ length: count }, (_, i) => i + 1).join("\n")}\nFinding remains intact.\n1\n2\nA numbered finding.`;
  assert.equal(licensingTextForDisplay(source), "NARRATIVE\nFinding remains intact.\n1\n2\nA numbered finding.");
  assert.ok(source.startsWith("<meta"), "display formatting must preserve the source text");
}

const before = process.env.API_AUTH_REQUIRED;
process.env.API_AUTH_REQUIRED = "true";
try {
  for (const url of ["/api/platform/licensing", "/api/platform/licensing/updates", `/api/platform/licensing/report?id=${reports[0].id}`]) {
    const headers = {};
    const response = { statusCode: 0, body: null, setHeader(name, value) { headers[name] = value; },
      getHeader(name) { return headers[name]; }, status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; } };
    await handler({ method: "GET", url, headers: {} }, response);
    assert.equal(response.statusCode, 401, "licensing documents require the common authenticated boundary");
    assert.match(String(headers["Cache-Control"]), /no-store/);
  }
} finally {
  if (before === undefined) delete process.env.API_AUTH_REQUIRED; else process.env.API_AUTH_REQUIRED = before;
}
const tenantId = "d72d9036-cff8-4f5f-a6fa-d698f621d420";
const licensedUsers = [
  "424b21d4-605a-43a6-8dff-2a89a846e698",
  "75099b5b-5f7d-437f-8e3b-181f1fea1653",
  "f73371d5-d2b4-48b4-a32b-1edc7c88869f"
];
for (const oid of licensedUsers) {
  assert.equal(hasLicensingAccess({ tid: tenantId, oid }), true);
  assert.doesNotThrow(() => assertLicensingAccess({ authenticated: true, mode: "entra-delegated", claims: { tid: tenantId, oid } }));
}
for (const claims of [null, {}, { oid: licensedUsers[0] }, { tid: "another-tenant", oid: licensedUsers[0] },
  { tid: tenantId, oid: "11111111-1111-4111-8111-111111111111", roles: ["Alamo.Admissions.Admin"] },
  { tid: tenantId, name: "Betty Dominici", email: "betty@aaahealthservices.com" },
  { tid: tenantId, name: "Raj Thandi", preferred_username: "raj@aaahealthservices.com" }]) {
  assert.equal(hasLicensingAccess(claims), false, "only the three exact tenant-local object IDs may match");
  assert.throws(() => assertLicensingAccess({ authenticated: true, mode: "entra-delegated", claims }), (e) => e.statusCode === 404);
}
for (const context of [null, { authenticated: false, mode: "explicit-development-bypass" },
  { authenticated: true, mode: "entra-service-principal", claims: { tid: tenantId, oid: licensedUsers[0] } }]) {
  assert.throws(() => assertLicensingAccess(context), (e) => e.statusCode === 404);
}

// Exercise the real API authentication and route handlers with locally signed
// test tokens. Only the expected JWKS fetch is stubbed; no token leaves this test.
const environmentKeys = ["NODE_ENV", "API_AUTH_REQUIRED", "ENTRA_TENANT_ID", "ENTRA_CLIENT_ID", "ENTRA_API_AUDIENCE", "ENTRA_API_SCOPE", "ENTRA_API_REQUIRED_ROLE"];
const savedEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;
const audience = "api://licensing-access-test";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...await exportJWK(publicKey), kid: "licensing-access-test", alg: "RS256", use: "sig" };
globalThis.fetch = async (input) => {
  assert.equal(String(input), `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`);
  return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
};
Object.assign(process.env, { NODE_ENV: "test", API_AUTH_REQUIRED: "true", ENTRA_TENANT_ID: tenantId,
  ENTRA_CLIENT_ID: "licensing-access-test", ENTRA_API_AUDIENCE: audience, ENTRA_API_SCOPE: "access_as_user", ENTRA_API_REQUIRED_ROLE: "" });
async function licensingApiResponse(url, claims) {
  const token = await new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(`https://login.microsoftonline.com/${tenantId}/v2.0`).setAudience(audience).setIssuedAt().setExpirationTime("2m").sign(privateKey);
  const headers = {};
  const response = { statusCode: 0, body: null, setHeader(name, value) { headers[name] = value; },
    getHeader(name) { return headers[name]; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
  await handler({ method: "GET", url, headers: { authorization: `Bearer ${token}` } }, response);
  assert.match(String(headers["Cache-Control"]), /no-store/);
  return response;
}
try {
  const deniedClaims = [
    { tid: tenantId, oid: "11111111-1111-4111-8111-111111111111", scp: "access_as_user" },
    { tid: tenantId, oid: "unlisted-account", name: "Betty Dominici", email: "betty@aaahealthservices.com", scp: "access_as_user" },
    { tid: "another-tenant", oid: licensedUsers[1], scp: "access_as_user" }
  ];
  for (const claims of deniedClaims) for (const path of ["/api/platform/licensing", "/api/platform/licensing/updates", "/api/platform/licensing/report?id=invalid"]) {
    const result = await licensingApiResponse(path, claims);
    assert.equal(result.statusCode, 404, "authenticated nonmembers must not reach any Licensing loader");
    assert.equal(result.body.error, "Not found.");
  }
  for (const oid of licensedUsers) {
    const result = await licensingApiResponse("/api/platform/licensing/report?id=invalid", { tid: tenantId, oid, scp: "access_as_user" });
    assert.equal(result.statusCode, 400, "Betty, Raj, and Eric must reach the report loader after authenticated authorization");
    assert.equal(result.body.code, "licensing_report_invalid");
  }
} finally {
  globalThis.fetch = originalFetch;
  for (const key of environmentKeys) {
    if (savedEnvironment[key] === undefined) delete process.env[key]; else process.env[key] = savedEnvironment[key];
  }
}
console.log("Licensing checks passed: archive integrity, search, analysis, and signed-token access limited to Betty, Raj, and Eric across all three APIs.");
