// Carelog enforces its own Microsoft identity and facility access. This is navigation only.
(() => {
  const viewers = new Set(["betty dominici", "andrew dominici", "eric wilson"]);
  const selector = ".platform-poc-launcher";
  const styles = `
    .platform-poc-launcher{display:none;align-items:center;justify-content:center;min-height:40px;padding:8px 16px;border:1px solid #bfd8ce;border-radius:9px;background:#f5faf7;color:#164b43;text-decoration:none;font:700 13px/1 Arial,Helvetica,sans-serif;white-space:nowrap;transition:background .16s ease,border-color .16s ease}
    .platform-poc-launcher:hover{background:#e8f4ed;border-color:#83b7a5}
    .platform-poc-launcher:focus-visible{outline:3px solid #087d64;outline-offset:3px}
    @media(min-width:1024px){.platform-poc-launcher{display:inline-flex}}
  `;
  if (!document.getElementById("platform-poc-launcher-style")) {
    const style = document.createElement("style");
    style.id = "platform-poc-launcher-style";
    style.textContent = styles;
    document.head.append(style);
  }

  function render() {
    const identity = document.querySelector("[data-platform-user-identity]");
    const name = identity?.getAttribute("aria-label")?.replace(/^signed in as\s+/i, "").trim().toLowerCase();
    const header = document.querySelector("[data-platform-page-navigation]");
    const links = header?.querySelector("[data-platform-primary-links]");
    const existing = document.querySelector(selector);
    if (!viewers.has(name) || !links) {
      existing?.remove();
      return;
    }
    if (existing?.parentElement === links) return;
    existing?.remove();
    const anchor = document.createElement("a");
    anchor.className = "platform-poc-launcher";
    anchor.href = "/carelog-demo.html";
    anchor.target = "_blank";
    // The new same-origin tab inherits Platform's MSAL session storage. Its
    // redirect page then drops the opener before loading the Surface presenter.
    anchor.rel = "opener";
    anchor.setAttribute("aria-label", "Open Carelog Demo in a new tab");
    anchor.title = "Open Carelog Demo";
    anchor.textContent = "Carelog Demo";
    links.insertBefore(anchor, identity);
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
  render();
})();

// Fleet is a navigation destination, not a grant. Carelog checks the signed-in
// operator's role and community scope independently on every fleet request.
(() => {
  const viewers = new Set(["betty dominici", "andrew dominici", "eric wilson"]);
  const communities = new Set(["337", "342", "343", "344", "345"]);
  const route = "/fleet/index.html";
  const selector = "[data-platform-fleet-link]";
  const icon = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 16h4"/></svg>';
  const style = document.createElement("style");
  style.textContent = `
    [data-platform-fleet-link]{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:44px;min-height:44px;padding:8px 12px;border-radius:8px;color:#315b54;text-decoration:none;font-family:inherit;font-weight:600;font-size:14px;line-height:1.2;white-space:nowrap;transition:background .16s ease,color .16s ease}
    [data-platform-fleet-link]:hover{background:#f5f8f6;color:#086c57}
    [data-platform-fleet-link]:focus-visible{outline:3px solid #087d64;outline-offset:2px}
    [data-platform-fleet-link="mobile"]{display:flex;justify-content:flex-start;min-height:64px;padding:16px;font-size:18px;border-radius:0;border-top:1px solid #e1e5e2}
    [data-platform-fleet-link="community"]{flex-shrink:0;margin-left:auto;font-size:13px}
    @media(prefers-reduced-motion:reduce){[data-platform-fleet-link]{transition:none}}
  `;
  document.head.append(style);

  function entry(parent, kind, community) {
    if (!parent) return;
    const href = community ? `${route}?community=${encodeURIComponent(community)}&view=tablets` : route;
    let anchor = parent.querySelector(`[data-platform-fleet-link="${kind}"]`);
    if (!anchor) {
      anchor = document.createElement("a");
      anchor.dataset.platformFleetLink = kind;
      anchor.innerHTML = icon;
      const label = document.createElement("span");
      label.textContent = community ? "Tablets" : "Fleet";
      anchor.append(label);
      const identity = kind === "desktop" ? parent.querySelector("[data-platform-user-identity]") : null;
      parent.insertBefore(anchor, identity);
    }
    if (anchor.getAttribute("href") !== href) anchor.setAttribute("href", href);
    const label = community ? "Open this community’s tablets" : "Open Fleet";
    if (anchor.getAttribute("aria-label") !== label) anchor.setAttribute("aria-label", label);
  }

  function render() {
    const identity = document.querySelector("[data-platform-user-identity]");
    const name = identity?.getAttribute("aria-label")?.replace(/^signed in as\s+/i, "").trim().toLowerCase();
    if (!viewers.has(name)) {
      document.querySelectorAll(selector).forEach(link => link.remove());
      return;
    }
    entry(document.querySelector("[data-platform-primary-links]"), "desktop");
    entry(document.querySelector("[data-platform-mobile-menu] > div"), "mobile");
    document.querySelectorAll("[data-california-community-profile]").forEach(profile => {
      const community = profile.getAttribute("data-california-community-profile");
      if (!communities.has(community)) {
        profile.querySelectorAll(selector).forEach(link => link.remove());
        return;
      }
      entry(profile.querySelector("[data-community-modal-navigation]"), "community", community);
    });
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "data-california-community-profile"] });
  render();
})();
