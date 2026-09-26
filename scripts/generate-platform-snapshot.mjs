import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generatePlatformSnapshot } from "../server/platform-data.mjs";
import { getPlatformSnapshotTargets } from "../server/platform-snapshot.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

function loadLocalEnvFile() {
  const envPath = path.join(appRoot, ".env");

  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf8");

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value.replace(/^['"]|['"]$/g, "");
    }
  });
}

function hasDatabricksEnv() {
  const hasHost = Boolean(process.env.DATABRICKS_HOST);
  const hasWarehouse = Boolean(
    process.env.DATABRICKS_HTTP_PATH || process.env.DATABRICKS_SQL_WAREHOUSE_ID
  );
  const hasOauth = Boolean(
    process.env.DATABRICKS_CLIENT_ID && process.env.DATABRICKS_CLIENT_SECRET
  );
  const hasPat = Boolean(process.env.DATABRICKS_TOKEN);

  return hasHost && hasWarehouse && (hasOauth || hasPat);
}

function isStrictMode() {
  return process.env.PLATFORM_SNAPSHOT_REQUIRED === "true";
}

function shouldPublishAzureSnapshot() {
  return process.env.PLATFORM_SNAPSHOT_PUBLISH_AZURE === "true";
}

async function main() {
  loadLocalEnvFile();

  if (!hasDatabricksEnv()) {
    console.warn(
      "Skipping platform snapshot generation because Databricks environment variables are not set."
    );
    return;
  }

  const publishAzure = shouldPublishAzureSnapshot();
  const payload = await generatePlatformSnapshot({ publishAzure });
  const targets = getPlatformSnapshotTargets(payload);

  console.log(`Generated platform snapshot at ${targets.local} (${payload.snapshot.version})`);

  if (publishAzure && targets.azure) {
    console.log(
      `Published Azure snapshot artifacts to ${targets.azure.latest} and ${targets.azure.dated}`
    );
  } else if (targets.azure) {
    console.log("Azure snapshot publishing skipped. Set PLATFORM_SNAPSHOT_PUBLISH_AZURE=true to publish from this script.");
  } else {
    console.log("Azure snapshot publishing not configured; local snapshot fallback remains active.");
  }
}

main().catch((error) => {
  if (isStrictMode() || shouldPublishAzureSnapshot()) {
    console.error("Platform snapshot generation failed:", error);
    process.exit(1);
  }

  console.warn("Platform snapshot generation failed; continuing without a published snapshot.", error);
});
