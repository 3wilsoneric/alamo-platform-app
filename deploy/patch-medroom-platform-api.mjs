#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// The Azure runtime API diverges from the working-tree adapter. Patch only the
// reviewed med-room route onto the exact preceding production file; refuse an
// unknown base image rather than replacing production's unrelated routes.
const path = process.argv[2];
if (!path) throw new Error("Pass the production api/platform.js path.");
const original = await readFile(path, "utf8");
const expectedSha256 = "8f1112d7fe2540cf3281ffc2a05344a0e5f90d61ce832b7291df06d5f976b86f";
const actualSha256 = createHash("sha256").update(original).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error(`Production API base changed: ${actualSha256}`);

function insertAfter(source, anchor, addition) {
  if (source.indexOf(anchor) !== source.lastIndexOf(anchor) || !source.includes(anchor)) {
    throw new Error(`Expected one patch anchor: ${anchor}`);
  }
  return source.replace(anchor, `${anchor}${addition}`);
}

let patched = insertAfter(original,
  'import { assertLicensingAccess } from "../server/licensing-access.mjs";\n',
  'import { getMedroomDashboard } from "../server/medroom-dashboard.mjs";\nimport { assertMedroomAccess } from "../server/medroom-access.mjs";\n');
patched = insertAfter(patched,
  '  "/api/platform/licensing/updates": ({ authContext }) => {\n    assertLicensingAccess(authContext);\n    return getLicensingUpdates();\n  },\n',
  '  "/api/platform/medroom": ({ authContext }) => {\n    assertMedroomAccess(authContext);\n    return getMedroomDashboard();\n  },\n');
await writeFile(path, patched);
console.log("Patched owner-only med-room API route onto verified production base.");
