#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const notebookDirectory = path.join(root, "databricks/notebooks");
const notebookFiles = (await readdir(notebookDirectory))
  .filter((fileName) => fileName.endsWith(".py"))
  .sort();

const unsupportedPatterns = [
  {
    label: "REFRESH TABLE",
    pattern: /\bREFRESH\s+TABLE\b/i,
    guidance: "Newly created external tables are immediately queryable; validate them with spark.table(...).limit(1).collect() instead."
  },
  {
    label: "spark.catalog.refreshTable",
    pattern: /\bspark\.catalog\.refreshTable\s*\(/,
    guidance: "Do not call refreshTable from serverless workflow notebooks."
  }
];

const failures = [];

for (const fileName of notebookFiles) {
  const source = await readFile(path.join(notebookDirectory, fileName), "utf8");
  const lines = source.split(/\r?\n/);
  for (const rule of unsupportedPatterns) {
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) {
        failures.push(`${fileName}:${index + 1}: ${rule.label} is not supported on Databricks serverless. ${rule.guidance}`);
      }
    });
  }
}

if (failures.length) {
  console.error(["Databricks serverless compatibility check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}

console.log(`Databricks serverless compatibility passed (${notebookFiles.length} notebooks).`);
