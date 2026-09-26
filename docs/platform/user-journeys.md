# Operator User Journeys

- purpose: name the real ways operators use Alamo Platform and bind those journeys to testable surfaces
- status: authoritative current-state reference
- owners: product, engineering, QA
- updated: 2026-07-18
- tags: product, journeys, analyst, qa, surfaces
- labels: platform-handbook, current-state
- related files:
  - [product-surfaces.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/product-surfaces.md)
  - [analyst-system.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/analyst-system.md)
  - [testing-quality.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/testing-quality.md)
  - [scripts/user-journey-scenarios.json](/Users/eric/CareEngineMain/alamo-platform-app/scripts/user-journey-scenarios.json)
  - [scripts/check-user-journeys.mjs](/Users/eric/CareEngineMain/alamo-platform-app/scripts/check-user-journeys.mjs)
  - [scripts/check-browser-journey-fuzz.mjs](/Users/eric/CareEngineMain/alamo-platform-app/scripts/check-browser-journey-fuzz.mjs)

## Product Thesis

Users should be able to use the platform in two safe ways:

- Ask a question and get a direct answer with the right data surface attached.
- Press a prepared surface and use the app like a vertical website inside the chat canvas.

The system should stay narrow and reliable. Most common work should resolve
through deterministic tools and prepared modules. AH Analyst can synthesize, but
the tool layer owns period, scope, grain, rows, validation, and exports.

## Journey Map

| Journey | Why someone uses it | Primary surfaces | Expected behavior |
| --- | --- | --- | --- |
| Quick Resident Lookup | Identify one client fast and see the profile, unit, community, incidents, and available meds/docs signals. | Resident Search, Resident Profile | Exact match opens a profile card. No-match gives a safe roster-search recovery, not a random resident list. |
| Community Pulse Check | Ask "How is San Pablo?" or drill into census, incident, diagnosis, and length-of-stay context. | Community Profile, Census Trend, Incident Breakdown, Diagnosis Mix, Length Of Stay Mix | Gives a compact current read first, then one focused module. Community names are always names, not facility IDs. |
| Incident Triage | Understand what happened, who is involved, and whether the feed is current. | Incident Center, Incident Breakdown, Incident Detail List, Incident Freshness | Counts use the right grain: people means unique residents, incidents means event rows. Freshness questions explain latest loaded dates. |
| Trend And Movement Review | Compare periods and identify movers without speculative executive commentary. | Census Movement, Census Trend, Incident Category Comparison, Incident Rate Change | Uses verified periods, direct calculations, readable comparison tables, and no substituted months. |
| Exact Rows And Export | Pull underlying detail rows for audit, review, or offline follow-up. | Detail List, CSV Artifact, Preview Table | Chat previews a bounded table; the CSV preserves the complete exact row set. |
| Data Trust And Recovery | Understand missing, stale, unsupported, or ambiguous data. | Data Availability, Clarification, Closest Valid Slice | Fails closed, names what is loaded, and offers the nearest valid rerun or surface. |
| Medication Signal Review | Check med compliance and refusal signals when MAR-derived context is loaded. | Medication Profile, Medication Compliance, Medication Refusals | Keeps community context across follow-ups and labels legacy versus MAR-backed rows clearly. |
| Surface-Only Use | Use prepared modules without asking analytical questions. | Resident Search, Incident Center, Community Detail | "Open resident search" or "open Incident Center" surfaces the module directly with minimal chatter. |
| Operating Snapshot | Get a fast portfolio-level read. | Operating Snapshot, Communities Overview, Incident Center | Returns one compact table and only the most useful next surfaces. |

## Scenario Types

Quick lookups:

- "show Shannon Romero resident profile"
- "resident search"
- "how many people went AWOL in May 2026"

Multi-step investigations:

- "List every AWOL incident from May through June by community, including resident name, date, incident type, and description"
- "do that for April now"
- "now San Pablo"
- "just totals"
- "How is San Pablo?" -> census trend -> incidents by category -> length of stay -> incident freshness
- resident profile -> resident incident history -> resident community census trend -> resident community incident categories

Surface-only usage:

- "open the incident center module"
- "show San Pablo resident search"
- "show me the resident search module"

Trust and recovery:

- "why are today's incidents not showing up"
- "what data periods are available for incident detail?"
- "give me the top category of each community in incidents November of last year"

Population and community review:

- "How is San Pablo?"
- "show San Pablo diagnosis mix"
- "show San Pablo length of stay mix"
- "show santa clartia censsus trend"

## QA Loop

Run:

```bash
npm run check:user-journeys
npm run check:user-journey-stress
npm run check:user-journey-fuzz
npm run check:user-missions
npm run check:browser-missions
npm run check:browser-surfaces
npm run check:browser-journey-fuzz
```

The runner executes `scripts/user-journey-scenarios.json`, expands prompt
variants, preserves multi-turn session state, scores each turn, and writes:

```text
generated/user-journey-qa/latest.json
```

The stress runner executes a longer app-usage simulation:

- 50 surface-opening turns.
- 25 analytical questions in one preserved thread.
- 2 fresh-session checks after the long thread.

It writes:

```text
generated/user-journey-stress/latest.json
```

The fuzz runner is the seeded Monte Carlo-style layer. It generates a
repeatable mix of surface openings, historical census asks, incident slices,
people-versus-event AWOL counts, typo recovery, resident lookup/recovery,
medication signal prompts, comparisons, and unsupported-period requests. It
uses deterministic randomness so a failure can be replayed with the same seed:

```bash
npm run check:user-journey-fuzz
USER_JOURNEY_FUZZ_SEED=triage-1 USER_JOURNEY_FUZZ_TURNS=500 npm run check:user-journey-fuzz
```

It writes:

```text
generated/user-journey-fuzz/latest.json
```

The mission runner is the qualitative "mystery shopper" layer. It starts with
an end goal, runs a multi-turn session, then scores the whole experience across
accuracy, thread persistence, surface usefulness, readability/friction, and
speed. It writes:

```text
generated/user-mission-qa/latest.json
```

The browser mission runner performs the same kind of judgment against the real
React workspace. It verifies that the answer appears in the canvas, prepared
modules render, the sticky composer stays usable, snap-to-message behavior
keeps the newest turn in focus, and no API or browser console failures happen
while the journey runs. It writes:

```text
generated/browser-mission-qa/latest.json
generated/browser-mission-qa/screenshots/*.png
```

The browser surface runner is the narrower prepared-surface and visual hygiene
gate. It opens Communities Overview, Incident Center, Resident Search, focused
community modules, Command Center, Glossary, and common
generated visual answers. It catches hidden loaders, dark-mode regressions,
raw facility IDs, stale community names, missing chart/table values, horizontal
overflow, and lost composer visibility. It writes:

```text
generated/browser-surface-qa/latest.json
generated/browser-surface-qa/screenshots/*.png
```

The browser journey fuzz runner is the seeded end-to-end UI fuzz layer. It
randomly samples named operator journeys, runs them through the real React chat
workspace, and checks answer text, module surfacing, thread follow-ups,
snap-to-message positioning, sticky composer visibility, API failures, and
browser console failures. It also verifies that the browser harness is pointed
at the expected Alamo app/API pair and that deterministic journeys do not
silently fall through to analyst escalation text. It is replayable by seed:

```bash
npm run check:browser-journey-fuzz
BROWSER_JOURNEY_FUZZ_SEED=incident-ui BROWSER_JOURNEY_FUZZ_SESSIONS=20 npm run check:browser-journey-fuzz
```

It writes:

```text
generated/browser-journey-fuzz/latest.json
generated/browser-journey-fuzz/screenshots/*.png
generated/browser-journey-fuzz/failures/*.json
```

Use the report recursively:

1. Find weak journeys, not only weak prompts.
2. Decide whether the issue is intent, data scope, answer wording, module display, or recovery.
3. Fix the shared runtime layer instead of adding one-off prompt patches.
4. Add another journey scenario only when it represents a new operator behavior.

## Failure Smells

- The answer substitutes a nearby month instead of saying the requested period is not loaded.
- "People" and "incidents" use the same count.
- A resident no-match opens a generic longest-stay list.
- A page/module request becomes an analytical answer.
- A broad detail-list request renders hundreds of rows directly in chat.
- The first sentence is source metadata instead of a direct answer.
- A visual exposes facility IDs or stale names.
- A follow-up such as "do that for April" forgets the previous frame.
