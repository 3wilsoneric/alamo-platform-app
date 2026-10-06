import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateLicensingBundle } from "../../server/licensing-validation.mjs";
import { LICENSING_BLOB_PATH, LICENSING_MAX_BYTES } from "../../server/licensing-storage.mjs";
import { licensingContainer, readBlob } from "./cloud-storage.mjs";
import { withLicensingLease } from "./cloud-storage.mjs";
import { LICENSING_SCHEDULE, isLicensingScheduledTime } from "./job-schedule.mjs";
import { deliverPendingLicensingNotifications, queueLicensingChangeNotification } from "./update-notifications.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const container = licensingContainer();
const current = container.getBlockBlobClient(LICENSING_BLOB_PATH);
try {
  const recoveredNotifications = await deliverPendingLicensingNotifications(container);
  if (process.argv.includes("--scheduled") && !isLicensingScheduledTime()) {
    console.log(JSON.stringify({ status: "skipped", reason: "Outside Monday/Wednesday 9 a.m. Pacific.", notifications: recoveredNotifications }));
  } else {
    const result = await withLicensingLease(current, async (leaseId, signal) => {
      const previous = await readBlob(current, LICENSING_MAX_BYTES);
      const saved = validateLicensingBundle(JSON.parse(previous.bytes));
      const destination = path.join(root, "generated/licensing");
      await mkdir(destination, { recursive: true });
      try {
        const evidenceHash = saved.collector?.evidenceSha256 ?? process.env.LICENSING_INITIAL_EVIDENCE_SHA256;
        if (!/^[a-f0-9]{64}$/.test(evidenceHash ?? "")) throw new Error("Published collector restart state is missing.");
        const evidence = await readBlob(container.getBlobClient(`licensing/evidence/${evidenceHash}.tar.gz`), 64 * 1024 * 1024);
        if (createHash("sha256").update(evidence.bytes).digest("hex") !== evidenceHash) {
          throw new Error("Collector restart archive hash mismatch.");
        }
        const archive = path.join(destination, "restore.tar.gz");
        await writeFile(archive, evidence.bytes);
        const source = path.join(root, "output/ccld-baseline");
        await mkdir(source, { recursive: true });
        await exec("python3", ["scripts/licensing/restore.py", archive, source], { cwd: root, timeout: 60_000, signal });
        const runId = (await readFile(path.join(source, "data/latest-complete.txt"), "utf8")).trim();
        if (runId !== saved.baseline.runId) throw new Error("Restart archive and published baseline disagree.");
        await writeFile(path.join(destination, "baseline.json"), JSON.stringify(saved.baseline));
        await writeFile(path.join(destination, "updates.json"), JSON.stringify(saved.updates));
        const { stdout } = await exec(process.execPath, ["scripts/check-licensing-updates.mjs", "--publish"], {
          cwd: root, timeout: 900_000, maxBuffer: 4 * 1024 * 1024, signal,
          env: { ...process.env, LICENSING_CLOUD_JOB: "true", LICENSING_EXPECTED_ETAG: previous.etag, LICENSING_LEASE_ID: leaseId }
        });
        process.stdout.write(stdout);
        const publishedBaseline = JSON.parse(await readFile(path.join(destination, "baseline.json"), "utf8"));
        const publishedUpdates = JSON.parse(await readFile(path.join(destination, "updates.json"), "utf8"));
        const latestAlerts = publishedUpdates.alerts.filter((alert) => alert.id.startsWith(`${publishedBaseline.runId}-`));
        const notification = await queueLicensingChangeNotification(container, {
          runId: publishedBaseline.runId,
          alerts: latestAlerts,
          checkedAt: publishedUpdates.lastChecked
        });
        return { status: "complete", schedule: LICENSING_SCHEDULE, notification };
      } catch (error) {
        // Preserve the last published collection and expose failure in Updates.
        // This also covers restore/import/publish failures, not just HTTP errors.
        if (!signal.aborted) {
          try {
            const latest = await readBlob(current, LICENSING_MAX_BYTES);
            const retained = validateLicensingBundle(JSON.parse(latest.bytes));
            retained.updates = { ...retained.updates, status: "failed", lastChecked: new Date().toISOString(), schedule: LICENSING_SCHEDULE };
            await current.uploadData(Buffer.from(JSON.stringify(retained)), {
              conditions: { ifMatch: latest.etag, leaseId },
              blobHTTPHeaders: { blobContentType: "application/json", blobCacheControl: "no-cache" }
            });
          } catch (statusError) { console.error(`Unable to publish failure status: ${statusError.message}`); }
        }
        throw error;
      }
    });
    const deliveredNotifications = await deliverPendingLicensingNotifications(container);
    console.log(JSON.stringify({ ...result, notifications: [...recoveredNotifications, ...deliveredNotifications] }));
  }
} catch (error) {
  console.error(`Licensing cloud check failed: ${error.message}`);
  process.exitCode = 1;
}
