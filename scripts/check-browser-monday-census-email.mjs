import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderMondayCensusEmail } from "../shared/monday-census-email.mjs";
import { withBrowserQa } from "./browser-qa-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(
  path.join(root, "scripts/fixtures/monday-census-email.sanitized.json"),
  "utf8"
));
const outputDir = path.join(root, "generated/monday-census-email-prototype");
const html = renderMondayCensusEmail(fixture);

await mkdir(outputDir, { recursive: true });
await withBrowserQa(async (browser) => {
  const desktop = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 1 });
  await desktop.setContent(html, { waitUntil: "load" });
  await desktop.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: true });
  const emailWidth = await desktop.locator(".email-shell").evaluate((element) => element.getBoundingClientRect().width);
  assertWithin(emailWidth, 679, 681, "desktop email width");
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.setContent(html, { waitUntil: "load" });
  const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (mobileOverflow > 2) throw new Error(`Mobile email has ${mobileOverflow}px horizontal overflow.`);
  const metricCells = await mobile.locator(".metric-cell").count();
  if (metricCells !== 4) throw new Error(`Mobile email rendered ${metricCells} KPI cells instead of 4.`);
  const metricWidth = await mobile.locator(".metric-cell").first().evaluate((element) =>
    element.getBoundingClientRect().width
  );
  assertWithin(metricWidth, 160, 180, "mobile KPI width");
  await mobile.screenshot({ path: path.join(outputDir, "mobile.png"), fullPage: true });
  await mobile.close();
});

console.log("Monday census email browser checks passed.");

function assertWithin(value, minimum, maximum, label) {
  if (value < minimum || value > maximum) {
    throw new Error(`${label} was ${value}px; expected ${minimum}-${maximum}px.`);
  }
}
