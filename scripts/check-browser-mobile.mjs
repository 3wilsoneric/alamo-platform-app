#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ask,
  attachPageDiagnostics,
  openChat,
  prepareArtifactDirs,
  startCleanChat,
  waitForExpectations,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const VIEWPORT = { width: 390, height: 844 };
const DETAIL_PROMPT = "Can you list every AWOL/Elopement incident from May 2026 through June 2026?";

function collectMobileLayout() {
  const root = document.documentElement;
  const assistant = Array.from(document.querySelectorAll('[data-chat-message-content="assistant"]')).at(-1);
  const answer = assistant?.querySelector('[data-formatted-message-text="true"]');
  const module = Array.from(document.querySelectorAll("[data-chat-module-content-id], [data-chat-visual-module-id]"))
    .at(-1);
  const visible = (element) => {
    if (element.closest('[inert], [aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const clippedControls = Array.from(document.querySelectorAll("button, select, input, textarea"))
    .filter(visible)
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return element.scrollWidth > element.clientWidth + 2 || rect.left < -1 || rect.right > window.innerWidth + 1;
    })
    .map((element) => ({
      text: (element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 100),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      left: Math.round(element.getBoundingClientRect().left),
      right: Math.round(element.getBoundingClientRect().right)
    }));
  const freeTextComposers = Array.from(document.querySelectorAll("textarea, input"))
    .filter(visible)
    .filter((element) => /ask anything|type a message|send a message/i.test(
      `${element.getAttribute("placeholder") || ""} ${element.getAttribute("aria-label") || ""}`
    )).length;

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    documentWidth: root.scrollWidth,
    horizontalOverflow: root.scrollWidth - root.clientWidth,
    answerRect: answer ? {
      left: Math.round(answer.getBoundingClientRect().left),
      width: Math.round(answer.getBoundingClientRect().width),
      height: Math.round(answer.getBoundingClientRect().height)
    } : null,
    moduleRect: module ? {
      top: Math.round(module.getBoundingClientRect().top),
      left: Math.round(module.getBoundingClientRect().left),
      width: Math.round(module.getBoundingClientRect().width),
      height: Math.round(module.getBoundingClientRect().height)
    } : null,
    clippedControls,
    freeTextComposers
  };
}

async function main() {
  const { artifactDir, screenshotDir } = await prepareArtifactDirs("browser-mobile-qa");
  const consoleErrors = [];
  const requestFailures = [];
  let report;

  await withBrowserQa(async (browser) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    attachPageDiagnostics(page, { consoleErrors, requestFailures });
    await openChat(page);
    await startCleanChat(page);
    await ask(page, DETAIL_PROMPT);

    const expected = await waitForExpectations(page, [
      /Portfolio recorded 375 matching AWOL\/Elopement incidents/i,
      /The monthly split was 195 in May 2026 and 180 in June 2026/i,
      /Showing 5 of 375 incidents/i,
      /Download portfolio-awol-elopement-2026-05-2026-06\.csv/i
    ]);
    const initialLayout = await page.evaluate(collectMobileLayout);

    const expandButton = page.getByRole("button", { name: "Show 50 incidents" });
    await page.mouse.wheel(0, 1);
    await expandButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(50);
    const initialControlBox = await expandButton.boundingBox();
    await expandButton.click();
    await page.getByText("Showing 50 of 375 incidents", { exact: true }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(120);
    const collapseButton = page.getByRole("button", { name: "Collapse preview" });
    const expandedControlBox = await collapseButton.boundingBox();
    const expandedLayout = await page.evaluate(collectMobileLayout);
    const screenshotPath = path.join(screenshotDir, "awol-detail-expanded.png");
    await page.screenshot({ path: screenshotPath, fullPage: false });

    await collapseButton.click();
    await page.getByText("Showing 5 of 375 incidents", { exact: true }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(120);
    const restoredExpandButton = page.getByRole("button", { name: "Show 50 incidents" });
    const collapsedControlBox = await restoredExpandButton.boundingBox();
    const collapsedLayout = await page.evaluate(collectMobileLayout);
    const collapsedScreenshotPath = path.join(screenshotDir, "awol-detail-collapsed.png");
    await page.screenshot({ path: collapsedScreenshotPath, fullPage: false });

    await page.getByRole("button", { name: "Choose another question" }).click();
    const search = page.locator('[data-certified-question-search="true"]').last();
    await search.fill("show santa clartia censsus trend");
    await page.waitForTimeout(180);
    const searchResults = await page.locator('[data-certified-question-button="true"]').evaluateAll((nodes) => (
      nodes.map((node) => node.getAttribute("data-certified-question-id"))
    ));
    const catalogLayout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    }));

    const failures = [];
    if (expected.missing.length) failures.push(`missing answer content: ${expected.missing.join(", ")}`);
    for (const [stage, layout] of [["initial", initialLayout], ["expanded", expandedLayout], ["collapsed", collapsedLayout]]) {
      if (layout.viewport.width !== VIEWPORT.width || layout.viewport.height !== VIEWPORT.height) {
        failures.push(`${stage} viewport was ${layout.viewport.width}x${layout.viewport.height}`);
      }
      if (layout.horizontalOverflow > 1) failures.push(`${stage} horizontal overflow: ${layout.horizontalOverflow}px`);
      if (!layout.answerRect || layout.answerRect.width < 320) failures.push(`${stage} answer did not use the mobile content width`);
      if (!layout.moduleRect || layout.moduleRect.width < 320) failures.push(`${stage} detail module did not use the mobile content width`);
      if (layout.clippedControls.length) failures.push(`${stage} clipped controls: ${JSON.stringify(layout.clippedControls)}`);
      if (layout.freeTextComposers) failures.push(`${stage} exposed ${layout.freeTextComposers} free-text composer(s)`);
    }
    if (!initialControlBox || !expandedControlBox || !collapsedControlBox) {
      failures.push("preview controls were not measurable through expansion and collapse");
    } else {
      const expandedDrift = Math.abs(expandedControlBox.y - initialControlBox.y);
      const collapsedDrift = Math.abs(collapsedControlBox.y - expandedControlBox.y);
      if (expandedDrift > 160) failures.push(`expansion moved the active control by ${Math.round(expandedDrift)}px`);
      if (collapsedDrift > 160) failures.push(`collapse moved the active control by ${Math.round(collapsedDrift)}px`);
      for (const [stage, controlBox] of [["expanded", expandedControlBox], ["collapsed", collapsedControlBox]]) {
        if (controlBox.y < -2 || controlBox.y + controlBox.height > VIEWPORT.height + 2) {
          failures.push(`${stage} preview moved the active control outside the viewport`);
        }
      }
    }
    if (catalogLayout.horizontalOverflow > 1) failures.push(`catalog horizontal overflow: ${catalogLayout.horizontalOverflow}px`);
    if (!searchResults[0]?.startsWith("census-trend:")) {
      failures.push(`typo search did not rank the census-trend rail first: ${JSON.stringify(searchResults)}`);
    }
    if (consoleErrors.length) failures.push(`console errors: ${consoleErrors.length}`);
    if (requestFailures.length) failures.push(`request failures: ${requestFailures.length}`);

    report = {
      generatedAt: new Date().toISOString(),
      passed: failures.length === 0,
      viewport: VIEWPORT,
      expected,
      initialLayout,
      expandedLayout,
      collapsedLayout,
      controlBoxes: {
        initial: initialControlBox,
        expanded: expandedControlBox,
        collapsed: collapsedControlBox
      },
      catalogLayout,
      searchResults,
      consoleErrors,
      requestFailures,
      failures,
      screenshotPath,
      collapsedScreenshotPath
    };
    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

    if (failures.length) throw new Error(JSON.stringify(report, null, 2));
    console.log(`browser mobile QA passed: ${VIEWPORT.width}x${VIEWPORT.height}, 5-to-50-to-5 preview, typo ranking, no overflow`);
  });
}

await main();
