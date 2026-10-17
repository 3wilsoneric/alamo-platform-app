import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const destination = path.join(root, "generated/everyagent-worker");
// Rebuild only this script's generated output so deleted source and excluded
// presentation assets cannot remain in a later worker package.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of ["server", "shared"]) await cp(path.join(root, name), path.join(destination, name), {
  recursive: true, filter: source => !source.startsWith(path.join(root, "server/presentations"))
});
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
await writeFile(path.join(destination, "package.json"), JSON.stringify({ name: "alamoagent-worker", version: "1.0.0", private: true,
  type: "module", main: "server/everyagent-worker.mjs", engines: pkg.engines, dependencies: pkg.dependencies, overrides: pkg.overrides }, null, 2) + "\n");
await cp(path.join(root, "scripts/azure/everyagent-host.json"), path.join(destination, "host.json"));
await cp(path.join(root, "package-lock.json"), path.join(destination, "package-lock.json"));
console.log(`Prepared private Functions worker at ${destination}. No resources created or deployed.`);
