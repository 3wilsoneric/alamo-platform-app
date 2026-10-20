#!/usr/bin/env node
// Exercise the actual upload/extraction/retrieval path for all 100 fictional PDFs
// in an isolated local object store. Never writes to Azure or calls the network.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createExecutiveDirectorIntakeSubmission,
  getExecutiveDirectorIntakeSource,
  queryExecutiveDirectorIntakeSubmissions,
  toExecutiveDirectorSubmissionDetail
} from "../server/executive-director-intake-storage.mjs";

const root = await mkdtemp(path.join(tmpdir(), "alamo-lic624-100-"));
const previous = {
  storage: process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE,
  localRoot: process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT
};
process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE = "local";
process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT = root;
const fetchBefore = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network is prohibited in synthetic LIC 624 QA."); };

const directory = path.resolve("output/pdf/lic624-demo-100");
const files = (await readdir(directory)).filter((name) => /^SYNTHETIC-LIC624-San-Pablo-\d{3}\.pdf$/.test(name)).sort();
assert.equal(files.length, 100);
const ids = new Set();
const hashes = new Set();
const scenarios = new Map();

try {
  for (const [index, name] of files.entries()) {
    const bytes = await readFile(path.join(directory, name));
    const result = await createExecutiveDirectorIntakeSubmission({
      req: { body: bytes, headers: { "content-type": "application/pdf", "x-file-name": name } },
      facilityId: "337",
      authContext: { authenticated: false }
    });
    assert.equal(result.duplicate, false);
    assert.equal(result.status, "needs_review");
    assert.equal(result.extraction?.method, "pdf_acroform");
    assert.deepEqual(result.extraction?.reviewIssues, []);
    assert.equal(result.extraction?.data?.facility?.name, "San Pablo Synthetic Demo Facility");
    assert.equal(result.extraction?.data?.residents?.[0]?.name, `Demo Resident ${String(index + 1).padStart(3, "0")}`);
    assert.equal(toExecutiveDirectorSubmissionDetail(result).reviewIssues.length, 0);
    ids.add(result.submissionId);
    hashes.add(result.sha256);
    for (const incidentType of result.extraction.data.incidentTypes) {
      scenarios.set(incidentType.key, (scenarios.get(incidentType.key) ?? 0) + 1);
    }
    const stored = await getExecutiveDirectorIntakeSource("337", result.submissionId);
    assert.equal(stored.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(stored.bytes, bytes);
  }
  assert.equal(ids.size, 100);
  assert.equal(hashes.size, 100);
  assert.deepEqual(Object.fromEntries([...scenarios].sort()), {
    hospitalization: 20,
    injury_accident: 20,
    medical_emergency: 20,
    property_damage: 20,
    unauthorized_absence: 20
  });
  const queue = await queryExecutiveDirectorIntakeSubmissions({ facilityId: "337", limit: 100 });
  assert.equal(queue.summary.total, 100);
  assert.equal(queue.summary.needsReview, 100);
  assert.equal(queue.submissions.length, 100);
  const firstBytes = await readFile(path.join(directory, files[0]));
  const retry = await createExecutiveDirectorIntakeSubmission({
    req: { body: firstBytes, headers: { "content-type": "application/pdf", "x-file-name": "renamed-retry.pdf" } },
    facilityId: "337",
    authContext: { authenticated: false }
  });
  assert.equal(retry.duplicate, true);
  assert.equal((await queryExecutiveDirectorIntakeSubmissions({ facilityId: "337", limit: 100 })).summary.total, 100);
  console.log(JSON.stringify({ uploaded: 100, extracted: 100, issues: 0, uniqueHashes: hashes.size, duplicateRetryCreatedNewRecord: false, scenarios: Object.fromEntries([...scenarios].sort()) }));
} finally {
  globalThis.fetch = fetchBefore;
  if (previous.storage === undefined) delete process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE;
  else process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE = previous.storage;
  if (previous.localRoot === undefined) delete process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT;
  else process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT = previous.localRoot;
  await rm(root, { recursive: true, force: true });
}
