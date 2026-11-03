// The authenticated Platform bundle publishes only validated licensing update
// identifiers. This view state is kept per Entra account in this browser.
(() => {
  const eventName = "alamo:licensing-feed";
  const keyPrefix = "alamo-platform:licensing-seen:v1:";
  const style = document.createElement("style");
  style.textContent = `
    .licensing-nav-alert--unread{color:#ae2932!important;background:#fff4f3!important}
    .licensing-nav-alert--unread[aria-current="page"]{border-bottom-color:#ae2932!important}
    .licensing-nav-alert__indicator{display:inline-flex;align-items:center;gap:3px;margin-left:7px;color:#ae2932;white-space:nowrap}
    .licensing-nav-alert__indicator svg{width:17px;height:17px;fill:#ae29321c;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .licensing-nav-alert__indicator b{display:grid;place-items:center;min-width:17px;height:17px;padding:0 3px;border-radius:9px;background:#ae2932;color:white;font:700 10px/1 Arial,sans-serif}
    [data-platform-mobile-menu] .licensing-nav-alert__indicator{margin-left:auto}
  `;
  document.head.append(style);

  let current = null;
  let unread = 0;
  let scheduled = false;
  const memory = new Map();

  function readSeen(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "null");
      return value?.v === 1 && Array.isArray(value.ids) ? value.ids.filter(id => typeof id === "string") : null;
    } catch { return memory.get(key) ?? null; }
  }
  function saveSeen(key, ids) {
    const bounded = [...new Set(ids)].slice(-500);
    memory.set(key, bounded);
    try { localStorage.setItem(key, JSON.stringify({ v: 1, ids: bounded })); } catch { /* private browsing */ }
    return bounded;
  }
  function render() {
    for (const nav of document.querySelectorAll('[data-platform-page-navigation], [data-platform-mobile-menu]')) {
      for (const link of nav.querySelectorAll('a[href*="/analytics/licensing"]')) {
        const visible = Boolean(current && unread);
        link.classList.toggle("licensing-nav-alert--unread", visible);
        if (visible) {
          link.setAttribute("aria-label", `Licensing, ${unread} new ${unread === 1 ? "update" : "updates"}`);
          let indicator = link.querySelector(".licensing-nav-alert__indicator");
          if (!indicator) {
            indicator = document.createElement("span");
            indicator.className = "licensing-nav-alert__indicator";
            indicator.setAttribute("aria-hidden", "true");
            indicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><b></b>';
            link.append(indicator);
          }
          const count = indicator.querySelector("b");
          if (count) count.textContent = unread > 99 ? "99+" : String(unread);
        } else {
          link.removeAttribute("aria-label");
          link.querySelector(".licensing-nav-alert__indicator")?.remove();
        }
      }
    }
  }
  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  }
  function updateCount() {
    if (!current) return;
    const seen = new Set(readSeen(current.key) ?? []);
    unread = current.alerts.filter(alert => !seen.has(alert.id)).length;
    scheduleRender();
  }
  function acknowledge() {
    if (!current) return;
    saveSeen(current.key, [...(readSeen(current.key) ?? []), ...current.alerts.map(alert => alert.id)]);
    updateCount();
  }
  window.addEventListener(eventName, event => {
    const detail = event.detail;
    if (!detail || !/^[a-f0-9-]{36}$/i.test(detail.accountId ?? "") || !Array.isArray(detail.alerts)) return;
    const alerts = detail.alerts.filter(alert => typeof alert?.id === "string" && alert.id.length <= 200 && Number.isFinite(Date.parse(alert.at)));
    const key = keyPrefix + detail.accountId.toLowerCase();
    current = { key, alerts };
    if (readSeen(key) === null) {
      const completedAt = Date.parse(detail.lastSuccessful ?? "");
      const earlier = alerts.filter(alert => !Number.isFinite(completedAt) || Math.abs(Date.parse(alert.at) - completedAt) > 60 * 60 * 1000);
      saveSeen(key, earlier.map(alert => alert.id));
    }
    if (document.querySelector("[data-licensing-updates-panel]")) acknowledge();
    else updateCount();
  });
  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("[data-licensing-page] button[aria-expanded]") : null;
    if (button?.textContent?.trim().startsWith("Updates")) acknowledge();
  }, true);
  window.addEventListener("storage", event => { if (current && event.key === current.key) updateCount(); });
  new MutationObserver(scheduleRender).observe(document.documentElement, { childList: true, subtree: true });
  scheduleRender();
})();
