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
  const analyticsLink = page.locator('[data-california-hero-action="analytics"]');
  if (await admissionsLink.count() !== 1 || await admissionsLink.getAttribute("href") !== "/admissions") {
    throw new Error("Admissions navigation must be visible to an identity with Admissions access.");
  }
  const [analyticsBox, admissionsBox] = await Promise.all([
    analyticsLink.boundingBox(),
    admissionsLink.boundingBox()
  ]);
  if (!analyticsBox || !admissionsBox || admissionsBox.y <= analyticsBox.y + analyticsBox.height) {
    throw new Error("Admissions navigation must sit below Analytics.");
  }
  await page.goto(`${BASE_URL}/admissions`, { waitUntil: "domcontentloaded" });

  await page.locator('[data-admissions-overview="true"]').waitFor();
  const admissionsBackground = await page.locator('[data-admissions-overview="true"]').evaluate(
    (element) => window.getComputedStyle(element).backgroundColor
  );
  if (admissionsBackground !== homeBackground) {
    throw new Error(`Admissions canvas ${admissionsBackground} does not match Home ${homeBackground}.`);
  }
  const admissionsNavigation = page.locator('[data-platform-page-navigation="true"]');
  const admissionsAnalyticsLink = admissionsNavigation.locator('[data-platform-page-target="analytics"]');
  const [admissionsNavigationBox, admissionsAnalyticsBox] = await Promise.all([
    admissionsNavigation.boundingBox(),
    admissionsAnalyticsLink.boundingBox()
  ]);
  if (
    await admissionsAnalyticsLink.getAttribute("data-platform-page-side") !== "right" ||
    !admissionsNavigationBox ||
    !admissionsAnalyticsBox ||
    admissionsAnalyticsBox.x < admissionsNavigationBox.x + admissionsNavigationBox.width / 2
  ) {
    throw new Error("Admissions must place its Analytics navigation on the right.");
  }
  for (const name of ["Board", "Census", "Trends"]) {
    if (await page.getByRole("tab", { name: new RegExp(`^${name}`) }).count() !== 1) {
      throw new Error(`Admissions overview is missing its compact ${name} tab.`);
    }
  }
  const surfaceTabs = page.locator('[data-admissions-surface-tabs="true"]');
  const desktopTabs = surfaceTabs.getByRole("tab");
  const [desktopFirstTabBox, desktopLastTabBox] = await Promise.all([
    desktopTabs.first().boundingBox(),
    desktopTabs.last().boundingBox()
  ]);
  const desktopViewport = page.viewportSize();
  if (
    !desktopFirstTabBox ||
    !desktopLastTabBox ||
    !desktopViewport ||
    Math.abs(
      (desktopFirstTabBox.x + desktopLastTabBox.x + desktopLastTabBox.width) / 2 -
      (desktopViewport.width / 2)
    ) > 2
  ) {
    throw new Error(`Admissions surface navigation must stay centered at the top of the page: ${JSON.stringify({ desktopFirstTabBox, desktopLastTabBox, desktopViewport })}`);
  }
  const clientNames = page.locator('[data-admissions-client-name="true"]');
  await clientNames.first().waitFor({ state: "visible", timeout: 60_000 });
  if (await clientNames.count() < 1 || !(await clientNames.first().innerText()).trim()) {
    throw new Error("Admissions board cards must show the client name.");
  }
  const executiveUpdate = page.locator('[data-admissions-executive-update="true"]');
  await executiveUpdate.waitFor({ state: "visible" });
  const streamStartLength = (await executiveUpdate.innerText()).trim().length;
  if (await executiveUpdate.getAttribute("data-admissions-chat-typing") !== "true") {
    throw new Error("Admissions analyst response must begin in a composing state.");
  }
  await page.waitForTimeout(500);
  const streamProgressLength = (await executiveUpdate.innerText()).trim().length;
  if (
    await executiveUpdate.getAttribute("data-admissions-chat-typing") !== "true" ||
    streamProgressLength <= streamStartLength
  ) {
    throw new Error(`Admissions analyst response must stream progressively: ${JSON.stringify({ streamStartLength, streamProgressLength })}`);
  }
  await page.waitForFunction(
    () => document.querySelector('[data-admissions-executive-update="true"]')?.getAttribute("data-admissions-chat-typing") === "false",
    undefined,
    { timeout: 20_000 }
  );
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
  const acceptedClientNames = await page.locator('[data-admissions-card-decision="accept"]')
    .locator('xpath=ancestor::*[@data-admissions-board-card][1]')
    .locator('[data-admissions-client-name="true"]')
    .allTextContents();
  const acceptedLine = executiveUpdate.locator('[data-admissions-executive-line="accepted"]');
  if (
    acceptedClientNames.length < 1 ||
    await acceptedLine.count() !== 1 ||
    !acceptedClientNames.every((name) => executiveText.includes(name.trim())) ||
    !/^Accepted clients moving toward admission:/.test((await acceptedLine.innerText()).trim())
  ) {
    throw new Error("Admissions executive update must lead with every accepted client moving toward admission.");
  }
  if (
    await executiveUpdate.locator('[data-admissions-executive-line]').count() !== 3 ||
    await executiveUpdate.locator('[data-admissions-executive-line="workload"]').count() !== 1 ||
    await executiveUpdate.locator('[data-admissions-executive-line="locations"]').count() !== 1
  ) {
    throw new Error("Admissions executive update must keep accepted clients, workload, and locations distinct.");
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
  if (
    await executiveUpdate.getAttribute("data-admissions-chat-typing") !== "false" ||
    await executiveUpdate.locator('[data-admissions-typing-caret="true"]').count()
  ) {
    throw new Error("Admissions analyst response must finish its stream and remove the typing caret.");
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
  const firstBoardCard = page.locator('[data-admissions-board-card]').first();
  const firstClientName = (await firstBoardCard.locator('[data-admissions-client-name="true"]').innerText()).trim();
  if (
    await firstBoardCard.locator('[data-admissions-card-fact]').count() !== 4 ||
    await firstBoardCard.locator('[data-admissions-card-decision]').count() !== 1 ||
    await firstBoardCard.locator('[data-admissions-card-readiness]').count() !== 1 ||
    !/Briefing/.test(await firstBoardCard.innerText()) ||
    /Continue|Complete the assessment|Preparation/.test(await firstBoardCard.innerText())
  ) {
    throw new Error("Admissions cards must read as CEO briefings, not workflow task controls.");
  }
  const acceptDecision = page.locator('[data-admissions-card-decision="accept"]').first();
  if (await acceptDecision.count()) {
    const acceptTreatment = await acceptDecision.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    if (
      acceptTreatment.background !== "rgb(25, 116, 83)" ||
      acceptTreatment.color !== "rgb(255, 255, 255)"
    ) {
      throw new Error(`Accept decisions must use the strong green treatment with white text: ${JSON.stringify(acceptTreatment)}`);
    }
  }
  const explicitReviewCard = page.locator('[data-admissions-board-card][aria-label*="Under Review"]');
  if (
    await explicitReviewCard.count() !== 1 ||
    await explicitReviewCard.locator('[data-admissions-card-decision="under-review"]').count() !== 1
  ) {
    throw new Error("Only an explicit Pipeline Under Review status may use the Under review category.");
  }
  await firstBoardCard.click();
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
    await progressModal.locator('[data-admissions-chart-section]').count() !== 4 ||
    await progressModal.locator('[data-admissions-chart-stream="true"]').count() !== 1 ||
    await progressModal.getByRole("heading", { name: "Admission brief" }).count() !== 1 ||
    await progressModal.getByRole("heading", { name: "Workflow and readiness" }).count() !== 1 ||
    await progressModal.getByRole("heading", { name: "Client context" }).count() !== 1 ||
    await progressModal.getByRole("heading", { name: "Review focus" }).count() !== 0
  ) {
    throw new Error("Client review must use one streamlined management-chart reading path.");
  }
  const folderTabTreatment = await chartNameLabel.evaluate((element) => ({
    background: window.getComputedStyle(element).backgroundColor,
    labelHeight: element.getBoundingClientRect().height
  }));
  folderTabTreatment.tabHeight = await chartNameTab.evaluate((element) => element.getBoundingClientRect().height);
  const progressTreatment = await decisionTab.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  if (
    folderTabTreatment.background !== "rgb(255, 253, 250)" ||
    folderTabTreatment.tabHeight < 64 ||
    (await decisionTab.textContent())?.trim() !== "In progress" ||
    (await decisionTab.getAttribute("data-admissions-decision-tab")) !== "in-progress" ||
    progressTreatment.background !== "rgb(54, 95, 199)" ||
    progressTreatment.color !== "rgb(255, 255, 255)"
  ) {
    throw new Error(`Admissions chart must pair a large white client label with its explicit Pipeline status category: ${JSON.stringify({ folderTabTreatment, progressTreatment })}`);
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
  const dataPointTriggers = progressModal.locator('[data-admissions-data-trigger]');
  if (
    await dataPointTriggers.count() !== 9 ||
    await progressModal.locator('[data-admissions-drilldown], [data-admissions-drilldown-trigger]').count()
  ) {
    throw new Error("The management chart must drill through its nine existing data rows without a second overlay.");
  }
  const statusTrigger = progressModal.locator('[data-admissions-data-trigger="status"]');
  await statusTrigger.click();
  const statusDetail = progressModal.locator('[data-admissions-data-detail="status"]');
  await statusDetail.waitFor({ state: "visible" });
  if (
    await statusTrigger.getAttribute("aria-expanded") !== "true" ||
    await statusDetail.getByText("Admissions category", { exact: true }).count() !== 1 ||
    await statusDetail.getByText("Board stage", { exact: true }).count() !== 1 ||
    !/remains In progress/.test(await statusDetail.innerText())
  ) {
    throw new Error("Pipeline status must expand in place to its category, board stage, and source-status explanation.");
  }
  const placementTrigger = progressModal.locator('[data-admissions-data-trigger="placement"]');
  await placementTrigger.click();
  const placementDetail = progressModal.locator('[data-admissions-data-detail="placement"]');
  await placementDetail.waitFor({ state: "visible" });
  if (
    await statusDetail.count() ||
    await placementDetail.getByText("Destination community", { exact: true }).count() !== 1 ||
    await placementDetail.getByText("Planned admission", { exact: true }).count() !== 1
  ) {
    throw new Error("Placement must drill directly into its destination and planned-admission fields.");
  }
  await progressModal.locator('[data-admissions-data-trigger="owner-timing"]').click();
  const timingDetail = progressModal.locator('[data-admissions-data-detail="owner-timing"]');
  await timingDetail.waitFor({ state: "visible" });
  if (
    await placementDetail.count() ||
    await timingDetail.getByText("Owner", { exact: true }).count() !== 1 ||
    await timingDetail.getByText("Priority", { exact: true }).count() !== 1 ||
    await timingDetail.getByText("Last Pipeline update", { exact: true }).count() !== 1
  ) {
    throw new Error("Owner and timing must expand through the existing row into its underlying workflow fields.");
  }
  await progressModal.locator('[data-admissions-data-trigger="assessment"]').click();
  const assessmentDetail = progressModal.locator('[data-admissions-data-detail="assessment"]');
  await assessmentDetail.waitFor({ state: "visible" });
  if (
    await assessmentDetail.getByText("Assessment status", { exact: true }).count() !== 1 ||
    await assessmentDetail.getByText("Context source", { exact: true }).count() !== 1 ||
    await progressModal.locator('[data-admissions-management-overview="true"]').count() !== 1 ||
    await progressModal.locator('[data-admissions-management-medications="true"]').count() !== 1
  ) {
    throw new Error("Assessment detail and the bounded client-context data must remain visible in one readable chart.");
  }
  await page.screenshot({
    path: `${screenshotDir}/desktop-admissions-inline-drilldown.png`,
    fullPage: false
  });
  await page.keyboard.press("Escape");
  await assessmentDetail.waitFor({ state: "hidden" });
  if (!await progressModal.isVisible()) {
    throw new Error("Escape must collapse an open data point before it closes the management chart.");
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
  const mobileSurfaceTabs = mobilePage.locator('[data-admissions-surface-tabs="true"]');
  const mobileTabs = mobileSurfaceTabs.getByRole("tab");
  const [mobileFirstTabBox, mobileLastTabBox] = await Promise.all([
    mobileTabs.first().boundingBox(),
    mobileTabs.last().boundingBox()
  ]);
  const mobileViewport = mobilePage.viewportSize();
  if (
    !mobileFirstTabBox ||
    !mobileLastTabBox ||
    !mobileViewport ||
    Math.abs(
      (mobileFirstTabBox.x + mobileLastTabBox.x + mobileLastTabBox.width) / 2 -
      (mobileViewport.width / 2)
    ) > 2
  ) {
    throw new Error(`Mobile Admissions surface navigation must stay centered at the top of the page: ${JSON.stringify({ mobileFirstTabBox, mobileLastTabBox, mobileViewport })}`);
  }
  if (
    await mobilePage.locator('[data-platform-page-target="analytics"]').getAttribute("data-platform-page-side") !== "right"
  ) {
    throw new Error("Mobile Admissions must keep Analytics navigation on the right.");
  }
  const mobileExecutiveUpdate = mobilePage.locator('[data-admissions-executive-update="true"]');
  await mobileExecutiveUpdate.waitFor({ state: "visible", timeout: 60_000 });
  await mobilePage.waitForFunction(
    () => document.querySelector('[data-admissions-executive-update="true"]')?.getAttribute("data-admissions-chat-typing") === "false",
    undefined,
    { timeout: 20_000 }
  );
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
    await mobileProgress.locator('[data-admissions-decision-tab="in-progress"]').count() !== 1
  ) {
    throw new Error("Mobile management chart must retain the separate client and Pipeline status tabs.");
  }
  await mobileProgress.locator('[data-admissions-data-trigger="placement"]').click();
  const mobileDrilldown = mobileProgress.locator('[data-admissions-data-detail="placement"]');
  await mobileDrilldown.waitFor({ state: "visible" });
  const mobileDrilldownOverflow = await mobileProgress.evaluate(
    (element) => element.scrollWidth - element.clientWidth
  );
  if (
    await mobileDrilldown.getByText("Destination community", { exact: true }).count() !== 1 ||
    await mobileDrilldown.getByText("Planned admission", { exact: true }).count() !== 1 ||
    mobileDrilldownOverflow > 2
  ) {
    throw new Error(`Mobile placement drill-down is incomplete or has ${mobileDrilldownOverflow}px of horizontal overflow.`);
  }
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-inline-drilldown.png`,
    fullPage: false
  });
  await mobilePage.keyboard.press("Escape");
  await mobileDrilldown.waitFor({ state: "hidden" });
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
  if (await mobileProgress.getByRole("button", { name: "Done" }).count()) {
    throw new Error("Admissions progress modal must rely on the corner close control and backdrop, not a redundant Done action.");
  }
  await mobilePage.screenshot({
    path: `${screenshotDir}/mobile-admissions-progress.png`,
    fullPage: false
  });
  await mobileProgress.getByRole("button", { name: "Close management chart" }).click();
  await mobileProgress.waitFor({ state: "hidden" });
  await mobilePage.locator('[data-admissions-board-card]').first().click();
  await mobileProgress.waitFor({ state: "visible" });
  await mobileProgress.click({ position: { x: 1, y: 1 } });
  await mobileProgress.waitFor({ state: "hidden" });
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
