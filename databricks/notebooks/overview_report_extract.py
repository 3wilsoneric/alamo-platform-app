# Databricks notebook source
# MAGIC %md
# MAGIC # Overview report extract
# MAGIC
# MAGIC Produces governed, chart-ready datasets from the existing Alamo gold views.
# MAGIC This notebook does not alter pipeline tables or publish a platform snapshot.
# MAGIC
# MAGIC Report sections:
# MAGIC
# MAGIC 1. Data coverage
# MAGIC 2. Quarterly operating scorecard
# MAGIC 3. Weekly and monthly census and resident flow
# MAGIC 4. Current and completed length of stay
# MAGIC 5. Discharge outcome coverage and provisional outcome groups
# MAGIC 6. Internal 30-, 90-, and 180-day readmissions
# MAGIC 7. Incident volume, reach, severity, and category mix
# MAGIC 8. Medication execution, refusals, PRN follow-up, and medication burden
# MAGIC 9. Current resident and documentation profile
# MAGIC 10. Services provided
# MAGIC 11. Assessments and notes
# MAGIC 12. Unit placement activity
# MAGIC 13. Data-quality controls
# MAGIC
# MAGIC At the end, the notebook writes one Excel workbook to the current user's
# MAGIC Databricks Workspace files. Each result remains a normal worksheet.

# COMMAND ----------

from datetime import datetime
import os
import re
import zipfile

dbutils.widgets.text("catalog", "alamohealth")
dbutils.widgets.text("gold_schema", "gold")
dbutils.widgets.text("facility_id", "")
dbutils.widgets.text("start_month", "2022-04")
dbutils.widgets.text("end_month", "2026-07")

catalog = (dbutils.widgets.get("catalog") or "alamohealth").strip()
gold_schema = (dbutils.widgets.get("gold_schema") or "gold").strip()
facility_id = (dbutils.widgets.get("facility_id") or "").strip()
start_month = (dbutils.widgets.get("start_month") or "").strip()
end_month = (dbutils.widgets.get("end_month") or "").strip()

if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", catalog):
    raise ValueError("catalog must be a valid SQL identifier")
if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", gold_schema):
    raise ValueError("gold_schema must be a valid SQL identifier")
if facility_id and not re.fullmatch(r"[A-Za-z0-9_-]+", facility_id):
    raise ValueError("facility_id may contain only letters, numbers, underscores, and hyphens")
for widget_name, value in [("start_month", start_month), ("end_month", end_month)]:
    try:
        datetime.strptime(value, "%Y-%m")
    except ValueError as exc:
        raise ValueError(f"{widget_name} must be formatted as YYYY-MM") from exc
if start_month > end_month:
    raise ValueError("start_month cannot be after end_month")

gold = f"{catalog}.{gold_schema}"
report_datasets = []


def scope(column: str) -> str:
    return "1 = 1" if not facility_id else f"cast({column} AS string) = '{facility_id}'"


def show_dataset(title: str, query: str) -> None:
    displayHTML(f"<h2 style='margin-top:28px'>{title}</h2>")
    dataframe = spark.sql(query)
    report_datasets.append((title, dataframe))
    display(dataframe)


spark.sql(
    f"""
    CREATE OR REPLACE TEMP VIEW overview_facilities AS
    SELECT Facility, max(Facility_Name) AS Facility_Name
    FROM (
      SELECT cast(Facility AS string) AS Facility, Facility_Name
      FROM {gold}.v_tool_resident_profile_enriched
      UNION ALL
      SELECT cast(Facility AS string) AS Facility, Facility_Name
      FROM {gold}.v_tool_resident_episode_history
      UNION ALL
      SELECT cast(Facility AS string) AS Facility, Facility_Name
      FROM {gold}.v_tool_incident_monthly_by_community_category
    ) names
    WHERE Facility IS NOT NULL
    GROUP BY Facility
    """
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 1. Data coverage
# MAGIC
# MAGIC Use this as the report's evidence footer. Missing data remains missing rather
# MAGIC than being converted to zero.

# COMMAND ----------

show_dataset(
    "Data coverage",
    f"""
    SELECT 'Monthly census' AS dataset,
           count(*) AS rows,
           min(month_bucket) AS first_period,
           max(month_bucket) AS last_period
    FROM {gold}.v_tool_census_monthly_by_community
    WHERE {scope("Facility")}
    UNION ALL
    SELECT 'Resident episodes', count(*),
           cast(min(admit_date) AS string),
           cast(max(coalesce(discharge_date, admit_date)) AS string)
    FROM {gold}.v_tool_resident_episode_history
    WHERE {scope("Facility")}
    UNION ALL
    SELECT 'Incident detail', count(*),
           cast(min(Incident_Date_parsed) AS string),
           cast(max(Incident_Date_parsed) AS string)
    FROM {gold}.v_tool_incident_detail_history
    WHERE {scope("Facility")}
    UNION ALL
    SELECT 'Medication monthly', count(*),
           min(month_bucket),
           max(month_bucket)
    FROM {gold}.v_tool_mar_monthly_by_community_medication
    WHERE {scope("facility_id")}
    UNION ALL
    SELECT 'Current resident profile', count(*),
           cast(min(Admit_Date) AS string),
           cast(max(Admit_Date) AS string)
    FROM {gold}.v_tool_resident_profile_enriched
    WHERE {scope("Facility")}
    ORDER BY dataset
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 2. Quarterly operating scorecard
# MAGIC
# MAGIC `average_weekly_census` is the average of governed reconstructed weekly census
# MAGIC points, not licensed-bed occupancy. `incidents_per_100_average_weekly_census`
# MAGIC is a normalized volume index, not a resident-day rate.

# COMMAND ----------

show_dataset(
    "Quarterly operating scorecard",
    f"""
    WITH census AS (
      SELECT
        cast(Facility AS string) AS Facility,
        concat(year(census_date), '-Q', quarter(census_date)) AS quarter,
        round(avg(census), 1) AS average_weekly_census,
        min_by(census, census_date) AS opening_census,
        max_by(census, census_date) AS ending_census
      FROM {gold}.v_tool_census_weekly_by_community
      WHERE date_format(census_date, 'yyyy-MM') BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility,
               concat(year(census_date), '-Q', quarter(census_date))
    ),
    flow AS (
      SELECT
        cast(Facility AS string) AS Facility,
        concat(year(to_date(concat(month_bucket, '-01'))), '-Q',
               quarter(to_date(concat(month_bucket, '-01')))) AS quarter,
        sum(admissions) AS admissions,
        sum(discharges) AS discharges,
        sum(net_change) AS net_flow
      FROM {gold}.v_tool_resident_flow_monthly_by_community
      WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility,
               concat(year(to_date(concat(month_bucket, '-01'))), '-Q',
                      quarter(to_date(concat(month_bucket, '-01'))))
    ),
    incidents AS (
      SELECT
        cast(Facility AS string) AS Facility,
        concat(year(Incident_Date_parsed), '-Q', quarter(Incident_Date_parsed)) AS quarter,
        count(*) AS incidents,
        count(DISTINCT Res_Number) AS residents_with_incidents,
        sum(CASE WHEN lower(trim(coalesce(Sentinel_Event_YN, ''))) IN
          ('true', 'yes', 'y', '1') THEN 1 ELSE 0 END) AS sentinel_incidents
      FROM {gold}.v_tool_incident_detail_history
      WHERE date_format(Incident_Date_parsed, 'yyyy-MM')
        BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility,
               concat(year(Incident_Date_parsed), '-Q', quarter(Incident_Date_parsed))
    ),
    medication AS (
      SELECT
        cast(facility_id AS string) AS Facility,
        concat(year(to_date(concat(month_bucket, '-01'))), '-Q',
               quarter(to_date(concat(month_bucket, '-01')))) AS quarter,
        sum(scheduled_count) AS scheduled_doses,
        sum(given_count) AS given_doses,
        sum(not_given_count) AS not_given_doses,
        sum(refusal_count) AS refusals,
        round(sum(given_count) / nullif(sum(scheduled_count), 0) * 100, 1)
          AS medication_compliance_pct
      FROM {gold}.v_tool_mar_monthly_by_community_medication
      WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("facility_id")}
      GROUP BY facility_id,
               concat(year(to_date(concat(month_bucket, '-01'))), '-Q',
                      quarter(to_date(concat(month_bucket, '-01'))))
    ),
    completed_stays AS (
      SELECT
        cast(Facility AS string) AS Facility,
        concat(year(discharge_date), '-Q', quarter(discharge_date)) AS quarter,
        count(*) AS completed_stays,
        round(avg(datediff(discharge_date, admit_date)), 1) AS average_completed_los_days,
        percentile_approx(datediff(discharge_date, admit_date), 0.5)
          AS median_completed_los_days,
        round(
          sum(CASE WHEN nullif(trim(discharge_reason), '') IS NOT NULL THEN 1 ELSE 0 END)
          / count(*) * 100,
          1
        ) AS discharge_reason_coverage_pct
      FROM {gold}.v_tool_resident_episode_history
      WHERE discharge_date IS NOT NULL
        AND admit_date IS NOT NULL
        AND discharge_date >= admit_date
        AND date_format(discharge_date, 'yyyy-MM') BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility,
               concat(year(discharge_date), '-Q', quarter(discharge_date))
    ),
    keys AS (
      SELECT Facility, quarter FROM census
      UNION
      SELECT Facility, quarter FROM flow
      UNION
      SELECT Facility, quarter FROM incidents
      UNION
      SELECT Facility, quarter FROM medication
      UNION
      SELECT Facility, quarter FROM completed_stays
    )
    SELECT
      k.Facility AS facility_id,
      f.Facility_Name AS facility_name,
      k.quarter,
      c.average_weekly_census,
      c.opening_census,
      c.ending_census,
      c.ending_census - c.opening_census AS census_change_in_quarter,
      fl.admissions,
      fl.discharges,
      fl.net_flow,
      i.incidents,
      i.residents_with_incidents,
      i.sentinel_incidents,
      round(i.incidents / nullif(c.average_weekly_census, 0) * 100, 1)
        AS incidents_per_100_average_weekly_census,
      m.scheduled_doses,
      m.given_doses,
      m.not_given_doses,
      m.refusals,
      m.medication_compliance_pct,
      s.completed_stays,
      s.average_completed_los_days,
      s.median_completed_los_days,
      s.discharge_reason_coverage_pct
    FROM keys k
    LEFT JOIN overview_facilities f ON k.Facility = f.Facility
    LEFT JOIN census c ON k.Facility = c.Facility AND k.quarter = c.quarter
    LEFT JOIN flow fl ON k.Facility = fl.Facility AND k.quarter = fl.quarter
    LEFT JOIN incidents i ON k.Facility = i.Facility AND k.quarter = i.quarter
    LEFT JOIN medication m ON k.Facility = m.Facility AND k.quarter = m.quarter
    LEFT JOIN completed_stays s ON k.Facility = s.Facility AND k.quarter = s.quarter
    ORDER BY k.quarter, facility_name
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 3. Census and resident flow

# COMMAND ----------

show_dataset(
    "Weekly census and resident flow",
    f"""
    WITH flow AS (
      SELECT
        cast(Facility AS string) AS Facility,
        week_start,
        sum(admissions) AS admissions,
        sum(discharges) AS discharges,
        sum(net_change) AS net_flow
      FROM {gold}.v_tool_resident_flow_weekly_by_community
      WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility, week_start
    )
    SELECT
      cast(c.Facility AS string) AS facility_id,
      c.Facility_Name AS facility_name,
      c.week_start,
      c.census_date AS week_end,
      c.census,
      c.census_7d_prior,
      c.census_change_7d,
      fl.admissions,
      fl.discharges,
      fl.net_flow
    FROM {gold}.v_tool_census_weekly_by_community c
    LEFT JOIN flow fl
      ON cast(c.Facility AS string) = fl.Facility
     AND c.week_start = fl.week_start
    WHERE c.month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("c.Facility")}
    ORDER BY c.week_start, c.Facility_Name
    """,
)

show_dataset(
    "Monthly census and resident flow",
    f"""
    WITH flow AS (
      SELECT cast(Facility AS string) AS Facility,
             month_bucket,
             sum(admissions) AS admissions,
             sum(discharges) AS discharges,
             sum(net_change) AS net_flow
      FROM {gold}.v_tool_resident_flow_monthly_by_community
      WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility, month_bucket
    )
    SELECT
      cast(c.Facility AS string) AS facility_id,
      f.Facility_Name AS facility_name,
      c.month_bucket,
      c.snapshot_date,
      c.census,
      c.prior_census,
      c.census_delta,
      fl.admissions,
      fl.discharges,
      fl.net_flow
    FROM {gold}.v_tool_census_monthly_by_community c
    LEFT JOIN overview_facilities f ON cast(c.Facility AS string) = f.Facility
    LEFT JOIN flow fl
      ON cast(c.Facility AS string) = fl.Facility
     AND c.month_bucket = fl.month_bucket
    WHERE c.month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("c.Facility")}
    ORDER BY c.month_bucket, facility_name
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 4. Length of stay
# MAGIC
# MAGIC Current LOS describes the present roster. Completed LOS describes episodes
# MAGIC that ended during the selected period. Keep both; they answer different questions.

# COMMAND ----------

show_dataset(
    "Current resident length of stay",
    f"""
    SELECT
      cast(p.Facility AS string) AS facility_id,
      max(p.Facility_Name) AS facility_name,
      count(*) AS current_residents,
      round(avg(p.LOS_Days), 1) AS average_los_days,
      percentile_approx(p.LOS_Days, 0.5) AS median_los_days,
      percentile_approx(p.LOS_Days, 0.25) AS p25_los_days,
      percentile_approx(p.LOS_Days, 0.75) AS p75_los_days,
      sum(CASE WHEN p.LOS_Days >= 365 THEN 1 ELSE 0 END) AS residents_365_plus_days,
      round(sum(CASE WHEN p.LOS_Days >= 365 THEN 1 ELSE 0 END) / count(*) * 100, 1)
        AS residents_365_plus_pct
    FROM {gold}.v_tool_resident_profile_enriched p
    WHERE {scope("p.Facility")}
    GROUP BY p.Facility
    ORDER BY facility_name
    """,
)

show_dataset(
    "Completed length of stay by discharge quarter",
    f"""
    SELECT
      cast(e.Facility AS string) AS facility_id,
      max(e.Facility_Name) AS facility_name,
      concat(year(e.discharge_date), '-Q', quarter(e.discharge_date)) AS discharge_quarter,
      count(*) AS completed_stays,
      round(avg(datediff(e.discharge_date, e.admit_date)), 1) AS average_los_days,
      percentile_approx(datediff(e.discharge_date, e.admit_date), 0.5)
        AS median_los_days,
      percentile_approx(datediff(e.discharge_date, e.admit_date), 0.25)
        AS p25_los_days,
      percentile_approx(datediff(e.discharge_date, e.admit_date), 0.75)
        AS p75_los_days
    FROM {gold}.v_tool_resident_episode_history e
    WHERE e.admit_date IS NOT NULL
      AND e.discharge_date IS NOT NULL
      AND e.discharge_date >= e.admit_date
      AND date_format(e.discharge_date, 'yyyy-MM') BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("e.Facility")}
    GROUP BY e.Facility,
             concat(year(e.discharge_date), '-Q', quarter(e.discharge_date))
    ORDER BY discharge_quarter, facility_name
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 5. Discharge outcomes
# MAGIC
# MAGIC The outcome groups below are provisional. Review the mapping before publishing
# MAGIC a successful-discharge KPI. Unknown reasons remain in the denominator and are
# MAGIC reported separately.

# COMMAND ----------

show_dataset(
    "Discharge outcome coverage and provisional groups",
    f"""
    WITH classified AS (
      SELECT
        cast(Facility AS string) AS Facility,
        Facility_Name,
        discharge_date,
        discharge_reason,
        CASE
          WHEN nullif(trim(discharge_reason), '') IS NULL THEN 'Unknown'
          WHEN lower(discharge_reason) RLIKE
            'higher level|hospital|behaviorally disqualified|clinically disqualified|awol|eviction|incarcer|jail'
            THEN 'Unsuccessful or higher care'
          WHEN lower(discharge_reason) RLIKE
            'own home|with family|live with family|assisted living|another al|sister al|internal transfer to al'
            THEN 'Home, family, or lower-support setting'
          ELSE 'Other known outcome'
        END AS provisional_outcome_group
      FROM {gold}.v_tool_resident_episode_history
      WHERE discharge_date IS NOT NULL
        AND date_format(discharge_date, 'yyyy-MM') BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
    )
    SELECT
      Facility AS facility_id,
      max(Facility_Name) AS facility_name,
      concat(year(discharge_date), '-Q', quarter(discharge_date)) AS discharge_quarter,
      count(*) AS total_discharges,
      sum(CASE WHEN provisional_outcome_group <> 'Unknown' THEN 1 ELSE 0 END)
        AS known_reason_discharges,
      round(
        sum(CASE WHEN provisional_outcome_group <> 'Unknown' THEN 1 ELSE 0 END)
        / count(*) * 100,
        1
      ) AS reason_coverage_pct,
      sum(CASE WHEN provisional_outcome_group =
        'Home, family, or lower-support setting' THEN 1 ELSE 0 END)
        AS lower_support_discharges,
      sum(CASE WHEN provisional_outcome_group =
        'Unsuccessful or higher care' THEN 1 ELSE 0 END)
        AS unsuccessful_or_higher_care_discharges,
      sum(CASE WHEN provisional_outcome_group = 'Other known outcome' THEN 1 ELSE 0 END)
        AS other_known_discharges,
      sum(CASE WHEN provisional_outcome_group = 'Unknown' THEN 1 ELSE 0 END)
        AS unknown_discharges,
      round(
        sum(CASE WHEN provisional_outcome_group =
          'Home, family, or lower-support setting' THEN 1 ELSE 0 END)
        / nullif(sum(CASE WHEN provisional_outcome_group IN (
          'Home, family, or lower-support setting',
          'Unsuccessful or higher care'
        ) THEN 1 ELSE 0 END), 0) * 100,
        1
      ) AS lower_support_pct_of_classified
    FROM classified
    GROUP BY Facility,
             concat(year(discharge_date), '-Q', quarter(discharge_date))
    ORDER BY discharge_quarter, facility_name
    """,
)

show_dataset(
    "Raw discharge reasons for mapping review",
    f"""
    SELECT
      cast(Facility AS string) AS facility_id,
      max(Facility_Name) AS facility_name,
      coalesce(nullif(trim(discharge_reason), ''), '(missing)') AS discharge_reason,
      count(*) AS discharges
    FROM {gold}.v_tool_resident_episode_history
    WHERE discharge_date IS NOT NULL
      AND date_format(discharge_date, 'yyyy-MM') BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("Facility")}
    GROUP BY Facility, coalesce(nullif(trim(discharge_reason), ''), '(missing)')
    ORDER BY discharges DESC, facility_name, discharge_reason
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 6. Internal readmissions
# MAGIC
# MAGIC These rates detect a later admission anywhere in the Alamo ElderMark episode
# MAGIC history. They do not detect returns to outside providers. Recent discharges are
# MAGIC excluded from denominators until their full observation window has elapsed.

# COMMAND ----------

show_dataset(
    "Internal readmission rates",
    f"""
    WITH report_bounds AS (
      SELECT max(snapshot_date) AS as_of_date
      FROM {gold}.v_tool_census_monthly_by_community
    ),
    ordered AS (
      SELECT
        cast(Facility AS string) AS Facility,
        Facility_Name,
        Res_Number,
        admit_date,
        discharge_date,
        lead(admit_date) OVER (
          PARTITION BY Res_Number
          ORDER BY admit_date, coalesce(discharge_date, DATE '9999-12-31'), episode_id
        ) AS next_admit_date
      FROM {gold}.v_tool_resident_episode_history
      WHERE admit_date IS NOT NULL
    ),
    discharged AS (
      SELECT
        o.*,
        b.as_of_date,
        datediff(o.next_admit_date, o.discharge_date) AS days_to_internal_readmission
      FROM ordered o
      CROSS JOIN report_bounds b
      WHERE o.discharge_date IS NOT NULL
        AND o.discharge_date >= o.admit_date
        AND date_format(o.discharge_date, 'yyyy-MM') BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("o.Facility")}
    )
    SELECT
      Facility AS facility_id,
      max(Facility_Name) AS facility_name,
      concat(year(discharge_date), '-Q', quarter(discharge_date)) AS discharge_quarter,
      sum(CASE WHEN discharge_date <= date_sub(as_of_date, 30) THEN 1 ELSE 0 END)
        AS eligible_30d_discharges,
      sum(CASE WHEN discharge_date <= date_sub(as_of_date, 30)
                AND days_to_internal_readmission BETWEEN 1 AND 30 THEN 1 ELSE 0 END)
        AS readmitted_30d,
      round(
        sum(CASE WHEN discharge_date <= date_sub(as_of_date, 30)
                  AND days_to_internal_readmission BETWEEN 1 AND 30 THEN 1 ELSE 0 END)
        / nullif(sum(CASE WHEN discharge_date <= date_sub(as_of_date, 30)
          THEN 1 ELSE 0 END), 0) * 100,
        1
      ) AS internal_readmission_30d_pct,
      sum(CASE WHEN discharge_date <= date_sub(as_of_date, 90) THEN 1 ELSE 0 END)
        AS eligible_90d_discharges,
      sum(CASE WHEN discharge_date <= date_sub(as_of_date, 90)
                AND days_to_internal_readmission BETWEEN 1 AND 90 THEN 1 ELSE 0 END)
        AS readmitted_90d,
      round(
        sum(CASE WHEN discharge_date <= date_sub(as_of_date, 90)
                  AND days_to_internal_readmission BETWEEN 1 AND 90 THEN 1 ELSE 0 END)
        / nullif(sum(CASE WHEN discharge_date <= date_sub(as_of_date, 90)
          THEN 1 ELSE 0 END), 0) * 100,
        1
      ) AS internal_readmission_90d_pct,
      sum(CASE WHEN discharge_date <= date_sub(as_of_date, 180) THEN 1 ELSE 0 END)
        AS eligible_180d_discharges,
      sum(CASE WHEN discharge_date <= date_sub(as_of_date, 180)
                AND days_to_internal_readmission BETWEEN 1 AND 180 THEN 1 ELSE 0 END)
        AS readmitted_180d,
      round(
        sum(CASE WHEN discharge_date <= date_sub(as_of_date, 180)
                  AND days_to_internal_readmission BETWEEN 1 AND 180 THEN 1 ELSE 0 END)
        / nullif(sum(CASE WHEN discharge_date <= date_sub(as_of_date, 180)
          THEN 1 ELSE 0 END), 0) * 100,
        1
      ) AS internal_readmission_180d_pct
    FROM discharged
    GROUP BY Facility,
             concat(year(discharge_date), '-Q', quarter(discharge_date))
    ORDER BY discharge_quarter, facility_name
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 7. Incidents

# COMMAND ----------

show_dataset(
    "Monthly incident trend and severity",
    f"""
    WITH incident_month AS (
      SELECT
        cast(Facility AS string) AS Facility,
        max(Facility_Name) AS Facility_Name,
        date_format(Incident_Date_parsed, 'yyyy-MM') AS month_bucket,
        count(*) AS incidents,
        count(DISTINCT Res_Number) AS residents_with_incidents,
        sum(CASE WHEN lower(trim(coalesce(Sentinel_Event_YN, ''))) IN
          ('true', 'yes', 'y', '1') THEN 1 ELSE 0 END) AS sentinel_incidents,
        sum(CASE WHEN lower(trim(coalesce(Injuires_YN, ''))) IN
          ('true', 'yes', 'y', '1') THEN 1 ELSE 0 END) AS injury_incidents,
        sum(CASE WHEN lower(trim(coalesce(Notify_EmergSrvs_YN, ''))) IN
          ('true', 'yes', 'y', '1') THEN 1 ELSE 0 END) AS emergency_service_notifications
      FROM {gold}.v_tool_incident_detail_history
      WHERE date_format(Incident_Date_parsed, 'yyyy-MM')
        BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility, date_format(Incident_Date_parsed, 'yyyy-MM')
    )
    SELECT
      i.Facility AS facility_id,
      i.Facility_Name AS facility_name,
      i.month_bucket,
      i.incidents,
      i.residents_with_incidents,
      i.sentinel_incidents,
      i.injury_incidents,
      i.emergency_service_notifications,
      c.census,
      round(i.incidents / nullif(c.census, 0) * 100, 1)
        AS incidents_per_100_monthly_census
    FROM incident_month i
    LEFT JOIN {gold}.v_tool_census_monthly_by_community c
      ON i.Facility = cast(c.Facility AS string)
     AND i.month_bucket = c.month_bucket
    ORDER BY i.month_bucket, i.Facility_Name
    """,
)

show_dataset(
    "Incident category mix",
    f"""
    SELECT
      cast(i.Facility AS string) AS facility_id,
      i.Facility_Name AS facility_name,
      i.month_bucket,
      i.Incident_Category AS incident_category,
      i.incident_count,
      i.resident_count,
      i.latest_incident_date
    FROM {gold}.v_tool_incident_monthly_by_community_category i
    WHERE i.month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("i.Facility")}
    ORDER BY i.month_bucket, facility_name, i.incident_count DESC
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 8. Medication performance

# COMMAND ----------

show_dataset(
    "Monthly medication performance",
    f"""
    SELECT
      cast(facility_id AS string) AS facility_id,
      max(facility_name) AS facility_name,
      month_bucket,
      sum(administration_count) AS administrations,
      sum(scheduled_count) AS scheduled_doses,
      sum(given_count) AS given_doses,
      sum(not_given_count) AS not_given_doses,
      sum(refusal_count) AS refusals,
      sum(prn_given_count) AS prn_given,
      sum(awol_count) AS not_given_due_to_awol,
      sum(hospital_count) AS not_given_due_to_hospital,
      sum(unknown_count) AS unknown_outcomes,
      round(sum(given_count) / nullif(sum(scheduled_count), 0) * 100, 1)
        AS compliance_pct,
      round(sum(refusal_count) / nullif(sum(scheduled_count), 0) * 100, 1)
        AS refusal_pct
    FROM {gold}.v_tool_mar_monthly_by_community_medication
    WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("facility_id")}
    GROUP BY facility_id, month_bucket
    ORDER BY month_bucket, facility_name
    """,
)

show_dataset(
    "Current medication burden",
    f"""
    SELECT
      cast(facility_id AS string) AS facility_id,
      max(facility_name) AS facility_name,
      count(*) AS residents,
      round(avg(active_medication_count), 1) AS average_active_medications,
      round(avg(active_psychotropic_count), 1) AS average_active_psychotropics,
      round(avg(active_prn_count), 1) AS average_active_prn_orders,
      sum(CASE WHEN active_medication_count >= 5 THEN 1 ELSE 0 END)
        AS residents_with_5_plus_medications,
      sum(CASE WHEN active_psychotropic_count >= 3 THEN 1 ELSE 0 END)
        AS residents_with_3_plus_psychotropics,
      round(avg(compliance_pct_30d), 1) AS average_resident_compliance_pct_30d,
      sum(refusals_30d) AS refusals_30d,
      sum(prn_given_30d) AS prn_given_30d,
      sum(prn_followup_30d) AS prn_followup_30d,
      round(sum(prn_followup_30d) / nullif(sum(prn_given_30d), 0) * 100, 1)
        AS prn_followup_pct_30d
    FROM {gold}.v_tool_mar_resident_summary
    WHERE {scope("facility_id")}
    GROUP BY facility_id
    ORDER BY facility_name
    """,
)

show_dataset(
    "Top medication refusals",
    f"""
    SELECT
      cast(r.Facility AS string) AS facility_id,
      f.Facility_Name AS facility_name,
      r.Medication AS medication,
      r.total_scheduled,
      r.refusals,
      r.refusal_pct
    FROM {gold}.v_tool_medication_refusal_summary r
    LEFT JOIN overview_facilities f ON cast(r.Facility AS string) = f.Facility
    WHERE {scope("r.Facility")}
    ORDER BY r.refusals DESC, facility_name, medication
    LIMIT 50
    """,
)

show_dataset(
    "MAR exception pattern, bounded to the published 90-day detail",
    f"""
    SELECT
      cast(facility_id AS string) AS facility_id,
      max(facility_name) AS facility_name,
      month_bucket,
      coalesce(nullif(trim(outcome_category), ''), 'Unclassified exception')
        AS outcome_category,
      count(*) AS exception_records,
      count(DISTINCT resident_id) AS residents_with_exception,
      sum(is_refusal) AS refusals,
      sum(is_over_60_minutes_late) AS administrations_over_60_minutes_late,
      sum(CASE WHEN is_on_hold = 1 THEN 1 ELSE 0 END) AS held_medication_records
    FROM {gold}.v_tool_mar_exception_detail_90d
    WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("facility_id")}
    GROUP BY
      facility_id,
      month_bucket,
      coalesce(nullif(trim(outcome_category), ''), 'Unclassified exception')
    ORDER BY month_bucket, facility_name, exception_records DESC
    """,
)

show_dataset(
    "PRN effectiveness follow-up, bounded to the published 90-day detail",
    f"""
    SELECT
      cast(facility_id AS string) AS facility_id,
      max(facility_name) AS facility_name,
      month_bucket,
      count(*) AS prn_administration_records,
      count(DISTINCT resident_id) AS residents_with_prn,
      sum(has_effectiveness_followup) AS records_with_effectiveness_followup,
      round(
        sum(has_effectiveness_followup) / nullif(count(*), 0) * 100,
        1
      ) AS prn_effectiveness_followup_pct
    FROM {gold}.v_tool_mar_prn_effectiveness_90d
    WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("facility_id")}
    GROUP BY facility_id, month_bucket
    ORDER BY month_bucket, facility_name
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 9. Current resident and documentation profile

# COMMAND ----------

show_dataset(
    "Current resident operating profile",
    f"""
    SELECT
      cast(Facility AS string) AS facility_id,
      max(Facility_Name) AS facility_name,
      count(*) AS current_residents,
      round(avg(Age), 1) AS average_age,
      round(avg(LOS_Days), 1) AS average_los_days,
      percentile_approx(LOS_Days, 0.5) AS median_los_days,
      sum(incident_count_30d) AS resident_incidents_30d,
      sum(incident_count_90d) AS resident_incidents_90d,
      sum(CASE WHEN days_since_last_note > 7 THEN 1 ELSE 0 END)
        AS residents_without_note_in_7_days,
      sum(CASE WHEN days_since_last_note > 30 THEN 1 ELSE 0 END)
        AS residents_without_note_in_30_days
    FROM {gold}.v_tool_resident_profile_enriched
    WHERE {scope("Facility")}
    GROUP BY Facility
    ORDER BY facility_name
    """,
)

show_dataset(
    "Current diagnosis mix",
    f"""
    SELECT
      cast(Facility AS string) AS facility_id,
      max(Facility_Name) AS facility_name,
      coalesce(nullif(trim(Primary_Diagnosis), ''), 'Not documented')
        AS primary_diagnosis,
      count(*) AS residents,
      round(
        count(*) / sum(count(*)) OVER (PARTITION BY Facility) * 100,
        1
      ) AS resident_pct
    FROM {gold}.v_tool_resident_profile_enriched
    WHERE {scope("Facility")}
    GROUP BY Facility, coalesce(nullif(trim(Primary_Diagnosis), ''), 'Not documented')
    ORDER BY facility_name, residents DESC
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 10. Services provided
# MAGIC
# MAGIC These are source service records, not automatically billable encounters.
# MAGIC Review `service_status`, `service_type`, and source-table coverage before using
# MAGIC the counts for reimbursement or productivity claims.

# COMMAND ----------

show_dataset(
    "Monthly services provided",
    f"""
    SELECT
      cast(Facility AS string) AS facility_id,
      max(Facility_Name) AS facility_name,
      month_bucket,
      service_type,
      coalesce(nullif(trim(service_status), ''), 'Status not documented') AS service_status,
      source_table,
      count(*) AS service_records,
      count(DISTINCT Res_Number) AS residents_served,
      count(DISTINCT employee_id) AS staff_recorded,
      round(sum(coalesce(service_units, 0)), 1) AS recorded_service_units,
      sum(CASE WHEN service_units IS NOT NULL THEN 1 ELSE 0 END)
        AS records_with_service_units
    FROM {gold}.v_tool_services_provided
    WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("Facility")}
    GROUP BY
      Facility,
      month_bucket,
      service_type,
      coalesce(nullif(trim(service_status), ''), 'Status not documented'),
      source_table
    ORDER BY month_bucket, facility_name, service_records DESC
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 11. Assessments and notes
# MAGIC
# MAGIC Assessment-score trends are defensible only when the same assessment type and
# MAGIC scoring scale repeat for the same resident. The summary below preserves type
# MAGIC and score coverage so unlike instruments are never averaged together.

# COMMAND ----------

show_dataset(
    "Monthly assessment activity",
    f"""
    SELECT
      cast(Facility AS string) AS facility_id,
      max(Facility_Name) AS facility_name,
      month_bucket,
      assessment_type,
      coalesce(nullif(trim(assessment_status), ''), 'Status not documented')
        AS assessment_status,
      count(*) AS assessment_records,
      count(DISTINCT Res_Number) AS assessed_residents,
      sum(CASE WHEN assessment_score IS NOT NULL THEN 1 ELSE 0 END)
        AS records_with_score,
      round(avg(assessment_score), 2) AS average_score
    FROM {gold}.v_tool_assessment_summary
    WHERE month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("Facility")}
    GROUP BY
      Facility,
      month_bucket,
      assessment_type,
      coalesce(nullif(trim(assessment_status), ''), 'Status not documented')
    ORDER BY month_bucket, facility_name, assessment_records DESC
    """,
)

show_dataset(
    "Monthly note and follow-up activity",
    f"""
    WITH report_bounds AS (
      SELECT max(snapshot_date) AS as_of_date
      FROM {gold}.v_tool_census_monthly_by_community
    )
    SELECT
      cast(n.Facility AS string) AS facility_id,
      max(n.Facility_Name) AS facility_name,
      n.month_bucket,
      n.note_type,
      count(*) AS note_records,
      count(DISTINCT n.Res_Number) AS residents_with_notes,
      sum(CASE WHEN n.action_required_by_date IS NOT NULL THEN 1 ELSE 0 END)
        AS notes_with_followup_date,
      sum(CASE WHEN n.action_required_by_date IS NOT NULL
                AND n.action_required_by_date <= b.as_of_date THEN 1 ELSE 0 END)
        AS followup_dates_on_or_before_data_as_of,
      max(b.as_of_date) AS data_as_of_date
    FROM {gold}.v_tool_notes_summary n
    CROSS JOIN report_bounds b
    WHERE n.month_bucket BETWEEN '{start_month}' AND '{end_month}'
      AND {scope("n.Facility")}
    GROUP BY n.Facility, n.month_bucket, n.note_type
    ORDER BY n.month_bucket, facility_name, note_records DESC
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 12. Unit placement activity
# MAGIC
# MAGIC These rows describe unit-placement starts and ends. They are not admissions and
# MAGIC discharges unless reconciled to the resident episode table.

# COMMAND ----------

show_dataset(
    "Monthly unit placement activity",
    f"""
    WITH starts AS (
      SELECT
        cast(Facility AS string) AS Facility,
        max(Facility_Name) AS Facility_Name,
        date_format(start_date, 'yyyy-MM') AS month_bucket,
        count(*) AS placement_starts,
        count(DISTINCT Res_Number) AS residents_starting_placement
      FROM {gold}.v_tool_resident_unit_history
      WHERE start_date IS NOT NULL
        AND date_format(start_date, 'yyyy-MM') BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility, date_format(start_date, 'yyyy-MM')
    ),
    ends AS (
      SELECT
        cast(Facility AS string) AS Facility,
        max(Facility_Name) AS Facility_Name,
        date_format(end_date, 'yyyy-MM') AS month_bucket,
        count(*) AS placement_ends,
        count(DISTINCT Res_Number) AS residents_ending_placement
      FROM {gold}.v_tool_resident_unit_history
      WHERE end_date IS NOT NULL
        AND date_format(end_date, 'yyyy-MM') BETWEEN '{start_month}' AND '{end_month}'
        AND {scope("Facility")}
      GROUP BY Facility, date_format(end_date, 'yyyy-MM')
    ),
    keys AS (
      SELECT Facility, month_bucket FROM starts
      UNION
      SELECT Facility, month_bucket FROM ends
    )
    SELECT
      k.Facility AS facility_id,
      coalesce(s.Facility_Name, e.Facility_Name, f.Facility_Name) AS facility_name,
      k.month_bucket,
      coalesce(s.placement_starts, 0) AS placement_starts,
      coalesce(s.residents_starting_placement, 0) AS residents_starting_placement,
      coalesce(e.placement_ends, 0) AS placement_ends,
      coalesce(e.residents_ending_placement, 0) AS residents_ending_placement
    FROM keys k
    LEFT JOIN starts s
      ON k.Facility = s.Facility AND k.month_bucket = s.month_bucket
    LEFT JOIN ends e
      ON k.Facility = e.Facility AND k.month_bucket = e.month_bucket
    LEFT JOIN overview_facilities f ON k.Facility = f.Facility
    ORDER BY k.month_bucket, facility_name
    """,
)

# COMMAND ----------
# MAGIC %md
# MAGIC ## 13. Data-quality controls
# MAGIC
# MAGIC These controls belong beside the report, not hidden in pipeline logs. A report
# MAGIC should not publish census, discharge, or documentation claims when its relevant
# MAGIC coverage or reconciliation check is outside the accepted threshold.

# COMMAND ----------

show_dataset(
    "Census reconciliation and exclusions",
    f"""
    SELECT
      cast(Facility AS string) AS facility_id,
      Facility_Name AS facility_name,
      latest_census_month,
      latest_monthly_census,
      active_roster_residents,
      current_active_roster_residents,
      current_active_minus_latest_census,
      monthly_census_minus_active_roster,
      prior_census,
      census_delta,
      excluded_or_non_countable_rows,
      suspected_test_rows,
      exclusion_reasons,
      min_week,
      max_week,
      weekly_census_rows
    FROM {gold}.v_tool_census_data_quality
    WHERE {scope("Facility")}
    ORDER BY facility_name
    """,
)

show_dataset(
    "Governed data catalog",
    f"""
    SELECT
      slice_name,
      grain,
      row_count,
      min_period,
      max_period,
      facility_ids,
      fields,
      generated_at
    FROM {gold}.v_tool_context_manifest
    ORDER BY slice_name
    """,
)

# COMMAND ----------

def unique_sheet_name(title: str, used_names) -> str:
    base = re.sub(r"[\[\]:*?/\\\\]", " ", title)
    base = re.sub(r"\s+", " ", base).strip() or "Dataset"
    candidate = base[:31]
    suffix = 2
    while candidate.lower() in used_names:
        suffix_text = f" {suffix}"
        candidate = f"{base[:31 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    used_names.add(candidate.lower())
    return candidate


def collect_export_frames():
    frames = []
    excel_row_limit = 1_048_575
    for title, dataframe in report_datasets:
        frame = dataframe.limit(excel_row_limit + 1).toPandas()
        if len(frame.index) > excel_row_limit:
            raise ValueError(
                f"{title} exceeds Excel's worksheet row limit. Narrow the "
                "facility or period instead of publishing a truncated file."
            )
        frames.append((title, frame))
    return frames


def write_excel_workbook(frames, export_path: str) -> None:
    import pandas as pd

    readme = pd.DataFrame(
        [
            ("Report", "Alamo Platform governed overview extract"),
            ("Generated", datetime.now().isoformat(timespec="seconds")),
            ("Facility scope", facility_id or "All communities"),
            ("Start month", start_month),
            ("End month", end_month),
            ("Worksheets", len(frames)),
            (
                "Census definition",
                "Governed census points; not licensed-bed occupancy percentage.",
            ),
            (
                "Discharge outcomes",
                "Provisional mapping requiring business-owner review.",
            ),
            (
                "Internal readmissions",
                "Returns visible in Alamo ElderMark episodes only.",
            ),
            (
                "MAR detail",
                "Exception and PRN detail are bounded to the published 90-day window.",
            ),
        ],
        columns=["Item", "Value"],
    )
    used_names = {"readme"}

    with pd.ExcelWriter(export_path, engine="openpyxl") as writer:
        readme.to_excel(writer, sheet_name="README", index=False)
        for title, frame in frames:
            frame.to_excel(
                writer,
                sheet_name=unique_sheet_name(title, used_names),
                index=False,
            )

        for worksheet in writer.book.worksheets:
            worksheet.freeze_panes = "A2"
            worksheet.auto_filter.ref = worksheet.dimensions
            for column_cells in worksheet.columns:
                values = [
                    "" if cell.value is None else str(cell.value)
                    for cell in list(column_cells)[:500]
                ]
                width = min(max((len(value) for value in values), default=8) + 2, 48)
                worksheet.column_dimensions[column_cells[0].column_letter].width = width


def write_zip_fallback(frames, export_path: str) -> None:
    with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "README.txt",
            "\n".join(
                [
                    "Alamo Platform governed overview extract",
                    f"Generated: {datetime.now().isoformat(timespec='seconds')}",
                    f"Facility scope: {facility_id or 'All communities'}",
                    f"Period: {start_month} through {end_month}",
                ]
            ),
        )
        for index, (title, frame) in enumerate(frames, start=1):
            slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
            archive.writestr(
                f"{index:02d}-{slug or 'dataset'}.csv",
                frame.to_csv(index=False),
            )


def publish_workspace_export() -> str:
    frames = collect_export_frames()
    current_user = spark.sql("SELECT current_user() AS current_user").first()[
        "current_user"
    ]
    export_directory = f"/Workspace/Users/{current_user}/alamo-platform-exports"
    os.makedirs(export_directory, exist_ok=True)

    generated_key = datetime.now().strftime("%Y%m%d-%H%M%S")
    workbook_name = (
        f"alamo-overview-{start_month}-to-{end_month}-{generated_key}.xlsx"
    )
    export_path = os.path.join(export_directory, workbook_name)

    try:
        write_excel_workbook(frames, export_path)
    except ImportError:
        export_path = export_path.removesuffix(".xlsx") + ".zip"
        write_zip_fallback(frames, export_path)

    return export_path


workspace_export_path = publish_workspace_export()
displayHTML(
    "<h2 style='margin-top:32px'>Complete report file ready</h2>"
    "<p>Open Workspace &gt; Home &gt; alamo-platform-exports and download the "
    "newest file.</p>"
)
display(
    spark.createDataFrame(
        [(workspace_export_path,)],
        ["workspace_file"],
    )
)

# COMMAND ----------

print(
    f"overview_report_extract completed. File: {workspace_export_path}. "
    "Review the provisional discharge mapping before publishing outcome percentages."
)
