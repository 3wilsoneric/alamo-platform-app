import assert from "node:assert/strict";
import { analyzeLic624Scan, mapLic624OcrResult } from "../server/lic624-ocr.mjs";

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
console.log("LIC 624 OCR mapping, managed-identity request, and two-page scan fixtures passed.");
