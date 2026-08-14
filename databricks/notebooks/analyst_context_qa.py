# Databricks notebook source
# MAGIC %md
# MAGIC # analyst_context_qa
# MAGIC
# MAGIC Validates the analyst-facing gold views before the application snapshot is published.
# MAGIC The application language-routing suites remain in Node CI; this notebook gates the
# MAGIC Databricks data contracts that those tools depend on.

# COMMAND ----------

dbutils.widgets.text("catalog", "alamohealth")
dbutils.widgets.text("gold_schema", "gold")
dbutils.widgets.text("date_partition", "")

from calendar import monthrange
from datetime import date, datetime, timezone
from uuid import uuid4

from pyspark.sql import functions as F

catalog = (dbutils.widgets.get("catalog") or "alamohealth").strip()
gold_schema = (dbutils.widgets.get("gold_schema") or "gold").strip()
date_partition = (dbutils.widgets.get("date_partition") or "").strip()
target = f"{catalog}.{gold_schema}"
run_id = str(uuid4())
generated_at = datetime.now(timezone.utc)


def scalar(sql: str, key: str = "value"):
    row = spark.sql(sql).first()
    return row[key] if row is not None else None


def resolve_qa_as_of_date() -> date:
    try:
        row = spark.sql(
            f"""
            SELECT
              cast(max(snapshot_date) AS string) AS snapshot_date,
              max(month_bucket) AS month_bucket
            FROM {target}.v_census
            """
        ).first()
    except Exception as exc:
        raise ValueError(
            f"date_partition was not supplied and analyst_context_qa could not derive an as-of date from {target}.v_census"
        ) from exc

    if row and row["snapshot_date"]:
        return datetime.strptime(str(row["snapshot_date"])[:10], "%Y-%m-%d").date()
    if row and row["month_bucket"]:
        year, month = [int(part) for part in str(row["month_bucket"])[:7].split("-")]
        return date(year, month, monthrange(year, month)[1])

    raise ValueError(
        f"date_partition was not supplied and {target}.v_census has no snapshot_date or month_bucket to anchor analyst_context_qa"
    )


if date_partition:
    try:
        qa_as_of_date = datetime.strptime(date_partition, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("date_partition must be formatted as YYYY-MM-DD")
else:
    qa_as_of_date = resolve_qa_as_of_date()

QA_AS_OF_SQL = f"DATE '{qa_as_of_date.isoformat()}'"


checks = []


def add_check(check_id, domain, severity, passed, expected, actual, detail):
    checks.append(
        {
            "run_id": run_id,
            "generated_at": generated_at,
            "check_id": check_id,
            "domain": domain,
            "severity": severity,
            "status": "PASS" if passed else ("FAIL" if severity == "critical" else "WARN"),
            "expected": str(expected),
            "actual": str(actual),
            "detail": detail,
        }
    )


# COMMAND ----------

manifest_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_context_manifest") or 0)
resident_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_resident_profile") or 0)
census_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_census_monthly_by_community") or 0)
census_weekly_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_census_weekly_by_community") or 0)
weekly_census_latest_date = scalar(
    f"SELECT cast(max(census_date) AS string) AS value FROM {target}.v_tool_census_weekly_by_community"
)
weekly_census_contract_failures = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {target}.v_tool_census_weekly_by_community
        WHERE census_date <> week_end
           OR datediff(census_date, prior_census_date) <> 7
           OR census - census_7d_prior <> census_change_7d
        """
    )
    or 0
)
census_quality_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_census_data_quality") or 0)
resident_countability_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_resident_countability_audit") or 0)
non_countable_profile_count = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {target}.v_tool_resident_profile p
        JOIN {target}.v_tool_resident_countability_audit q
          ON p.Res_Number = q.Res_Number
         AND p.Facility = q.Facility
        WHERE coalesce(q.is_countable_resident, 1) = 0
        """
    )
    or 0
)
duplicate_profile_resident_count = int(
    scalar(
        f"""
        WITH duplicates AS (
          SELECT Facility, Res_Number, count(*) AS rows
          FROM {target}.v_tool_resident_profile
          GROUP BY Facility, Res_Number
          HAVING count(*) > 1
        )
        SELECT count(*) AS value FROM duplicates
        """
    )
    or 0
)
incident_monthly_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_incident_monthly_by_community_category") or 0)
detail_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_incident_detail_current_month") or 0)
history_detail_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_incident_detail_history") or 0)
history_aggregate_count = int(
    scalar(f"SELECT coalesce(sum(incident_count), 0) AS value FROM {target}.v_tool_incident_monthly_by_community_category") or 0
)
enriched_resident_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_resident_profile_enriched") or 0)
resident_incident_rollup_count = int(
    scalar(f"SELECT coalesce(sum(incident_count_all_time), 0) AS value FROM {target}.v_tool_resident_incident_summary") or 0
)
resident_episode_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_resident_episode_history") or 0)
non_countable_episode_count = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {target}.v_tool_resident_episode_history e
        JOIN {target}.v_tool_resident_countability_audit q
          ON e.Res_Number = q.Res_Number
         AND e.Facility = q.Facility
        WHERE coalesce(q.is_countable_resident, 1) = 0
        """
    )
    or 0
)
resident_flow_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_resident_flow_weekly_by_community") or 0)
resident_flow_week_gap_count = int(
    scalar(
        f"""
        WITH coverage AS (
          SELECT
            Facility,
            min(week_start) AS min_week,
            max(week_start) AS max_week,
            count(*) AS actual_weeks
          FROM {target}.v_tool_resident_flow_weekly_by_community
          GROUP BY Facility
        )
        SELECT count(*) AS value
        FROM coverage
        WHERE actual_weeks <> cast(floor(datediff(max_week, min_week) / 7) + 1 AS bigint)
        """
    )
    or 0
)
resident_flow_monthly_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_resident_flow_monthly_by_community") or 0)
resident_unit_history_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_resident_unit_history") or 0)
services_provided_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_services_provided") or 0)
assessment_summary_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_assessment_summary") or 0)
notes_summary_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_notes_summary") or 0)
latest_incident_month = scalar(
    f"SELECT max(month_bucket) AS value FROM {target}.v_tool_incident_monthly_by_community_category"
)
aggregate_latest_count = int(
    scalar(
        f"""
        SELECT coalesce(sum(incident_count), 0) AS value
        FROM {target}.v_tool_incident_monthly_by_community_category
        WHERE month_bucket = '{latest_incident_month}'
        """
    )
    or 0
)
latest_incident_date = scalar(
    f"SELECT max(Incident_Date_parsed) AS value FROM {target}.v_tool_incident_detail_current_month"
)
latest_census_month = scalar(
    f"SELECT max(month_bucket) AS value FROM {target}.v_tool_census_monthly_by_community"
)
census_min_month = scalar(
    f"SELECT min(month_bucket) AS value FROM {target}.v_tool_census_monthly_by_community"
)
resident_episode_min_month = scalar(
    f"SELECT date_format(min(admit_date), 'yyyy-MM') AS value FROM {target}.v_tool_resident_episode_history"
)
latest_census_communities = int(
    scalar(
        f"""
        SELECT count(DISTINCT Facility) AS value
        FROM {target}.v_tool_census_monthly_by_community
        WHERE month_bucket = '{latest_census_month}'
        """
    )
    or 0
)
mar_quality = spark.table(f"{target}.v_mar_data_quality").first().asDict(recursive=True)
mar_resident_summary_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_mar_resident_summary") or 0)
mar_exception_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_mar_exception_detail_90d") or 0)
mar_prn_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_mar_prn_effectiveness_90d") or 0)
mar_medication_order_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_mar_medication_orders_current") or 0)
mar_monthly_scheduled = int(
    scalar(f"SELECT coalesce(sum(scheduled_count), 0) AS value FROM {target}.v_tool_mar_monthly_by_community_medication") or 0
)
mar_detail_scheduled = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {target}.v_mar_administration_detail
        WHERE is_prn = 0
          AND month_bucket >= date_format(add_months({QA_AS_OF_SQL}, -18), 'yyyy-MM')
        """
    )
    or 0
)
mar_age_days = int(
    scalar(f"SELECT datediff({QA_AS_OF_SQL}, max(administration_date)) AS value FROM {target}.v_mar_administration_detail") or 0
)

add_check("manifest-present", "context", "critical", manifest_count >= 21, ">=21 slices", manifest_count, "Tool context manifest includes the governed resident, incident, census, and MAR slices.")
add_check("resident-profile-present", "residents", "critical", resident_count > 0, ">0 rows", resident_count, "Current resident profile rows are available.")
add_check("census-history-present", "census", "critical", census_count > 0, ">0 rows", census_count, "Monthly census history is available.")
add_check("census-weekly-present", "census", "critical", census_weekly_count > 0, ">0 rows", census_weekly_count, "Weekly census history is available.")
add_check(
    "census-weekly-through-as-of",
    "census",
    "critical",
    weekly_census_latest_date == qa_as_of_date.isoformat(),
    qa_as_of_date.isoformat(),
    weekly_census_latest_date,
    "Weekly census must end on the governed source date, including a partial calendar week.",
)
add_check(
    "census-weekly-exact-seven-day-change",
    "census",
    "critical",
    weekly_census_contract_failures == 0,
    "0 invalid rows",
    weekly_census_contract_failures,
    "Every weekly census delta must compare its observation date with exactly seven days earlier and reconcile arithmetically.",
)
add_check("census-quality-present", "census", "critical", census_quality_count > 0, ">0 rows", census_quality_count, "Census data-quality rows are available.")
add_check("resident-countability-audit-present", "census", "critical", resident_countability_count > 0, ">0 rows", resident_countability_count, "Resident countability audit rows are available.")
add_check("resident-profile-countable-only", "census", "critical", non_countable_profile_count == 0, "0 rows", non_countable_profile_count, "Current resident profile excludes fake/test/non-countable residents.")
add_check("resident-profile-no-duplicates", "census", "critical", duplicate_profile_resident_count == 0, "0 duplicate facility/resident rows", duplicate_profile_resident_count, "Current resident profile has one row per facility/resident.")
add_check(
    "census-history-covers-resident-episodes",
    "census",
    "warning",
    bool(census_min_month and resident_episode_min_month and census_min_month <= resident_episode_min_month),
    f"<= first episode month {resident_episode_min_month}",
    census_min_month,
    "Monthly census should cover the earliest loaded resident episode when full census history is enabled.",
)
add_check("incident-monthly-present", "incidents", "critical", incident_monthly_count > 0, ">0 rows", incident_monthly_count, "Monthly incident category rows are available.")
add_check("incident-detail-present", "incidents", "critical", detail_count > 0, ">0 rows", detail_count, "Current-month incident detail rows are available.")
add_check("incident-history-present", "incidents", "critical", history_detail_count >= detail_count, f">={detail_count} rows", history_detail_count, "Historical incident detail includes the current month.")
add_check("incident-history-aggregate-match", "incidents", "critical", history_detail_count == history_aggregate_count, history_aggregate_count, history_detail_count, "Full historical incident detail reconciles to monthly category aggregates.")
add_check("resident-enrichment-complete", "residents", "critical", enriched_resident_count == resident_count, resident_count, enriched_resident_count, "Every current resident has an enriched profile row.")
add_check("resident-incident-rollup-match", "residents", "critical", resident_incident_rollup_count == history_detail_count, history_detail_count, resident_incident_rollup_count, "Resident all-time incident rollups reconcile to historical incident detail.")
add_check("resident-episode-history-present", "residents", "critical", resident_episode_count > 0, ">0 rows", resident_episode_count, "Resident admission/discharge episode history is available.")
add_check("resident-episodes-countable-only", "residents", "critical", non_countable_episode_count == 0, "0 rows", non_countable_episode_count, "Historical resident episodes exclude fake/test/non-countable residents.")
add_check("resident-flow-weekly-present", "residents", "critical", resident_flow_count > 0, ">0 rows", resident_flow_count, "Weekly resident intake/discharge movement rows are available.")
add_check(
    "resident-flow-weekly-contiguous",
    "residents",
    "critical",
    resident_flow_week_gap_count == 0,
    "0 facilities with missing weeks",
    resident_flow_week_gap_count,
    "Weekly resident flow emits explicit zero rows for quiet weeks instead of omitting them.",
)
add_check("resident-flow-monthly-present", "residents", "critical", resident_flow_monthly_count > 0, ">0 rows", resident_flow_monthly_count, "Monthly resident intake/discharge movement rows are available.")
add_check("resident-unit-history-present", "residents", "warning", resident_unit_history_count > 0, ">0 rows", resident_unit_history_count, "Resident unit history is available when ElderMark provides it.")
add_check("services-provided-present", "services", "warning", services_provided_count > 0, ">0 rows", services_provided_count, "Services-provided detail is available when ElderMark provides it.")
add_check("assessment-summary-present", "assessments", "warning", assessment_summary_count > 0, ">0 rows", assessment_summary_count, "Assessment detail is available when ElderMark provides it.")
add_check("notes-summary-present", "notes", "warning", notes_summary_count > 0, ">0 rows", notes_summary_count, "Resident note detail is available when ElderMark provides it.")
add_check("mar-administration-ids-unique", "medications", "critical", mar_quality["administration_rows"] == mar_quality["distinct_administration_ids"], mar_quality["administration_rows"], mar_quality["distinct_administration_ids"], "MAR administration IDs are unique.")
add_check("mar-resident-summary-complete", "medications", "warning", mar_resident_summary_count == resident_count, resident_count, mar_resident_summary_count, "MAR resident summary coverage is tracked, but a coverage mismatch should not block census or incident snapshot publication.")
add_check("mar-current-orders-present", "medications", "critical", mar_medication_order_count > 0, ">0 rows", mar_medication_order_count, "Current medication orders are available for resident medication profiles.")
add_check("mar-monthly-reconciles", "medications", "warning", mar_monthly_scheduled == mar_detail_scheduled, mar_detail_scheduled, mar_monthly_scheduled, "MAR monthly scheduled counts reconcile to governed non-PRN administration detail.")
add_check("mar-prn-present", "medications", "warning", mar_prn_count > 0, ">0 rows", mar_prn_count, "Recent PRN administrations and effectiveness follow-up rows are available when source data provides them.")
add_check("mar-exceptions-present", "medications", "warning", mar_exception_count > 0, ">0 rows", mar_exception_count, "Bounded 90-day medication exception detail is available.")
add_check("mar-unknown-outcomes", "medications", "warning", float(mar_quality["unknown_pct"] or 0) <= 2, "<=2%", f"{mar_quality['unknown_pct']}%", "Unknown MAR outcomes remain below the operational review threshold.")
add_check("mar-freshness", "medications", "warning", mar_age_days <= 3, "<=3 days old", f"{mar_age_days} days old", "Latest governed MAR administration date is current.")
add_check(
    "incident-detail-aggregate-match",
    "incidents",
    "critical",
    detail_count == aggregate_latest_count,
    aggregate_latest_count,
    detail_count,
    f"Detail rows must equal the aggregate incident total for {latest_incident_month}.",
)
add_check(
    "latest-census-community-coverage",
    "census",
    "warning",
    latest_census_communities >= 5,
    ">=5 communities",
    latest_census_communities,
    f"Community coverage in latest census month {latest_census_month}.",
)
incident_age_days = int(
    scalar(
        f"SELECT datediff({QA_AS_OF_SQL}, max(Incident_Date_parsed)) AS value FROM {target}.v_tool_incident_detail_current_month"
    )
    or 0
)
add_check(
    "incident-detail-freshness",
    "incidents",
    "warning",
    incident_age_days <= 3,
    "<=3 days old",
    f"{incident_age_days} days old",
    f"Latest loaded incident date is {latest_incident_date}.",
)

# COMMAND ----------

qa_df = spark.createDataFrame(checks)
qa_table = f"{target}.tool_context_qa_runs"
qa_df.write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(qa_table)

spark.sql(
    f"""
    CREATE OR REPLACE VIEW {target}.v_tool_context_qa_latest AS
    SELECT run_id, generated_at, check_id, domain, severity, status, expected, actual, detail
    FROM {qa_table}
    WHERE generated_at = (SELECT max(generated_at) FROM {qa_table})
    """
)

for check in checks:
    print(f"{check['status']}: {check['check_id']} · expected {check['expected']} · actual {check['actual']}")

context_counts = {
    "manifest": manifest_count,
    "census_monthly": census_count,
    "census_weekly": census_weekly_count,
    "census_quality": census_quality_count,
    "resident_countability": resident_countability_count,
    "non_countable_profile_rows": non_countable_profile_count,
    "duplicate_profile_residents": duplicate_profile_resident_count,
    "resident_episode_history": resident_episode_count,
    "non_countable_episode_rows": non_countable_episode_count,
    "resident_flow_weekly": resident_flow_count,
    "resident_flow_monthly": resident_flow_monthly_count,
    "incident_detail_history": history_detail_count,
    "mar_resident_summary": mar_resident_summary_count,
    "mar_current_medication_orders": mar_medication_order_count,
    "mar_prn_effectiveness_90d": mar_prn_count,
    "mar_exception_detail_90d": mar_exception_count,
}
print(f"ANALYST_CONTEXT_COUNTS={context_counts}")

critical_failures = [check for check in checks if check["status"] == "FAIL"]
if critical_failures:
    failed_ids = ", ".join(check["check_id"] for check in critical_failures)
    raise ValueError(f"Analyst context QA failed: {failed_ids}")

print(f"analyst_context_qa completed: {sum(check['status'] == 'PASS' for check in checks)}/{len(checks)} checks passed")
