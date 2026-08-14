#!/usr/bin/env node
import { createServer } from "vite";

const SAMPLE_VALUES = Object.freeze({
  community: "San Pablo",
  resident: "Shannon Romero",
  incidentCategory: "AWOL/Elopement",
  month: "May 2026",
  startMonth: "May 2026",
  endMonth: "June 2026"
});

function getPlaceholderIds(prompt) {
  return [...String(prompt ?? "").matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function renderPrompt(prompt) {
  return String(prompt ?? "").replace(/\{([^}]+)\}/g, (_match, id) => SAMPLE_VALUES[id] ?? id);
}

async function main() {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true }
  });

  try {
    const { getCertifiedQuestionCatalog, searchCertifiedQuestionCatalog } = await vite.ssrLoadModule(
      "/src/features/home/workspaceHomeUtils.ts"
    );
    const catalog = getCertifiedQuestionCatalog();
    const failures = [];

    for (const item of catalog) {
      const query = renderPrompt(item.runPrompt);
      const firstResult = searchCertifiedQuestionCatalog(query, 1)[0];
      const expectedVariables = getPlaceholderIds(item.runPrompt);
      const actualVariables = new Set(getPlaceholderIds(firstResult?.runPrompt));

      if (!firstResult) {
        failures.push(`${item.id}: no search result for “${query}”`);
        continue;
      }
      const sharedRunPrompt = firstResult.runPrompt === item.runPrompt;
      if (firstResult.familyId !== item.familyId && !sharedRunPrompt) {
        failures.push(`${item.id}: routed to ${firstResult.id} for “${query}”`);
      }
      for (const variableId of expectedVariables) {
        if (!actualVariables.has(variableId)) {
          failures.push(`${item.id}: ${firstResult.id} dropped {${variableId}} for “${query}”`);
        }
      }
    }

    if (failures.length) {
      throw new Error(`Question search routing failed:\n${failures.join("\n")}`);
    }

    console.log(`question search routing passed (${catalog.length} menu routes)`);
  } finally {
    await vite.close();
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
