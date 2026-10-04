# Desktop Distribution

- purpose: document the installable Alamo Health desktop application, its security boundary, installation, verification, and rollback
- status: authoritative current-state reference
- owners: engineering, operations
- updated: 2026-09-03
- tags: desktop, pwa, azure, entra, installability, operations
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/public/manifest.json](/Users/eric/CareEngineMain/alamo-platform-app/public/manifest.json)
  - [alamo-platform-app/public/sw.js](/Users/eric/CareEngineMain/alamo-platform-app/public/sw.js)
  - [alamo-platform-app/src/shared/desktop/DesktopRuntime.tsx](/Users/eric/CareEngineMain/alamo-platform-app/src/shared/desktop/DesktopRuntime.tsx)
  - [alamo-platform-app/scripts/check-desktop-readiness.mjs](/Users/eric/CareEngineMain/alamo-platform-app/scripts/check-desktop-readiness.mjs)

## Runtime Model

Alamo Health is an installable Progressive Web App using the same packaging
model as Pipeline. It runs in its own desktop window without browser chrome but
continues to use `https://www.alamoplatform.com`, the Azure Container Apps
runtime, and the existing Microsoft Entra sign-in. There is no second desktop
backend, desktop secret, or separate Entra application.

The installed app opens at `/home`. Browser history, deep links, authorization,
and API behavior remain the same as the web application.

The browser runtime compares its loaded content-hashed JavaScript entry point
with the current production entry document when it starts, regains focus,
becomes visible, reconnects, and once per minute while visible. A mismatch
means a newer frontend release is available, so the runtime reloads the current
URL once. This applies to ordinary browser tabs and the installed PWA and keeps
long-lived sessions from remaining on an older UI indefinitely.

## Data Boundary

The service worker caches only the generic offline page, the AH brand assets,
and content-hashed Vite JavaScript and CSS. Navigations are network-only and all
API requests remain network-only. The desktop layer does not persist snapshots,
resident information, analytics responses, access tokens, or other protected
platform data.

If the device is offline, Alamo shows a static connection-required page. A
connection and successful Entra session are required before platform content is
available.

## Install

In Microsoft Edge or Google Chrome, open `https://www.alamoplatform.com/home`,
sign in, and choose the browser's **Install Alamo Health** action. The installed
application uses the green-and-gray AH icon in the desktop launcher, taskbar,
and application switcher.

For managed Windows distribution, an administrator may package the same live
URL with PWABuilder and distribute the resulting MSIX through Intune. That
package remains a launcher for the same Azure-hosted application and does not
change the authentication or data boundary.

## Verification

Run:

```bash
npm run check:desktop
```

Production verification should confirm that `/manifest.json` and `/sw.js`
return `no-cache, no-store, must-revalidate`, the manifest exposes 192, 512, and
1024 pixel icons, and the browser reports an active service worker for `/`.
It should also simulate a different published entry bundle and confirm that a
visible client reloads without requiring a manual refresh.

## Rollback

Application releases remain ordinary Azure Container Apps revisions, so the
first rollback is traffic restoration to the previous healthy revision. If the
desktop runtime itself must be retired, deploy a worker that removes only
`alamo-static-*` caches and unregisters `/sw.js`; never clear unrelated browser
storage or application data.
