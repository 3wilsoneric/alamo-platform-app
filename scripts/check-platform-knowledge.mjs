import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizePlatformKnowledgeSearchInput,
  validateKnowledgeAssertionInput,
  validateKnowledgeDocumentInput,
  validateKnowledgeNoteInput,
  validateKnowledgeSourceInput
} from "../shared/knowledge-contracts.mjs";
import {
  getPlatformKnowledgeCoverage,
  getPlatformKnowledgeRecord,
  searchPlatformKnowledge
} from "../server/platform-knowledge-catalog.mjs";
import {
  getPlatformKnowledgeOverview,
  getPlatformKnowledgeRecordResponse,
  getPlatformKnowledgeSearchResponse
} from "../server/platform-knowledge-api.mjs";
import { createPlatformKnowledgeStore } from "../server/platform-knowledge-store.mjs";
import { assertPlatformKnowledgeOwner } from "../server/platform-knowledge-access.mjs";
import { hasPlatformOwnerAccess } from "../shared/platform-owner-access.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDirectory = await mkdtemp(path.join(os.tmpdir(), "alamo-knowledge-store-"));
const storePath = path.join(testDirectory, "knowledge", "store-v1.json");
const store = createPlatformKnowledgeStore({ storePath });
const failures = [];

function assert(condition, message, detail = null) {
  if (condition) return;
  failures.push(detail == null ? message : `${message}: ${JSON.stringify(detail)}`);
}

async function expectFailure(callback, message, expectedText) {
  try {
    await callback();
    failures.push(message);
  } catch (error) {
    if (expectedText && !String(error?.message ?? error).includes(expectedText)) {
      failures.push(`${message}: unexpected error ${String(error?.message ?? error)}`);
    }
  }
}

const coverage = getPlatformKnowledgeCoverage();
assert(coverage.states === 50, "seed catalog must contain all 50 state profiles", coverage);
assert(coverage.verifiedDemandStates === 15, "seed catalog must contain the verified-demand core", coverage);
assert(coverage.buyerTargets === 14, "seed catalog must contain all maintained buyer targets", coverage);
assert(coverage.opportunities >= 5, "seed catalog must contain maintained public opportunities", coverage);
assert(coverage.totalRecords === coverage.states + coverage.verifiedDemandStates + coverage.buyerTargets + coverage.opportunities, "seed coverage totals must reconcile", coverage);

const washington = searchPlatformKnowledge({ q: "Trueblood placement bottleneck", state: "Washington", limit: 5 });
assert(washington.results[0]?.id === "demand-wa", "Washington evidence search must rank the demand dossier first", washington.results);
assert(washington.results[0]?.sources?.every((source) => source.url.startsWith("https://")), "seed evidence must use HTTPS sources", washington.results[0]);
const californiaOpportunities = searchPlatformKnowledge({ q: "DMH residential contract", state: "CA", kinds: ["opportunity"], limit: 10 });
assert(californiaOpportunities.total > 0, "California procurement search must return opportunities", californiaOpportunities);
assert(californiaOpportunities.results.every((result) => result.kind === "opportunity" && result.stateCode === "CA"), "seed filters must be enforced", californiaOpportunities.results);
const boundedInput = normalizePlatformKnowledgeSearchInput({ q: "x".repeat(600), limit: 500, kinds: ["document", "unknown"] });
assert(boundedInput.query.length === 500 && boundedInput.limit === 25, "knowledge search input must remain bounded", boundedInput);
assert(boundedInput.kinds.join(",") === "document", "unknown knowledge kinds must be rejected", boundedInput);
assert(getPlatformKnowledgeRecord("demand-wa")?.id === "demand-wa", "seed record lookup must return exact records");

const invalidSource = validateKnowledgeSourceInput({ platform: "html_index", collectorKey: "ca", name: "CA", url: "http://example.gov" });
assert(!invalidSource.valid, "source registry must reject non-HTTPS endpoints", invalidSource);
assert(!validateKnowledgeDocumentInput({}).valid, "document contract must require source, URL, media type, title, and content");
assert(!validateKnowledgeNoteInput({ title: "Published without evidence", body: "No citation", status: "published" }).valid, "published notes must cite a document");
assert(!validateKnowledgeAssertionInput({
  documentId: "doc",
  entityType: "facility",
  entityId: "facility-1",
  fieldName: "bed_capacity",
  valueNum: 20
}).valid, "capacity assertions must retain their qualifier");

await store.initialize();
const registered = await store.registerSource({
  platform: "html_index",
  collectorKey: "california-bhsa",
  name: "California BHSA plans",
  url: "https://example.gov/bhsa",
  config: { state: "California", stateCode: "CA" },
  cadenceMinutes: 1440,
  rateLimitRpm: 6
});
assert(registered.created && !registered.source.verified && !registered.source.active, "new sources must enter unverified and inactive", registered);
const sourceId = registered.source.id;
await expectFailure(() => store.ingestDocument({
  sourceId,
  sourceUrl: "https://example.gov/bhsa/unreviewed.txt",
  title: "Unreviewed source",
  mediaType: "text/plain",
  content: "must not archive"
}), "unreviewed sources must not write documents", "active, human-verified");
const reviewedSource = await store.reviewSource(sourceId, {
  verified: true,
  active: true,
  reviewer: "human@example.org"
});
assert(reviewedSource.verified && reviewedSource.active && reviewedSource.verifiedBy === "human@example.org", "explicit human review must activate sources", reviewedSource);

const firstDiscovery = await store.recordDiscoveredItem({
  sourceId,
  dedupeKey: "plan-2026",
  url: "https://example.gov/bhsa/plan-2026.txt",
  title: "County BHSA Integrated Plan",
  listingHash: "listing-v1"
});
const unchangedDiscovery = await store.recordDiscoveredItem({
  sourceId,
  dedupeKey: "plan-2026",
  url: "https://example.gov/bhsa/plan-2026.txt",
  title: "County BHSA Integrated Plan",
  listingHash: "listing-v1"
});
assert(firstDiscovery.created && !unchangedDiscovery.created && !unchangedDiscovery.changed, "discovery must be idempotent on source and dedupe key", unchangedDiscovery);

const firstDocument = await store.ingestDocument({
  sourceId,
  sourceUrl: "https://example.gov/bhsa/plan-2026.txt",
  title: "County BHSA Integrated Plan",
  mediaType: "text/plain",
  content: "Licensed capacity is 20 beds. Future crisis residential funding is planned.",
  publishedAt: "2026-06-30",
  retrievedAt: "2026-09-01T12:00:00.000Z",
  metadata: { state: "California", stateCode: "CA", county: "Example County" }
});
const duplicateDocument = await store.ingestDocument({
  sourceId,
  sourceUrl: "https://example.gov/bhsa/archive/plan-2026.txt",
  title: "Archived County BHSA Integrated Plan",
  mediaType: "text/plain",
  content: " Licensed   capacity is 20 beds. Future crisis residential funding is planned. ",
  retrievedAt: "2026-09-01T12:05:00.000Z",
  metadata: { state: "California", stateCode: "CA", county: "Example County" }
});
assert(firstDocument.created && duplicateDocument.deduplicated, "normalized identical content must create one document", { firstDocument, duplicateDocument });
assert(firstDocument.document.id === duplicateDocument.document.id, "same artifact at two URLs must keep one document identity");
const changedDiscovery = await store.recordDiscoveredItem({
  sourceId,
  dedupeKey: "plan-2026",
  url: "https://example.gov/bhsa/plan-2026.txt",
  title: "County BHSA Integrated Plan — listing amended",
  listingHash: "listing-v2"
});
assert(changedDiscovery.changed && changedDiscovery.item.status === "pending", "changed listing metadata must return a discovered item to pending", changedDiscovery);

const revisedDocument = await store.ingestDocument({
  sourceId,
  sourceUrl: "https://example.gov/bhsa/plan-2026.txt",
  title: "County BHSA Integrated Plan — amended",
  mediaType: "text/plain",
  content: "Licensed capacity is 24 beds. Future crisis residential funding is planned.",
  retrievedAt: "2026-09-02T12:00:00.000Z",
  metadata: { state: "California", stateCode: "CA", county: "Example County" }
});
assert(revisedDocument.created && revisedDocument.revision?.priorDocumentId === firstDocument.document.id, "changed bytes at a stable URL must create a deterministic revision", revisedDocument);

const proposalOne = await store.proposeAssertion({
  documentId: firstDocument.document.id,
  entityType: "facility",
  entityId: "facility-example",
  fieldName: "bed_capacity",
  valueNum: 20,
  unit: "beds",
  valueQualifier: "licensed",
  quote: "Licensed capacity is 20 beds.",
  page: 1,
  observedAt: "2026-06-30",
  evidenceGrade: "official_plan"
});
assert(proposalOne.status === "proposed" && proposalOne.reviewer === null, "new assertions must enter the review queue", proposalOne);
assert((await store.search({ q: "licensed capacity", kinds: ["assertion"] })).total === 0, "proposed assertions must stay out of default search");
assert((await store.getReviewQueue()).proposedAssertions[0]?.id === proposalOne.id, "human review queue must expose proposed assertions");
const approvedOne = await store.reviewAssertion(proposalOne.id, { decision: "approved", reviewer: "human@example.org" });
assert(approvedOne.status === "approved" && approvedOne.reviewer === "human@example.org", "only explicit human review may approve an assertion", approvedOne);

const proposalTwo = await store.proposeAssertion({
  documentId: revisedDocument.document.id,
  entityType: "facility",
  entityId: "facility-example",
  fieldName: "bed_capacity",
  valueNum: 24,
  unit: "beds",
  valueQualifier: "licensed",
  quote: "Licensed capacity is 24 beds.",
  observedAt: "2026-07-01",
  evidenceGrade: "official_plan"
});
await store.reviewAssertion(proposalTwo.id, { decision: "approved", reviewer: "human@example.org" });
const conflicts = await store.getAssertionConflicts();
assert(conflicts.length === 1 && conflicts[0].assertions.length === 2, "approved disagreements must surface as conflicts instead of overwrites", conflicts);
const currentFacts = await store.getCurrentFacts();
assert(currentFacts.length === 1 && currentFacts[0].valueNum === 24, "current facts must resolve the latest approved observation without overwriting history", currentFacts);

const note = await store.putNote({
  title: "Example County capacity note",
  body: "The amended plan reports 24 licensed beds; licensed does not imply staffed or available capacity.",
  status: "published",
  documentIds: [revisedDocument.document.id],
  tags: ["capacity", "california"]
});
const noteSearch = await store.search({ q: "staffed available capacity", kinds: ["note"] });
assert(note.status === "published" && noteSearch.results[0]?.id === note.id, "published cited notes must be searchable", { note, noteSearch });
assert(noteSearch.results[0]?.sources?.[0]?.url === "https://example.gov/bhsa/plan-2026.txt", "searchable notes must retain source links", noteSearch.results[0]);

const bodySearch = await store.search({ q: "future crisis residential funding", kinds: ["document"] });
assert(bodySearch.total === 2, "archived text content must be searchable without exposing its private index field", bodySearch);
assert(bodySearch.results.every((result) => !Object.hasOwn(result, "searchBody")), "search index text must not leak as an API field", bodySearch.results);

const pdfDocument = await store.ingestDocument({
  sourceId,
  sourceUrl: "https://example.gov/bhsa/board-letter.pdf",
  title: "Behavioral Health Board Letter",
  mediaType: "application/pdf",
  content: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  retrievedAt: "2026-09-03T12:00:00.000Z",
  metadata: { state: "California", stateCode: "CA", county: "Example County" }
});
assert((await store.getSummary()).pendingProcessing === 1, "binary documents must enter the text-extraction queue");
await store.attachExtractedText(pdfDocument.document.id, {
  text: "The board letter authorizes crisis residential contract funding.",
  pageCount: 3
});
const extractedSearch = await store.search({ q: "authorizes crisis residential", kinds: ["document"] });
assert(extractedSearch.results.some((result) => result.id === pdfDocument.document.id), "derived document text must become searchable", extractedSearch);

const localSummary = await store.getSummary();
assert(localSummary.initialized === true, "initialized local stores must report their persistence state", localSummary);
assert(localSummary.sources === 1 && localSummary.documents === 3, "local knowledge counts must reconcile", localSummary);
assert(localSummary.documentLinks === 4 && localSummary.documentRevisions === 1, "document links and revisions must remain separate", localSummary);
assert(localSummary.pendingProcessing === 0 && localSummary.completedProcessing === 3, "document processing queue must reconcile", localSummary);
assert(localSummary.approvedAssertions === 2 && localSummary.publishedNotes === 1, "approval and publication counts must reconcile", localSummary);
const persisted = JSON.parse(await readFile(storePath, "utf8"));
assert(!JSON.stringify(persisted).includes('"type":"Buffer"'), "store metadata must not inline archived artifact bytes");

await store.markSourceBlocked(sourceId, "HTTP 403");
await expectFailure(() => store.ingestDocument({
  sourceId,
  sourceUrl: "https://example.gov/bhsa/blocked.txt",
  title: "Blocked fetch",
  mediaType: "text/plain",
  content: "must not archive"
}), "blocked sources must stop document writes", "active, human-verified");
const changedSource = await store.registerSource({
  platform: "html_index",
  collectorKey: "california-bhsa",
  name: "California BHSA plans",
  url: "https://example.gov/new-bhsa-location",
  config: { state: "California", stateCode: "CA" },
  cadenceMinutes: 1440,
  rateLimitRpm: 6
});
assert(changedSource.requiresReview && !changedSource.source.verified && !changedSource.source.active, "material source changes must return to human review", changedSource);

const overview = await getPlatformKnowledgeOverview();
assert(overview.name === "Alamo Platform knowledge base", "knowledge service must retain Alamo naming", overview);
assert(overview.productionPersistence === "azure-target-not-yet-enabled", "API must not misrepresent local storage as durable Azure persistence", overview);
const apiSearch = await getPlatformKnowledgeSearchResponse(new URL("https://www.alamoplatform.com/api/platform/knowledge/search?q=Trueblood&state=WA"));
assert(apiSearch.results[0]?.id === "demand-wa", "authenticated API search adapter must preserve seed results", apiSearch);
const apiRecord = await getPlatformKnowledgeRecordResponse(new URL("https://www.alamoplatform.com/api/platform/knowledge/record?id=demand-wa"));
assert(apiRecord.record.id === "demand-wa", "authenticated API record adapter must return exact records", apiRecord);

assertPlatformKnowledgeOwner({ authenticated: false, mode: "explicit-development-bypass", claims: null });
assert(hasPlatformOwnerAccess({ oid: "f73371d5-d2b4-48b4-a32b-1edc7c88869f" }), "the verified Platform owner identity must retain owner-only workspace access");
assert(!hasPlatformOwnerAccess({ oid: "wrong-object-id" }), "unlisted identities must remain outside owner-only workspaces");
assertPlatformKnowledgeOwner({
  authenticated: true,
  mode: "entra-delegated",
  claims: { preferred_username: "owner@example.org" }
}, { ownerEmail: "OWNER@example.org" });
for (const deniedContext of [
  { authenticated: true, mode: "entra-delegated", claims: { preferred_username: "other@example.org" } },
  { authenticated: true, mode: "entra-delegated", claims: { oid: "wrong-object-id" } }
]) {
  try {
    assertPlatformKnowledgeOwner(deniedContext, { ownerEmail: "owner@example.org", ownerObjectId: "owner-object-id" });
    assert(false, "non-owner identity must not access knowledge routes", deniedContext);
  } catch (error) {
    assert(error?.statusCode === 404 && error?.code === "not_found", "non-owner knowledge requests must receive a hidden 404", error);
  }
}

const platformApiSource = await readFile(path.join(root, "api/platform.js"), "utf8");
const devApiSource = await readFile(path.join(root, "server/dev-api.mjs"), "utf8");
const platformNavigationSource = await readFile(path.join(root, "src/features/california/components/PlatformPageNavigation.tsx"), "utf8");
for (const route of ["/api/platform/knowledge", "/api/platform/knowledge/search", "/api/platform/knowledge/record"]) {
  assert(platformApiSource.includes(route), `production API must register ${route}`);
  assert(devApiSource.includes(route), `development API must mirror ${route}`);
}
assert(platformApiSource.includes("assertPlatformKnowledgeOwner"), "production knowledge routes must enforce owner-only access");
assert(devApiSource.includes("assertPlatformKnowledgeOwner"), "development knowledge routes must mirror owner-only access");
assert(platformNavigationSource.includes("usePlatformOwnerAccess"), "shared navigation must resolve the verified owner identity");
assert(platformNavigationSource.includes('label: "Outreach"') && platformNavigationSource.includes("ownerOnly: true"), "Outreach must remain a discoverable owner-only destination");

await rm(testDirectory, { recursive: true, force: true });

if (failures.length) {
  console.error(`FAILED: platform knowledge checks (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`platform knowledge checks passed (${coverage.totalRecords} seed records; local archive, revision, assertion, and note lifecycle)`);
