#!/usr/bin/env node
import {
  BASE_URL,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(`California carousel check failed: ${message}`);
}

async function waitForActivePanel(page, panelName) {
  try {
    await page.waitForFunction(
      (name) => {
        const carousel = document.querySelector(
          '[data-california-workspace-carousel="true"]'
        );
        const panel = document.querySelector(
          `[data-california-carousel-panel="${name}"]`
        );
        if (!carousel || !panel) return false;
        return (
          carousel.getAttribute("data-california-active-panel") === name &&
          panel.getAttribute("aria-hidden") === "false" &&
          Math.abs(
            panel.getBoundingClientRect().left -
              carousel.getBoundingClientRect().left
          ) <= 2
        );
      },
      panelName,
      { timeout: 15_000 }
    );
  } catch (error) {
    const state = await page.evaluate((name) => {
      const carousel = document.querySelector(
        '[data-california-workspace-carousel="true"]'
      );
      const panel = document.querySelector(
        `[data-california-carousel-panel="${name}"]`
      );
      return {
        route: window.location.pathname,
        activePanel: carousel?.getAttribute("data-california-active-panel"),
        carouselLeft: carousel?.getBoundingClientRect().left,
        carouselWidth: carousel?.getBoundingClientRect().width,
        panelLeft: panel?.getBoundingClientRect().left,
        panelWidth: panel?.getBoundingClientRect().width,
        panelHidden: panel?.getAttribute("aria-hidden"),
        trackWidth: document
          .querySelector('[data-california-carousel-track="true"]')
          ?.getBoundingClientRect().width,
        panels: Array.from(
          document.querySelectorAll("[data-california-carousel-panel]")
        ).map((entry) => ({
          name: entry.getAttribute("data-california-carousel-panel"),
          left: entry.getBoundingClientRect().left,
          width: entry.getBoundingClientRect().width
        })),
        trackTransform: window.getComputedStyle(
          document.querySelector(
            '[data-california-carousel-track="true"]'
          ) ?? document.body
        ).transform
      };
    }, panelName);
    throw new Error(
      `California carousel check failed: ${panelName} did not settle: ${JSON.stringify(state)}`,
      { cause: error }
    );
  }
}

async function assertNoDocumentScroll(page, label) {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
    scrollY: window.scrollY
  }));
  assert(
    overflow.horizontal <= 2 &&
      overflow.vertical <= 2 &&
      overflow.scrollY <= 2,
    `${label} escaped the viewport: ${JSON.stringify(overflow)}`
  );
}

async function assertNoPanelOverflow(page, panelName, label) {
  const result = await page
    .locator(`[data-california-carousel-panel="${panelName}"]`)
    .evaluate((panel) => {
      const panelBox = panel.getBoundingClientRect();
      const offenders = Array.from(panel.querySelectorAll("*"))
        .map((element) => {
          const box = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            marker:
              element.getAttribute("data-reports-page") ??
              element.getAttribute("data-certified-question-guide") ??
              element.className,
            left: Math.round(box.left),
            right: Math.round(box.right),
            width: Math.round(box.width),
            overflowX: window.getComputedStyle(element).overflowX
          };
        })
        .filter(
          (entry) =>
            entry.right > Math.round(panelBox.right) + 2 &&
            entry.overflowX !== "auto" &&
            entry.overflowX !== "scroll"
        )
        .sort((left, right) => right.right - left.right)
        .slice(0, 5);
      return {
        overflow: panel.scrollWidth - panel.clientWidth,
        offenders
      };
    });
  assert(
    result.overflow <= 2,
    `${label} has ${result.overflow}px of hidden horizontal panel overflow: ${JSON.stringify(result.offenders)}`
  );
}

async function assertMapNavigationPlacement(page, viewport, label) {
  const placement = await page
    .locator('[data-california-hero-menu="true"]')
    .evaluate((menu) => {
      const box = menu.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        viewportWidth: window.innerWidth
      };
    });
  assert(
    placement.left >= 8 && placement.right <= placement.viewportWidth - 8,
    `${label} navigation is clipped: ${JSON.stringify(placement)}`
  );
}

async function assertAnalyticsComposition(page, viewport, label) {
  const composition = await page.evaluate(() => {
    const reports = document.querySelector('[data-reports-page="true"]');
    const aside = document.querySelector('aside[aria-label="Analytics"]');
    const main = reports?.querySelector('main');
    const library = document.querySelector('[data-analytics-report-library="true"]');
    const reader = document.querySelector('[data-full-report]');
    if (!reports || !aside || !main || !library || !reader) return null;
    const reportsBox = reports.getBoundingClientRect();
    const asideBox = aside.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const libraryBox = library.getBoundingClientRect();
    const readerBox = reader.getBoundingClientRect();
    return {
      reportsLeft: reportsBox.left,
      reportsRight: reportsBox.right,
      asideLeft: asideBox.left,
      asideRight: asideBox.right,
      asideWidth: asideBox.width,
      mainLeft: mainBox.left,
      mainRight: mainBox.right,
      mainTop: mainBox.top,
      mainWidth: mainBox.width,
      libraryBottom: libraryBox.bottom,
      readerTop: readerBox.top,
      readerLeft: readerBox.left,
      readerRight: readerBox.right,
      readerWidth: readerBox.width
    };
  });
  assert(composition, `${label} did not render the report library and reader`);
  if (viewport.width >= 768) {
    assert(
      composition.asideRight <= composition.mainLeft + 2 && composition.asideWidth <= 300,
      `${label} analytics library is not a restrained left rail: ${JSON.stringify(composition)}`
    );
  } else {
    assert(
      composition.mainTop >= composition.libraryBottom - 2,
      `${label} mobile report reader overlaps the report library: ${JSON.stringify(composition)}`
    );
  }
  assert(
    composition.mainLeft >= composition.reportsLeft - 2 &&
      composition.mainRight <= composition.reportsRight + 2 &&
      composition.readerLeft >= composition.mainLeft - 2 &&
      composition.readerRight <= composition.mainRight + 2 &&
      composition.readerWidth >= composition.mainWidth * 0.96,
    `${label} report reader does not fit its available pane: ${JSON.stringify(composition)}`
  );
}

async function runViewport(browser, screenshotDir, viewport, suffix) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
  await page
    .locator('[data-california-workspace-carousel="true"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator('[data-california-map="true"]')
    .waitFor({ state: "visible", timeout: 10_000 });

  assert(
    (await page.locator('[data-california-carousel-panel]').count()) === 3,
    `${suffix} does not pre-mount exactly three panels`
  );
  assert(
    (await page.locator('[data-platform-wordmark="true"]').count()) === 1,
    `${suffix} does not render exactly one Alamo Health home anchor`
  );
  const userIdentity = page.locator('[data-platform-user-identity="true"]');
  assert(
    (await userIdentity.count()) === 1,
    `${suffix} does not retain exactly one profile control`
  );
  assert(
    (await userIdentity.isVisible()) === (viewport.width >= 640),
    `${suffix} profile control does not follow its desktop-only placement`
  );
  await page
    .locator('[data-california-workspace-carousel="true"]')
    .evaluate((carousel) => {
      carousel.setAttribute("data-carousel-instance-proof", "preserved");
    });
  await assertNoDocumentScroll(page, `${suffix} map panel`);
  await assertMapNavigationPlacement(page, viewport, `${suffix} map panel`);

  await page
    .getByRole("button", { name: "Ask a question", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname === "/questions", {
    timeout: 5_000
  });
  assert(
    (await page
      .locator('[data-california-workspace-carousel="true"]')
      .getAttribute("data-carousel-instance-proof")) === "preserved",
    `${suffix} remounted the carousel instead of sliding the existing workspace`
  );
  await waitForActivePanel(page, "questions");
  await page
    .locator('[data-certified-question-guide="true"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  const embeddedQuestionChrome = await page
    .locator('[data-california-carousel-panel="questions"]')
    .evaluate((panel) => {
      const workspace = panel.querySelector('[data-embedded-question-workspace="true"]');
      const guide = panel.querySelector('[data-certified-question-guide="true"]');
      const buttons = [...panel.querySelectorAll("button")].map((button) => ({
        label: button.getAttribute("aria-label") || "",
        text: String(button.textContent || "").trim()
      }));
      const workspaceStyle = workspace ? window.getComputedStyle(workspace) : null;
      const guideStyle = guide ? window.getComputedStyle(guide) : null;
      return {
        hasSecondaryToolbar: buttons.some(
          (button) =>
            /^(Hide questions|Open questions)$/i.test(button.label) ||
            /^(Hide questions|New chat)$/i.test(button.text)
        ),
        workspaceBorderTopWidth: workspaceStyle?.borderTopWidth || "",
        guideBorderTopWidth: guideStyle?.borderTopWidth || ""
      };
    });
  assert(
    !embeddedQuestionChrome.hasSecondaryToolbar,
    `${suffix} Questions panel reintroduced the secondary question toolbar`
  );
  assert(
    embeddedQuestionChrome.workspaceBorderTopWidth === "0px",
    `${suffix} Questions workspace reintroduced a shell divider`
  );
  assert(
    embeddedQuestionChrome.guideBorderTopWidth === "3px",
    `${suffix} Questions guide lost its green top rule`
  );
  await assertNoDocumentScroll(page, `${suffix} Questions panel`);
  await assertNoPanelOverflow(page, "questions", `${suffix} Questions panel`);
  await page.screenshot({
    path: `${screenshotDir}/${suffix}-questions-carousel.png`,
    fullPage: false
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForActivePanel(page, "questions");
  await page
    .locator('[data-certified-question-guide="true"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  await assertNoDocumentScroll(page, `${suffix} reloaded Questions panel`);

  assert(
    (await page.getByRole("button", { name: "Analytics", exact: true }).count()) === 1,
    `${suffix} does not expose the Analytics handoff from Questions`
  );
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/analytics", {
    timeout: 5_000
  });
  await waitForActivePanel(page, "reports");
  await page
    .locator('[data-reports-page="true"][data-reports-embedded="true"]')
    .waitFor({ state: "visible", timeout: 10_000 });
  await page
    .locator('[data-full-report]')
    .waitFor({ state: "visible", timeout: 45_000 });
  await assertNoDocumentScroll(page, `${suffix} Analytics panel`);
  await assertNoPanelOverflow(page, "reports", `${suffix} Analytics panel`);
  await assertAnalyticsComposition(page, viewport, `${suffix} Analytics panel`);
  await page.screenshot({
    path: `${screenshotDir}/${suffix}-analytics-carousel.png`,
    fullPage: false
  });

  await page.getByRole("button", { name: "Back to California map" }).click();
  await page.waitForURL((url) => url.pathname === "/home", {
    timeout: 5_000
  });
  await waitForActivePanel(page, "map");

  await context.close();
}

async function main() {
  const { screenshotDir } = await prepareArtifactDirs(
    "browser-california-carousel-qa"
  );

  await withBrowserQa(async (browser) => {
    await runViewport(
      browser,
      screenshotDir,
      { width: 1440, height: 920 },
      "desktop"
    );
    await runViewport(
      browser,
      screenshotDir,
      { width: 1160, height: 1356 },
      "portrait-desktop"
    );
    await runViewport(
      browser,
      screenshotDir,
      { width: 2826, height: 1358 },
      "ultrawide"
    );
    await runViewport(
      browser,
      screenshotDir,
      { width: 390, height: 844 },
      "mobile"
    );
  });

  console.log(
    "California carousel browser QA passed: map, Questions, and Analytics navigation, reload, back navigation, logo, profile control, report composition, and viewport containment work from mobile through ultrawide."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
