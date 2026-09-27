#!/usr/bin/env node
import {
  BASE_URL,
  attachPageDiagnostics,
  prepareArtifactDirs,
  withBrowserQa
} from "./browser-qa-utils.mjs";

const { screenshotDir } = await prepareArtifactDirs("browser-admissions-overview-qa");

await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  attachPageDiagnostics(page, { consoleErrors, requestFailures });

  await page.goto(`${BASE_URL}/home`, { waitUntil: "domcontentloaded" });
  const homeBackground = await page.locator('[data-california-workspace-carousel="true"]').evaluate(
    (element) => window.getComputedStyle(element).backgroundColor
  );
  const admissionsLink = page.locator('[data-california-hero-action="admissions"]');
  if (await admissionsLink.count()) {
    throw new Error("Admissions navigation must remain hidden until the overview is finished.");
  }
  await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-admissions-overview="true"]').waitFor();
  const admissionsBackground = await page.locator('[data-admissions-overview="true"]').evaluate(
    (element) => window.getComputedStyle(element).backgroundColor
  );
  if (admissionsBackground !== homeBackground) {
    throw new Error(`Admissions canvas ${admissionsBackground} does not match Home ${homeBackground}.`);
  }
  for (const name of ["Board", "Census", "Trends"]) {
    if (await page.getByRole("tab", { name: new RegExp(`^${name}`) }).count() !== 1) {
      throw new Error(`Admissions overview is missing its compact ${name} tab.`);
    }
  }
  const clientNames = page.locator('[data-admissions-client-name="true"]');
  await clientNames.first().waitFor({ state: "visible", timeout: 60_000 });
  if (await clientNames.count() < 1 || !(await clientNames.first().innerText()).trim()) {
    throw new Error("Admissions board cards must show the client name.");
  }
  const executiveUpdate = page.locator('[data-admissions-executive-update="true"]');
  await executiveUpdate.waitFor({ state: "visible" });
  const executiveText = (await executiveUpdate.innerText()).trim();
  if (
    !/active referrals?/.test(executiveText) ||
    !executiveText.includes("at decision") ||
    !executiveText.includes("Where the work is:")
  ) {
    throw new Error(`Admissions executive update is incomplete: ${executiveText}`);
  }
  if (/[()]/.test(executiveText)) {
    throw new Error(`Admissions executive update must use natural counts without parentheses: ${executiveText}`);
  }
  if (await executiveUpdate.locator('[data-admissions-executive-line]').count() !== 2) {
    throw new Error("Admissions executive update must keep its workload and location lines distinct.");
  }
  if (await executiveUpdate.locator("strong").count() < 5) {
    throw new Error("Admissions executive update has lost its reading hierarchy.");
  }
  const chatTreatment = await executiveUpdate.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      background: style.backgroundColor,
      borderLeftWidth: style.borderLeftWidth,
      borderRadius: style.borderRadius
    };
  });
  if (
    await executiveUpdate.getAttribute("data-admissions-chat-response") !== "true" ||
    await executiveUpdate.locator('[data-admissions-chat-avatar="true"]').count() !== 1 ||
    chatTreatment.background !== "rgb(244, 247, 245)" ||
    chatTreatment.borderLeftWidth !== "0px" ||
    chatTreatment.borderRadius !== "16px"
  ) {
    throw new Error(`Admissions executive update lost its assistant-response treatment: ${JSON.stringify(chatTreatment)}`);
  }
  if (await executiveUpdate.locator('[data-admissions-executive-line]').first().evaluate((element) => window.getComputedStyle(element).transitionDuration) === "0s") {
    throw new Error("Admissions analyst response must retain its streaming reveal transition.");
  }
  if (/Immediate follow-up:|Update overdue|Move-in overdue|Needs follow-up/.test(await page.locator("body").innerText())) {
    throw new Error("Admissions must not present automated attention judgments.");
  }
  const communityFilters = page.locator('[data-admissions-community-filters="true"]');
  await communityFilters.waitFor({ state: "visible" });
  const communityPills = communityFilters.getByRole("button");
  if (await communityPills.count() < 6) {
    throw new Error("Admissions board must expose All communities and each community as pressable pills.");
  }
  if (
    await page.locator('[data-admissions-board="true"] select').count() ||
    await page.getByRole("button", { name: /^Attention/ }).count() ||
    await page.getByRole("button", { name: "Clear" }).count()
  ) {
    throw new Error("Community pills must be the Admissions board's only filters.");
  }
  const layoutToggle = page.locator('[data-admissions-layout-toggle="true"]');
  const boardViewButton = layoutToggle.getByRole("button", { name: "Board" });
  const listViewButton = layoutToggle.getByRole("button", { name: "List" });
  const initialViewTreatment = {
    group: await layoutToggle.evaluate((element) => window.getComputedStyle(element).backgroundColor),
    board: await boardViewButton.evaluate((element) => window.getComputedStyle(element).backgroundColor),
    list: await listViewButton.evaluate((element) => window.getComputedStyle(element).backgroundColor)
  };
  if (
    initialViewTreatment.group !== "rgba(0, 0, 0, 0)" ||
    initialViewTreatment.board !== "rgb(229, 242, 236)" ||
    initialViewTreatment.list !== "rgba(0, 0, 0, 0)" ||
    await boardViewButton.getAttribute("aria-pressed") !== "true" ||
    await listViewButton.getAttribute("aria-pressed") !== "false"
  ) {
    throw new Error(`Admissions view control must highlight only the active page without a gray tray: ${JSON.stringify(initialViewTreatment)}`);
  }
  const allCardsCount = await page.locator('[data-admissions-board-card]').count();
  const allCommunitiesPill = communityFilters.getByRole("button", { name: "All communities" });
  const firstCommunityPill = communityPills.nth(1);
  const secondCommunityPill = communityPills.nth(2);
  await firstCommunityPill.click();
  const firstCommunityCount = await page.locator('[data-admissions-board-card]').count();
  await secondCommunityPill.click();
  const twoCommunityCount = await page.locator('[data-admissions-board-card]').count();
  if (
    await firstCommunityPill.getAttribute("aria-pressed") !== "true" ||
    await secondCommunityPill.getAttribute("aria-pressed") !== "true" ||
    await allCommunitiesPill.getAttribute("aria-pressed") !== "false" ||
    firstCommunityCount < 1 ||
    twoCommunityCount <= firstCommunityCount ||
    twoCommunityCount >= allCardsCount
  ) {
    throw new Error("Admissions community pills must support additive multi-selection.");
  }
  await allCommunitiesPill.click();
  if (
    await allCommunitiesPill.getAttribute("aria-pressed") !== "true" ||
    await page.locator('[data-admissions-board-card]').count() !== allCardsCount
  ) {
    throw new Error("All communities must reset the Admissions board to its complete referral set.");
  }
  const surfaceTabs = page.locator('[data-admissions-surface-tabs="true"]');
  const tabTreatment = await surfaceTabs.getByRole("tab", { name: /^Board/ }).evaluate((element) => {
    const tab = window.getComputedStyle(element);
    const list = window.getComputedStyle(element.parentElement);
    return { borderBottomColor: tab.borderBottomColor, borderRadius: tab.borderRadius, listBackground: list.backgroundColor };
  });
  if (tabTreatment.borderBottomColor !== "rgb(15, 139, 115)" || tabTreatment.borderRadius !== "0px" || tabTreatment.listBackground !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Admissions tabs lost their quiet analyst treatment: ${JSON.stringify(tabTreatment)}`);
  }
  if (await page.locator('[data-open-full-pipeline="true"], a[href*="alamo-pipeline.com"]').count()) {
    throw new Error("Admissions overview must remain a self-contained analyst update without Pipeline links.");
  }
  await page.screenshot({
    path: `${screenshotDir}/desktop-admissions-board.png`,
    fullPage: true
  });
  const firstClientName = (await page.locator('[data-admissions-board-card]').first().locator('[data-admissions-client-name="true"]').innerText()).trim();
  await page.locator('[data-admissions-board-card]').first().click();
  const progressModal = page.locator('[data-admissions-progress-modal="true"]');
  await progressModal.waitFor({ state: "visible" });
  if (await progressModal.locator('[data-admissions-progress-step]').count() !== 3) {
    throw new Error("Client progress review must show the three referral stages.");
  }
  const chartTabName = (await progressModal.locator('[data-admissions-chart-tab-name="true"]').innerText()).trim();
  const chartNameTab = progressModal.locator('[data-admissions-chart-name-tab="true"]');
  const chartNameLabel = progressModal.locator('[data-admissions-chart-name-label="true"]');
  const decisionTab = progressModal.locator('[data-admissions-decision-tab]');
  if (
    chartTabName !== firstClientName ||
    await progressModal.locator('[data-admissions-chart-section]').count() < 8 ||
    await progressModal.getByRole("heading", { name: "Client and placement" }).count() !== 1 ||
    await progressModal.getByRole("heading", { name: "Admission readiness" }).count() !== 1 ||
    await progressModal.getByRole("heading", { name: "Review focus" }).count() !== 0
  ) {
    throw new Error("Client review must use the client name as its folder tab and present the complete management chart.");
  }
  const folderTabTreatment = await chartNameLabel.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    labelHeight: element.getBoundingClientRect().height
  }));
  folderTabTreatment.tabHeight = await chartNameTab.evaluate((element) => element.getBoundingClientRect().height);
  if (
    folderTabTreatment.background !== "rgb(255, 253, 250)" ||
    folderTabTreatment.tabHeight < 64 ||
    (await decisionTab.innerText()).trim() !== "Under review" ||
    (await decisionTab.getAttribute("data-admissions-decision-tab")) !== "under-review"
  ) {
    throw new Error(`Admissions chart must pair a large white client label with its decision tab: ${JSON.stringify(folderTabTreatment)}`);
  }
  if (
    await progressModal.getByText("Admissions management chart", { exact: true }).count() ||
    await progressModal.getByRole("heading", { name: "Management review" }).count()
  ) {
    throw new Error("Management chart must open directly on the operational content without a redundant title block.");
  }
  const chartWidth = await progressModal.getByRole("dialog").evaluate((element) => element.getBoundingClientRect().width);
  if (chartWidth < 1100) {
    throw new Error(`Desktop management chart is too narrow at ${chartWidth}px.`);
  }
  const desktopDialogBox = await progressModal.getByRole("dialog").boundingBox();
  if (!desktopDialogBox || desktopDialogBox.y < 23 || desktopDialogBox.y + desktopDialogBox.height > 877) {
    throw new Error(`Desktop management chart must remain inside the viewport margin: ${JSON.stringify(desktopDialogBox)}`);
  }
  const chartPalette = await progressModal.evaluate((element) => {
    const folder = element.querySelector('[data-admissions-chart-folder="true"]');
    const paper = element.querySelector('[data-admissions-chart-paper="true"]');
    if (!(folder instanceof HTMLElement) || !(paper instanceof HTMLElement)) return null;
    return {
      folder: window.getComputedStyle(folder).backgroundColor,
      paper: window.getComputedStyle(paper).backgroundColor
    };
  });
  if (chartPalette?.folder !== "rgb(242, 229, 201)" || chartPalette.paper !== "rgb(255, 254, 251)") {
    throw new Error(`Admissions chart lost its manila-folder and paper treatment: ${JSON.stringify(chartPalette)}`);
  }
  await page.screenshot({
    path: `${screenshotDir}/desktop-admissions-progress.png`,
    fullPage: false
  });
  await page.keyboard.press("Escape");
  await progressModal.waitFor({ state: "hidden" });
  await page.getByRole("tab", { name: /^Census/ }).click();
  await page.getByRole("heading", { name: "Community census" }).waitFor();
  if (await executiveUpdate.count()) {
    throw new Error("Admissions executive referral update must stay with the Board view.");
  }
  await page.screenshot({
    path: `${screenshotDir}/desktop-admissions-census.png`,
    fullPage: true
  });
  if (consoleErrors.length || requestFailures.length) {
    throw new Error(JSON.stringify({ consoleErrors, requestFailures }));
  }

  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });
  await mobilePage.locator('[data-admissions-overview="true"]').waitFor();
  await mobilePage.locator('[data-admissions-executive-update="true"]').waitFor({ state: "visible", timeout: 60_000 });
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-board.png`,
    fullPage: true
  });
  await mobilePage.locator('[data-admissions-board-card]').first().click();
  const mobileProgress = mobilePage.locator('[data-admissions-progress-modal="true"]');
  await mobileProgress.waitFor({ state: "visible" });
  if (
    await mobileProgress.locator('[data-admissions-chart-name-tab="true"]').count() !== 1 ||
    await mobileProgress.locator('[data-admissions-chart-name-label="true"]').count() !== 1 ||
    await mobileProgress.locator('[data-admissions-decision-tab="under-review"]').count() !== 1
  ) {
    throw new Error("Mobile management chart must retain the separate client and decision tabs.");
  }
  const modalOverflow = await mobileProgress.evaluate(
    (element) => element.scrollWidth - element.clientWidth
  );
  if (modalOverflow > 2) {
    throw new Error(`Admissions progress modal has ${modalOverflow}px of horizontal overflow on mobile.`);
  }
  const mobileDialog = mobileProgress.getByRole("dialog");
  const dialogBox = await mobileDialog.boundingBox();
  if (!dialogBox || dialogBox.y < 7 || dialogBox.y + dialogBox.height > 837) {
    throw new Error(`Admissions progress modal must remain inside the mobile viewport margin: ${JSON.stringify(dialogBox)}`);
  }
  const doneColor = await mobileProgress.getByRole("button", { name: "Done" }).evaluate(
    (element) => window.getComputedStyle(element).color
  );
  if (doneColor !== "rgb(255, 255, 255)") {
    throw new Error(`Admissions progress modal action lost its white label: ${doneColor}`);
  }
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-progress.png`,
    fullPage: false
  });
  await mobileProgress.getByRole("button", { name: "Done" }).click();
  await mobilePage.getByRole("tab", { name: /^Census/ }).click();
  if (await mobilePage.locator('[data-admissions-community-census-card]').count() !== 5) {
    throw new Error("Admissions overview does not render all five mobile community census cards.");
  }
  const mobileOverflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  if (mobileOverflow > 2) {
    throw new Error(`Admissions overview has ${mobileOverflow}px of horizontal overflow on mobile.`);
  }
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-overview.png`,
    fullPage: true
  });
  await mobileContext.close();
});

console.log("browser admissions checks passed");
