# Databricks notebook source
# MAGIC %md
# MAGIC # mar_gold_views
# MAGIC
# MAGIC Creates governed medication-order and MAR administration views from the
# MAGIC ElderMark silver tables. Detail remains in Databricks; downstream snapshots
# MAGIC should publish aggregates and bounded exception rows only.

# COMMAND ----------

from datetime import datetime

dbutils.widgets.text("catalog", "alamohealth")
dbutils.widgets.text("silver_schema", "silver")
dbutils.widgets.text("gold_schema", "gold")
dbutils.widgets.text("governed_start_date", "2021-01-01")
dbutils.widgets.text("date_partition", "")

catalog = (dbutils.widgets.get("catalog") or "alamohealth").strip()
silver_schema = (dbutils.widgets.get("silver_schema") or "silver").strip()
gold_schema = (dbutils.widgets.get("gold_schema") or "gold").strip()
governed_start_date = (dbutils.widgets.get("governed_start_date") or "2021-01-01").strip()
date_partition = (dbutils.widgets.get("date_partition") or "").strip()

if not date_partition:
    raise ValueError("Missing required widget: date_partition")

try:
    governed_start = datetime.strptime(governed_start_date, "%Y-%m-%d").date()
    as_of_date = datetime.strptime(date_partition, "%Y-%m-%d").date()
except ValueError as exc:
    raise ValueError("governed_start_date and date_partition must be formatted as YYYY-MM-DD") from exc

if governed_start > as_of_date:
    raise ValueError("governed_start_date cannot be after date_partition")

GOVERNED_START_SQL = f"DATE '{governed_start.isoformat()}'"
AS_OF_SQL = f"DATE '{as_of_date.isoformat()}'"

silver = f"{catalog}.{silver_schema}"
gold = f"{catalog}.{gold_schema}"


def create_view(name: str, sql: str) -> None:
    spark.sql(f"CREATE OR REPLACE VIEW {gold}.{name} AS {sql}")
    print(f"created -> {gold}.{name}")


# COMMAND ----------

create_view(
    "v_mar_medication_orders_current",
    f"""
    WITH facility_names AS (
      SELECT cast(Facility AS string) AS Facility, max(Facility_Name) AS Facility_Name
      FROM {gold}.v_active_residents
      GROUP BY cast(Facility AS string)
    )
    SELECT
      cast(m.Res_Med_ID AS string) AS medication_order_id,
      cast(m.Res_Number AS string) AS resident_id,
      cast(m.Facility AS string) AS facility_id,
      f.Facility_Name AS facility_name,
      trim(m.Medication) AS medication_name,
      nullif(trim(m.Dosage), '') AS dosage,
      nullif(trim(m.Route), '') AS route,
      nullif(trim(m.Schedule), '') AS schedule,
      nullif(trim(m.Passing_Times), '') AS passing_times,
      nullif(trim(m.Instructions), '') AS instructions,
      nullif(trim(m.Indicated_For), '') AS indication,
      nullif(trim(m.Prescribed_by_Code), '') AS prescriber_code,
      nullif(trim(m.Diagnosis_Code), '') AS diagnosis_code,
      cast(coalesce(m.Narcotic, 0) AS int) AS is_narcotic,
      cast(coalesce(m.Psychotropic, 0) AS int) AS is_psychotropic,
      cast(
        CASE
          WHEN lower(coalesce(m.PRN_Scheduled, '')) = 'true'
            OR lower(coalesce(m.Schedule, '')) LIKE '%prn%'
          THEN 1 ELSE 0
        END AS int
      ) AS is_prn,
      cast(CASE WHEN lower(coalesce(m.On_Hold_List, '')) = 'true' THEN 1 ELSE 0 END AS int) AS is_on_hold,
      m.Effective_Date_dt AS effective_date,
      m.Prescription_End_Date_dt AS prescription_end_date,
      m.Archive_Date_dt AS archive_date,
      m.__TIMESTAMP AS source_timestamp
    FROM {silver}.res_medications m
    LEFT JOIN facility_names f
      ON cast(m.Facility AS string) = f.Facility
    WHERE coalesce(m.is_active, 0) = 1
      AND m.Effective_Date_dt <= {AS_OF_SQL}
      AND (m.Prescription_End_Date_dt IS NULL OR m.Prescription_End_Date_dt >= {AS_OF_SQL})
      AND nullif(trim(m.Res_Med_ID), '') IS NOT NULL
      AND nullif(trim(m.Medication), '') IS NOT NULL
    """
)

# COMMAND ----------

create_view(
    "v_mar_administration_detail",
    f"""
    WITH facility_names AS (
      SELECT cast(Facility AS string) AS Facility, max(Facility_Name) AS Facility_Name
      FROM {gold}.v_active_residents
      GROUP BY cast(Facility AS string)
    ), resident_names AS (
      SELECT
        cast(Facility AS string) AS Facility,
        cast(Res_Number AS string) AS Res_Number,
        max(trim(concat(coalesce(First_Name, ''), ' ', coalesce(Last_Name, '')))) AS resident_name
      FROM {silver}.resident
      GROUP BY cast(Facility AS string), cast(Res_Number AS string)
    ), order_detail AS (
      SELECT
        cast(Facility AS string) AS facility_id,
        cast(Res_Number AS string) AS resident_id,
        cast(Res_Med_ID AS string) AS medication_order_id,
        max(nullif(trim(Dosage), '')) AS dosage,
        max(nullif(trim(Route), '')) AS route,
        max(nullif(trim(Schedule), '')) AS schedule,
        max(cast(coalesce(Narcotic, 0) AS int)) AS is_narcotic,
        max(cast(coalesce(Psychotropic, 0) AS int)) AS is_psychotropic
      FROM {silver}.res_medications
      WHERE nullif(trim(Res_Med_ID), '') IS NOT NULL
      GROUP BY cast(Facility AS string), cast(Res_Number AS string), cast(Res_Med_ID AS string)
    ), normalized AS (
      SELECT
        cast(d.Med_Delivery_ID AS string) AS administration_id,
        cast(d.Res_Med_ID AS string) AS medication_order_id,
        cast(d.Res_Number AS string) AS resident_id,
        cast(d.Facility AS string) AS facility_id,
        f.Facility_Name AS facility_name,
        r.resident_name,
        trim(d.Medication) AS medication_name,
        o.dosage,
        o.route,
        o.schedule,
        coalesce(o.is_narcotic, 0) AS is_narcotic,
        coalesce(o.is_psychotropic, 0) AS is_psychotropic,
        coalesce(
          d.Scheduled_Date_dt,
          d.PRN_Result_Date_dt,
          d.Given_or_Recorded_Date_dt,
          d.Create_Date_dt
        ) AS administration_date,
        d.Scheduled_Date_dt AS scheduled_date,
        nullif(trim(d.Scheduled_Time), '') AS scheduled_time,
        nullif(trim(d.Scheduled_When), '') AS scheduled_when,
        d.Given_or_Recorded_Date_dt AS recorded_date,
        nullif(trim(d.Given_or_Recorded_Time), '') AS recorded_time,
        nullif(trim(d.Given_or_Recorded_When), '') AS recorded_when,
        cast(d.Sched_to_Given_Minutes_Late AS int) AS minutes_late,
        CASE
          WHEN lower(trim(coalesce(d.Given, ''))) = 'true'
            OR d.PRN_Result_Date_dt IS NOT NULL
            OR nullif(trim(d.PRN_Results), '') IS NOT NULL
          THEN 'given'
          WHEN nullif(trim(d.Not_Given_Reason), '') IS NOT NULL THEN 'not_given'
          ELSE 'unknown'
        END AS administration_outcome,
        nullif(trim(d.Not_Given_Reason), '') AS not_given_reason,
        nullif(trim(d.Missed_Held_Update_Reason), '') AS missed_or_held_reason,
        cast(CASE WHEN lower(coalesce(d.On_Hold, '')) = 'true' THEN 1 ELSE 0 END AS int) AS is_on_hold,
        cast(
          CASE
            WHEN lower(trim(coalesce(d.PRN, ''))) = 'true'
              OR d.PRN_Result_Date_dt IS NOT NULL
              OR nullif(trim(d.PRN_Results), '') IS NOT NULL
            THEN 1 ELSE 0
          END AS int
        ) AS is_prn,
        nullif(trim(d.PRN_Reason_Given), '') AS prn_reason,
        nullif(trim(d.PRN_Results), '') AS prn_result,
        d.PRN_Result_Date_dt AS prn_result_date,
        nullif(trim(d.PRN_Result_When), '') AS prn_result_when,
        nullif(trim(d.Note), '') AS administration_note,
        nullif(trim(d.Given_or_Recorded_Person_ID), '') AS recorded_by_id,
        nullif(trim(d.Poured_Employee_ID), '') AS poured_by_id,
        d.__TIMESTAMP AS source_timestamp
      FROM {silver}.med_delivery d
      LEFT JOIN facility_names f
        ON cast(d.Facility AS string) = f.Facility
      LEFT JOIN resident_names r
        ON cast(d.Facility AS string) = r.Facility
       AND cast(d.Res_Number AS string) = r.Res_Number
      LEFT JOIN order_detail o
        ON cast(d.Facility AS string) = o.facility_id
       AND cast(d.Res_Number AS string) = o.resident_id
       AND cast(d.Res_Med_ID AS string) = o.medication_order_id
      WHERE coalesce(
          d.Scheduled_Date_dt,
          d.PRN_Result_Date_dt,
          d.Given_or_Recorded_Date_dt,
          d.Create_Date_dt
        ) BETWEEN {GOVERNED_START_SQL} AND {AS_OF_SQL}
        AND nullif(trim(d.Med_Delivery_ID), '') IS NOT NULL
    )
    SELECT
      *,
      CASE
        WHEN administration_outcome = 'given' THEN 'given'
        WHEN lower(coalesce(not_given_reason, '')) RLIKE 'refus|declin|doesn.t need|non.?complian' THEN 'refused'
        WHEN lower(coalesce(not_given_reason, '')) RLIKE 'awol|elope|missing' THEN 'awol'
        WHEN lower(coalesce(not_given_reason, '')) RLIKE 'hospital|emergency room|(^|[^a-z])er([^a-z]|$)|geri.?psych' THEN 'hospital'
        WHEN lower(coalesce(not_given_reason, '')) RLIKE 'family|meds sent|self.?admin|out with' THEN 'offsite_with_meds'
        WHEN is_on_hold = 1 OR lower(coalesce(missed_or_held_reason, '')) RLIKE 'hold|held' THEN 'held'
        WHEN administration_outcome = 'not_given' THEN 'other_not_given'
        ELSE 'unknown'
      END AS outcome_category,
      cast(
        CASE WHEN administration_outcome = 'not_given'
          AND lower(coalesce(not_given_reason, '')) RLIKE 'refus|declin|doesn.t need|non.?complian'
        THEN 1 ELSE 0 END AS int
      ) AS is_refusal,
      cast(CASE WHEN minutes_late > 60 THEN 1 ELSE 0 END AS int) AS is_over_60_minutes_late,
      date_format(administration_date, 'yyyy-MM') AS month_bucket
    FROM normalized
    """
)

# COMMAND ----------

create_view(
    "v_mar_exception_detail",
    f"""
    SELECT *
    FROM {gold}.v_mar_administration_detail
    WHERE administration_outcome <> 'given'
       OR is_over_60_minutes_late = 1
    """
)

# COMMAND ----------

create_view(
    "v_mar_prn_effectiveness",
    f"""
    SELECT
      administration_id,
      medication_order_id,
      resident_id,
      resident_name,
      facility_id,
      facility_name,
      medication_name,
      dosage,
      route,
      administration_date,
      scheduled_date,
      recorded_date,
      administration_outcome,
      prn_reason,
      prn_result,
      prn_result_date,
      prn_result_when,
      cast(CASE WHEN prn_result IS NOT NULL OR prn_result_date IS NOT NULL THEN 1 ELSE 0 END AS int) AS has_effectiveness_followup,
      month_bucket
    FROM {gold}.v_mar_administration_detail
    WHERE is_prn = 1
      AND (
        administration_outcome = 'given'
        OR prn_result IS NOT NULL
        OR prn_result_date IS NOT NULL
      )
    """
)

# COMMAND ----------

create_view(
    "v_mar_monthly_by_community_medication",
    f"""
    SELECT
      facility_id,
      max(facility_name) AS facility_name,
      month_bucket,
      medication_name,
      count(*) AS administration_count,
      sum(CASE WHEN is_prn = 0 THEN 1 ELSE 0 END) AS scheduled_count,
      sum(CASE WHEN is_prn = 0 AND administration_outcome = 'given' THEN 1 ELSE 0 END) AS given_count,
      sum(CASE WHEN is_prn = 0 AND administration_outcome = 'not_given' THEN 1 ELSE 0 END) AS not_given_count,
      sum(is_refusal) AS refusal_count,
      sum(CASE WHEN is_prn = 1 AND administration_outcome = 'given' THEN 1 ELSE 0 END) AS prn_given_count,
      sum(CASE WHEN outcome_category = 'awol' THEN 1 ELSE 0 END) AS awol_count,
      sum(CASE WHEN outcome_category = 'hospital' THEN 1 ELSE 0 END) AS hospital_count,
      sum(CASE WHEN administration_outcome = 'unknown' THEN 1 ELSE 0 END) AS unknown_count,
      count(DISTINCT resident_id) AS resident_count,
      round(
        sum(CASE WHEN is_prn = 0 AND administration_outcome = 'given' THEN 1 ELSE 0 END) /
        nullif(sum(CASE WHEN is_prn = 0 THEN 1 ELSE 0 END), 0) * 100,
        2
      ) AS compliance_pct
    FROM {gold}.v_mar_administration_detail
    GROUP BY facility_id, month_bucket, medication_name
    """
)

# COMMAND ----------

create_view(
    "v_mar_resident_summary",
    f"""
    WITH residents AS (
      SELECT
        cast(Res_Number AS string) AS resident_id,
        max(trim(concat(coalesce(First_Name, ''), ' ', coalesce(Last_Name, '')))) AS resident_name,
        cast(Facility AS string) AS facility_id,
        max(Facility_Name) AS facility_name
      FROM {gold}.v_active_residents
      GROUP BY cast(Res_Number AS string), cast(Facility AS string)
    ), order_rollup AS (
      SELECT
        resident_id,
        facility_id,
        count(DISTINCT medication_order_id) AS active_medication_count,
        sum(is_psychotropic) AS active_psychotropic_count,
        sum(is_narcotic) AS active_narcotic_count,
        sum(is_prn) AS active_prn_count
      FROM {gold}.v_mar_medication_orders_current
      GROUP BY resident_id, facility_id
    ), administration_rollup AS (
      SELECT
        resident_id,
        facility_id,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 7) AND is_prn = 0 THEN 1 ELSE 0 END) AS scheduled_7d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 7) AND is_prn = 0 AND administration_outcome = 'given' THEN 1 ELSE 0 END) AS given_7d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 7) THEN is_refusal ELSE 0 END) AS refusals_7d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 30) AND is_prn = 0 THEN 1 ELSE 0 END) AS scheduled_30d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 30) AND is_prn = 0 AND administration_outcome = 'given' THEN 1 ELSE 0 END) AS given_30d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 30) AND is_prn = 0 AND administration_outcome = 'not_given' THEN 1 ELSE 0 END) AS not_given_30d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 30) THEN is_refusal ELSE 0 END) AS refusals_30d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 90) AND is_prn = 0 THEN 1 ELSE 0 END) AS scheduled_90d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 90) AND is_prn = 0 AND administration_outcome = 'given' THEN 1 ELSE 0 END) AS given_90d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 90) AND is_prn = 0 AND administration_outcome = 'not_given' THEN 1 ELSE 0 END) AS not_given_90d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 90) THEN is_refusal ELSE 0 END) AS refusals_90d,
        max(recorded_date) AS last_recorded_date
      FROM {gold}.v_mar_administration_detail
      WHERE administration_date >= date_sub({AS_OF_SQL}, 90)
      GROUP BY resident_id, facility_id
    ), prn_rollup AS (
      SELECT
        resident_id,
        facility_id,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 30) THEN 1 ELSE 0 END) AS prn_given_30d,
        sum(CASE WHEN administration_date >= date_sub({AS_OF_SQL}, 30) AND has_effectiveness_followup = 1 THEN 1 ELSE 0 END) AS prn_followup_30d
      FROM {gold}.v_mar_prn_effectiveness
      WHERE administration_date >= date_sub({AS_OF_SQL}, 30)
      GROUP BY resident_id, facility_id
    )
    SELECT
      r.*,
      coalesce(o.active_medication_count, 0) AS active_medication_count,
      coalesce(o.active_psychotropic_count, 0) AS active_psychotropic_count,
      coalesce(o.active_narcotic_count, 0) AS active_narcotic_count,
      coalesce(o.active_prn_count, 0) AS active_prn_count,
      coalesce(a.scheduled_7d, 0) AS scheduled_7d,
      coalesce(a.given_7d, 0) AS given_7d,
      coalesce(a.refusals_7d, 0) AS refusals_7d,
      coalesce(a.scheduled_30d, 0) AS scheduled_30d,
      coalesce(a.given_30d, 0) AS given_30d,
      coalesce(a.not_given_30d, 0) AS not_given_30d,
      coalesce(a.refusals_30d, 0) AS refusals_30d,
      coalesce(a.scheduled_90d, 0) AS scheduled_90d,
      coalesce(a.given_90d, 0) AS given_90d,
      coalesce(a.not_given_90d, 0) AS not_given_90d,
      coalesce(a.refusals_90d, 0) AS refusals_90d,
      a.last_recorded_date,
      coalesce(p.prn_given_30d, 0) AS prn_given_30d,
      coalesce(p.prn_followup_30d, 0) AS prn_followup_30d,
      round(CASE WHEN a.scheduled_30d > 0 THEN a.given_30d / a.scheduled_30d * 100 ELSE NULL END, 2) AS compliance_pct_30d
    FROM residents r
    LEFT JOIN order_rollup o
      ON r.resident_id = o.resident_id AND r.facility_id = o.facility_id
    LEFT JOIN administration_rollup a
      ON r.resident_id = a.resident_id AND r.facility_id = a.facility_id
    LEFT JOIN prn_rollup p
      ON r.resident_id = p.resident_id AND r.facility_id = p.facility_id
    """
)

# COMMAND ----------

create_view(
    "v_mar_data_quality",
    f"""
    SELECT
      count(*) AS administration_rows,
      count(DISTINCT administration_id) AS distinct_administration_ids,
      sum(CASE WHEN administration_outcome = 'given' THEN 1 ELSE 0 END) AS given_rows,
      sum(CASE WHEN administration_outcome = 'not_given' THEN 1 ELSE 0 END) AS not_given_rows,
      sum(CASE WHEN administration_outcome = 'unknown' THEN 1 ELSE 0 END) AS unknown_rows,
      round(sum(CASE WHEN administration_outcome = 'unknown' THEN 1 ELSE 0 END) / count(*) * 100, 2) AS unknown_pct,
      min(administration_date) AS earliest_administration_date,
      max(administration_date) AS latest_administration_date,
      sum(CASE WHEN administration_date > {AS_OF_SQL} THEN 1 ELSE 0 END) AS future_rows,
      sum(CASE WHEN resident_id IS NULL OR resident_id = '' THEN 1 ELSE 0 END) AS missing_resident_rows,
      sum(CASE WHEN medication_name IS NULL OR medication_name = '' THEN 1 ELSE 0 END) AS missing_medication_rows
    FROM {gold}.v_mar_administration_detail
    """
)

# COMMAND ----------

print("mar_gold_views completed successfully.")

# COMMAND ----------

quality = spark.table(f"{gold}.v_mar_data_quality").first().asDict(recursive=True)
active_resident_count = spark.sql(
    f"SELECT count(*) AS value FROM (SELECT DISTINCT cast(Facility AS string), cast(Res_Number AS string) FROM {gold}.v_active_residents)"
).first()["value"]
resident_summary_count = spark.table(f"{gold}.v_mar_resident_summary").count()
active_order_count = spark.table(f"{gold}.v_mar_medication_orders_current").count()
prn_row_count = spark.table(f"{gold}.v_mar_prn_effectiveness").count()
prn_admin_count = spark.sql(
    f"SELECT count(*) AS value FROM {gold}.v_mar_administration_detail WHERE is_prn = 1"
).first()["value"]
prn_source_count = spark.sql(
    f"""
    SELECT count(*) AS value
    FROM {silver}.med_delivery
    WHERE coalesce(Scheduled_Date_dt, PRN_Result_Date_dt, Given_or_Recorded_Date_dt, Create_Date_dt)
      BETWEEN {GOVERNED_START_SQL} AND {AS_OF_SQL}
      AND (
        lower(trim(coalesce(PRN, ''))) = 'true'
        OR PRN_Result_Date_dt IS NOT NULL
        OR nullif(trim(PRN_Results), '') IS NOT NULL
      )
    """
).first()["value"]

checks = {
    "administration_rows_present": quality["administration_rows"] > 0,
    "administration_ids_unique": quality["administration_rows"] == quality["distinct_administration_ids"],
    "no_future_administration_rows": quality["future_rows"] == 0,
    "resident_ids_complete": quality["missing_resident_rows"] == 0,
    "medication_names_complete": quality["missing_medication_rows"] == 0,
    "active_orders_present": active_order_count > 0,
    "resident_summary_complete": resident_summary_count == active_resident_count,
    "prn_flags_present": prn_admin_count > 0,
    "prn_effectiveness_present": prn_row_count > 0,
    "prn_detail_reconciles": prn_admin_count == prn_source_count,
}

result = {
    "checks": checks,
    "quality": {key: (value.isoformat() if hasattr(value, "isoformat") else value) for key, value in quality.items()},
    "active_order_count": active_order_count,
    "active_resident_count": active_resident_count,
    "resident_summary_count": resident_summary_count,
    "prn_row_count": prn_row_count,
    "prn_admin_count": prn_admin_count,
    "prn_source_count": prn_source_count,
}

print(f"MAR_GOLD_RESULT={result}")
if quality["unknown_pct"] > 15:
    print(f"WARNING: unknown administration outcomes are {quality['unknown_pct']}% of governed rows.")

failed = [check_id for check_id, passed in checks.items() if not passed]
if failed:
    raise ValueError(f"MAR gold validation failed: {', '.join(failed)}")
