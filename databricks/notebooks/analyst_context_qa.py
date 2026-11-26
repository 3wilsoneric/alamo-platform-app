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
# auto = write the old-vs-new census reconciliation report only when no prior
# report exists (first run of the episode-based census); always | never.
dbutils.widgets.text("census_reconciliation_report", "auto")

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
resident_admit_date_failures = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {target}.v_tool_resident_profile p
        WHERE try_cast(p.Admit_Date AS date) IS NULL
           OR p.Admit_Date NOT RLIKE '^\\\\d{{4}}-\\\\d{{2}}-\\\\d{{2}}$'
        """
    )
    or 0
)
current_resident_county_count = int(
    scalar(f"SELECT coalesce(sum(resident_count), 0) AS value FROM {target}.v_tool_current_resident_county_by_community") or 0
)
current_resident_county_reconciliation_failures = int(
    scalar(
        f"""
        WITH profile_counts AS (
          SELECT Facility, count(*) AS residents
          FROM {target}.v_tool_resident_profile
          GROUP BY Facility
        ),
        county_counts AS (
          SELECT Facility, sum(resident_count) AS residents
          FROM {target}.v_tool_current_resident_county_by_community
          GROUP BY Facility
        )
        SELECT count(*) AS value
        FROM profile_counts p
        FULL OUTER JOIN county_counts c ON p.Facility = c.Facility
        WHERE coalesce(p.residents, -1) <> coalesce(c.residents, -1)
        """
    )
    or 0
)
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
# Owner-approved census: every published census must equal the canonical
# daily census (v_tool_census_daily_by_community) on the same date.
census_daily_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_census_daily_by_community") or 0)
census_monthly_vs_daily_failures = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {target}.v_tool_census_monthly_by_community m
        LEFT JOIN {target}.v_tool_census_daily_by_community d
          ON d.Facility = m.Facility
         AND d.census_date = m.snapshot_date
        WHERE d.census_date IS NULL
           OR d.is_month_snapshot_date <> 1
           OR NOT (m.census <=> d.census)
        """
    )
    or 0
)
census_average_daily_failures = int(
    scalar(
        f"""
        WITH expected AS (
          SELECT Facility, month_bucket, round(avg(cast(census AS double)), 2) AS average_daily_census
          FROM {target}.v_tool_census_daily_by_community
          WHERE census_date >= history_start_date
          GROUP BY Facility, month_bucket
        )
        SELECT count(*) AS value
        FROM {target}.v_tool_census_monthly_by_community m
        LEFT JOIN expected e
          ON e.Facility = m.Facility
         AND e.month_bucket = m.month_bucket
        WHERE NOT (m.average_daily_census <=> e.average_daily_census)
        """
    )
    or 0
)
# gold.v_census (silver census_snapshot) feeds the dashboards' monthly census.
census_published_monthly_vs_daily_failures = int(
    scalar(
        f"""
        WITH published AS (
          SELECT cast(Facility AS string) AS Facility, month_bucket, cast(census AS int) AS census
          FROM {target}.v_census
        ),
        daily AS (
          SELECT Facility, month_bucket, census
          FROM {target}.v_tool_census_daily_by_community
          WHERE is_month_snapshot_date = 1
            AND census_date >= history_start_date
        )
        SELECT count(*) AS value
        FROM published p
        FULL OUTER JOIN daily d
          ON p.Facility = d.Facility
         AND p.month_bucket = d.month_bucket
        WHERE coalesce(p.month_bucket, d.month_bucket) >= (
            SELECT date_format(min(history_start_date), 'yyyy-MM') FROM {target}.v_tool_census_daily_by_community
          )
          AND coalesce(p.month_bucket, d.month_bucket) <= date_format({QA_AS_OF_SQL}, 'yyyy-MM')
          AND coalesce(p.census, 0) <> coalesce(d.census, 0)
        """
    )
    or 0
)
census_weekly_vs_daily_failures = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {target}.v_tool_census_weekly_by_community w
        LEFT JOIN {target}.v_tool_census_daily_by_community d
          ON d.Facility = w.Facility
         AND d.census_date = w.census_date
        LEFT JOIN {target}.v_tool_census_daily_by_community p
          ON p.Facility = w.Facility
         AND p.census_date = w.prior_census_date
        WHERE NOT (w.census <=> d.census)
           OR NOT (w.census_7d_prior <=> p.census)
        """
    )
    or 0
)

census_reconciliation_mode = (dbutils.widgets.get("census_reconciliation_report") or "auto").strip().lower()
census_reconciliation_table = f"{target}.census_definition_reconciliation"
census_reconciliation_sql = f"""
    WITH snapshot_dates AS (
      SELECT DISTINCT month_bucket, census_date AS snapshot_date
      FROM {target}.v_tool_census_daily_by_community
      WHERE is_month_snapshot_date = 1
        AND census_date >= history_start_date
    ),
    resident_table_census AS (
      SELECT cast(r.Facility AS string) AS Facility, s.month_bucket, s.snapshot_date,
        count(DISTINCT cast(r.Res_Number AS string)) AS resident_table_census
      FROM snapshot_dates s
      JOIN {catalog}.silver.resident r
        ON coalesce(r.is_countable_resident, 0) = 1
       AND r.Admit_Date_dt <= s.snapshot_date
       AND (r.Discharge_Date_dt IS NULL OR r.Discharge_Date_dt > s.snapshot_date)
      GROUP BY cast(r.Facility AS string), s.month_bucket, s.snapshot_date
    ),
    episode_census AS (
      SELECT Facility, month_bucket, census_date AS snapshot_date, census AS episode_daily_census
      FROM {target}.v_tool_census_daily_by_community
      WHERE is_month_snapshot_date = 1
        AND census_date >= history_start_date
    )
    SELECT
      '{run_id}' AS run_id,
      current_timestamp() AS generated_at,
      coalesce(e.Facility, r.Facility) AS Facility,
      coalesce(e.month_bucket, r.month_bucket) AS month_bucket,
      coalesce(e.snapshot_date, r.snapshot_date) AS snapshot_date,
      coalesce(r.resident_table_census, 0) AS old_resident_table_census,
      coalesce(e.episode_daily_census, 0) AS new_episode_daily_census,
      coalesce(e.episode_daily_census, 0) - coalesce(r.resident_table_census, 0) AS difference
    FROM episode_census e
    FULL OUTER JOIN resident_table_census r
      ON e.Facility = r.Facility
     AND e.month_bucket = r.month_bucket
"""
census_reconciliation_df = spark.sql(census_reconciliation_sql)
census_reconciliation_differences = census_reconciliation_df.filter(F.col("difference") != 0).count()
prior_reconciliation_rows = 0
try:
    prior_reconciliation_rows = int(scalar(f"SELECT count(*) AS value FROM {census_reconciliation_table}") or 0)
except Exception:
    prior_reconciliation_rows = 0
if census_reconciliation_mode == "always" or (census_reconciliation_mode == "auto" and prior_reconciliation_rows == 0):
    census_reconciliation_df.write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(census_reconciliation_table)
    print(f"CENSUS_RECONCILIATION_REPORT written to {census_reconciliation_table} (run_id={run_id})")
    display(census_reconciliation_df.filter(F.col("difference") != 0).orderBy(F.desc("month_bucket"), "Facility"))

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
source_service_archive_count = int(scalar(f"SELECT count(*) AS value FROM {catalog}.silver.service_archive WHERE try_to_timestamp(Service_Month, 'd!M!yyyy') IS NOT NULL") or 0)
non_archive_services_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_services_provided WHERE source_table <> 'service_archive' OR day(service_date) <> 1") or 0)
service_measure_mismatches = int(scalar(f"""
  WITH expected AS (
    SELECT Facility, count(*) records, count(Minutes_of_Service) minutes_known,
      count(Visits) visits_known, sum(try_cast(Minutes_of_Service as double)) minutes,
      sum(try_cast(Visits as double)) visits
    FROM {catalog}.silver.service_archive
    WHERE try_to_timestamp(Service_Month, 'd!M!yyyy') IS NOT NULL GROUP BY Facility
  ), actual AS (
    SELECT Facility, count(*) records, count(service_minutes) minutes_known,
      count(service_visits) visits_known, sum(service_minutes) minutes, sum(service_visits) visits
    FROM {target}.v_tool_services_provided GROUP BY Facility
  )
  SELECT count(*) AS value FROM expected e FULL OUTER JOIN actual a ON e.Facility = a.Facility
  WHERE NOT (e.records <=> a.records) OR NOT (e.minutes_known <=> a.minutes_known)
     OR NOT (e.visits_known <=> a.visits_known) OR NOT (e.minutes <=> a.minutes)
     OR NOT (e.visits <=> a.visits)
""") or 0)
assessment_summary_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_assessment_summary") or 0)
notes_summary_count = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_notes_summary") or 0)
# Published analytical fields must carry source values, not merely a schema.
# Entry_Date_dt is the normalized ElderMark date from the silver transform.
source_notes_with_text = int(scalar(f"SELECT count(*) AS value FROM {catalog}.silver.notes WHERE Entry_Date_dt IS NOT NULL AND nullif(trim(Comment), '') IS NOT NULL") or 0)
published_notes_with_text = int(scalar(f"SELECT count(*) AS value FROM {target}.v_tool_notes_summary WHERE nullif(trim(note_text), '') IS NOT NULL") or 0)
resident_note_mismatches = int(scalar(f"""
  WITH latest AS (
    SELECT Facility, Res_Number, max(note_date) AS last_note_date
    FROM {target}.v_tool_notes_summary WHERE note_date <= {QA_AS_OF_SQL}
    GROUP BY Facility, Res_Number
  )
  SELECT count(*) AS value FROM {target}.v_tool_resident_profile_enriched p
  LEFT JOIN latest n ON p.Facility = n.Facility AND p.Res_Number = n.Res_Number
  WHERE NOT (p.last_note_date <=> n.last_note_date)
     OR NOT (p.days_since_last_note <=> datediff({QA_AS_OF_SQL}, n.last_note_date))
""") or 0)
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

add_check("manifest-present", "context", "critical", manifest_count >= 22, ">=22 slices", manifest_count, "Tool context manifest includes the governed resident, county, incident, census, and MAR slices.")
add_check("resident-profile-present", "residents", "critical", resident_count > 0, ">0 rows", resident_count, "Current resident profile rows are available.")
episode_duplicate_count = int(scalar(f"SELECT count(*) - count(DISTINCT episode_id) AS value FROM {target}.v_tool_resident_episode_history") or 0)
resolution_conflicts = int(scalar(f"""SELECT count(*) AS value FROM (
  SELECT history_id, facility_id, resident_id, admit_date
  FROM {target}.report_admission_county_resolutions
  GROUP BY history_id, facility_id, resident_id, admit_date
  HAVING count(DISTINCT county) > 1
)""") or 0)
add_check("admission-episodes-unique", "residents", "critical", episode_duplicate_count == 0, "0 duplicate stay keys", episode_duplicate_count, "County enrichment must preserve one record per admission episode.")
add_check("admission-county-resolutions-consistent", "residents", "critical", resolution_conflicts == 0, "0 conflicting reviewed counties", resolution_conflicts, "Reviewed county evidence cannot assign different counties to the same source admission.")
add_check("resident-admit-date-normalized", "residents", "critical", resident_admit_date_failures == 0, "0 missing or malformed admission dates", resident_admit_date_failures, "Current residents have valid ISO admission dates for county and length-of-stay joins.")
add_check("current-resident-county-present", "residents", "critical", current_resident_county_count == resident_count, resident_count, current_resident_county_count, "Every current resident is represented once in the county census, including County not recorded.")
add_check("current-resident-county-reconciles", "residents", "critical", current_resident_county_reconciliation_failures == 0, "0 community mismatches", current_resident_county_reconciliation_failures, "County census totals reconcile to the governed current roster for every community.")
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
add_check("census-daily-present", "census", "critical", census_daily_count > 0, ">0 rows", census_daily_count, "Canonical daily census (admission episodes x countability) is available.")
add_check(
    "census-monthly-equals-daily",
    "census",
    "critical",
    census_monthly_vs_daily_failures == 0,
    "0 mismatched facility-months",
    census_monthly_vs_daily_failures,
    "Tool monthly census must equal the canonical daily census on its snapshot date (min(month end, as-of)).",
)
add_check(
    "census-average-daily-equals-daily",
    "census",
    "critical",
    census_average_daily_failures == 0,
    "0 mismatched facility-months",
    census_average_daily_failures,
    "Monthly average daily census must be the mean of the canonical daily census in the month.",
)
add_check(
    "census-published-monthly-equals-daily",
    "census",
    "critical",
    census_published_monthly_vs_daily_failures == 0,
    "0 mismatched facility-months",
    census_published_monthly_vs_daily_failures,
    "gold.v_census (silver census_snapshot, used by dashboards) must equal the canonical daily census on the same date.",
)
add_check(
    "census-weekly-equals-daily",
    "census",
    "critical",
    census_weekly_vs_daily_failures == 0,
    "0 mismatched facility-weeks",
    census_weekly_vs_daily_failures,
    "Weekly census and its 7-day-prior value must equal the canonical daily census on census_date and prior_census_date.",
)
add_check(
    "census-definition-reconciliation",
    "census",
    "warning",
    census_reconciliation_differences == 0,
    "0 facility-months where old Resident-table census differs",
    census_reconciliation_differences,
    f"Informational: old Resident-table census vs episode-based daily census per facility-month; detail in {census_reconciliation_table}.",
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
add_check("service-archive-population", "services", "critical", services_provided_count == source_service_archive_count, source_service_archive_count, services_provided_count, "Every dated resident service archive record is preserved exactly once; employee schedules do not count as care.")
add_check("service-archive-measures", "services", "critical", non_archive_services_count + service_measure_mismatches == 0, 0, non_archive_services_count + service_measure_mismatches, "Archived service minutes and visits retain their separate source units.")
add_check("assessment-summary-present", "assessments", "warning", assessment_summary_count > 0, ">0 rows", assessment_summary_count, "Assessment detail is available when ElderMark provides it.")
add_check("notes-summary-present", "notes", "warning", notes_summary_count > 0, ">0 rows", notes_summary_count, "Resident note detail is available when ElderMark provides it.")
add_check("notes-text-preserved", "notes", "critical", published_notes_with_text == source_notes_with_text, source_notes_with_text, published_notes_with_text, "Dated ElderMark note comments survive the governed projection.")
add_check("resident-notes-population", "residents", "critical", resident_note_mismatches == 0, 0, resident_note_mismatches, "Last-note dates cover the full current roster, not only documentation exceptions; future notes do not set current gaps.")
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
    "census_daily": census_daily_count,
    "census_monthly_vs_daily_failures": census_monthly_vs_daily_failures,
    "census_published_monthly_vs_daily_failures": census_published_monthly_vs_daily_failures,
    "census_weekly_vs_daily_failures": census_weekly_vs_daily_failures,
    "census_definition_reconciliation_differences": census_reconciliation_differences,
    "census_quality": census_quality_count,
    "resident_countability": resident_countability_count,
    "current_resident_county": current_resident_county_count,
    "current_resident_county_reconciliation_failures": current_resident_county_reconciliation_failures,
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
