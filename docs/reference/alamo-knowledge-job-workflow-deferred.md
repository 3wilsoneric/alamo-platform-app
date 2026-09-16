# Alamo Knowledge Hub + Research Jobs — Deferred Expansion

- purpose: preserve the migrated Atlas Knowledge Hub and market-research atlas while defining the connected research-job expansion for a later build
- status: operational Knowledge Hub deployed; research-job expansion deferred
- owners: Eric Wilson
- updated: 2026-09-03
- tags: knowledge, research-jobs, workflow, analyst, evidence, deferred
- labels: platform-reference, deferred-product-direction
- source context:
  - `/Users/eric/atlas-knowledge-hub`
  - Behavioral Health Atlas collection-layer engineering handoff

## Scope Correction

The source product is `/Users/eric/atlas-knowledge-hub`: the operational
company-brain application containing medication and safety SOPs, policies,
forms, training, documents, linked knowledge notes, plain-language guidance,
and guided procedure walkthroughs. It is not the 50-state behavioral-health
research dataset.

That operational Knowledge Hub has now been migrated into the private Alamo
`/knowledge` surface, restyled for Alamo, and served through the same protected
platform API and Azure runtime. The 50-state research collection remains
available beside it as **Market research atlas**.

This document defers only the future Research Jobs and agent-orchestration
layer. It does not defer, replace, or narrow the operational Knowledge Hub.

## Product Direction

The operational Knowledge Hub and searchable market-research atlas are both
permanent, first-class parts of the Alamo Platform. Keep their records, search,
filters, detail views, sources, workflows, and owner-only access.

Research Jobs will become a connected production workflow that creates,
reviews, and publishes new knowledge into the appropriate Hub collection.
Jobs supplement the operational Hub and research atlas; they replace neither.

The connected operating model is:

```text
Create research job
  -> define brief and deliverable
  -> build the research plan
  -> collect permitted sources
  -> extract source-linked evidence
  -> synthesize an overview
  -> human review
  -> publish approved output to the appropriate Knowledge Hub collection
```

The Hub and market atlas must remain independently useful for direct search,
browsing, and guided SOP execution. Users do not need to enter a research job
to find existing knowledge or run an operational walkthrough.

## Intended Interface

`/knowledge` should continue to open on the operational Knowledge Hub. The
market-research atlas remains its adjacent research collection. A future
**Research jobs** entry, tab, or workspace should be added without replacing
or reducing either deployed experience.

The deployed Knowledge Hub retains:

- plain-language guidance and quick operational actions
- medication, crisis, safety, and administrative SOPs
- step-by-step walkthroughs with working notes and resumable progress
- policies, forms, training, documents, and linked knowledge-studio notes

The market-research atlas retains:

- the current searchable state, demand, buyer, opportunity, source, document,
  assertion, and note records
- search, filters, result counts, record details, and source provenance
- a direct route for exploring the company knowledge base without starting a
  workflow

Research Jobs adds:

- job queue with active, awaiting-review, paused, and completed work
- **New research job** intake for objective, scope, priority, questions, and
  expected deliverable
- job workspace showing current stage, stage owner, research activity, linked
  evidence, draft output, blockers, and review state
- explicit controls to pause, resume, advance, return for more research, and
  approve for publication
- activity history so the work can be resumed without losing context
- links between each job, its supporting evidence, and the Atlas records it
  creates or updates

The interface uses Alamo Platform branding and interaction patterns rather than
running the old Next.js frontend as a separate product. The source knowledge
model and workflows remain recognizable inside the Alamo shell.

## Workflow Roles

The **Analyst** is the overview and coordination agent for each job. It owns the
brief, research plan, synthesis, status summary, and final handoff.

Specialist roles sit underneath the Analyst and are assigned by workflow stage:

- **Source Scout** — locate and archive approved public sources
- **Evidence Analyst** — extract source-linked facts and identify conflicts
- future domain specialists — bounded to the job and its permitted sources
- **Owner** — approve, reject, or return findings before publication
- **Platform** — publish only approved outputs into the company knowledge base

These are orchestration slots, not permission for autonomous research yet. The
research skills and agent harness remain a later phase.

## Persistence Model

Development should remain local-first. Production jobs must persist inside the
existing Alamo Azure footprint, not in a separate SaaS product.

The future job record should preserve:

- job ID, title, objective, scope, priority, status, and current stage
- ordered workflow stages and responsible role
- questions, tasks, blockers, and activity events
- collected documents and immutable source references
- proposed facts and conflicts
- draft synthesis and deliverable artifacts
- reviewer decisions and publication links
- timestamps and revision/optimistic-concurrency metadata

The existing knowledge catalog and its current 101 maintained records remain a
first-class corpus. They may optionally be associated with a migrated
foundation job for lineage, but their visibility or usefulness must not depend
on that migration.

## Governance Invariants

- discovery is not confirmation
- extraction is not a canonical update
- only human-approved assertions become company knowledge
- every material claim retains its document/source provenance
- capacity qualifiers such as licensed, staffed, funded, census, and waitlist
  must remain distinct
- the surface and every mutation endpoint stay owner-only until access is
  deliberately expanded
- no PHI or resident-level operational data enters this public-source research
  workflow
- no autonomous crawler, agent swarm, or research skill ships as part of the
  first job-workflow implementation

## Recommended Research-Jobs Build Order

1. Add research-job contracts and a local JSON repository with deterministic
   stage transitions and activity history.
2. Add durable Azure job persistence in a dedicated knowledge container using
   the platform managed identity and least-privilege write access.
3. Add the job queue, intake, and job workspace alongside the existing
   `/knowledge` Hub; preserve both deployed collections as primary surfaces and
   add clear navigation between records and their originating jobs.
4. Add human review and publish controls that can only promote approved facts.
5. Attach existing 50-state research to a migrated foundation job.
6. Add Analyst coordination and specialist research skills only after the
   workflow, evidence, and review contracts are stable.

## Current Deployed State

The owner-only `/knowledge` page contains the migrated operational Knowledge
Hub—6 SOPs with 37 guided steps, 12 policies, 12 documents/forms, 15 training
items, 5 linked knowledge files, and 8 quick actions—and the preserved
101-record market-research atlas. The deferred work adds Research Jobs and
agent orchestration; it does not replace, cancel, or shrink either collection.
