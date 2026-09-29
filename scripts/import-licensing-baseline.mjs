import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LICENSING_COMMUNITIES } from "../shared/licensing-contracts.mjs";
import { validateLicensingBaseline } from "../server/licensing-library.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(process.argv[2] ?? path.join(root, "output/ccld-baseline/data"));
const runId = (await readFile(path.join(source, "latest-complete.txt"), "utf8")).trim();
if (!/^\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(runId)) throw new Error("Invalid collection run ID.");
const runPath = path.join(source, "runs", runId);
const summary = JSON.parse(await readFile(path.join(runPath, "summary.json"), "utf8"));
if (summary.status !== "complete" || summary.run_id !== runId || summary.facilities.length !== 4 ||
    summary.facilities.some((f) => f.status !== "complete")) throw new Error("A complete four-community run is required.");
const records = (await readFile(path.join(runPath, "records.ndjson"), "utf8"))
  .trim().split("\n").map((line) => JSON.parse(line));
const communities = summary.facilities.map((f) => {
  const known = LICENSING_COMMUNITIES.find((c) => c.licenseNumber === f.facility_number);
  if (!known || known.facilityId !== f.platform_facility_id) throw new Error("Unrecognized facility mapping.");
  return { ...known, licensedName: f.licensed_name, licenseStatus: f.license_status,
    reportCount: f.report_count, complaintCount: f.complaint_count, sourceUrl: f.source_url };
});
const reports = [];
for (const r of records.filter((row) => row.kind === "report")) {
  const community = communities.find((c) => c.licenseNumber === r.facility_number);
  if (!community || r.run_id !== runId || r.platform_facility_id !== community.facilityId) {
    throw new Error("Report provenance does not match the collection.");
  }
  for (const key of ["raw_path", "text_path"]) {
    const relative = r[key];
    if (!/^artifacts\/[a-f0-9]{64}\.(?:html|txt)$/.test(relative)) throw new Error("Invalid archive path.");
    const bytes = await readFile(path.join(source, relative));
    if (createHash("sha256").update(bytes).digest("hex") !== path.parse(relative).name) {
      throw new Error("Archived evidence hash mismatch.");
    }
    if (key === "text_path" && bytes.toString("utf8") !== r.text) throw new Error("Extracted text mismatch.");
  }
  reports.push({ id: `${r.facility_number}-${r.entity_id}`, facilityId: community.facilityId,
    licenseNumber: community.licenseNumber, title: r.payload.REPORTTITLE,
    reportType: r.payload.REPORTTYPE, reportDate: r.payload.report_date,
    controlNumber: r.payload.CONTROLNUMBER || null, sourceUrl: community.sourceUrl,
    textSha256: r.payload.text_sha256, retrievedAt: r.fetched_at, text: r.text });
}
const baseline = validateLicensingBaseline({ version: "licensing-baseline-v1", runId,
  collectedAt: summary.finished_at, monitoring: "not_scheduled", communities,
  totalReports: reports.length, reports });
const destination = path.join(root, "generated/licensing");
await mkdir(destination, { recursive: true });
const temporary = path.join(destination, `baseline-${process.pid}.tmp`);
await writeFile(temporary, JSON.stringify(baseline));
await rename(temporary, path.join(destination, "baseline.json"));
console.log(`Imported ${reports.length} verified licensing reports for ${communities.length} communities. No cloud publication or scheduling.`);
