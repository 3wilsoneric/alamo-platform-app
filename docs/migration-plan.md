# Alamo Platform App Migration Plan

## What This Starter App Is

`alamo-platform-app` is the new standalone Communities/Ops application.

It is intended to keep:

- the current DataHub shell
- the current header and search experience
- the current navigation feel
- the current pages for communities, reports, incident center, workforce, settings, and admin

It is intended to add:

- Microsoft authentication
- a cleaner route structure
- a clean dependency on Pipeline data instead of Pipeline UI

## Folder Layout

```text
alamo-platform-app/
  src/
    app/
      App.tsx
      auth/
      providers/
    features/
      communities/pages/
      reports/pages/
      incidents/pages/
      workforce/pages/
      settings/pages/
      admin/pages/
    shared/
      layout/
      navigation/
      ui/
      charts/
      data/
      api/
      types/
```

## How To Use The Current Files

Move these current files into the new app first:

- `src/components/DataHub/DataHub.tsx`
  - use as the reference for the app shell
- `src/components/DataHub/components/DataHubHeader.tsx`
  - move into `src/shared/navigation/PlatformHeader.tsx`
- `src/components/DataHub/pages/DataHubHome.tsx`
  - move into `src/features/communities/pages/AppHomePage.tsx`
- `src/components/DataHub/pages/Dashboard.tsx`
  - move into `src/features/communities/pages/CommunitiesPage.tsx`
- `src/components/DataHub/pages/Reports.tsx`
  - move into `src/features/reports/pages/ReportsPage.tsx`
- `src/components/DataHub/pages/IncidentCenter.tsx`
  - move into `src/features/incidents/pages/IncidentCenterPage.tsx`
- `src/components/DataHub/pages/Workforce.tsx`
  - move into `src/features/workforce/pages/WorkforcePage.tsx`
- `src/components/DataHub/components/SettingsPage.tsx`
  - move into `src/features/settings/pages/SettingsPage.tsx`
- `src/components/DataHub/pages/DataAdmin.tsx`
  - move into `src/features/admin/pages/AdminPage.tsx`
- `src/components/DataHub/components/ProfileModal.tsx`
  - move into `src/shared/navigation/`
- `src/components/DataHub/components/Chatbot.tsx`
  - keep for later if it belongs in the new app
- `src/components/DataHub/components/tutorial/*`
  - move later after the shell and pages are stable

Do not move these into `alamo-platform-app`:

- `src/components/Pipeline/*`
- `src/components/CareEngine/*`

## Move Order

### 1. Make the shell work first

- Replace the placeholder `PlatformHeader.tsx` with the current DataHub header.
- Replace the placeholder `AppHomePage.tsx` with the current DataHub home page.
- Update all route paths from `/datahub/...` to the new app routes:
  - `/home`
  - `/communities`
  - `/reports`
  - `/incidents`
  - `/workforce`
  - `/settings`
  - `/admin`

### 2. Move the main pages

- Move Dashboard into Communities.
- Move Reports.
- Move Incident Center.
- Move Workforce.
- Move Settings and Admin.

### 3. Remove old cross-links

- Remove `PipelineModal` or convert it into a simple external handoff to the separate Pipeline app.
- Remove direct references to `/pipeline`.
- Remove assumptions that the app lives under `/datahub`.

### 4. Add Microsoft authentication

- Replace `src/app/auth/LoginPage.tsx` with the real sign-in screen.
- Add MSAL setup in `src/app/providers/AppProviders.tsx`.
- Replace the placeholder auth gate in `src/shared/layout/ProtectedAppShell.tsx`.
- Map Microsoft groups or roles to app access.

### 5. Separate data from presentation

- Pull hardcoded page data into `src/shared/data`.
- Add typed API adapters under `src/shared/api`.
- Make Pipeline summary data enter the Communities app through those adapters.

## VS Code Terminal Commands

If `code` is available on your machine later, these are the commands to use:

```bash
cd /Users/eric/CareEngineMain
code alamo-platform-app
```

If you want to install dependencies after opening the folder:

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm install
npm run dev
```

## Suggested Next Code Moves

Start with these file-by-file replacements:

1. Replace `src/shared/navigation/PlatformHeader.tsx` with the logic from the current DataHub header.
2. Replace `src/features/communities/pages/AppHomePage.tsx` with the current DataHub home page.
3. Replace `src/features/communities/pages/CommunitiesPage.tsx` with the current DataHub dashboard.
4. Replace `src/features/reports/pages/ReportsPage.tsx` with the current Reports page.
5. Replace `src/features/incidents/pages/IncidentCenterPage.tsx` with the current Incident Center page.
6. Replace `src/features/workforce/pages/WorkforcePage.tsx` with the current Workforce page.
7. Move Settings and Admin last.

## What To Do Next

1. Install dependencies in `alamo-platform-app`.
2. Get the placeholder app booting.
3. Move the DataHub header and home page first.
4. Move the Communities page next.
5. Strip out Pipeline route links.
6. Add Microsoft auth before polishing secondary features.
