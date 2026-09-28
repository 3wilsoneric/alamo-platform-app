# Deployment And Operations

- purpose: document local development, production deployment, auth, environment variables, and health checks
- status: authoritative current-state reference
- owners: engineering, operations
- updated: 2026-09-28
- tags: deployment, azure-container-apps, vercel, local-dev, entra, databricks, operations
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/.env.example](/Users/eric/CareEngineMain/alamo-platform-app/.env.example)
  - [alamo-platform-app/package.json](/Users/eric/CareEngineMain/alamo-platform-app/package.json)
  - [alamo-platform-app/server/databricks.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/databricks.mjs)
  - [alamo-platform-app/server/platform-snapshot.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/platform-snapshot.mjs)
  - [alamo-platform-app/vite.config.ts](/Users/eric/CareEngineMain/alamo-platform-app/vite.config.ts)
  - [alamo-platform-app/vercel.json](/Users/eric/CareEngineMain/alamo-platform-app/vercel.json)

## Current Production Host

`www.alamoplatform.com` is served by the Azure Container App
`alamo-platform-prod-web` in resource group `alamo-data-rg` (West US 2), using
Azure Container Registry `pipelineprodacra6qdvl6ebenac`. The Container App is
in single-revision mode; a new image update promotes the new revision. Confirm
the current image and revision with `az containerapp show` before every change.

The Vercel variables, API adapter, and cron settings below describe that
deployment target, not the current public `www` host. Do not treat a Vercel
promotion as an Azure production release. The September 2026 iPhone polish
release used `Dockerfile.iphone-overlay` to add CSS and Home Screen HTML
metadata to the exact preceding Azure image digest. The follow-up phone
experience release uses `Dockerfile.mobile-experience-overlay` on that digest
and adds only phone CSS, the stacked community selector, same-origin profile and
analytics choice controls, and their HTML references.
Neither overlay rebuilds the browser bundle or server. Rollback is an Azure
Container App image update to the recorded preceding digest, not a Vercel
promotion.

Source-level browser changes use `Dockerfile.frontend-release`. Build the Vite
bundle locally, pass the exact current production image digest as `BASE_IMAGE`,
and replace only `/app/dist`. This preserves the already-proven Azure server,
API, environment, and data adapters while shipping the reviewed React bundle.
Record the preceding image digest before promotion so rollback remains an Azure
Container App image update.

Repeated frontend overlays eventually approach the registry's image-depth
ceiling. When that happens, use `Dockerfile.frontend-rebase` once with the exact
current production digest as `BASE_IMAGE`. It copies the proven runtime
filesystem into one fresh layer, adds the validated `/app/dist`, and recreates
the current image's user, environment, working directory, entrypoint, and
command. Before promotion, compare the resulting image configuration with the
source image and confirm the flattened layer count. Resume ordinary
`Dockerfile.frontend-release` overlays after that rebase release.

### Admissions board release — 2026-09-26

The compact Admissions workflow board is deployed as a frontend-only release:

- source commit: `348e96e`
- image tag: `alamo-platform:admissions-board-348e96e`
- image digest: `sha256:5f69353518b7c653062b80c6575a4cb2a0f80052e4ce6bfc2925ef90ec729132`
- active revision: `alamo-platform-prod-web--admissions-board-0926`
- rollback digest: `sha256:abd325d6a2dcb05837932ce77eedabd1d90fcaddbfe8539827cfd933a8553e15`

The release overlays `/app/dist` on the preceding production digest. It does
not replace the server, API, environment, or Pipeline feed configuration.
Post-promotion verification confirmed a healthy revision at 100% traffic,
4/4 public smoke probes, and a connected live Admissions payload with 21 of 21
board cards, five communities, and portfolio census 541.

### Admissions client identity release — 2026-09-26

The authenticated Admissions board now carries and displays the actual client
name from Pipeline. This is an intentional PHI-bearing server-to-server
contract inside the existing protected Platform boundary; deployment checks
must report name coverage by count and must not print names.

Pipeline producer:

- source commit: `58ddaf0874e966673156042df262656255ac7c7e`
- source PR: `https://github.com/3wilsoneric/pipeline-app/pull/209`
- image digest: `sha256:fdbdaad81a9babcab2e3477fe1274f72d45a3d4f4dd6ae36798bcbb03d8e2a3e`
- active revision: `pipeline-prod-web--58ddaf0874e96667`

Platform consumer:

- source commit: `8b3cce2`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/2`
- image tag: `alamo-platform:admissions-identity-8b3cce2`
- image digest: `sha256:9e58125439ee4e070bc17fab2cf5719081cea97186f23e6d70214da35742ffb3`
- active revision: `alamo-platform-prod-web--admissions-identity-0926`
- rollback digest: `sha256:5f69353518b7c653062b80c6575a4cb2a0f80052e4ce6bfc2925ef90ec729132`

The Platform release uses `Dockerfile.admissions-identity-release` to replace
the reviewed browser bundle and the Pipeline summary normalizer on the exact
preceding production digest. Post-promotion verification confirmed healthy
Pipeline and Platform revisions at 100% traffic, contract version 2.1, 21 of
21 board cards with non-empty client names, five communities, portfolio census
541, the desktop/mobile Admissions browser regression, and 4/4 public smoke
probes.

### Admissions progress review release — 2026-09-26

The Admissions board is now a self-contained analyst update. Its section tabs
use a quiet underline treatment, visible Pipeline links are removed, and every
client card opens a responsive progress modal with workflow stage, next action,
assignment, timing, planned admission, priority, and current review flags.

- source commit: `e5849bb`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/3`
- image tag: `alamo-platform:admissions-progress-e5849bb`
- image digest: `sha256:1fb96dc2fbc4de25e503b8f47248153b107ac979a94476e7dfcb34b25944b05e`
- active revision: `alamo-platform-prod-web--admissions-progress-0926`
- rollback digest: `sha256:9e58125439ee4e070bc17fab2cf5719081cea97186f23e6d70214da35742ffb3`

This is a frontend-only overlay on the preceding production digest.
Post-promotion verification confirmed a healthy revision at 100% traffic, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, the responsive desktop/mobile progress-modal regression, the absence of
the former Pipeline control in the deployed bundle, and 4/4 public smoke
probes.

### Admissions executive update release — 2026-09-26

The Board view now opens with one live executive paragraph derived from the
governed referral summary. It reports active workload, stage distribution,
the three busiest communities, and the current exception load in the voice of
an admissions coordinator briefing leadership.

- source commit: `7aa2ac7`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/4`
- image tag: `alamo-platform:admissions-executive-7aa2ac7`
- image digest: `sha256:507e93f00abb513e72e48810a2f687b2445c4077ce9fac548bca61104ba46ac8`
- active revision: `alamo-platform-prod-web--admissions-executive-0926`
- rollback digest: `sha256:1fb96dc2fbc4de25e503b8f47248153b107ac979a94476e7dfcb34b25944b05e`

This is a frontend-only overlay on the preceding production digest.
Post-promotion verification confirmed a healthy revision at 100% traffic, the
executive update and progress modal in the deployed bundle, no visible Pipeline
control, a connected payload with 21 of 21 named cards, and 4/4 public smoke
probes.

### Admissions canvas alignment release — 2026-09-26

The Admissions page canvas now uses the same white background as the main Home
surface while preserving workflow-column and card colors.

- source commit: `0faa171`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/5`
- image tag: `alamo-platform:admissions-canvas-0faa171`
- image digest: `sha256:02d025953096a7b0c7fdfb5f351b3cb9a0d6cb92d123288e301800a58d50d6e6`
- active revision: `alamo-platform-prod-web--admissions-canvas-0926`
- rollback digest: `sha256:507e93f00abb513e72e48810a2f687b2445c4077ce9fac548bca61104ba46ac8`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, matching computed Home and Admissions canvas
colors in desktop/mobile browser QA, a connected payload with 21 of 21 named
cards, and 4/4 public smoke probes.

### Admissions executive briefing format release — 2026-09-26

The live executive paragraph now separates workload, community concentration,
and immediate follow-up into three scannable lines. Selective semibold emphasis
creates reading hierarchy, and community loads use natural language instead of
parenthetical counts.

- source commit: `5c6927a`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/6`
- image tag: `alamo-platform:admissions-executive-format-5c6927a`
- image digest: `sha256:8e6b3b5d7af56d3b9fe932947804630fb7409184602f00c4409afaf54c875808`
- active revision: `alamo-platform-prod-web--admissions-format-0926`
- rollback digest: `sha256:02d025953096a7b0c7fdfb5f351b3cb9a0d6cb92d123288e301800a58d50d6e6`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, the desktop/mobile formatting regression, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, and 4/4 public smoke probes.

### Admissions community pills release — 2026-09-26

Community is now the Board's only filter. The former community and status
dropdowns, attention filter, and Clear control are replaced by responsive
community pills. Multiple communities can remain selected together, and All
communities resets the full board.

- source commit: `41dc177`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/7`
- image tag: `alamo-platform:admissions-community-pills-41dc177`
- image digest: `sha256:512ae688013f991080215dedfae1a738e1b15081b5137695edde3418c5195f59`
- active revision: `alamo-platform-prod-web--admissions-pills-0926`
- rollback digest: `sha256:8e6b3b5d7af56d3b9fe932947804630fb7409184602f00c4409afaf54c875808`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, additive multi-community selection and reset
behavior in desktop/mobile browser QA, a connected payload with 21 of 21 named
cards, five communities, portfolio census 541, and 4/4 public smoke probes.

### Admissions referral chart release — 2026-09-26

Opening an Admissions client now presents the governed referral summary as a
Pipeline-inspired chart in a manila folder frame. The white chart sheet orders
identity, next action, referral facts, workflow progress, and review focus for
fast operational review on desktop and mobile. No clinical fields or additional
Pipeline data were added to the bounded Platform summary.

- source commit: `814c68e`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/8`
- image tag: `alamo-platform:admissions-chart-folder-814c68e`
- image digest: `sha256:69bf936c2cf79f398b3b1fb931a5aaaef1418dead54c40833e4718d4cb4e1a7f`
- active revision: `alamo-platform-prod-web--admissions-chart-0927`
- rollback digest: `sha256:512ae688013f991080215dedfae1a738e1b15081b5137695edde3418c5195f59`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, the desktop/mobile chart-folder visual and
overflow checks, the expected folder treatment in the production bundle, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, and 4/4 public smoke probes.

### Admissions management chart release — 2026-09-26

The client folder now opens as a larger management chart. Its folder tab is the
client name, and the chart adds client and placement facts, signed-assessment
overview and support items, medication handoff, admission readiness, workflow
progress, workflow details, and review focus. Narrative assessment data is
included only from a signed assessment; unsigned narrative, contacts,
documents, raw notes, and extraction evidence remain outside the Platform
summary contract.

Pipeline producer:

- source commit: `71896caf`
- source PR: `https://github.com/3wilsoneric/pipeline-app/pull/210`
- active revision: `pipeline-prod-web--b39c377c21d11ae9`
- contract version: `3.0`

Platform consumer:

- source commit: `33a14c1`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/9`
- image tag: `alamo-platform:admissions-management-auth-a0a9e14`
- image digest: `sha256:c25f70d4c2dfba2158e51960c2e99ee3ac7d6207ce789e9ee0ff1cff0fadc29d`
- active revision: `alamo-platform-prod-web--admissions-mgmt-auth-0927`
- rollback digest: `sha256:69bf936c2cf79f398b3b1fb931a5aaaef1418dead54c40833e4718d4cb4e1a7f`

The release replaces the browser bundle and Pipeline summary normalizer on the
preceding known-good runtime. The browser bundle was built with the production
`VITE_ENTRA_*` public configuration before image promotion. Post-promotion
verification confirmed a healthy single active revision at 100% traffic, 4/4
public smoke probes, 21 named admissions with management profiles, six signed
assessment profiles, client-name tab identity, nine chart sections, and no
horizontal overflow at a 390-pixel viewport.

### Admissions decision tabs release — 2026-09-26

The management chart is expanded to 1240 pixels on desktop. Its client name is
now isolated on a larger white folder label beside a decision tab: green
`Accept`, red `Deny`, or yellow `Under review`. Accepted, awaiting-admit, and
Meet-the-Client-pending statuses map to `Accept`; declined or denied statuses
map to `Deny`; all earlier workflow states map to `Under review`.

- source commit: `0accb73`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/11`
- image tag: `alamo-platform:admissions-decision-tabs-44e0ecb`
- image digest: `sha256:08521d6ce65ea83c0d92506cbaa5fd9fb9f46aa9e75e96fe749f67ce78f2ca9b`
- active revision: `alamo-platform-prod-web--admissions-tabs-0927`
- rollback digest: `sha256:c25f70d4c2dfba2158e51960c2e99ee3ac7d6207ce789e9ee0ff1cff0fadc29d`

Post-promotion verification confirmed a healthy single active revision at 100%
traffic, 4/4 public smoke probes, correct client-name identity across all 21
live cards, correct live mapping for six accepted and 15 under-review cards,
synthetic coverage for the deny state, and no horizontal overflow at a
390-pixel viewport.

### Admissions folder refinement release — 2026-09-26

The chart now opens directly on the operational content without the redundant
management-review title block. The folder and name tab use pale manila stock,
and the client name sits on an inset off-white paper label inside the tab. The
separate decision tab and all management-chart content remain unchanged.

- source commit: `337e615`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/13`
- image tag: `alamo-platform:admissions-folder-d1ebbdb`
- image digest: `sha256:d6dc6d4518bdeb40c29c04be02c59fd95adc4f766a56ae642dc6329732850f09`
- active revision: `alamo-platform-prod-web--admissions-folder-0927`
- rollback digest: `sha256:08521d6ce65ea83c0d92506cbaa5fd9fb9f46aa9e75e96fe749f67ce78f2ca9b`

Post-promotion verification confirmed a healthy single active revision at 100%
traffic, 4/4 public smoke probes, the intended production folder and label
colors, removal of the old title block, and no horizontal overflow at a
390-pixel viewport.

### Admissions folder viewport cap — 2026-09-26

The entire management folder, including its tabs, now remains inside the
visible browser viewport. The outer folder keeps an 8-pixel mobile margin and a
24-pixel desktop margin; long chart content scrolls inside the paper instead of
extending the folder beyond the page.

- source commit: `905abca`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/15`
- image tag: `alamo-platform:admissions-folder-cap-e01f159`
- image digest: `sha256:7ceabdf89a2e947f53b50a85d96bd0f481a88ce844aa2b2ed4e71988839d79c1`
- active revision: `alamo-platform-prod-web--admissions-folder-cap-0927`
- rollback digest: `sha256:d6dc6d4518bdeb40c29c04be02c59fd95adc4f766a56ae642dc6329732850f09`

Production browser verification measured the desktop folder from 24 to 675 in
a 699-pixel viewport and the mobile folder from 8 to 836 in an 844-pixel
viewport. The mobile chart scrolls internally with zero horizontal overflow.
The release also passed all four public production smoke probes.

### Admissions analyst response release — 2026-09-26

The Board's governed executive update now reads as an Admissions analyst
response instead of a bordered report paragraph. A compact analyst identity,
soft response surface, selective emphasis, and a short staged reveal preserve
the same workload, community, and follow-up facts while making the update feel
generated and conversational. Reduced-motion users receive the complete answer
immediately. A scoped theme rule preserves the 16-pixel response radius without
changing the Platform's sharper treatment elsewhere.

- source commits: `1d12635`, `f5c87e6`, `2e1afd3`
- source PRs: `https://github.com/3wilsoneric/alamo-platform-app/pull/17`, `https://github.com/3wilsoneric/alamo-platform-app/pull/18`, `https://github.com/3wilsoneric/alamo-platform-app/pull/19`
- image tag: `alamo-platform:admissions-chat-theme-2e1afd3`
- image digest: `sha256:eb55e1cb950de372a2215653a4f6dd5473e7509b50d1e68ff378d5460141403d`
- active revision: `alamo-platform-prod-web--admissions-chat-theme-0927`
- rollback digest: `sha256:e71b3bd4a2b441aafb1bab898ff6bd2c1ab81faea443fa9cd127ad20e9a1ef6c`

Production browser verification confirmed the staged reveal completes, the
three formatted lines and analyst mark remain visible, the old left border is
absent, the response retains its intended background and radius, and the page
has zero horizontal overflow at a 390-pixel viewport. The release is healthy at
100% traffic and passed all four public production smoke probes.

### Admissions attention-label removal — 2026-09-26

The Admissions overview no longer turns Pipeline timing flags into management
judgments. Automated `Update overdue`, `Move-in overdue`, `No owner`, `Needs
follow-up`, and `Immediate follow-up` labels are absent from the board, list,
client chart, and analyst response. Factual workflow status, owner, next action,
days open, last update, and planned admission remain available.

- source commit: `6d06456`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/21`
- image tag: `alamo-platform:admissions-no-attention-6d06456`
- image digest: `sha256:0a2184a1b74f856e82c1ba53ebfd9ef0370122e504dff70b11988f7cd0793a5a`
- active revision: `alamo-platform-prod-web--admissions-no-attention-0927`
- rollback digest: `sha256:eb55e1cb950de372a2215653a4f6dd5473e7509b50d1e68ff378d5460141403d`

Post-promotion verification confirmed the removed labels are absent from the
deployed browser bundle, the retained analyst response content is present, the
single active revision is healthy at 100% traffic, and all four public
production smoke probes pass.

### Admissions view-selection release — 2026-09-26

The Board/List control no longer sits inside a gray segmented tray. Only the
current view receives an Alamo-green surface and text treatment; the inactive
view remains transparent. Both labels remain visible at phone width.

- source commit: `bd374bf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/23`
- image tag: `alamo-platform:admissions-view-bd374bf`
- image digest: `sha256:121a0ff2216a9298e4fa7a99fcfc76b67924d35e9389be4e7afac1f13498cbe0`
- active revision: `alamo-platform-prod-web--admissions-view-0927`
- rollback digest: `sha256:0a2184a1b74f856e82c1ba53ebfd9ef0370122e504dff70b11988f7cd0793a5a`

Post-promotion verification confirmed the active-view treatment in the
deployed browser bundle, a healthy single revision at 100% traffic, and all
four public production smoke probes.

### Admissions modal dismissal release — 2026-09-26

The Admissions management chart no longer includes a redundant full-width
`Done` action. Users dismiss the chart with the corner close control, by
clicking the surrounding backdrop, or with Escape. The chart content and
Pipeline data contract are unchanged.

- source commit: `e14f666`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/25`
- image tag: `alamo-platform:admissions-modal-dismiss-e14f666`
- image digest: `sha256:01b1d9fa953fb72797b1292808378b10bb534bb8fd2670be139a13c7a65c532c`
- active revision: `alamo-platform-prod-web--admissions-dismiss-0927`
- rollback digest: `sha256:121a0ff2216a9298e4fa7a99fcfc76b67924d35e9389be4e7afac1f13498cbe0`

Post-promotion verification confirmed the exact production browser asset,
a healthy single revision at 100% traffic, and all four public production
smoke probes. TypeScript, the deterministic Admissions dashboard check, and
the production browser build also pass.

### Admissions chart streamlining release — 2026-09-26

The client management chart now follows one vertical reading path instead of
splitting facts across two competing dashboard columns. Four deliberate
sections cover the next action, admission brief, workflow and readiness, and
signed client context. Flat chart rows replace the former fact-card grids while
preserving placement, referral, payer, owner, timing, assessment, requirement,
support, and medication information.

- source commit: `579203f`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/27`
- image tag: `alamo-platform:admissions-chart-streamline-579203f`
- image digest: `sha256:8519eb08dc81c02eb18a0dba174fe9c70c2d4e59f733ac732ac26022227fafe8`
- active revision: `alamo-platform-prod-web--admissions-streamline-0927`
- rollback digest: `sha256:01b1d9fa953fb72797b1292808378b10bb534bb8fd2670be139a13c7a65c532c`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and phone renders contained one chart stream,
four sections, and no horizontal overflow.

### Admissions executive card release — 2026-09-26

The Admissions Board and List now present each referral as an executive
briefing rather than an operator task card. Raw workflow instructions such as
`Continue preparation` are no longer shown. Each referral surfaces its
decision, stage, accountable owner, time open and update freshness, planned
admission, and an evidence-based readiness summary. The detailed chart also
reframes its former next-action callout as `Current management focus`.

- source commit: `6ca694c`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/29`
- image tag: `alamo-platform:admissions-ceo-cards-6ca694c`
- image digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`
- active revision: `alamo-platform-prod-web--admissions-ceo-cards-0927`
- rollback digest: `sha256:8519eb08dc81c02eb18a0dba174fe9c70c2d4e59f733ac732ac26022227fafe8`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and phone renders showed the executive fields,
excluded raw workflow-action copy, and had no horizontal overflow.

### Admissions navigation release — 2026-09-26

Admissions now appears directly below Analytics in the shared desktop and
phone navigation for identities that pass the existing Admissions access
decision. The destination remains absent for identities without an Admissions
role, and opens the native `/admissions` overview without changing API, data,
or authentication configuration.

- source commit: `255f742`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/31`
- image tag: `alamo-platform:admissions-nav-255f742`
- image digest: `sha256:e933cfde2251be9582d47303a9b35b3d1e0d90df6f58b84adc323c3911933bfe`
- active revision: `alamo-platform-prod-web--admissions-nav-0927`
- rollback digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel renders placed Admissions below
Analytics, opened `/admissions`, and had no horizontal overflow.

### Admissions navigation access correction — 2026-09-26

The Admissions destination is now shown below Analytics for every authenticated
Platform identity. Admissions-specific roles continue to constrain assessor-only
identities but no longer act as a second navigation entitlement for normal
Platform users. The release bundle was rebuilt with the required browser-safe
Entra client and tenant values after an unconfigured intermediate bundle was
detected and rolled back.

- source commit: `3ac46d5`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/33`
- image tag: `alamo-platform:admissions-nav-auth-3ac46d5`
- image digest: `sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`
- active revision: `alamo-platform-prod-web--admissions-nav-auth-0927`
- rollback digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. A fresh load in the owner's signed-in Chrome session showed no
authentication setup error, placed Admissions below Analytics, and opened the
native `/admissions` overview from that menu item.

### Admissions decision-color refinement — 2026-09-27

Admissions decision labels now use a more legible executive palette across
Board cards, List rows, and management-chart folder tabs. `Accept` uses a
deeper Alamo green with white text, while `Under review` uses a warmer gold
with dark text and a defined gold border. No decision logic, source data, or
workflow behavior changed.

- source commit: `37c0f94`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/35`
- image tag: `alamo-platform:admissions-decision-colors-37c0f94`
- image digest: `sha256:28b7f08d72a68da6a1e47997eaf689ea3937e20429239a7a78e3c28279acd755`
- active revision: `alamo-platform-prod-web--admissions-colors-0927`
- rollback digest: `sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel checks verified the label and folder
tab colors without horizontal overflow. A fresh load in the owner's signed-in
Chrome session confirmed six visible `Accept` labels with white text and fifteen
visible `Under review` labels with the new gold treatment.

### Admissions streamed executive briefing — 2026-09-27

The Admissions analyst briefing now renders as a progressive character stream
at a conversational response pace instead of revealing complete lines at once.
Accepted clients lead the response, with clients carrying planned admission
dates ordered first and their destination communities and dates shown inline.
The workload and community summaries follow after that client rollup. Reduced-
motion preferences continue to reveal the complete response immediately.

- source commit: `df983ed`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/37`
- image tag: `alamo-platform:admissions-streamed-briefing-df983ed`
- image digest: `sha256:16c8de1f4be9fa83403eaf0c5bf14368a33d4fad49a8012a44e69e80cf2736f1`
- active revision: `alamo-platform-prod-web--admissions-stream-0927`
- rollback digest: `sha256:28b7f08d72a68da6a1e47997eaf689ea3937e20429239a7a78e3c28279acd755`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel checks verified progressive text,
accepted-client ordering, stream completion, zero horizontal overflow, and final
caret removal. A fresh load in the owner's signed-in Chrome session confirmed
the response remained in the composing state while its visible text grew, then
finished with all six live accepted clients in the leading paragraph, no
authentication setup error, and no horizontal overflow.

### Admissions Analytics-navigation placement — 2026-09-27

The Admissions page-level navigation now keeps Home on the left and places
Analytics at the far right of the header. The same alignment is preserved at
desktop and mobile widths; navigation destinations and access rules are
unchanged.

- source commit: `a573838`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/39`
- image tag: `alamo-platform:admissions-analytics-right-a573838`
- image digest: `sha256:1a441d5e6f166e1b38ffddbdeb00ff9443901d79717c2de9607024d04b6c5430`
- active revision: `alamo-platform-prod-web--admissions-nav-right-0927`
- rollback digest: `sha256:16c8de1f4be9fa83403eaf0c5bf14368a33d4fad49a8012a44e69e80cf2736f1`

The frontend-only release was rebuilt over the stable runtime image
`sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`
to collapse accumulated frontend layers after the registry reached its maximum
image depth; backend behavior was unchanged. Post-promotion verification
confirmed the exact tested production JavaScript asset, one active revision at
100% traffic, and all four public production smoke probes. Deterministic desktop
and 390-pixel Admissions checks verified right-side placement without overflow.
A fresh load in the owner's signed-in Chrome session confirmed Analytics on the
right side of `/admissions` with no authentication setup error.

### Admissions explicit review-status correction — 2026-09-27

Admissions now displays `Under review` only when Pipeline explicitly reports
that status. Accepted and denied status mappings are unchanged; every other
undecided workflow status now displays as `In progress` with a blue treatment
instead of being inferred as a yellow review decision.

- source commit: `cf5ac4d`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/41`
- image tag: `alamo-platform:admissions-explicit-review-cf5ac4d`
- image digest: `sha256:27078ece1f18465312cc3ef725e25b536b75062c737f055507509cd88b6edc6e`
- active revision: `alamo-platform-prod-web--admissions-review-status-0927`
- rollback digest: `sha256:1a441d5e6f166e1b38ffddbdeb00ff9443901d79717c2de9607024d04b6c5430`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel browser checks covered both an
ordinary in-progress record and an explicit Pipeline `Under Review` record. A
fresh load in the owner's signed-in Chrome session confirmed all 21 live cards
matched their source statuses: six accepted, 15 in progress, zero incorrectly
inferred as under review, and no authentication setup error.

### Admissions in-progress contrast correction — 2026-09-27

The blue `In progress` category now forces white text in every Admissions
surface so surrounding card, table, or modal styles cannot reduce its contrast.

- source commit: `2908814`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/43`
- image tag: `alamo-platform:admissions-in-progress-white-2908814`
- image digest: `sha256:30beb8bcead8e7e817e0261faed877d0730bc709cb6453817e6b3497dcd21060`
- active revision: `alamo-platform-prod-web--progress-white-0927`
- rollback digest: `sha256:27078ece1f18465312cc3ef725e25b536b75062c737f055507509cd88b6edc6e`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. A fresh load in the owner's signed-in Chrome session confirmed all 15
visible `In progress` labels computed to pure white text.

### Admissions client-chart drill-downs — 2026-09-27

The three summary bands inside each Admissions management chart are now
interactive. `Admission brief` opens status provenance, placement, and referral
origin; `Workflow and readiness` opens ownership, timing, and requirement
readiness; and `Client context` opens the bounded assessment overview, care and
support snapshot, and medication handoff. The detail remains inside the existing
folder chart, keeps the client name and decision tab visible, and does not expose
raw Pipeline notes or documents.

- source commit: `635e467`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/45`
- image tag: `alamo-platform:admissions-chart-drilldowns-635e467`
- image digest: `sha256:8bb15245c20ac250b5c25dc4fef4ff4d475d19665bc80545b054ec8baa50bf61`
- active revision: `alamo-platform-prod-web--chart-drilldowns-0927`
- rollback digest: `sha256:30beb8bcead8e7e817e0261faed877d0730bc709cb6453817e6b3497dcd21060`

This frontend-only release was rebuilt over the stable runtime image
`sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`;
the backend and Pipeline feed contract did not change. TypeScript, JavaScript
lint, docs, the Admissions dashboard check, the production-configured build,
and deterministic desktop and 390-pixel browser coverage passed before
promotion. Post-promotion verification confirmed the exact JavaScript asset,
a healthy single revision at 100% traffic, and all four public smoke probes. A
signed-in production check opened all three chart drill-downs against the live
21-card feed with no horizontal overflow, raw-document links, or browser errors.

### Admissions data-row drill-down correction — 2026-09-27

The chart-level drill-down sheets were replaced with direct, in-place
disclosure on the existing management-chart rows. Status, placement, referral
origin, coverage, client details, ownership and timing, assessment, documents,
and requirements now expand into their underlying source fields. Only one row
opens at a time; client context stays directly readable in the chart. This also
corrects the mobile reading order and keeps the disclosure control to the right
of each left-aligned label and value.

- source commit: `c395211`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/47`
- image tag: `alamo-platform:admissions-inline-drilldowns-c395211`
- image digest: `sha256:049f7e365d29ded864c86f6ffbac9798964392e021f7cb4ac5e1d737e15cd99a`
- active revision: `alamo-platform-prod-web--inline-drill-0927`
- rollback digest: `sha256:8bb15245c20ac250b5c25dc4fef4ff4d475d19665bc80545b054ec8baa50bf61`

This frontend-only correction used the existing stable runtime and did not
change the backend or Pipeline feed contract. TypeScript, JavaScript lint,
documentation, the Admissions dashboard check, the production-configured
build, and deterministic desktop and 390-pixel browser coverage passed before
promotion. Post-promotion verification confirmed the exact JavaScript asset, a
healthy single revision at 100% traffic, and all four public smoke probes. A
signed-in production check found all nine row controls on the live 21-card feed,
expanded placement and assessment in place, kept one detail open at a time,
and reported no horizontal overflow, legacy drill-down overlays, or browser
errors.

### Admissions mobile category navigation — 2026-09-28

The Admissions workspace now uses a category-first list on phone and tablet
widths instead of compressing the desktop board. `Referral received`,
`In progress`, `Decision`, `Census`, and `Trends` form the mobile navigation;
the selected pipeline category renders its client list and each client opens
the existing management chart. Community filters stay in one horizontally
scrollable row. Desktop retains the board/list controls and centers the
`Board`, `Census`, and `Trends` navigation.

- source commit: `024409e`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/49`
- image tag: `alamo-platform:admissions-mobile-lists-024409e`
- image digest: `sha256:cf66502c8155f201b5b3776c18d9e17db8fed29f23544494846f8070c46dce30`
- active revision: `alamo-platform-prod-web--mobile-lists-0928`
- rollback digest: `sha256:049f7e365d29ded864c86f6ffbac9798964392e021f7cb4ac5e1d737e15cd99a`

This frontend-only release used the exact preceding production image as its
base, so the backend, Pipeline feed contract, environment, and secrets did not
change. TypeScript, the Admissions dashboard check, a production-configured
build, and deterministic responsive coverage at 320, 390, 768, and 1024 pixels
passed before promotion. Connected-feed fixture coverage confirmed category
selection, client lists, the management-chart modal, one-row community filters,
and no page or modal overflow at 390 and 768 pixels. Post-promotion verification
confirmed the exact JavaScript and CSS assets, a healthy single revision at
100% traffic, and all four public production smoke probes.

### Analytics Monday-briefing removal — 2026-09-28

The Monday census briefing is no longer presented as an Analytics report on
desktop or mobile. Analytics now contains only the five finished governed
report families. The separate scheduled Monday census email workflow remains
available and was not changed.

- source commit: `0828abf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/51`
- release-tooling commit: `850e3fd`
- release-tooling PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/52`
- image tag: `alamo-platform:reports-no-monday-0828abf`
- image digest: `sha256:9ee73ecb35a542b4a52f717c59645fd197c7df5f1e685ee58c39f4c4edbe8382`
- active revision: `alamo-platform-prod-web--reports-no-monday-0928`
- rollback digest: `sha256:cf66502c8155f201b5b3776c18d9e17db8fed29f23544494846f8070c46dce30`

The frontend release Dockerfile was reduced to one filesystem layer after the
original overlay attempt reached the inherited image-depth limit. The successful
release still uses the exact preceding production image as its runtime base and
changes only the browser bundle. TypeScript, the report contract check,
documentation, a production-configured build, and the complete desktop/mobile
report browser regression passed before promotion. Post-promotion verification
confirmed the exact JavaScript and CSS assets, absence of the removed report
label in the live bundle, a healthy revision at 100% traffic, and all four
public production smoke probes.

### Analytics text navigation release — 2026-09-28

The Analytics workspace switcher is now a quiet text row at the upper right.
`Reports` and `Ask a question` sit directly beside one another with no tray or
icons; only the current destination receives a light green outlined box. The
desktop placement reserves space for the separate Admissions destination, and
the same selected-state treatment remains legible without horizontal overflow
on phone widths.

- source commit: `9145330`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/54`
- release-tooling commit: `5da22a3`
- release-tooling PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/55`
- image tag: `alamo-platform:analytics-text-nav-9145330`
- image digest: `sha256:35916d7d19fac583b623defe7c17d717c319436e37e28ed7f88c98f9fb0212c2`
- active revision: `alamo-platform-prod-web--analytics-text-nav-0928`
- rollback digest: `sha256:9ee73ecb35a542b4a52f717c59645fd197c7df5f1e685ee58c39f4c4edbe8382`

The release rebased the exact proven production filesystem into a fresh image
after inherited frontend overlays reached the registry depth ceiling. Runtime
configuration was preserved exactly while filesystem layers were reduced from
125 to two. TypeScript, the California Home contract check, documentation, a
production-configured build, the full report browser regression, and responsive
desktop, phone, tablet, and ultrawide visual checks passed before promotion.
Post-promotion verification confirmed the exact JavaScript and CSS assets, a
healthy revision at 100% traffic, and all four public production smoke probes.

### Primary Platform text navigation correction — 2026-09-28

The preceding text-only treatment was corrected to apply to the primary
`Analytics` and `Admissions` destinations, not the Analytics workspace
switcher. Those primary destinations now remain beside one another at the upper
right without arrows, and the active page receives a light green outlined box.
The Alamo home anchor remains at the upper left. `Reports` and `Ask a question`
were restored to their bordered Analytics control and positioned independently
so neither navigation overlaps from phone through ultrawide widths.

- source commit: `c245bcf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/57`
- image tag: `alamo-platform:primary-text-nav-c245bcf`
- image digest: `sha256:d93329474498a735d53c18214034eeca777b0d272fe65eba930bc312ff613763`
- active revision: `alamo-platform-prod-web--primary-text-nav-0928`
- rollback digest: `sha256:35916d7d19fac583b623defe7c17d717c319436e37e28ed7f88c98f9fb0212c2`

This frontend-only release adds one browser-bundle layer to the flattened
runtime and does not change the server, API, environment, or data adapters.
TypeScript, the California Home contract, documentation, the
production-configured build, full report coverage, Admissions dashboard
contracts, and responsive browser coverage from phone through ultrawide passed
before promotion. Desktop and mobile visual checks also confirmed the active
Analytics and Admissions states. Post-promotion verification confirmed the
exact JavaScript and CSS assets, a healthy revision at 100% traffic, and all
four public production smoke probes.

## Local Development

Install and run:

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm install
npm run dev:all
```

Ports:

- Vite frontend: `http://localhost:3001`
- local API server: `http://localhost:3002`
- Vite proxies `/api` to port `3002`
- The local API accepts loopback-only browser origins (`localhost`,
  `127.0.0.1`, and `[::1]`) on any port so isolated QA servers remain usable.
  Use the comma-separated `DEV_API_ALLOWED_ORIGINS` override to restrict this
  to an explicit local origin list.

Useful separate commands:

```bash
npm run dev
npm run dev:api
npm run snapshot:generate
npm run snapshot:publish
npm run build
```

## Production Build

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm run build
```

Build behavior:

- `npm run build` only runs the Vite production build.
- It does not generate or publish platform snapshots.
- Production runtime requires Azure snapshot storage and fails closed when its
  credentials are incomplete, its latest blob is missing, or its read fails.
- Local generated snapshot is a development-only fallback. It is never used to
  conceal an Azure production outage.
- `npm run snapshot:generate` writes a local fallback snapshot only.
- `npm run snapshot:publish` is an explicit escape hatch that can publish a
  locally generated snapshot to Azure; do not use it for the normal daily data
  pipeline because the Databricks `snapshot_publish` notebook owns the governed
  tool-context snapshot.
- App-side Azure publishing refuses to publish an empty analyst `toolContext`
  unless `PLATFORM_SNAPSHOT_ALLOW_EMPTY_TOOL_CONTEXT=true` is set for an
  intentional emergency override.

## Frontend Auth Variables

Browser-safe Entra variables:

- `VITE_ENTRA_CLIENT_ID`
- `VITE_ENTRA_TENANT_ID`
- `VITE_ENTRA_API_SCOPE` optional override; defaults to `api://<client-id>/access_as_user`
- `VITE_API_AUTH_REQUIRED` optional local-development opt-in; production builds always require API auth

If the first two are missing, the protected shell shows an authentication setup
message instead of rendering the app.

The browser callback is always `<current-origin>/login`; it is not configurable.
For production, register `https://www.alamoplatform.com/login` as a **Single-page
application** redirect URI in Entra. The registered URI must match the canonical
browser origin exactly. The apex domain redirects to `www`, so an apex callback
cannot safely carry the OAuth response.

MSAL also reuses `/login` inside a same-origin hidden frame when it refreshes an
API token. Production security headers therefore allow framing by the same
origin only (`frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`) and allow
both Microsoft and same-origin frame sources. External sites still cannot frame
the platform. Do not restore `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
or a Microsoft-only `frame-src`; those settings let the first sign-in complete
but block the authenticated workspace from acquiring its API token.

## Server Auth Variables

Microsoft/Azure service principal:

- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`
- `ENTRA_TENANT_ID`

Delegated user API authorization:

- `API_AUTH_REQUIRED` optional local-development override; Vercel preview and production always fail closed
- `ENTRA_API_AUDIENCE` optional override; defaults to `api://<ENTRA_CLIENT_ID>`
- `ENTRA_API_SCOPE` defaults to `access_as_user`
- `ENTRA_API_REQUIRED_ROLE` optional defense in depth; when set, the delegated token must contain this Entra app role

The API validates Microsoft signatures, the configured tenant, audience, scope,
and optional role. It accepts both Entra v1 (`sts.windows.net`) and v2
(`login.microsoftonline.com/.../v2.0`) issuer forms because the app registration's
token version controls which valid issuer Microsoft returns.

The Entra app registration must expose the delegated `access_as_user` scope. A deployment without that scope will show the login UI but API requests will be rejected rather than exposing resident or operational data anonymously.

Before production access is granted, configure the Entra Enterprise Application
with **Assignment required** enabled and assign only approved users or groups.
For an additional server-enforced boundary, define an app role such as
`AlamoPlatform.User`, assign it to the same users or groups, and set
`ENTRA_API_REQUIRED_ROLE=AlamoPlatform.User` in Vercel. Do not set the variable
until the role appears in delegated access tokens; the API rejects tokens that
do not carry it.

Azure snapshot storage:

- `AZURE_STORAGE_ACCOUNT`
- `AZURE_STORAGE_CONTAINER`
- `AZURE_STORAGE_CONNECTION_STRING` optional legacy path
- `SNAPSHOT_ROOT`
- `PLATFORM_SNAPSHOT_MAX_BYTES` defaults to 64 MB. The publisher emits compact,
  tables-only analyst context so the governed snapshot remains below this bound.

Private acquisition storage uses the same Azure account and private container:

- `ACQUISITION_STORAGE_CONTAINER` optionally overrides
  `AZURE_STORAGE_CONTAINER`
- `ACQUISITION_STORAGE_ROOT` defaults to `acquisition-intelligence`
- `ACQUISITION_STORAGE_READ_SOURCE` may force `local` or `azure` for controlled
  verification; production defaults to Azure and fails closed
- `ACQUISITION_STORAGE_CACHE_TTL_MS` defaults to five minutes
- `npm run acquisition:publish:azure` publishes raw source lineage plus the
  validated manifest and compressed facility index
- `ACQUISITION_PUBLISH_RESEARCH_INITIALIZE=true npm run
  acquisition:publish:azure` is a first-use-only initializer; it cannot replace
  an existing production research store

Production research mutations use conditional Blob ETags and retry bounded
conflicts. Successful revisions are archived under the acquisition storage root
so the owner-authored workflow is durable across Azure Container Apps replicas
and Vercel serverless instances. The Azure Container Apps runtime uses its
existing user-assigned managed identity; grant that identity Blob Data
Contributor only on the private snapshot container so it can persist research
without receiving account-wide write access.

Company-level research, hold, and pass decisions are stored separately at
`research/operator-selections-v1.json.gz` with the same owner-only API boundary
and conditional Blob-write protection. Generated proposal refreshes never
overwrite this decision store.

Databricks:

- `DATABRICKS_HOST`
- `DATABRICKS_HTTP_PATH` or `DATABRICKS_SQL_WAREHOUSE_ID`
- `DATABRICKS_CATALOG`
- `DATABRICKS_SCHEMA`
- `DATABRICKS_CLIENT_ID`
- `DATABRICKS_CLIENT_SECRET`

Development-only Databricks fallback:

- `DATABRICKS_TOKEN`
- `ALLOW_DATABRICKS_PAT_IN_DEV=true`

Production should use Databricks OAuth, not PAT fallback.

Anthropic/AH Analyst:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_MAX_TOKENS`
- `ANTHROPIC_TIMEOUT_MS` bounded per-attempt timeout; defaults to 35 seconds
- `ANTHROPIC_MAX_ATTEMPTS` bounded retry count from 1 to 3; defaults to 2
- `COPILOT_ASSISTANT_LABEL`
- `GOVERNED_REPORT_SYNTHESIS_ENABLED`; set `false` to force deterministic one-page report prose

Do not put private API keys in `VITE_*` variables.

Governed report delivery:

- `REPORT_EMAIL_WEBHOOK_URL`: HTTPS-only mail-delivery webhook
- `REPORT_EMAIL_WEBHOOK_SECRET`: Bearer secret checked by the webhook
- `REPORT_EMAIL_ALLOWED_DOMAINS`: comma-separated recipient-domain allowlist
- `REPORT_EMAIL_TIMEOUT_MS`: bounded from 2 to 30 seconds

All three delivery values must be valid before the workspace exposes **Email
to me**. The webhook receives `to`, `subject`, `html`, `filename`, `reportId`,
`audience`, `period`, and `idempotencyKey`. It must reject bad Bearer tokens,
send only to the supplied approved recipients, and deduplicate the
`Idempotency-Key` header.

Weekly briefing delivery:

- `CRON_SECRET`: required by `/api/reports/weekly`; Vercel supplies it to cron requests
- `WEEKLY_BRIEFING_EXECUTIVE_RECIPIENTS`
- `WEEKLY_BRIEFING_OPERATIONS_RECIPIENTS`
- `WEEKLY_BRIEFING_CLINICAL_RECIPIENTS`
- `WEEKLY_BRIEFING_COMMUNITY_RECIPIENTS_JSON`: recipients keyed by facility ID or exact community name
- `WEEKLY_BRIEFING_SCHEDULE_LABEL`: display-only operator label

The schedule itself lives in `vercel.json` and currently runs each Monday.
Plans without recipients are skipped. A failed audience is reported
independently. The cron endpoint returns `503` when any configured plan fails,
allowing a safe retry through idempotent delivery.

## Health Checks

Use these endpoints after deploy or publish from a signed-in platform session
or with an `Authorization: Bearer <access-token>` header. Preview and production
health endpoints are deliberately not public; an anonymous `401` confirms that
the delegated API boundary is fail-closed.

- `/api/platform/health`
- `/api/platform/snapshot-health`
- `/api/platform/snapshot-metadata`
- `/api/platform/analyst-qa`
- `/api/platform/analyst-traces`
- `/api/platform/bootstrap`
- `/api/integrations/pipeline/clinical/health`
- `/api/integrations/pipeline/clinical/census`
- `/api/integrations/pipeline/clinical/roster?limit=1`
- `/api/integrations/pipeline/clinical/medications/summary`
- `/api/communities/dashboard`
- `/api/communities/snapshot?facilityId=337`
- `/api/incidents`
- `/api/chat/claude/health`
- `/api/reports/status`

Interpretation:

- snapshot missing on bootstrap/community endpoints should be a controlled `503`
- snapshot stale should appear in metadata/Command Center, not silently hide
- `/api/incidents` should say whether it returned `live-databricks` or
  `snapshot-fallback`
- analyst QA warning means the app can still run, but at least one tested prompt
  path needs review
- Pipeline clinical health returns `503` for a stale, missing, QA-rejected, or
  incomplete snapshot. Data endpoints may preserve a stale last-known-good
  snapshot only when the response clearly carries stale freshness metadata.

Pipeline clinical integration:

- `PIPELINE_CLINICAL_API_SCOPE`: delegated Entra scope, normally `Pipeline.Clinical.Read`
- `PIPELINE_CLINICAL_API_ROLE`: service application role, normally `Pipeline.Clinical.Read.All`
- `PIPELINE_CLINICAL_SNAPSHOT_MAX_AGE_HOURS`: freshness target, defaults to 24
- `PIPELINE_CLINICAL_API_MAX_RESPONSE_BYTES`: per-response bound, defaults to 2 MB
- `PLATFORM_CLIENT_THUMBNAIL_MAX_BYTES`: private client-thumbnail bound, defaults to 2 MB
- `PLATFORM_CLIENT_DOCUMENT_MAX_BYTES`: private client-preview bound, defaults to 32 MB

Assign the Pipeline service principal the Alamo API application role and grant
tenant admin consent before enabling the Pipeline production adapter. Do not
copy ElderMark, Databricks, Azure snapshot, or Alamo server credentials into a
Pipeline browser variable.

## Common Operator Fixes

Snapshot/tool context is empty:

```text
Run tool_context_views -> analyst_context_qa -> snapshot_publish.
```

Entra login page blocks the app:

```text
Check VITE_ENTRA_CLIENT_ID, VITE_ENTRA_TENANT_ID, and confirm the Entra SPA redirect list contains the exact return address shown on the login page.
```

Databricks 401/secret errors:

```text
Use the client secret value, not the secret ID. Confirm service principal has Databricks/warehouse access.
```

Graph/email 401:

```text
This is separate from platform auth. Mail.Send app permission and mailbox eligibility must be configured.
```

Today's incidents not visible:

```text
Check latest incident detail date, rows dated today, snapshot generated time, and source feed freshness before changing UI.
```

## Vercel Routing

`vercel.json` rewrites nested API paths to single handler files and falls all
non-API routes back to `index.html`. This is why React deep links work even
though Vercel does not have a physical file per route.

It also schedules `/api/reports/weekly`. Changing the human-readable
`WEEKLY_BRIEFING_SCHEDULE_LABEL` does not change the cron; edit the UTC cron in
`vercel.json` when the actual run time changes.

## Security Notes

- Browser never calls Databricks or Claude directly.
- Browser sends a delegated Entra access token to every platform API request.
- Serverless API handlers validate token signature, issuer, audience, and scope before data access.
- When `ENTRA_API_REQUIRED_ROLE` is configured, handlers also require the assigned Entra app role.
- Server owns model/API keys and Databricks credentials.
- Frontend Entra variables are public configuration, not secrets.
- Generated docs should name environment variable keys but never preserve secret values.

### Licensing reports and update feed release — 2026-09-28

- source commits: `3686069` and `4bdacc5`, branch `codex/licensing-production-20260928`
- image tag: `alamo-platform:licensing-4bdacc5`
- image digest: `sha256:2cfacc47f400a787b501875ced690f71e4c6a62f43f59feeecdb4d8ec4a9e0fb`
- active revision: `alamo-platform-prod-web--licensing-4bdacc5`
- rollback digest: `sha256:d93329474498a735d53c18214034eeca777b0d272fe65eba930bc312ff613763`
- baseline: `20260928T211945Z-350926e2`, 93 reports across four communities

The protected `/licensing` page has a compact breadcrumb and Updates row,
one search box, and source-grounded report briefs. The page title and subtitle
were removed so reports begin higher on the screen. Community profiles link to
the corresponding Licensing collection. The final production browser asset is
`/assets/index-BGafwIFT.js`.

This release overlays the exact preceding production image with the browser
bundle, only the new Licensing server/shared modules, and three protected GET
routes patched into the production image's API handler. Existing Azure runtime,
Admissions integrations, authentication, environment, and data adapters remain
from that image. `scripts/prepare-licensing-release.mjs` builds the bounded
context and refreshes compressed static representations along with the originals.
Do not substitute the repository's whole API/server tree for the image runtime.

The serving bundle is private Azure Blob data at
`alamodatalake/alamo-platform-snapshots/licensing/library-v1.json`, read with the
existing managed identity. Immutable bundle versions and original source/SQLite
archives are kept under `licensing/versions/` and `licensing/evidence/`.
The publisher validates source hashes and uses conditional writes. Production
fails closed when cloud data cannot be read; it does not use local evidence as
an outage fallback. No new credentials or public storage permissions were added.

The existing Monday 9 a.m. Pacific Codex monitor runs
`node scripts/check-licensing-updates.mjs --publish` from the primary app checkout.
It publishes new reports and change notices to the live page. This is still a
local trigger requiring the Mac and Codex; Azure hosts the website and durable
published data, not the collector's schedule.

Verification: the full nonbrowser `check:ship:predeploy` gate passed all eight
stages, including `check:analyst`, dependency audit, regression replays, stress
checks, and production-configured build. Browser checks were performed through
CUA instead of the shell Playwright runner. The initial revision was rolled back
when signed-in search changed its URL but not its displayed results. The issue
was reproduced in the optimized build and corrected by making BrowserRouter
navigation synchronous (`useTransitions={false}`). TypeScript, Licensing,
Admissions access, California home contracts, and the resumed build gate passed
after that change. Optimized-browser search, report selection, clearing search,
and Back navigation passed before the final deployment.

Post-deployment verification confirmed Healthy/Running at 100% traffic, exact
browser asset identity, 4/4 public smoke probes, and 401/no-store for all three
unauthenticated Licensing endpoints. Signed-in production showed all 93 reports,
four results for the substantiated-medication/San Pablo query, source briefs,
the successful no-change Updates feed, the map and community Licensing link
(55 San Pablo reports), and the populated Admissions board. The compact layout
was visually verified; the local phone layout had no horizontal overflow.
