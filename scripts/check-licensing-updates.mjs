import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LICENSING_SCHEDULE } from "./licensing/job-schedule.mjs";
import { LICENSING_COMMUNITIES } from "../shared/licensing-contracts.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "generated/licensing");
const data = path.join(root, "output/ccld-baseline/data");
const replay = process.argv.includes("--refresh-feed-only");
let failure = false;
if (!replay) {
  try {
    await exec("python3", ["scripts/licensing/collect.py"], { cwd: root, timeout: 600_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    await exec(process.execPath, ["scripts/import-licensing-baseline.mjs"], { cwd: root, timeout: 60_000 });
  } catch (error) {
    failure = true;
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, "last-check-error.log"), String(error instanceof Error ? error.message : error).slice(0, 8000));
  }
}
const python = `import sqlite3,json,sys
c=sqlite3.connect(sys.argv[1]);c.row_factory=sqlite3.Row
run=c.execute("SELECT id,finished_at,status FROM runs ORDER BY started_at DESC LIMIT 1").fetchone()
rows=c.execute("SELECT ch.*,r.finished_at FROM changes ch JOIN runs r ON ch.run_id=r.id WHERE ch.change_type!='baseline' AND r.status='complete' AND r.finished_at IS NOT NULL ORDER BY r.started_at DESC LIMIT 100").fetchall()
print(json.dumps({'run':dict(run) if run else None,'changes':[dict(x) for x in rows]}))`;
const { stdout } = await exec("python3", ["-c", python, path.join(data, "baseline.sqlite")], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
const ledger = JSON.parse(stdout);
const baseline = JSON.parse(await readFile(path.join(destination, "baseline.json"), "utf8"));
const labels = { new: "New", revised: "Updated", no_longer_listed: "No longer listed", reappeared: "Listed again" };
const alerts = ledger.changes.map((change) => {
  const community = LICENSING_COMMUNITIES.find((c) => c.licenseNumber === change.facility_number);
  const reportId = `${change.facility_number}-${change.entity_id}`;
  const report = baseline.reports.find((r) => r.id === reportId);
  return { id: `${change.run_id}-${change.facility_number}-${change.kind}-${change.entity_id}-${change.change_type}`,
    community: community?.name ?? change.facility_number, title: `${labels[change.change_type] ?? "Changed"} ${change.kind === "report" ? "state report" : change.kind === "profile" ? "facility profile" : "complaint record"}`,
    at: change.finished_at, reportId: report?.id ?? null, reportDate: report?.reportDate ?? null };
});
const feed = { version: "licensing-updates-v1", lastChecked: failure ? new Date().toISOString() : ledger.run?.finished_at ?? null,
  ...(process.env.LICENSING_CLOUD_JOB === "true" ? { schedule: LICENSING_SCHEDULE } : {}),
  lastSuccessful: baseline.collectedAt, status: failure || ledger.run?.status !== "complete" || baseline.runId !== ledger.run?.id ? "failed" : "complete", alerts };
await mkdir(destination, { recursive: true });
const temporary = path.join(destination, `updates-${process.pid}.tmp`);
await writeFile(temporary, JSON.stringify(feed));
await rename(temporary, path.join(destination, "updates.json"));
console.log(JSON.stringify({ status: feed.status, lastChecked: feed.lastChecked, latestRun: ledger.run?.id,
  changesInLatestRun: alerts.filter((a) => a.id.startsWith(ledger.run?.id)).length, feed: "generated/licensing/updates.json" }));
if (process.argv.includes("--publish")) {
  const published = await exec(process.execPath, ["scripts/publish-licensing.mjs"], { cwd: root, timeout: 180_000, maxBuffer: 1024 * 1024 });
  process.stdout.write(published.stdout);
}
if (feed.status === "failed") process.exitCode = 1;
