import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { analyzeLic624Scan, mapLic624OcrResult } from "../server/lic624-ocr.mjs";
import { extractLic624Report } from "../server/lic624-extraction.mjs";
import { countLic624ExtractedFields } from "../server/lic624-review.mjs";

const pair = (key, value, confidence = 0.99) => ({ key: { content: key }, value: { content: value }, confidence });
const line = (content, x, y) => ({ content, polygon: [x, y, x + 0.2, y, x + 0.2, y + 0.02, x, y + 0.02] });
const analysis = {
  content: "SYNTHETIC TEST ONLY",
  pages: [
    { width: 8.5, height: 11, lines: [
      line("WHAT HAPPENED", 0.5, 6),
      line("Synthetic injury on 10/01/2026.", 0.5, 6.3),
      line("No real person was harmed.", 0.5, 6.6),
      line("PERSONS WHO OBSERVED", 0.5, 7),
      line("Demo Staff", 0.5, 7.3),
      line("IMMEDIATE ACTION", 0.5, 8),
      line("Staff checked safety.", 0.5, 8.3)
    ] },
    { width: 8.5, height: 11, lines: [
      line("NATURE OF TREATMENT", 0.5, 2), line("Synthetic evaluation.", 0.5, 2.3),
      line("WHERE ADMINISTERED", 0.5, 3), line("ADMINISTERED BY", 4.5, 3),
      line("Demo setting", 0.5, 3.3), line("Demo clinician", 4.5, 3.3),
      line("SUBMITTED BY", 0.5, 8), line("Demo Reporter", 0.5, 8.3),
      line("REVIEWED BY", 0.5, 9), line("Demo Reviewer", 0.5, 9.3)
    ] }
  ],
  keyValuePairs: [
    pair("NAME OF FACILITY", "San Pablo Synthetic Demo Facility"),
    pair("FACILITY FILE NUMBER", "DEMO-337-ONLY"),
    pair("CLIENTS/RESIDENTS INVOLVED", "Demo Resident"),
    pair("DATE OCCURRED", "10/01/2026"),
    pair("Injury - accident", ":selected:"),
    pair("Medical emergency", ":unselected:"),
    pair("YES", ":selected:"), pair("NO", ":unselected:"),
    pair("DATE", "10/01/2026"), pair("DATE", "10/02/2026")
  ]
};

const mapped = mapLic624OcrResult(analysis);
assert.equal(mapped?.method, "document_intelligence");
assert.equal(mapped?.status, "needs_review");
assert.equal(mapped?.data.facility.name, "San Pablo Synthetic Demo Facility");
assert.equal(mapped?.data.residents[0].name, "Demo Resident");
assert.deepEqual(mapped?.data.incidentTypes, [{ key: "injury_accident", label: "Injury - accident" }]);
assert.equal(mapped?.data.eventNarrative, "Synthetic injury on 10/01/2026. No real person was harmed.");
assert.equal(mapped?.data.immediateAction, "Staff checked safety.");
assert.equal(mapped?.data.treatment.necessary, true);
assert.equal(mapped?.data.treatment.whereAdministered, "Demo setting");
assert.equal(mapped?.data.treatment.administeredBy, "Demo clinician");
assert.equal(mapped?.data.submission.submittedBy, "Demo Reporter");
assert.equal(mapped?.data.submission.reviewedDate, "10/02/2026");
assert.equal(mapped?.ocrEvidence.pageCount, 2);
assert.equal(mapped?.reviewIssues.length, 0);
assert.equal(mapped?.extractedFieldCount, countLic624ExtractedFields(mapped.data));

const multipleResidents = structuredClone(analysis);
multipleResidents.keyValuePairs.push(
  pair("NAME", "Second Synthetic Resident"),
  pair("DATE OCCURRED", "10/02/2026"),
  pair("AGE", "42"),
  pair("SEX", "N/A"),
  pair("ADMITTED", "02/10/2026")
);
const multipleMapped = mapLic624OcrResult(multipleResidents);
assert.equal(multipleMapped?.data.residents.length, 2, "OCR must retain all people involved, not only the first row.");
assert.equal(multipleMapped?.data.residents[1].name, "Second Synthetic Resident");
assert.equal(multipleMapped?.data.residents[1].dateOccurred, "10/02/2026");

const noisyAnalysis = structuredClone(analysis);
noisyAnalysis.keyValuePairs.push(pair("Unrelated print on form", "Not a field", 0.99));
noisyAnalysis.keyValuePairs.push(pair("Uncertain scribble", "Cannot safely map", 0.5));
const noisyMapped = mapLic624OcrResult(noisyAnalysis);
assert.equal(noisyMapped?.extractedFieldCount, mapped.extractedFieldCount, "Unmapped OCR text must not inflate the form's extracted-field count.");
assert.ok(noisyMapped?.reviewIssues.some((issue) => issue.includes("lower confidence")));
assert.ok(noisyMapped?.ocrEvidence.keyValuePairs.some((item) => item.key === "uncertain scribble"), "Low-confidence text remains private evidence for review.");

const previous = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "https://alamo-docreader.cognitiveservices.azure.com/";
try {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), method: options.method ?? "GET", authorization: options.headers.Authorization });
    if (requests.length === 1) return {
      status: 202,
      headers: new Headers({ "operation-location": "https://alamo-docreader.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-layout/analyzeResults/11111111-1111-4111-8111-111111111111?api-version=2024-11-30" })
    };
    return { ok: true, text: async () => JSON.stringify({ status: "succeeded", analyzeResult: analysis }) };
  };
  const received = await analyzeLic624Scan(Buffer.from("synthetic bytes"), {
    credential: { getToken: async () => ({ token: "test-token" }) }, fetchImpl
  });
  assert.deepEqual(received, analysis);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].authorization, "Bearer test-token");
} finally {
  if (previous === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  else process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = previous;
}

delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
try {
  const unrelatedDocument = await PDFDocument.create();
  unrelatedDocument.addPage([612, 792]);
  const unrelatedForm = unrelatedDocument.getForm();
  for (let index = 0; index < 4; index += 1) unrelatedForm.createTextField(`unrelated-${index}`).setText(`visible-but-not-624-${index}`);
  const unrelated = await extractLic624Report(Buffer.from(await unrelatedDocument.save()), "application/pdf");
  assert.equal(unrelated.method, "ocr_required", "Unrelated PDF fields must not bypass scan extraction or create an empty reviewed form.");

  const partialDocument = await PDFDocument.create();
  partialDocument.addPage([612, 792]);
  const partialForm = partialDocument.getForm();
  partialForm.createTextField("Facility").setText("Synthetic Partial Facility");
  for (let index = 0; index < 4; index += 1) partialForm.createTextField(`unrelated-${index}`).setText(`not-a-624-field-${index}`);
  const partial = await extractLic624Report(Buffer.from(await partialDocument.save()), "application/pdf");
  assert.equal(partial.method, "pdf_acroform", "A partial fillable form must retain its mapped fields when OCR is unavailable.");
  assert.equal(partial.extractedFieldCount, 1);
  assert.equal(partial.data.facility.name, "Synthetic Partial Facility");
} finally {
  if (previous === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  else process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = previous;
}
console.log("LIC 624 OCR mapping, multi-person extraction, fillable-PDF fallback, and managed-identity fixtures passed.");
