# Ship Checklist

- purpose: define the final Alamo Platform release gate for the rails-only analyst workspace
- status: authoritative current-state release checklist
- owners: engineering, product, data platform
- updated: 2026-09-15
- tags: release, qa, browser, analyst, snapshot, data
- labels: platform-handbook, current-state, release-gate
- related files:
  - [package.json](/Users/eric/CareEngineMain/alamo-platform-app/package.json)
  - [testing-quality.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/testing-quality.md)
  - [data-publishing.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/data-publishing.md)
  - [deployment-operations.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/deployment-operations.md)

## November 24 owner-directed five-minute Ally releases

Routine Ally release checks have a **five-minute combined ceiling**: three
minutes before cutover and two minutes against the deployed candidate. The runner
enforces those limits, stops its own child processes on timeout, records a failed
receipt, and rejects skipped stages. A timeout requires investigating that check;
it never makes a candidate eligible to ship. Do not restart the full app suite
because the scoped gate timed out.

- Report UI, governed adapters, and runtime-package updates use
  `npm run check:ship:ally:predeploy`.
- Changes to Ally's analytical views or snapshot field mappings use
  `npm run check:ship:ally-data:predeploy`. This adds the existing field/grant,
  null-preservation, snapshot transport and cache-revalidation checks.
- After cutover, use `npm run check:ship:ally:postdeploy` with the authenticated
  main-Chrome evidence for the deployed candidate. An unavailable sign-in or
  inspection session is a concrete blocker, not a reason to repeat local checks.

Keep dependency security, authorization, source correctness, History containment,
phone layout, and build checks. Use the existing source/build fingerprints to reuse
passing evidence for unchanged code; never reuse a receipt across an affected
source, dependency, configuration or build change. Packaging verifies the immutable
candidate, its exact changed files/configuration and conditional rollback once.
Do not repeat packaging or tests solely because a commit message or deployment
timestamp changed.

The 50-conversation real-data evaluation is a separate quality benchmark. Preserve
its source dates, actual answers, independent figures, elapsed times and cost;
synthetic browser fixtures prove interface behavior only. Recheck a real answer,
its follow-up and saved History on the deployed candidate. Changed engine owners
also need their focused behavioral tests and build/package checks. Reuse a passing
native Functions recovery check when its checked implementation is unchanged.
When worker configuration changes, prove actual Durable activity adoption with
`assertWorkerBranch` and its no-model stale-run probe. Source grant changes still
need exact before/after receipts, denial checks and conditional rollback.

For a source publication, run its relevant upstream QA once, verify row counts,
nulls, monthly/daily grain, completeness, freshness and payload size before
publishing. The local `ally-data` receipt does not replace those data assertions.
Publication and migrations are distinct operations, not something to rerun for a
report UI release. A known material data error must be fixed or isolated.

This policy supersedes the blanket whole-suite-before-and-after rule for the
bounded Ally scope above. Broader shell, authentication and cross-feature changes
still require their affected checks and existing CI/security protections. Historical
guided-question generation, unrelated journey fuzzing and repeated whole-app
browser passes stay out of routine Ally release checks. Never weaken assertions,
bless a failure, or present the five-minute ceiling as evidence of answer quality.

## Ship Gate

Run the predeployment gate from the app root before changing production:

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm run check:ship:predeploy
```

This runs the full local, browser, dependency, and production-build stages and
stops on the first failure. It excludes signed-in smoke against the old
production revision, whose UI can legitimately differ from the candidate.
After deploying the named revision, run `npm run check:ship` against the new
production site. That is the strongest end-to-end gate and includes production
smoke, signed-in navigation, guided questions, and the build. Roll back a
failed postdeployment gate rather than treating it as a successful release.

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
5. Pass `npm run check:ship:predeploy`, deploy one named production revision,
   then run `npm run check:ship` against that deployment. Do not launch from an
   uncommitted or ambiguous local state.
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

- `npm run check:ship:predeploy` fails before cutover, or `npm run check:ship`
  fails after cutover.
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
