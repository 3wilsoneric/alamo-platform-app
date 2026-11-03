# Desktop Distribution

- purpose: document the installable Alamo Health desktop application, its security boundary, installation, verification, and rollback
- status: authoritative current-state reference
- owners: engineering, operations
- updated: 2026-11-02
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

For managed Windows distribution, the Platform's Windows release workflow
packages the same live URL. A signed bundle can be tested on Windows and then
published through an approved download channel or submitted to the Microsoft
Store. It uses the same Azure-hosted application and Entra sign-in.

## Windows Store Candidate

Run `npm run check:desktop` and then `npm run desktop:package:candidate` to
generate an ignored candidate archive and inspection receipt under
`generated/platform-windows-store/`. The packaging script reads only the public
production manifest and service worker, sends the public URL and publisher
details to PWABuilder, and checks the returned Windows package identity,
version, target family, and production origin. It does not access Platform
records or credentials. Python 3 and `curl` are required to run the script.

The default `AlamoHealth.Platform` identity and individual publisher are
**provisional**. Before a Store submission, replace them with the exact identity
and publisher from the reserved Partner Center product, then rebuild. The
script accepts `--package-id`, `--publisher-name`, `--publisher-cn`, and a
three-part `--version` through `npm run desktop:package:candidate -- <options>`.
The Microsoft Store account must complete identity verification before a
product name can be reserved and those final values copied from Partner Center.
The candidate is not a Store listing or an approved installer. The generated
sideload package is unsigned; do not give it to staff as a signed release.

The `Platform Windows app` GitHub workflow builds and inspects an unsigned
candidate on pull requests. A manual run on `main` with `sign=true` signs only
the verified bundle through the Platform-specific federated Azure identity and
checks its Windows trust. It then creates an `.appinstaller` update feed and
tests installation on Windows x64 and ARM64 runners. Its artifacts are staged
only; publish the immutable signed bundle before publishing the update feed.
After publishing the bundle, `signed-release.json`, and then the update feed,
run the workflow on `main` with `verify_published=true`, `sign=false`, and the
same `publish_base_url`. That check downloads the public files, verifies MIME
types, lengths, package hash, repository provenance, and installs through the
published App Installer feed on a clean Windows runner.

The signing identity requires the certificate-profile signer role at the exact
certificate profile scope. The `windows-release` GitHub environment contains
the Platform identity and profile settings. It must never use Pipeline's or
Carelog's release identity. `publish_base_url` must be the approved HTTPS
download directory for Platform.

Before staff distribution, verify installation, Entra sign-in, deep links,
updates, and rollback on a managed Windows test device. The hosted install
checks cannot test a real user session. Store submission also requires a
reserved Partner Center identity and Microsoft certification.

This route provides Windows installation and Store distribution of the existing
Platform. The broader enterprise application work still needs a shared client
identity, role-aware handoffs, common work queue, and explicit data contracts
between Platform, Pipeline, and Carelog. Carelog's native offline care engine
must remain in its own product boundary; packaging Platform does not acquire it.

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
