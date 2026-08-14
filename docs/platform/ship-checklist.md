# Ship Checklist

- purpose: define the final Alamo Platform release gate for the rails-only analyst workspace
- status: authoritative current-state release checklist
- owners: engineering, product, data platform
- updated: 2026-07-18
- tags: release, qa, browser, analyst, snapshot, data
- labels: platform-handbook, current-state, release-gate
- related files:
  - [package.json](/Users/eric/CareEngineMain/alamo-platform-app/package.json)
  - [testing-quality.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/testing-quality.md)
  - [data-publishing.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/data-publishing.md)
  - [deployment-operations.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/deployment-operations.md)

## Ship Gate

Run this from the app root before handing off a release:

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm run check:ship
```

This is the strongest local gate. It runs the full platform-ready profile,
browser journey checks, production smoke checks, and the production build. It
stops on the first failure so the next action is obvious.

The release and full profiles run `check:dependencies`, which fails on high or
critical production dependency advisories. The only documented exception is
React Router's RSC-only advisory; this client-rendered Vite SPA does not enable
RSC, server actions, loaders, or action request processing. Any additional high
or critical advisory fails the gate. The declared Node engine matches Vite's
supported runtime (`>=20.19 <23`), so local, CI, and Vercel builds do not
silently use an unsupported Node 20 minor.

## Controlled Six-User Launch

Before inviting the initial users:

1. In the Entra Enterprise Application, set **Assignment required** to **Yes**.
2. Assign only the six approved users, or one group containing exactly those
   users. Confirm an unassigned tenant user is denied.
3. Confirm the production SPA redirect is exactly
   `https://www.alamoplatform.com/login` and the delegated API scope is
   `access_as_user`.
4. Publish the latest governed snapshot and confirm its source date, generated
   time, census audit, weekly context, and payload headroom.
5. Deploy one named production revision, then run `npm run check:ship` against
   that deployment. Do not launch from an uncommitted or ambiguous local state.
6. Complete the human smoke pass with one of the six assigned accounts and one
   deliberately unassigned account.

For defense in depth after the assignment boundary is proven, add the
`AlamoPlatform.User` app role and set
`ENTRA_API_REQUIRED_ROLE=AlamoPlatform.User`. Do not enable the variable before
the role is present in delegated tokens because the API correctly fails closed.

## What Must Be True

- The home workspace loads in a few seconds and stays fast after the initial snapshot read.
- `/home` shows the centered California community map, five location markers, and the Questions control.
- Every location marker opens the comprehensive community profile in a modal, and selecting the backdrop returns home.
- Community census, incidents, roster, resident profile, and Resident Search drilldowns remain inside the modal; Back returns exactly one level.
- The question picker opens, collapses, and renders each selected answer as the next item in the vertical workspace.
- There is no free-form question input in the shipping rails-only mode.
- Buttons either open a trusted surface or run a vetted question. No report-builder, exposed Data Explorer, or dead-end CTA should be visible.
- Resident Search stays in the workspace, inherits the selected community, and shows search, a bounded scrollable roster, and one complete profile card.
- New chat starts with no leaked analysis context from the prior thread.
- Rendered answers use executive language: direct sentence first, short supporting bullets when useful, then a chart/table/module.
- Dates display as normal product dates, not raw ElderMark strings.
- Browser checks show no console crashes, no stuck loading states, and no broken chart/table rendering.
- Entra Enterprise Application assignment is required for production users; if `ENTRA_API_REQUIRED_ROLE` is configured, an assigned test user must receive that role in the delegated API token.

## Data Gate

After an ElderMark pull or Databricks notebook change, run the governed data path
before trusting the UI:

```text
verify_raw_landing
eldermark_staged_transform / refresh_gold
tool_context_views
analyst_context_qa
snapshot_publish
```

Then verify the published snapshot:

- Command Center should show the active snapshot and tool-context row counts.
- The snapshot data date should match the latest loaded data, not merely the time the snapshot notebook ran.
- The platform should not claim July data until the published snapshot contains July rows.
- Census must be checked against ElderMark for San Pablo and at least one other community after census logic changes.
- If ElderMark and the platform disagree, do not ship new census-facing claims until the variance is explained or isolated.

## No-Go Conditions

- `npm run check:ship` fails.
- The production signed-in smoke cannot reach the app.
- A guided question returns a fallback for a month/community that exists in the governed snapshot.
- A vetted question shows an unvetted CTA, report-builder button, or data-explorer link.
- New chat carries the previous thread's resident, community, category, or period.
- Current data freshness messaging implies rows exist past the latest loaded source date.
- Census counts are materially different from ElderMark and the difference has not been reconciled.

## Human Smoke Pass

After the scripted gate, do one signed-in preview pass:

1. Reload the app and confirm the starting state is quiet: the California map, five markers, and the Questions control.
2. Open every community marker, confirm the complete profile renders, and close one by selecting outside the modal.
3. Open Questions, then open Resident Search, search one resident, and confirm the profile card plus datasheet render in the workspace.
4. Run one census question, one incident count question, one community overview question, one resident question, and one medication question if MAR is enabled.
5. Start a new chat and run a different community question. Confirm no old context leaks.
6. Check Command Center freshness and snapshot metadata before production promotion.
