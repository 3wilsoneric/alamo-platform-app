/* Mobile controls for the existing Azure app. No API, auth, or app data changes. */
(() => {
  const mobile = window.matchMedia("(max-width: 639px)");
  const trayId = "alamo-mobile-community-tray";
  const reportPickerId = "alamo-mobile-report-picker";
  const categoryPickerId = "alamo-mobile-category-picker";
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
    if (markers.length !== 5) return;
    let tray = document.getElementById(trayId);
    if (!tray) {
      tray = document.createElement("nav");
      tray.id = trayId;
      tray.setAttribute("aria-label", "California communities");
      const heading = document.createElement("p");
      heading.className = "alamo-tray-heading";
      heading.textContent = "Open a community";
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
        button.textContent = name;
        button.addEventListener("click", () => {
          const current = [...document.querySelectorAll("[data-california-community-marker]")]
            .find((item) => item.getAttribute("data-california-community-marker") === id);
          current?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        });
        grid.append(button);
      }
      tray.append(heading, grid);
      document.body.append(tray);
    }

    const workspace = document.querySelector("[data-california-workspace-carousel]");
    const modalOpen = Boolean(document.querySelector('[role="dialog"][data-california-community-profile]'));
    tray.hidden = !mobile.matches || workspace?.getAttribute("data-california-active-panel") !== "map" || modalOpen;
  }

  function enhance() {
    if (mobile.matches) {
      enhanceReports();
      enhanceQuestions();
      enhanceCommunities();
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
    attributeFilter: ["aria-pressed", "data-california-active-panel", "inert"]
  });
  mobile.addEventListener("change", schedule);
  schedule();
})();
