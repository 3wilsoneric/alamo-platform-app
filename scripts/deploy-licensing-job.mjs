import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const image = process.argv.find((arg) => arg.startsWith("--image="))?.slice(8);
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-licensing-job@sha256:[a-f0-9]{64}$/.test(image ?? "")) {
  throw new Error("Pass --image=<pinned alamo-licensing-job digest>.");
}
const root = fileURLToPath(new URL("../", import.meta.url));
const definition = JSON.parse(await readFile(path.join(root, "scripts/azure/licensing-job.json"), "utf8"));
const container = definition.properties.template.containers[0];
container.image = image;
if (process.argv.includes("--enable-notifications")) {
  const notBefore = process.argv.find((arg) => arg.startsWith("--notifications-not-before="))?.split("=")[1];
  if (!notBefore || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(notBefore) || !Number.isFinite(Date.parse(notBefore))) {
    throw new Error("Pass --notifications-not-before=<UTC timestamp> to activate alerts without sending the old queue.");
  }
  container.env.find((entry) => entry.name === "LICENSING_ALERT_NOTIFICATIONS_ENABLED").value = "true";
  container.env.push({ name: "LICENSING_ALERT_NOT_BEFORE", value: notBefore });
}
if (process.argv.includes("--manual")) {
  definition.properties.configuration.triggerType = "Manual";
  definition.properties.configuration.manualTriggerConfig = { parallelism: 1, replicaCompletionCount: 1 };
  delete definition.properties.configuration.scheduleTriggerConfig;
  container.args = [];
}
const directory = path.join(root, "generated/licensing-job");
await mkdir(directory, { recursive: true });
const filename = path.join(directory, "deployment.json");
await writeFile(filename, JSON.stringify(definition, null, 2));
const url = "https://management.azure.com/subscriptions/84d40648-8488-4226-9e74-6b9458d0d73f/resourceGroups/alamo-data-rg/providers/Microsoft.App/jobs/alamo-platform-licensing-check?api-version=2025-07-01";
execFileSync("az", ["rest", "--method", "put", "--url", url, "--body", `@${filename}`, "--query", "{name:name,state:properties.provisioningState,trigger:properties.configuration.triggerType}", "-o", "json"], { stdio: "inherit" });
