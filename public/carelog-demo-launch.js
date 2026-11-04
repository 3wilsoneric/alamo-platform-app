(() => {
  // Keep the cloned same-origin MSAL session, but do not retain access to
  // Platform's tab after the desktop Surface opens.
  if (window.opener) window.opener = null;
  window.location.replace("/poc?platform=1&view=surface");
})();
