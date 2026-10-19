/* Mobile controls for the existing Azure app. No API, auth, or app data changes. */
(() => {
  const mobile = window.matchMedia("(max-width: 639px)");
  const trayId = "alamo-mobile-community-tray";
  const reportPickerId = "alamo-mobile-report-picker";
  const categoryPickerId = "alamo-mobile-category-picker";
  const modalControlsId = "alamo-mobile-modal-controls";
  const explorerFilterToggleId = "alamo-mobile-explorer-filters";
  const brandLogoPath = "/brand/alamo-health-management-logo.png";
  let scheduled = false;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      enhance();
    });
  }

  function optionList(select, choices) {
    const signature = choices.map(({ value, label }) => `${value}:${label}`).join("|");
    if (select.dataset.alamoOptions !== signature) {
      select.replaceChildren(...choices.map(({ value, label }) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        return option;
      }));
      select.dataset.alamoOptions = signature;
    }
  }

  function makePicker(id, labelText) {
    const wrapper = document.createElement("div");
    wrapper.id = id;
    wrapper.className = "alamo-mobile-picker";
    const label = document.createElement("label");
    label.htmlFor = `${id}-choice`;
    label.textContent = labelText;
    const select = document.createElement("select");
    select.id = `${id}-choice`;
    wrapper.append(label, select);
    return wrapper;
  }

  function reportButtons(library) {
    return [...library.querySelectorAll("button[data-analytics-report-option]")];
  }

  function reportValue(button) {
    return button.getAttribute("data-analytics-report-option") ?? "";
  }

  function reportTitle(button) {
    return button.children[1]?.children[0]?.textContent?.trim()
      || button.textContent?.trim()
      || "Analysis";
  }

  function enhanceReports() {
    const library = document.querySelector("[data-analytics-report-library]");
    const aside = library?.closest('aside[aria-label="Analytics"]');
    if (!library || !aside) return;
    const buttons = reportButtons(library);
    if (!buttons.length) return;

    let picker = aside.querySelector(`#${reportPickerId}`);
    if (!picker) {
      picker = makePicker(reportPickerId, "Choose analysis");
      aside.insertBefore(picker, library);
      picker.querySelector("select").addEventListener("change", (event) => {
        const choice = event.currentTarget.value;
        const currentLibrary = picker.closest("aside")?.querySelector("[data-analytics-report-library]");
        const target = currentLibrary && reportButtons(currentLibrary).find((button) => reportValue(button) === choice);
        target?.click();
      });
    }

    const select = picker.querySelector("select");
    optionList(select, buttons.map((button) => ({ value: reportValue(button), label: reportTitle(button) })));
    select.value = reportValue(buttons.find((button) => button.getAttribute("aria-pressed") === "true") ?? buttons[0]);
    aside.setAttribute("data-alamo-report-picker-ready", "true");
  }

  function categoryButtons(categories) {
    return [...categories.querySelectorAll("button")];
  }

  function categoryName(button) {
    return button.querySelector("span")?.textContent?.trim() || button.textContent?.trim() || "All";
  }

  function tagQuestionStructure(guide) {
    const directChildren = [...guide.children];
    const search = guide.querySelector('[data-certified-question-search="true"]');
    const toolbar = search?.closest("div.space-y-2, div.space-y-3") || directChildren[1];
    const firstRow = guide.querySelector('[data-certified-question-button="true"]');
    const results = firstRow?.parentElement;

    directChildren[0]?.setAttribute("data-certified-question-header", "true");
    toolbar?.setAttribute("data-certified-question-toolbar", "true");
    search?.parentElement?.setAttribute("data-certified-question-search-field", "true");
    toolbar?.nextElementSibling?.setAttribute("data-certified-question-summary", "true");
    results?.setAttribute("data-certified-question-results", "true");
    results?.nextElementSibling?.setAttribute("data-certified-question-pagination", "true");

    for (const row of guide.querySelectorAll('[data-certified-question-button="true"]')) {
      if (row.dataset.alamoMobileTapGuard === "true") continue;
      row.dataset.alamoMobileTapGuard = "true";
      row.addEventListener("click", (event) => {
        if (!mobile.matches || event.target.closest("select, button, a, input")) return;
        event.stopPropagation();
      }, true);
    }
  }

  function enhanceQuestions() {
    const guide = document.querySelector("[data-certified-question-guide]");
    if (!guide) return;
    tagQuestionStructure(guide);
    const categories = guide?.querySelector('[aria-label="Question categories"]');
    if (!categories) return;
    const buttons = categoryButtons(categories);
    if (!buttons.length) return;

    const nativePicker = guide.querySelector('[data-mobile-question-category="true"]');
    if (nativePicker) {
      guide.querySelector(`#${categoryPickerId}`)?.remove();
      nativePicker.closest("label")?.setAttribute("data-certified-question-category-field", "true");
      guide.setAttribute("data-alamo-category-picker-ready", "true");
      return;
    }

    let picker = guide.querySelector(`#${categoryPickerId}`);
    if (!picker) {
      picker = makePicker(categoryPickerId, "Category");
      picker.setAttribute("data-certified-question-category-field", "true");
      categories.parentElement?.insertBefore(picker, categories);
      picker.querySelector("select").addEventListener("change", (event) => {
        const choice = event.currentTarget.value;
        const currentCategories = picker.closest("[data-certified-question-guide]")?.querySelector('[aria-label="Question categories"]');
        const target = currentCategories && categoryButtons(currentCategories).find((button) => categoryName(button) === choice);
        target?.click();
      });
    }

    const select = picker.querySelector("select");
    optionList(select, buttons.map((button) => ({
      value: categoryName(button),
      label: `${categoryName(button)} · ${button.querySelectorAll("span")[1]?.textContent?.trim() ?? ""}`.trim()
    })));
    select.value = categoryName(buttons.find((button) => button.getAttribute("aria-pressed") === "true") ?? buttons[0]);
    guide.setAttribute("data-alamo-category-picker-ready", "true");
  }

  function directChildOf(section, node) {
    let current = node;
    while (current?.parentElement && current.parentElement !== section) current = current.parentElement;
    return current?.parentElement === section ? current : null;
  }

  function focusExplorerRecord(row) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!row.nextElementSibling?.matches('[data-explorer-row="detail"]')) return;
        const scroller = row.closest('[data-explorer-table-scroll="true"]');
        if (!(scroller instanceof HTMLElement)) return;
        const rowBox = row.getBoundingClientRect();
        const scrollerBox = scroller.getBoundingClientRect();
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + rowBox.top - scrollerBox.top),
          behavior: "auto"
        });
      });
    });
  }

  function enhanceExplorerSection(section) {
    const isResident = section.getAttribute("data-explorer-kind") === "residents";
    const toolbar = section.querySelector(':scope > div:first-child');
    const search = section.querySelector('input[aria-label="Search records"]');
    const table = section.querySelector("table");
    if (!toolbar || !search) return;

    toolbar.setAttribute("data-explorer-toolbar", "true");
    if (isResident) search.placeholder = "Search clients";
    search.closest("label")?.setAttribute("data-explorer-filter", "search");

    const filterGrid = search.closest("div.grid");
    filterGrid?.setAttribute("data-explorer-filter-grid", "true");
    const filters = [
      ["community", 'select[aria-label="Filter by community"]'],
      ["month", 'select[aria-label="Filter by month"]'],
      ["diagnosis", 'select[aria-label="Filter by diagnosis"]']
    ];
    for (const [name, selector] of filters) {
      const control = section.querySelector(selector);
      if (control) control.setAttribute("data-explorer-filter", name);
    }

    const unit = section.querySelector('select[aria-label="Filter by unit"]');
    const unitWrapper = unit?.parentElement;
    unitWrapper?.setAttribute("data-explorer-unit-filter", "true");

    const directToolbarChildren = [...toolbar.children];
    const summaryGrid = directToolbarChildren.find((child) => (
      child !== filterGrid && child.children.length === 4
    ));
    summaryGrid?.setAttribute("data-explorer-summary-grid", "true");

    const exportButton = [...toolbar.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "CSV");
    exportButton?.parentElement?.setAttribute("data-explorer-export-actions", "true");

    const title = toolbar.querySelector("h1");
    if (isResident && title && title.textContent?.trim() === "Data Explorer") title.textContent = "Client Search";

    let toggle = isResident ? toolbar.querySelector('[data-explorer-mobile-filter-toggle="true"]') : null;
    if (isResident && !toggle && filterGrid) {
      toggle = document.createElement("button");
      toggle.id = explorerFilterToggleId;
      toggle.type = "button";
      toggle.setAttribute("data-explorer-mobile-filter-toggle", "true");
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = '<span>More filters</span><span aria-hidden="true">⌄</span>';
      toggle.addEventListener("click", () => {
        const open = section.getAttribute("data-alamo-mobile-filters-open") !== "true";
        section.setAttribute("data-alamo-mobile-filters-open", String(open));
        toggle.setAttribute("aria-expanded", String(open));
      });
      filterGrid.insertAdjacentElement("afterend", toggle);
    }
    if (isResident && toggle) {
      section.setAttribute(
        "data-alamo-mobile-filters-open",
        String(toggle.getAttribute("aria-expanded") === "true")
      );
    }

    if (isResident) {
      const preview = [...section.children].find((child) => (
        child !== toolbar && /Resident preview|Select a resident to preview/i.test(child.textContent ?? "")
      ));
      preview?.setAttribute("data-explorer-preview", "true");
    }

    if (!table) return;
    const results = directChildOf(section, table);
    results?.setAttribute("data-explorer-results", "true");
    results?.firstElementChild?.setAttribute("data-explorer-results-header", "true");
    table.parentElement?.setAttribute("data-explorer-table-scroll", "true");

    const labels = [...table.querySelectorAll("thead th")].slice(1).map((header) => header.textContent?.trim() || "Field");
    for (const row of table.querySelectorAll("tbody tr")) {
      const detailCell = row.querySelector("td[colspan]");
      if (detailCell) {
        row.setAttribute("data-explorer-row", "detail");
        continue;
      }
      const cells = [...row.querySelectorAll(":scope > td")].slice(1);
      if (!cells.length) continue;
      row.setAttribute("data-explorer-row", "record");
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Open ${cells[0]?.textContent?.trim() || "record"} details`);
      if (row.getAttribute("data-alamo-keyboard-ready") !== "true") {
        row.setAttribute("data-alamo-keyboard-ready", "true");
        row.addEventListener("keydown", (event) => {
          if (event.target !== row || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          row.click();
        });
      }
      if (row.getAttribute("data-alamo-mobile-focus-ready") !== "true") {
        row.setAttribute("data-alamo-mobile-focus-ready", "true");
        row.addEventListener("click", (event) => {
          if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) return;
          focusExplorerRecord(row);
        });
      }
      cells.forEach((cell, index) => {
        cell.setAttribute("data-explorer-column-index", String(index));
        cell.setAttribute("data-explorer-column-label", labels[index] || `Field ${index + 1}`);
      });
    }
  }

  function enhanceExplorer() {
    for (const section of document.querySelectorAll("[data-explorer-kind]")) {
      enhanceExplorerSection(section);
    }
  }

  function tagIncidentCard(card) {
    card.setAttribute("data-incident-card", "true");
    const residentLink = card.querySelector(":scope > div:first-child button");
    residentLink?.setAttribute("data-incident-resident-link", "true");
    const details = [...card.querySelectorAll("button")]
      .find((button) => /^(Details|Less)$/i.test(button.textContent?.trim() ?? ""));
    details?.setAttribute("data-incident-details-toggle", "true");
  }

  function updateIncidentSection(section) {
    const list = section.querySelector('[data-alamo-incident-list="true"]');
    if (!list) return;
    const cards = [...list.children];
    const expanded = section.getAttribute("data-alamo-incidents-expanded") === "true";
    cards.forEach((card, index) => {
      tagIncidentCard(card);
      card.hidden = !expanded && index >= 4;
    });
    const toggle = section.querySelector('[data-incident-priority-toggle="true"]');
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", String(expanded));
    const label = expanded ? "Show fewer" : `Show all ${cards.length}`;
    if (toggle.textContent !== label) toggle.textContent = label;
  }

  function enhanceIncidents() {
    for (const header of document.querySelectorAll("[data-incident-priority]")) {
      const section = header.closest("section");
      if (!section) continue;

      if (section.hasAttribute("data-incident-priority-section")) {
        for (const card of section.querySelectorAll('[data-incident-card="true"]')) tagIncidentCard(card);
        continue;
      }

      const list = header.nextElementSibling;
      if (!(list instanceof HTMLElement)) continue;
      list.setAttribute("data-alamo-incident-list", "true");
      section.setAttribute("data-alamo-incident-section", header.getAttribute("data-incident-priority") ?? "true");
      const cards = [...list.children];
      if (cards.length <= 4) {
        cards.forEach((card) => {
          tagIncidentCard(card);
          card.hidden = false;
        });
        section.querySelector('[data-incident-priority-toggle="true"]')?.remove();
        continue;
      }

      let toggle = section.querySelector('[data-incident-priority-toggle="true"]');
      if (!toggle) {
        toggle = document.createElement("button");
        toggle.type = "button";
        toggle.setAttribute("data-incident-priority-toggle", "true");
        toggle.addEventListener("click", () => {
          const expanded = section.getAttribute("data-alamo-incidents-expanded") === "true";
          section.setAttribute("data-alamo-incidents-expanded", String(!expanded));
          updateIncidentSection(section);
        });
        section.append(toggle);
      }
      updateIncidentSection(section);
    }
  }

  function enhanceStateNavigation() {
    const dialog = document.querySelector('[role="dialog"][data-state-research-coverage]');
    const buttons = dialog ? [...dialog.querySelectorAll("footer button")] : [];
    buttons[0]?.setAttribute("data-state-navigation", "previous");
    buttons[1]?.setAttribute("data-state-navigation", "next");
  }

  function enhanceCommandCenter() {
    const prompt = document.querySelector('[data-command-center="true"] input[placeholder*="platform question"]');
    if (prompt && prompt.getAttribute("placeholder") !== "Ask a question") {
      prompt.setAttribute("placeholder", "Ask a question");
    }
  }

  function enhanceCommunities() {
    const markers = [...document.querySelectorAll("[data-california-community-marker]")];
    if (markers.length !== 5) {
      const existingTray = document.getElementById(trayId);
      if (existingTray) existingTray.hidden = true;
      return;
    }
    let tray = document.getElementById(trayId);
    if (tray && tray.getAttribute("data-alamo-community-selector") !== "rows-only") {
      tray.remove();
      tray = null;
    }
    if (!tray) {
      tray = document.createElement("nav");
      tray.id = trayId;
      tray.setAttribute("aria-label", "California communities");
      tray.setAttribute("data-alamo-community-selector", "rows-only");
      const grid = document.createElement("div");
      grid.className = "alamo-tray-grid";
      for (const marker of markers) {
        const id = marker.getAttribute("data-california-community-marker");
        const name = marker.querySelector("[data-california-community-tooltip]")?.textContent?.trim();
        if (!id || !name) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("data-alamo-tray-community", id);
        button.setAttribute("aria-label", `Open ${name} profile`);
        const dot = document.createElement("span");
        dot.className = "alamo-community-dot";
        dot.setAttribute("aria-hidden", "true");
        const communityName = document.createElement("span");
        communityName.className = "alamo-community-name";
        communityName.textContent = name;
        const census = document.createElement("span");
        census.className = "alamo-community-census";
        const censusValue = marker.getAttribute("data-california-node-census");
        census.textContent = censusValue ? `${Number(censusValue).toLocaleString()} residents` : "Open";
        const arrow = document.createElement("span");
        arrow.className = "alamo-community-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "›";
        button.append(dot, communityName, census, arrow);
        button.addEventListener("click", () => {
          const current = [...document.querySelectorAll("[data-california-community-marker]")]
            .find((item) => item.getAttribute("data-california-community-marker") === id);
          current?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        });
        grid.append(button);
      }
      tray.append(grid);
      document.querySelector('[data-california-carousel-panel="map"]')?.append(tray);
    }

    for (const marker of markers) {
      const id = marker.getAttribute("data-california-community-marker");
      const census = id && tray.querySelector(`[data-alamo-tray-community="${id}"] .alamo-community-census`);
      if (!census) continue;
      const censusValue = marker.getAttribute("data-california-node-census");
      census.textContent = censusValue ? `${Number(censusValue).toLocaleString()} residents` : "Open";
    }

    const workspace = document.querySelector("[data-california-workspace-carousel]");
    const modalOpen = Boolean(document.querySelector('[role="dialog"][data-california-community-profile]'));
    tray.hidden = !mobile.matches || workspace?.getAttribute("data-california-active-panel") !== "map" || modalOpen;
  }

  function enhanceBranding() {
    for (const wordmark of document.querySelectorAll('[data-platform-wordmark="true"]')) {
      wordmark.setAttribute("aria-label", "Alamo Health Management");
      if (wordmark.closest('[data-platform-page-target="home"]')) {
        wordmark.setAttribute("data-platform-wordmark-variant", "compact");
      } else if (!wordmark.hasAttribute("data-platform-wordmark-variant")) {
        const display = wordmark.getBoundingClientRect().width >= 260 || wordmark.className.includes("w-[286px]");
        wordmark.setAttribute("data-platform-wordmark-variant", display ? "display" : "standard");
      }
      const existing = wordmark.querySelector('img[data-platform-brand-logo="true"]');
      if (existing) continue;
      const image = document.createElement("img");
      image.src = brandLogoPath;
      image.alt = "";
      image.draggable = false;
      image.setAttribute("aria-hidden", "true");
      image.setAttribute("data-platform-brand-logo", "true");
      wordmark.replaceChildren(image);
    }
  }

  function enhanceCommunityModal() {
    const profile = document.querySelector("[data-california-community-profile]");
    const header = profile?.querySelector(":scope > header");
    const navigation = header?.querySelector('[data-community-modal-navigation="true"]');
    if (!profile || !header) return;
    if (!navigation) {
      header.querySelector(`#${modalControlsId}`)?.remove();
      header.removeAttribute("data-alamo-modal-picker-ready");
      return;
    }
    const tabs = [...navigation.querySelectorAll("button[data-community-modal-tab]")];
    if (!tabs.length) return;

    let controls = header.querySelector(`#${modalControlsId}`);
    if (!controls) {
      controls = document.createElement("div");
      controls.id = modalControlsId;
      controls.className = "alamo-mobile-modal-controls";
      const field = document.createElement("div");
      const label = document.createElement("label");
      label.htmlFor = `${modalControlsId}-choice`;
      label.textContent = "Community view";
      const select = document.createElement("select");
      select.id = `${modalControlsId}-choice`;
      field.append(label, select);
      controls.append(field);
      header.insertBefore(controls, navigation);
      select.addEventListener("change", (event) => {
        const target = [...header.querySelectorAll("button[data-community-modal-tab]")]
          .find((button) => button.getAttribute("data-community-modal-tab") === event.currentTarget.value);
        target?.click();
      });
    }

    const select = controls.querySelector("select");
    optionList(select, tabs.map((tab) => ({
      value: tab.getAttribute("data-community-modal-tab") ?? "detail",
      label: tab.textContent?.trim() || "Overview"
    })));
    select.value = tabs.find((tab) => tab.getAttribute("aria-current") === "page")?.getAttribute("data-community-modal-tab") ?? "detail";
    header.setAttribute("data-alamo-modal-picker-ready", "true");
  }

  function enhance() {
    enhanceBranding();
    if (mobile.matches) {
      enhanceReports();
      enhanceQuestions();
      enhanceExplorer();
      enhanceIncidents();
      enhanceStateNavigation();
      enhanceCommandCenter();
      enhanceCommunities();
      enhanceCommunityModal();
    } else {
      const tray = document.getElementById(trayId);
      if (tray) tray.hidden = true;
    }
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "aria-current",
      "aria-expanded",
      "aria-pressed",
      "data-california-active-panel",
      "data-california-modal-view",
      "data-california-node-census",
      "inert"
    ]
  });
  mobile.addEventListener("change", schedule);
  schedule();
})();
