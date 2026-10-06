import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "generated/licensing-job", `context-${Date.now()}`);
const files = ["package.json", "package-lock.json", "Dockerfile.licensing-job",
  "server/licensing-validation.mjs", "server/licensing-storage.mjs", "server/runtime-environment.mjs",
  "shared/licensing-contracts.mjs", "shared/licensing-analysis.mjs",
  "scripts/check-licensing-updates.mjs", "scripts/import-licensing-baseline.mjs", "scripts/publish-licensing.mjs",
  "scripts/licensing/collect.py", "scripts/licensing/restore.py", "scripts/licensing/cloud-storage.mjs",
  "scripts/licensing/job-schedule.mjs", "scripts/licensing/run-cloud-job.mjs", "scripts/licensing/update-notifications.mjs"];
for (const file of files) {
  const target = path.join(destination, file === "Dockerfile.licensing-job" ? "Dockerfile" : file);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, file), target);
}
console.log(destination);
