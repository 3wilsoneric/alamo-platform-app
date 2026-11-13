import { cp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(root, "generated/licensing-job", `context-${Date.now()}`);
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const localPackages = Object.values(pkg.dependencies).filter((value) => value.startsWith("file:"));
if (localPackages.some((value) => !/^file:vendor\/alamo-agent-[a-z-]+-\d+\.\d+\.\d+\.tgz$/.test(value))) {
  throw new Error("Choose pinned local agent distributions before preparing dependencies.");
}
const files = ["package.json", "package-lock.json", "Dockerfile.licensing-job", ...localPackages.map((value) => value.slice(5)),
  "server/licensing-validation.mjs", "server/licensing-storage.mjs", "server/runtime-environment.mjs",
  "shared/licensing-contracts.mjs", "shared/licensing-analysis.mjs",
  "scripts/check-licensing-updates.mjs", "scripts/import-licensing-baseline.mjs", "scripts/publish-licensing.mjs",
  "scripts/licensing/collect.py", "scripts/licensing/restore.py", "scripts/licensing/cloud-storage.mjs",
  "scripts/licensing/job-schedule.mjs", "scripts/licensing/process-error.mjs", "scripts/licensing/run-cloud-job.mjs", "scripts/licensing/update-notifications.mjs"];
await mkdir(path.join(destination, "vendor"), { recursive: true });
for (const file of files) {
  const target = path.join(destination, file === "Dockerfile.licensing-job" ? "Dockerfile" : file);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(path.join(root, file), target);
}
console.log(destination);
