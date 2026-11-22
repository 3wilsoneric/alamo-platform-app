#!/usr/bin/env node
// The current production shell retires both question-picker entry routes to
// Overview. Preserve this release command as a strict redirect/data/auth check.
// Local guided-answer behavior remains covered by check:browser-all-guided-answers.
process.argv.push("--legacy-questions");
const { main } = await import("./check-production-signed-in-smoke.mjs");
await main();
