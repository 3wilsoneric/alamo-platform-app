/* Mobile controls for the existing Azure app. No API, auth, or app data changes. */
(() => {
  const mobile = window.matchMedia("(max-width: 639px)");
  const trayId = "alamo-mobile-community-tray";
  const reportPickerId = "alamo-mobile-report-picker";
  const categoryPickerId = "alamo-mobile-category-picker";
  const modalControlsId = "alamo-mobile-modal-controls";
  const brandLogoPath = "/brand/alamo-health-management-logo.png";
  const mondayId = "monday-census-briefing";
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
    return [...library.querySelectorAll("button[data-monday-census-briefing-option], button[data-analytics-report-option]")];
  }

  function reportValue(button) {
    return button.hasAttribute("data-monday-census-briefing-option")
      ? mondayId
      : button.getAttribute("data-analytics-report-option") ?? "";
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

  function enhanceQuestions() {
    const guide = document.querySelector("[data-certified-question-guide]");
    const categories = guide?.querySelector('[aria-label="Question categories"]');
    if (!guide || !categories) return;
    const buttons = categoryButtons(categories);
    if (!buttons.length) return;

    let picker = guide.querySelector(`#${categoryPickerId}`);
    if (!picker) {
      picker = makePicker(categoryPickerId, "Category");
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
