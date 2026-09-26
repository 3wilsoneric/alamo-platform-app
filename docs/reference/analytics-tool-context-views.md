# Analytics Tool Context Views

- purpose: define the Databricks gold views that feed AH Analyst tools and snapshot context
- status: implemented current-state contract
- owners: data platform, backend
- updated: 2026-07-22
- tags: databricks, ah-analyst, tools, snapshot, gold-views
- labels: implementation-contract, analytics-context
- related files:
  - [alamo-platform-app/databricks/notebooks/tool_context_views.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/tool_context_views.py)
  - [alamo-platform-app/databricks/notebooks/snapshot_publish.py](/Users/eric/CareEngineMain/alamo-platform-app/databricks/notebooks/snapshot_publish.py)
  - [alamo-platform-app/server/copilot-tools.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/copilot-tools.mjs)

## Purpose

AH Analyst should not rebuild durable operating facts from semi-raw rows on every prompt.

The Databricks notebook creates additive gold views that prepare repeatable slices for:

- monthly incidents by community and category
- current-month incident detail
- monthly census with prior month and delta
- resident profile rows
- resident incident summary
- medication refusal summary
- medication compliance monthly rows
- complete 90-day medication exception detail
- complete 90-day PRN administration and effectiveness detail
- current resident medication orders with dose, route, schedule, indication, and medication flags
- documentation status
- community operating summary
- tool context manifest with slice names, grains, row counts, periods, fields, and freshness

## Runtime Flow

1. `tool_context_views.py` creates or replaces `alamohealth.gold.v_tool_*` views.
2. `snapshot_publish.py` reads those views into `reportsSummary.toolContext`.
3. `reportsSummary.toolContext.tables` exposes normalized table-shaped slices for generic tools.
4. `reportsSummary.toolContext.manifest` exposes available grains, fields, row counts, date ranges, and freshness.
5. `server/copilot-tools.mjs` prefers `reportsSummary.toolContext` when present.
6. If the views have not been deployed yet, existing snapshot sections still work as fallback.

## Tool Context v8

The snapshot now keeps legacy friendly keys and adds a normalized table contract:

- `manifest`: slice metadata used to answer what data is available.
- `tables.community_operating_summary`: one row per community.
- `tables.incident_monthly_by_community_category`: community-month-category incident facts.
- `tables.incident_detail_current_month`: current month incident detail rows.
- `tables.resident_profile`: current resident profile rows.
- `tables.resident_incident_summary`: resident-level incident rollups.
- `tables.documentation_status`: resident-level documentation status.
- `tables.medication_refusal_summary`: medication refusal rollups.
- `tables.medication_compliance_monthly`: community-month medication compliance.
- `tables.mar_monthly_by_community_medication`: community-month-medication administrations and outcomes.
- `tables.mar_resident_summary`: current resident MAR compliance, refusal, and PRN rollups.
- `tables.mar_exception_detail_90d`: every governed not-given or materially late administration in the 90-day window.
- `tables.mar_prn_effectiveness_90d`: every governed PRN administration in the 90-day window, including reason, result, and follow-up status.
- `tables.mar_medication_orders_current`: current medication orders for resident profiles.

Resident-level MAR detail remains server-side. The client receives only the scoped answer and module rows produced by an authorized tool invocation.

The app now has two generic deterministic tools over this context:

- `slice_metric`: filters/groups/sorts incidents, census, medication refusals, medication compliance, documentation, age, and LOS.
- `compare_periods`: compares two requested periods for incidents, census, or medication compliance.

Specific tools still exist for important workflows, but new analytical prompts should first try to fit one of these generic tools before adding another bespoke tool.

## Deployment Note

In Databricks, import `tool_context_views.py` to:

`/Workspace/Shared/alamo-platform/tool_context_views`

Then run it before `snapshot_publish`. The checked-in workflow JSON now includes that dependency.
