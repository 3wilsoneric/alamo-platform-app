// Carelog owns its own access checks. This is a Platform navigation shortcut only.
(() => {
  const viewers = new Set(["betty dominici", "andrew dominici", "eric wilson"]);
  const link = "/carelog.html";
  const selector = ".platform-poc-launcher";
  const styles = `
    .platform-poc-launcher{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:44px;min-height:44px;padding:4px 10px 4px 5px;border:1px solid #c6d8d1;border-radius:999px;background:#f5faf7;color:#164b43;text-decoration:none;font:700 13px/1 Arial,Helvetica,sans-serif;white-space:nowrap;box-shadow:0 2px 7px rgba(19,68,55,.08);transition:background .16s ease,transform .16s ease,box-shadow .16s ease}
    .platform-poc-launcher:hover{background:#e4f3ea;transform:translateY(-1px);box-shadow:0 5px 12px rgba(19,68,55,.15)}
    .platform-poc-launcher:focus-visible{outline:3px solid #087d64;outline-offset:3px}
    .platform-poc-launcher__icon{display:grid;place-items:center;flex:none;width:35px;height:35px;border-radius:50%;background:linear-gradient(145deg,#087d64 5%,#23587c 78%);color:#fff}
    .platform-poc-launcher__icon svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .platform-poc-launcher__label{padding-right:3px}
    [data-platform-primary-links]>.platform-poc-launcher{margin-left:7px}
    [data-platform-page-navigation]>.platform-poc-launcher{display:none}
    .platform-poc-turn-overlay{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;background:rgba(12,29,32,.88);color:#183448;font-family:Arial,Helvetica,sans-serif}
    .platform-poc-turn-card{width:min(100%,390px);padding:28px 26px;border-radius:22px;background:#fffdf8;text-align:center;box-shadow:0 25px 75px rgba(0,0,0,.35)}
    .platform-poc-turn-icon{display:grid;place-items:center;width:70px;height:70px;margin:0 auto 18px;border-radius:20px;background:#e2f1e8;color:#087d64;font-size:38px;line-height:1}
    .platform-poc-turn-card h2{margin:0;color:#183448;font-size:24px;line-height:1.2}
    .platform-poc-turn-card p{margin:12px 0 22px;color:#51636a;font-size:16px;line-height:1.45}
    .platform-poc-turn-card button{min-height:44px;padding:0 22px;border:1px solid #bbcbc4;border-radius:10px;background:#fff;color:#164b43;font:700 15px Arial,Helvetica,sans-serif}
    @media(max-width:1023px){[data-platform-page-navigation]>.platform-poc-launcher{display:inline-flex;margin-left:auto;margin-right:3px;padding:4px;border-radius:50%}.platform-poc-launcher__label{display:none}}
  `;
  if (!document.getElementById("platform-poc-launcher-style")) {
    const style = document.createElement("style");
    style.id = "platform-poc-launcher-style";
    style.textContent = styles;
    document.head.append(style);
  }

  function mobilePortrait() {
    return window.matchMedia("(pointer: coarse)").matches && window.innerHeight > window.innerWidth;
  }

  function openCarelog(event) {
    if (!mobilePortrait()) return;
    event.preventDefault();
    if (document.querySelector(".platform-poc-turn-overlay")) return;
    const overlay = document.createElement("div");
    overlay.className = "platform-poc-turn-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "platform-poc-turn-title");
    overlay.innerHTML = `<div class="platform-poc-turn-card"><div class="platform-poc-turn-icon" aria-hidden="true">↻</div><h2 id="platform-poc-turn-title">Turn your phone sideways</h2><p>Carelog will open when your screen is in landscape.</p><button type="button">Cancel</button></div>`;
    const cancel = overlay.querySelector("button");
    const close = () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    };
    const checkOrientation = () => {
      if (window.innerWidth > window.innerHeight) {
        close();
        window.location.assign(link);
      }
    };
    const onKeyDown = (keyEvent) => { if (keyEvent.key === "Escape") close(); };
    cancel.addEventListener("click", close);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);
    document.body.append(overlay);
    cancel.focus();
    checkOrientation();
  }

  function launcher(surface) {
    const anchor = document.createElement("a");
    anchor.className = "platform-poc-launcher";
    anchor.href = link;
    anchor.setAttribute("data-platform-poc-surface", surface);
    anchor.setAttribute("aria-label", "Open Carelog Point of Care");
    anchor.title = "Open Carelog Point of Care";
    anchor.innerHTML = `<span class="platform-poc-launcher__icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M11 5v9a5 5 0 0 0 10 0V5"/><path d="M8 5h3m10 0h3M16 19v4a5 5 0 0 0 10 0v-3"/><circle cx="26" cy="18" r="2"/></svg></span><span class="platform-poc-launcher__label">Carelog</span>`;
    anchor.addEventListener("click", openCarelog);
    return anchor;
  }

  function render() {
    const identity = document.querySelector("[data-platform-user-identity]");
    const name = identity?.getAttribute("aria-label")?.replace(/^signed in as\s+/i, "").trim().toLowerCase();
    const allowed = viewers.has(name);
    const header = document.querySelector("[data-platform-page-navigation]");
    const desktop = header?.querySelector("[data-platform-primary-links]");
    for (const existing of document.querySelectorAll(selector)) {
      const parent = existing.parentElement;
      if (!allowed || (parent !== header && parent !== desktop)) existing.remove();
    }
    if (!allowed || !header) return;
    if (desktop && !desktop.querySelector(":scope > .platform-poc-launcher")) {
      desktop.insertBefore(launcher("desktop"), desktop.lastElementChild);
    }
    if (!header.querySelector(":scope > .platform-poc-launcher")) {
      const menu = header.querySelector("[aria-controls='platform-mobile-menu']");
      header.insertBefore(launcher("mobile"), menu);
    }
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
