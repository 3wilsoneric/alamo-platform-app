import { readFile, writeFile } from "node:fs/promises";

const indexPath = "/app/dist/index.html";
const marker = "<!-- alamo-mobile-experience-v6 -->";
const html = await readFile(indexPath, "utf8");

if (!html.includes("<!-- alamo-iphone-polish-v1 -->") || !html.includes("</head>")) {
  throw new Error("The expected Azure iPhone release HTML is missing.");
}

if (!html.includes(marker)) {
  const additions = [
    marker,
    '<link rel="stylesheet" href="/mobile-app-experience.css?v=6" />',
    '<script defer src="/mobile-app-experience.js?v=6"></script>'
  ].join("\n    ");
  await writeFile(indexPath, html.replace("</head>", `    ${additions}\n  </head>`), "utf8");
}
