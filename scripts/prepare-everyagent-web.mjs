import { cp, mkdir, rename } from "node:fs/promises";

await mkdir("generated/everyagent-web/brand", { recursive: true });
await cp("public/brand/everyagent-alamo-v1.webp", "generated/everyagent-web/brand/everyagent-alamo-v1.webp");
await rename("generated/everyagent-web/agent.html", "generated/everyagent-web/index.html");
console.log("Prepared standalone AlamoAgent browser bundle with only its approved mark.");
