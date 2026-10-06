import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const resourceGroup = "alamo-data-rg";
const workflow = "alamo-platform-licensing-alerts";
const subscription = "84d40648-8488-4226-9e74-6b9458d0d73f";
const apiVersion = "2019-05-01";
const workflowUrl = `https://management.azure.com/subscriptions/${subscription}/resourceGroups/${resourceGroup}/providers/Microsoft.Logic/workflows/${workflow}`;
const definition = path.join(root, "scripts/azure/licensing-alert-workflow.json");

const connectionState = execFileSync("az", ["resource", "show", "--resource-group", resourceGroup, "--name", "office365", "--resource-type", "Microsoft.Web/connections", "--query", "properties.overallStatus", "-o", "tsv"], { encoding: "utf8" }).trim();
if (connectionState !== "Connected") throw new Error("The existing Office 365 connector is not connected.");

execFileSync("az", ["rest", "--method", "put", "--url", `${workflowUrl}?api-version=${apiVersion}`, "--body", `@${definition}`, "--query", "{name:name,state:properties.state,provisioning:properties.provisioningState}", "-o", "json"], { stdio: "inherit" });
const callback = JSON.parse(execFileSync("az", ["rest", "--method", "post", "--url", `${workflowUrl}/triggers/licensing_change_received/listCallbackUrl?api-version=${apiVersion}`, "-o", "json"], { encoding: "utf8" }));
if (!callback.value?.startsWith("https://") || !new URL(callback.value).hostname.endsWith("logic.azure.com")) throw new Error("Logic Apps did not return a valid callback URL.");
execFileSync("az", ["keyvault", "secret", "set", "--vault-name", "alamo-platform-kv-6jtpmf", "--name", "licensing-alert-webhook-url", "--value", callback.value, "--output", "none"], { stdio: "inherit" });
console.log(JSON.stringify({ workflow, state: "Enabled", callbackStoredIn: "alamo-platform-kv-6jtpmf/licensing-alert-webhook-url" }));
