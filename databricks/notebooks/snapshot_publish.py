# Databricks notebook source
# MAGIC %md
# MAGIC # snapshot_publish
# MAGIC
# MAGIC Production snapshot publisher for Alamo Platform.
# MAGIC
# MAGIC Reads:
# MAGIC
# MAGIC - `alamohealth.gold.v_tool_resident_profile`
# MAGIC - `alamohealth.gold.v_incidents`
# MAGIC - `alamohealth.gold.v_census`
# MAGIC - `alamohealth.gold.v_medication_compliance`
# MAGIC - `alamohealth.gold.v_refusal_by_medication`
# MAGIC - `alamohealth.gold.v_documentation_gaps`
# MAGIC
# MAGIC Publishes:
# MAGIC
# MAGIC - `snapshots/daily/latest.json`
# MAGIC - `snapshots/daily/YYYY-MM-DD.json`

# COMMAND ----------

dbutils.widgets.text("storage_account", "alamodatalake")
dbutils.widgets.text("container", "alamo-platform-snapshots")
dbutils.widgets.text("snapshot_root", "snapshots/daily")
dbutils.widgets.text("date_partition", "")

dbutils.widgets.text("entra_tenant_id", "d72d9036-cff8-4f5f-a6fa-d698f621d420")
dbutils.widgets.text("entra_client_id", "40283155-592b-4565-bd3c-c730a34feaaa")
dbutils.widgets.text("entra_client_secret", "")

# COMMAND ----------

import json
from calendar import monthrange
from collections import Counter
from datetime import date, datetime, timezone

from azure.identity import ClientSecretCredential
from azure.storage.blob import BlobServiceClient, ContentSettings

# COMMAND ----------


def require_widget(name: str) -> str:
    try:
        value = dbutils.widgets.get(name)
    except Exception as exc:
        raise ValueError(
            f"Widget '{name}' is not available. Run the widget-definition cell at the top of the notebook first."
        ) from exc

    value = value.strip() if value is not None else ""
    if not value:
        raise ValueError(
            f"Widget '{name}' is required but empty. Fill it in before running the notebook."
        )
    return value


def optional_widget(name: str) -> str:
    try:
        value = dbutils.widgets.get(name)
    except Exception:
        return ""
    return value.strip() if value is not None else ""


def rows(query: str):
    return [row.asDict(recursive=True) for row in spark.sql(query).collect()]


def optional_rows(query: str):
    try:
        return rows(query)
    except Exception as exc:
        print(f"optional query unavailable: {exc}")
        return []


def required_rows(query: str, label: str):
    result = rows(query)
    if not result:
        raise ValueError(
            f"Required snapshot source '{label}' returned 0 rows. "
            "Run the upstream gold/tool-context notebooks before snapshot_publish."
        )
    return result


def normalize_str(value):
    return "" if value is None else str(value).strip()


def normalize_nullable(value):
    value = normalize_str(value)
    return value or None


def normalize_int(value):
    if value is None:
        return 0
    return int(round(float(value)))


def normalize_float(value):
    if value is None:
        return 0.0
    return float(value)


def iso_value(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def format_month_label(value):
    if not value:
        return "—"
    year, month = str(value).split("-")
    dt = datetime(int(year), int(month), 1)
    return dt.strftime("%B %Y")


def resolve_snapshot_as_of_date() -> date:
    try:
        row = spark.sql(
            """
            SELECT
              cast(max(snapshot_date) AS string) AS snapshot_date,
              max(month_bucket) AS month_bucket
            FROM alamohealth.gold.v_census
            """
        ).first()
    except Exception as exc:
        raise ValueError(
            "date_partition was not supplied and snapshot_publish could not derive an as-of date from alamohealth.gold.v_census"
        ) from exc

    if row and row["snapshot_date"]:
        return datetime.strptime(str(row["snapshot_date"])[:10], "%Y-%m-%d").date()
    if row and row["month_bucket"]:
        year, month = [int(part) for part in str(row["month_bucket"])[:7].split("-")]
        return date(year, month, monthrange(year, month)[1])

    raise ValueError(
        "date_partition was not supplied and alamohealth.gold.v_census has no snapshot_date or month_bucket to anchor snapshot_publish"
    )


def summarize_counts(values):
    counts = Counter()
    for value in values:
        key = normalize_str(value) or "Unknown"
        counts[key] += 1
    return [
        {"label": label, "count": count}
        for label, count in counts.most_common()
    ]


def priority_from_incident(row):
    category = normalize_str(row.get("Incident_Category") or row.get("Type_of_Incident")).lower()
    detail = normalize_str(row.get("What_Staff_Saw")).lower()
    has_injury = normalize_str(row.get("Injuires_YN")).lower() == "yes"
    sentinel = normalize_str(row.get("Sentinel_Event_YN")).lower() == "yes"
    police = normalize_str(row.get("Notify_EmergSrvs_YN")).lower() == "yes"

    if (
        sentinel
        or police
        or has_injury
        or "death" in category
        or "aggression" in category
        or "mental health crisis" in category
        or "911" in category
        or "arrested" in detail
    ):
        return "HIGH"

    if (
        "medication" in category
        or "medical" in category
        or "fall" in category
        or "transport" in category
        or "awol" in category
    ):
        return "MEDIUM"

    return "LOW"


def incident_flags(row):
    flags = []

    if normalize_str(row.get("Sentinel_Event_YN")).lower() == "yes":
        flags.append("sentinel")
    if normalize_str(row.get("Notify_EmergSrvs_YN")).lower() == "yes":
        flags.append("911")
    if normalize_str(row.get("Notify_Physician_YN")).lower() == "yes":
        flags.append("physician")
    if normalize_str(row.get("Notify_Family_YN")).lower() == "yes":
        flags.append("family")
    if normalize_str(row.get("Injuires_YN")).lower() == "yes":
        flags.append("injury")
    if normalize_str(row.get("Prev_History_YN")).lower() == "yes":
        flags.append("history")

    return flags


def build_communities_dashboard():
    occupancy_rows = rows(
        """
        SELECT
          Facility,
          Facility_Name,
          census AS active_residents
        FROM alamohealth.gold.v_tool_community_operating_summary
        ORDER BY Facility
        """
    )

    resident_rows = rows(
        """
        SELECT
          Res_Number,
          First_Name,
          Last_Name,
          Age,
          Admit_Date,
          LOS_Days,
          Facility,
          Facility_Name,
          Unit_Number,
          Care_Level,
          Payor_Text,
          Primary_Diagnosis,
          Physician_Name,
          Diet
        FROM alamohealth.gold.v_tool_resident_profile
        """
    )

    incident_rows = rows(
        f"""
        SELECT
          Facility,
          Incident_Category,
          Incident_Date_parsed,
          date_format(Incident_Date_parsed, 'yyyy-MM') AS month_bucket,
          count(*) AS incident_count
        FROM alamohealth.gold.v_incidents
        WHERE Incident_Date_parsed >= add_months({SNAPSHOT_AS_OF_SQL}, -6)
        GROUP BY Facility, Incident_Category, Incident_Date_parsed, date_format(Incident_Date_parsed, 'yyyy-MM')
        """
    )

    census_rows = rows(
        f"""
        SELECT Facility, census, month_bucket
        FROM alamohealth.gold.v_census
        WHERE month_bucket <= date_format({SNAPSHOT_AS_OF_SQL}, 'yyyy-MM')
        ORDER BY month_bucket DESC, Facility
        """
    )

    facilities = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "community_name": normalize_str(row["Facility_Name"]) or "Unknown Facility",
            "community_code": normalize_str(row["Facility"]),
            "city": normalize_str(row["Facility_Name"]),
            "state": "CA",
            "total_residents": normalize_int(row["active_residents"]),
        }
        for row in occupancy_rows
    ]

    residents = [
        {
            "res_number": str(row["Res_Number"]),
            "first_name": normalize_str(row["First_Name"]),
            "last_name": normalize_str(row["Last_Name"]),
            "age": normalize_int(row["Age"]),
            "admit_date": normalize_nullable(row["Admit_Date"]),
            "los_days": normalize_int(row["LOS_Days"]),
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "unit_number": normalize_nullable(row["Unit_Number"]),
            "care_level": normalize_nullable(row["Care_Level"]),
            "payor": normalize_nullable(row["Payor_Text"]),
            "primary_diagnosis": normalize_nullable(row["Primary_Diagnosis"]),
            "physician": normalize_nullable(row["Physician_Name"]),
            "diet": normalize_nullable(row["Diet"]),
        }
        for row in resident_rows
    ]

    incidents = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "category": normalize_str(row["Incident_Category"]) or "General",
            "incident_date": iso_value(row["Incident_Date_parsed"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "incident_count": normalize_int(row["incident_count"]),
            "period": normalize_str(row["month_bucket"]),
        }
        for row in incident_rows
    ]

    census = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "census": normalize_int(row["census"]),
            "month_bucket": normalize_str(row["month_bucket"]),
        }
        for row in census_rows
    ]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "as_of_date": expected_as_of_date,
        "facilities": facilities,
        "residents": residents,
        "incidents": incidents,
        # Detailed narratives are published once in toolContext and hydrated by
        # the community endpoint. Duplicating them here can exceed the 64 MB
        # platform snapshot contract without adding any data.
        "incidentDetails": [],
        "census": census,
    }


def build_reports_summary():
    census_rows = rows(
        f"""
        SELECT Facility, census, month_bucket
        FROM alamohealth.gold.v_census
        WHERE month_bucket <= date_format({SNAPSHOT_AS_OF_SQL}, 'yyyy-MM')
        ORDER BY month_bucket DESC, Facility
        """
    )

    compliance_rows = rows(
        """
        SELECT Facility, Facility_Name, month_bucket, total_scheduled, given, not_given, compliance_pct
        FROM alamohealth.gold.v_medication_compliance
        ORDER BY month_bucket DESC, Facility
        LIMIT 120
        """
    )

    refusal_rows = rows(
        """
        SELECT Facility, Medication, total_scheduled, refusals, refusal_pct
        FROM alamohealth.gold.v_refusal_by_medication
        ORDER BY refusal_pct DESC, refusals DESC
        LIMIT 25
        """
    )

    gap_rows = rows(
        """
        SELECT Res_Number, First_Name, Last_Name, Facility, Facility_Name, last_note_date, days_since_last_note
        FROM alamohealth.gold.v_documentation_gaps
        ORDER BY days_since_last_note DESC
        LIMIT 25
        """
    )

    tool_context = build_tool_context_summary()

    return {
        "census": [
            {
                "facility_id": normalize_str(row["Facility"]),
                "census": normalize_int(row["census"]),
                "month_bucket": normalize_str(row["month_bucket"]),
            }
            for row in census_rows
        ],
        "medicationCompliance": [
            {
                "facility_id": normalize_str(row["Facility"]),
                "facility_name": normalize_str(row["Facility_Name"]),
                "month_bucket": normalize_str(row["month_bucket"]),
                "total_scheduled": normalize_int(row["total_scheduled"]),
                "given": normalize_int(row["given"]),
                "not_given": normalize_int(row["not_given"]),
                "compliance_pct": normalize_float(row["compliance_pct"]),
            }
            for row in compliance_rows
        ],
        "refusalByMedication": [
            {
                "facility_id": normalize_str(row["Facility"]),
                "medication": normalize_str(row["Medication"]),
                "total_scheduled": normalize_int(row["total_scheduled"]),
                "refusals": normalize_int(row["refusals"]),
                "refusal_pct": normalize_float(row["refusal_pct"]),
            }
            for row in refusal_rows
        ],
        "documentationGaps": [
            {
                "resident_id": str(row["Res_Number"]),
                "resident_name": " ".join(
                    part
                    for part in [normalize_str(row["First_Name"]), normalize_str(row["Last_Name"])]
                    if part
                ),
                "facility_id": normalize_str(row["Facility"]),
                "facility_name": normalize_str(row["Facility_Name"]),
                "last_note_date": iso_value(row["last_note_date"]),
                "days_since_last_note": normalize_int(row["days_since_last_note"]),
            }
            for row in gap_rows
        ],
        "toolContext": tool_context,
    }


def build_tool_context_summary():
    community_operating_rows = required_rows(
        """
        SELECT
          Facility,
          Facility_Name,
          resident_rows,
          census_month,
          census,
          prior_census,
          census_delta,
          incident_month,
          incidents,
          incidents_per_100_residents,
          average_age,
          average_los_days,
          medication_month,
          compliance_pct,
          documentation_gap_rows,
          largest_documentation_gap_days
        FROM alamohealth.gold.v_tool_community_operating_summary
        ORDER BY Facility
        """,
        "v_tool_community_operating_summary",
    )

    incident_monthly_rows = required_rows(
        """
        SELECT
          Facility,
          Facility_Name,
          Incident_Category,
          month_bucket,
          incident_count,
          resident_count,
          latest_incident_date
        FROM alamohealth.gold.v_tool_incident_monthly_by_community_category
        ORDER BY month_bucket DESC, Facility, incident_count DESC
        """,
        "v_tool_incident_monthly_by_community_category",
    )

    current_incident_detail_rows = optional_rows(
        """
        SELECT
          Unique_ID,
          Facility,
          Facility_Name,
          Res_Number,
          First_Name,
          Last_Name,
          Unit_Number,
          Incident_Date_parsed,
          __TIMESTAMP,
          Incident_Category,
          Type_of_Incident,
          Location_of_Incident_General,
          Location_of_Incident_Specific,
          What_Staff_Saw,
          Assistance_Given,
          Injuires_YN,
          Notify_EmergSrvs_YN,
          Sentinel_Event_YN,
          Prev_History_YN,
          month_bucket
        FROM alamohealth.gold.v_tool_incident_detail_current_month
        ORDER BY coalesce(__TIMESTAMP, Incident_Date_parsed) DESC
        LIMIT 750
        """
    )

    historical_incident_detail_rows = optional_rows(
        f"""
        SELECT
          Unique_ID,
          Facility,
          Facility_Name,
          Res_Number,
          First_Name,
          Last_Name,
          Unit_Number,
          Incident_Date_parsed,
          __TIMESTAMP,
          Incident_Category,
          Type_of_Incident,
          Location_of_Incident_General,
          Location_of_Incident_Specific,
          What_Staff_Saw,
          Assistance_Given,
          Injuires_YN,
          Notify_EmergSrvs_YN,
          Sentinel_Event_YN,
          Prev_History_YN,
          month_bucket
        FROM alamohealth.gold.v_tool_incident_detail_history
        WHERE Incident_Date_parsed >= add_months(trunc({SNAPSHOT_AS_OF_SQL}, 'MM'), -18)
        ORDER BY coalesce(__TIMESTAMP, Incident_Date_parsed) DESC
        LIMIT 15000
        """
    )

    resident_profile_rows = required_rows(
        """
        SELECT
          Res_Number,
          resident_name,
          First_Name,
          Last_Name,
          Age,
          Admit_Date,
          LOS_Days,
          Facility,
          Facility_Name,
          Unit_Number,
          Care_Level,
          Payor_Text,
          Primary_Diagnosis,
          Physician_Name,
          Diet,
          incident_count_all_time,
          incident_count_30d,
          incident_count_90d,
          incident_count_180d,
          last_incident_date,
          last_incident_category,
          last_note_date,
          days_since_last_note
        FROM alamohealth.gold.v_tool_resident_profile_enriched
        ORDER BY Facility, resident_name
        LIMIT 1000
        """,
        "v_tool_resident_profile_enriched",
    )

    resident_incident_summary_rows = optional_rows(
        """
        SELECT
          Facility,
          Facility_Name,
          Res_Number,
          resident_name,
          incident_count_all_time,
          incident_count_30d,
          incident_count_90d,
          incident_count_180d,
          last_incident_date,
          last_incident_category
        FROM alamohealth.gold.v_tool_resident_incident_summary
        ORDER BY incident_count_90d DESC, incident_count_all_time DESC
        LIMIT 500
        """
    )

    documentation_status_rows = optional_rows(
        """
        SELECT
          Res_Number,
          resident_name,
          Facility,
          Facility_Name,
          last_note_date,
          days_since_last_note
        FROM alamohealth.gold.v_tool_documentation_status
        ORDER BY days_since_last_note DESC
        LIMIT 500
        """
    )

    resident_episode_rows = optional_rows(
        """
        SELECT
          episode_id,
          Facility,
          Facility_Name,
          Res_Number,
          resident_name,
          admit_date,
          discharge_date,
          discharge_reason,
          discharge_destination,
          episode_status,
          month_bucket,
          source_table
        FROM alamohealth.gold.v_tool_resident_episode_history
        ORDER BY coalesce(admit_date, discharge_date) DESC, Facility, resident_name
        """
    )

    resident_flow_weekly_rows = optional_rows(
        f"""
        SELECT
          Facility,
          Facility_Name,
          week_start,
          month_bucket,
          admissions,
          discharges,
          net_change,
          admitted_residents,
          discharged_residents,
          source_rows
        FROM alamohealth.gold.v_tool_resident_flow_weekly_by_community
        WHERE week_start >= trunc(add_months({SNAPSHOT_AS_OF_SQL}, -52), 'MM')
          AND week_start <= {SNAPSHOT_AS_OF_SQL}
        ORDER BY week_start DESC, Facility
        """
    )

    resident_flow_monthly_rows = optional_rows(
        """
        SELECT
          Facility,
          Facility_Name,
          month_bucket,
          admissions,
          discharges,
          net_change,
          admitted_residents,
          discharged_residents,
          source_rows
        FROM alamohealth.gold.v_tool_resident_flow_monthly_by_community
        ORDER BY month_bucket DESC, Facility
        """
    )

    census_weekly_rows = optional_rows(
        f"""
        SELECT
          Facility,
          Facility_Name,
          week_start,
          week_end,
          census_date,
          prior_census_date,
          month_bucket,
          census,
          census_7d_prior,
          census_change_7d
        FROM alamohealth.gold.v_tool_census_weekly_by_community
        WHERE week_start >= trunc(add_months({SNAPSHOT_AS_OF_SQL}, -52), 'MM')
          AND week_start <= {SNAPSHOT_AS_OF_SQL}
        ORDER BY week_start DESC, Facility
        """
    )

    census_quality_rows = optional_rows(
        """
        SELECT
          Facility,
          Facility_Name,
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
        FROM alamohealth.gold.v_tool_census_data_quality
        ORDER BY Facility
        LIMIT 500
        """
    )

    resident_countability_rows = optional_rows(
        """
        SELECT
          Facility,
          Facility_Name,
          Res_Number,
          resident_name,
          admit_date,
          discharge_date,
          is_countable_resident,
          is_suspect_test_resident,
          resident_exclusion_reason
        FROM alamohealth.gold.v_tool_resident_countability_audit
        ORDER BY Facility, resident_name
        LIMIT 2500
        """
    )

    resident_unit_history_rows = optional_rows(
        f"""
        SELECT
          Facility,
          Facility_Name,
          Res_Number,
          resident_name,
          unit_number,
          start_date,
          end_date,
          month_bucket
        FROM alamohealth.gold.v_tool_resident_unit_history
        WHERE coalesce(start_date, end_date) >= add_months({SNAPSHOT_AS_OF_SQL}, -60)
        ORDER BY coalesce(start_date, end_date) DESC, Facility, resident_name
        LIMIT 15000
        """
    )

    services_provided_rows = optional_rows(
        f"""
        SELECT
          Facility,
          Facility_Name,
          Res_Number,
          resident_name,
          service_date,
          month_bucket,
          service_type,
          employee_id,
          service_status,
          service_units,
          source_table
        FROM alamohealth.gold.v_tool_services_provided
        WHERE service_date >= add_months({SNAPSHOT_AS_OF_SQL}, -18)
        ORDER BY service_date DESC, Facility, resident_name
        LIMIT 15000
        """
    )

    assessment_summary_rows = optional_rows(
        f"""
        SELECT
          Facility,
          Facility_Name,
          Res_Number,
          resident_name,
          assessment_date,
          month_bucket,
          assessment_type,
          assessment_status,
          assessment_score
        FROM alamohealth.gold.v_tool_assessment_summary
        WHERE assessment_date >= add_months({SNAPSHOT_AS_OF_SQL}, -24)
        ORDER BY assessment_date DESC, Facility, resident_name
        LIMIT 10000
        """
    )

    notes_summary_rows = optional_rows(
        f"""
        SELECT
          Facility,
          Facility_Name,
          Res_Number,
          resident_name,
          note_date,
          month_bucket,
          note_type,
          note_text,
          action_required_by_date
        FROM alamohealth.gold.v_tool_notes_summary
        WHERE note_date >= add_months({SNAPSHOT_AS_OF_SQL}, -12)
        ORDER BY note_date DESC, Facility, resident_name
        LIMIT 15000
        """
    )

    medication_refusal_rows = optional_rows(
        """
        SELECT
          Facility,
          Medication,
          total_scheduled,
          refusals,
          refusal_pct
        FROM alamohealth.gold.v_tool_medication_refusal_summary
        ORDER BY refusals DESC, refusal_pct DESC
        LIMIT 500
        """
    )

    medication_compliance_rows = optional_rows(
        """
        SELECT
          Facility,
          Facility_Name,
          month_bucket,
          total_scheduled,
          given,
          not_given,
          compliance_pct
        FROM alamohealth.gold.v_tool_medication_compliance_monthly
        ORDER BY month_bucket DESC, Facility
        """
    )

    mar_monthly_rows = required_rows(
        """
        SELECT
          facility_id,
          facility_name,
          month_bucket,
          medication_name,
          administration_count,
          scheduled_count,
          given_count,
          not_given_count,
          refusal_count,
          prn_given_count,
          awol_count,
          hospital_count,
          unknown_count,
          resident_count,
          compliance_pct
        FROM alamohealth.gold.v_tool_mar_monthly_by_community_medication
        ORDER BY month_bucket DESC, facility_id, administration_count DESC
        LIMIT 15000
        """,
        "v_tool_mar_monthly_by_community_medication",
    )

    mar_resident_summary_rows = required_rows(
        """
        SELECT *
        FROM alamohealth.gold.v_tool_mar_resident_summary
        ORDER BY facility_id, resident_name
        LIMIT 1000
        """,
        "v_tool_mar_resident_summary",
    )

    mar_exception_rows = optional_rows(
        """
        SELECT *
        FROM alamohealth.gold.v_tool_mar_exception_detail_90d
        ORDER BY administration_date DESC, administration_id DESC
        """
    )

    mar_prn_effectiveness_rows = optional_rows(
        """
        SELECT *
        FROM alamohealth.gold.v_tool_mar_prn_effectiveness_90d
        ORDER BY administration_date DESC, administration_id DESC
        """
    )

    mar_medication_order_rows = required_rows(
        """
        SELECT *
        FROM alamohealth.gold.v_tool_mar_medication_orders_current
        ORDER BY facility_id, resident_name, medication_name
        """,
        "v_tool_mar_medication_orders_current",
    )

    manifest_rows = required_rows(
        """
        SELECT
          slice_name,
          grain,
          row_count,
          min_period,
          max_period,
          facility_ids,
          fields,
          generated_at
        FROM alamohealth.gold.v_tool_context_manifest
        ORDER BY slice_name
        """,
        "v_tool_context_manifest",
    )

    analyst_qa_rows = optional_rows(
        """
        SELECT
          run_id,
          generated_at,
          check_id,
          domain,
          severity,
          status,
          expected,
          actual,
          detail
        FROM alamohealth.gold.v_tool_context_qa_latest
        ORDER BY severity, check_id
        """
    )

    community_operating_summary = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "resident_rows": normalize_int(row["resident_rows"]),
            "census_month": normalize_str(row["census_month"]),
            "census": normalize_int(row["census"]),
            "prior_census": normalize_int(row["prior_census"]),
            "census_delta": normalize_int(row["census_delta"]),
            "incident_month": normalize_str(row["incident_month"]),
            "incidents": normalize_int(row["incidents"]),
            "incidents_per_100_residents": normalize_float(row["incidents_per_100_residents"]),
            "average_age": normalize_float(row["average_age"]),
            "average_los_days": normalize_float(row["average_los_days"]),
            "medication_month": normalize_str(row["medication_month"]),
            "compliance_pct": None if row["compliance_pct"] is None else normalize_float(row["compliance_pct"]),
            "documentation_gap_rows": normalize_int(row["documentation_gap_rows"]),
            "largest_documentation_gap_days": normalize_int(row["largest_documentation_gap_days"]),
        }
        for row in community_operating_rows
    ]

    incident_monthly_by_community_category = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "category": normalize_str(row["Incident_Category"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "incident_count": normalize_int(row["incident_count"]),
            "resident_count": normalize_int(row["resident_count"]),
            "latest_incident_date": iso_value(row["latest_incident_date"]),
        }
        for row in incident_monthly_rows
    ]

    def normalize_incident_detail_rows(source_rows):
        return [
          {
            "id": str(row["Unique_ID"]),
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "resident_id": str(row["Res_Number"]) if row["Res_Number"] is not None else "",
            "client_name": " ".join(
                part
                for part in [normalize_str(row["First_Name"]), normalize_str(row["Last_Name"])]
                if part
            ) or (f"Resident {row['Res_Number']}" if row["Res_Number"] is not None else "Unknown Resident"),
            "unit_number": normalize_nullable(row["Unit_Number"]),
            "incident_date": iso_value(row["Incident_Date_parsed"]),
            "received_at": iso_value(row["__TIMESTAMP"]),
            "category": normalize_str(row["Incident_Category"]) or "General",
            "incident_type": normalize_str(row["Type_of_Incident"]),
            "location": " · ".join(
                part
                for part in [
                    normalize_str(row["Location_of_Incident_General"]),
                    normalize_str(row["Location_of_Incident_Specific"]),
                ]
                if part
            ),
            "email_body": normalize_nullable(row["What_Staff_Saw"]),
            "assistance_given": normalize_nullable(row["Assistance_Given"]),
            "injury_occurred": normalize_str(row["Injuires_YN"]).lower() == "yes",
            "police_called": normalize_str(row["Notify_EmergSrvs_YN"]).lower() == "yes",
            "sentinel_event": normalize_str(row["Sentinel_Event_YN"]).lower() == "yes",
            "previous_history": normalize_str(row["Prev_History_YN"]).lower() == "yes",
            "month_bucket": normalize_str(row["month_bucket"]),
          }
          for row in source_rows
        ]

    current_incident_details = normalize_incident_detail_rows(current_incident_detail_rows)
    incident_detail_history = normalize_incident_detail_rows(historical_incident_detail_rows)

    resident_profiles = [
        {
            "res_number": str(row["Res_Number"]),
            "resident_name": normalize_str(row["resident_name"]),
            "first_name": normalize_str(row["First_Name"]),
            "last_name": normalize_str(row["Last_Name"]),
            "age": normalize_int(row["Age"]),
            "admit_date": iso_value(row["Admit_Date"]),
            "los_days": normalize_int(row["LOS_Days"]),
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "unit_number": normalize_nullable(row["Unit_Number"]),
            "care_level": normalize_nullable(row["Care_Level"]),
            "payor": normalize_nullable(row["Payor_Text"]),
            "primary_diagnosis": normalize_nullable(row["Primary_Diagnosis"]),
            "physician": normalize_nullable(row["Physician_Name"]),
            "diet": normalize_nullable(row["Diet"]),
            "incident_count_all_time": normalize_int(row["incident_count_all_time"]),
            "incident_count_30d": normalize_int(row["incident_count_30d"]),
            "incident_count_90d": normalize_int(row["incident_count_90d"]),
            "incident_count_180d": normalize_int(row["incident_count_180d"]),
            "last_incident_date": iso_value(row["last_incident_date"]),
            "last_incident_category": normalize_nullable(row["last_incident_category"]),
            "last_note_date": iso_value(row["last_note_date"]),
            "days_since_last_note": normalize_int(row["days_since_last_note"]),
        }
        for row in resident_profile_rows
    ]

    resident_incident_summary = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "res_number": str(row["Res_Number"]),
            "resident_name": normalize_str(row["resident_name"]),
            "incident_count_all_time": normalize_int(row["incident_count_all_time"]),
            "incident_count_30d": normalize_int(row["incident_count_30d"]),
            "incident_count_90d": normalize_int(row["incident_count_90d"]),
            "incident_count_180d": normalize_int(row["incident_count_180d"]),
            "last_incident_date": iso_value(row["last_incident_date"]),
            "last_incident_category": normalize_nullable(row["last_incident_category"]),
        }
        for row in resident_incident_summary_rows
    ]

    documentation_status = [
        {
            "resident_id": str(row["Res_Number"]),
            "resident_name": normalize_str(row["resident_name"]),
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "last_note_date": iso_value(row["last_note_date"]),
            "days_since_last_note": normalize_int(row["days_since_last_note"]),
        }
        for row in documentation_status_rows
    ]

    resident_episode_history = [
        {
            "episode_id": normalize_str(row["episode_id"]),
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "resident_id": str(row["Res_Number"]) if row["Res_Number"] is not None else "",
            "resident_name": normalize_str(row["resident_name"]),
            "admit_date": iso_value(row["admit_date"]),
            "discharge_date": iso_value(row["discharge_date"]),
            "discharge_reason": normalize_nullable(row["discharge_reason"]),
            "discharge_destination": normalize_nullable(row["discharge_destination"]),
            "episode_status": normalize_str(row["episode_status"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "source_table": normalize_str(row["source_table"]),
        }
        for row in resident_episode_rows
    ]

    resident_flow_weekly_by_community = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "week_start": iso_value(row["week_start"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "admissions": normalize_int(row["admissions"]),
            "discharges": normalize_int(row["discharges"]),
            "net_change": normalize_int(row["net_change"]),
            "admitted_residents": normalize_nullable(row["admitted_residents"]),
            "discharged_residents": normalize_nullable(row["discharged_residents"]),
            "source_rows": normalize_int(row["source_rows"]),
        }
        for row in resident_flow_weekly_rows
    ]

    resident_flow_monthly_by_community = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "admissions": normalize_int(row["admissions"]),
            "discharges": normalize_int(row["discharges"]),
            "net_change": normalize_int(row["net_change"]),
            "admitted_residents": normalize_nullable(row["admitted_residents"]),
            "discharged_residents": normalize_nullable(row["discharged_residents"]),
            "source_rows": normalize_int(row["source_rows"]),
        }
        for row in resident_flow_monthly_rows
    ]

    census_weekly_by_community = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "week_start": iso_value(row["week_start"]),
            "week_end": iso_value(row["week_end"]),
            "census_date": iso_value(row["census_date"]),
            "prior_census_date": iso_value(row["prior_census_date"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "census": normalize_int(row["census"]),
            "census_7d_prior": normalize_int(row["census_7d_prior"]),
            "census_change_7d": normalize_int(row["census_change_7d"]),
        }
        for row in census_weekly_rows
    ]

    census_data_quality = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "latest_census_month": normalize_str(row["latest_census_month"]),
            "latest_monthly_census": normalize_int(row["latest_monthly_census"]),
            "active_roster_residents": normalize_int(row["active_roster_residents"]),
            "current_active_roster_residents": normalize_int(row.get("current_active_roster_residents")),
            "current_active_minus_latest_census": normalize_int(row.get("current_active_minus_latest_census")),
            "monthly_census_minus_active_roster": normalize_int(row["monthly_census_minus_active_roster"]),
            "prior_census": normalize_int(row["prior_census"]),
            "census_delta": normalize_int(row["census_delta"]),
            "excluded_or_non_countable_rows": normalize_int(row["excluded_or_non_countable_rows"]),
            "suspected_test_rows": normalize_int(row["suspected_test_rows"]),
            "exclusion_reasons": normalize_nullable(row["exclusion_reasons"]),
            "min_week": iso_value(row["min_week"]),
            "max_week": iso_value(row["max_week"]),
            "weekly_census_rows": normalize_int(row["weekly_census_rows"]),
        }
        for row in census_quality_rows
    ]

    resident_countability_audit = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "resident_id": str(row["Res_Number"]) if row["Res_Number"] is not None else "",
            "resident_name": normalize_str(row["resident_name"]),
            "admit_date": iso_value(row["admit_date"]),
            "discharge_date": iso_value(row["discharge_date"]),
            "is_countable_resident": normalize_int(row["is_countable_resident"]),
            "is_suspect_test_resident": normalize_int(row["is_suspect_test_resident"]),
            "resident_exclusion_reason": normalize_nullable(row["resident_exclusion_reason"]),
        }
        for row in resident_countability_rows
    ]

    resident_unit_history = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "resident_id": str(row["Res_Number"]) if row["Res_Number"] is not None else "",
            "resident_name": normalize_str(row["resident_name"]),
            "unit_number": normalize_nullable(row["unit_number"]),
            "start_date": iso_value(row["start_date"]),
            "end_date": iso_value(row["end_date"]),
            "month_bucket": normalize_str(row["month_bucket"]),
        }
        for row in resident_unit_history_rows
    ]

    services_provided = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "resident_id": str(row["Res_Number"]) if row["Res_Number"] is not None else "",
            "resident_name": normalize_str(row["resident_name"]),
            "service_date": iso_value(row["service_date"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "service_type": normalize_str(row["service_type"]),
            "employee_id": normalize_nullable(row["employee_id"]),
            "service_status": normalize_nullable(row["service_status"]),
            "service_units": None if row["service_units"] is None else normalize_float(row["service_units"]),
            "source_table": normalize_str(row["source_table"]),
        }
        for row in services_provided_rows
    ]

    assessment_summary = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "resident_id": str(row["Res_Number"]) if row["Res_Number"] is not None else "",
            "resident_name": normalize_str(row["resident_name"]),
            "assessment_date": iso_value(row["assessment_date"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "assessment_type": normalize_str(row["assessment_type"]),
            "assessment_status": normalize_nullable(row["assessment_status"]),
            "assessment_score": None if row["assessment_score"] is None else normalize_float(row["assessment_score"]),
        }
        for row in assessment_summary_rows
    ]

    notes_summary = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "resident_id": str(row["Res_Number"]) if row["Res_Number"] is not None else "",
            "resident_name": normalize_str(row["resident_name"]),
            "note_date": iso_value(row["note_date"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "note_type": normalize_str(row["note_type"]),
            "note_text": normalize_nullable(row["note_text"]),
            "action_required_by_date": iso_value(row["action_required_by_date"]),
        }
        for row in notes_summary_rows
    ]

    medication_refusal_summary = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "medication": normalize_str(row["Medication"]),
            "total_scheduled": normalize_int(row["total_scheduled"]),
            "refusals": normalize_int(row["refusals"]),
            "refusal_pct": normalize_float(row["refusal_pct"]),
        }
        for row in medication_refusal_rows
    ]

    medication_compliance_monthly = [
        {
            "facility_id": normalize_str(row["Facility"]),
            "facility_name": normalize_str(row["Facility_Name"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "total_scheduled": normalize_int(row["total_scheduled"]),
            "given": normalize_int(row["given"]),
            "not_given": normalize_int(row["not_given"]),
            "compliance_pct": normalize_float(row["compliance_pct"]),
        }
        for row in medication_compliance_rows
    ]

    mar_monthly_by_community_medication = [
        {
            "facility_id": normalize_str(row["facility_id"]),
            "facility_name": normalize_str(row["facility_name"]),
            "month_bucket": normalize_str(row["month_bucket"]),
            "medication_name": normalize_str(row["medication_name"]),
            "administration_count": normalize_int(row["administration_count"]),
            "scheduled_count": normalize_int(row["scheduled_count"]),
            "given_count": normalize_int(row["given_count"]),
            "not_given_count": normalize_int(row["not_given_count"]),
            "refusal_count": normalize_int(row["refusal_count"]),
            "prn_given_count": normalize_int(row["prn_given_count"]),
            "awol_count": normalize_int(row["awol_count"]),
            "hospital_count": normalize_int(row["hospital_count"]),
            "unknown_count": normalize_int(row["unknown_count"]),
            "resident_count": normalize_int(row["resident_count"]),
            "compliance_pct": None if row["compliance_pct"] is None else normalize_float(row["compliance_pct"]),
        }
        for row in mar_monthly_rows
    ]

    mar_resident_summary = [
        {
            "resident_id": normalize_str(row["resident_id"]),
            "resident_name": normalize_str(row["resident_name"]),
            "facility_id": normalize_str(row["facility_id"]),
            "facility_name": normalize_str(row["facility_name"]),
            "active_medication_count": normalize_int(row["active_medication_count"]),
            "active_psychotropic_count": normalize_int(row["active_psychotropic_count"]),
            "active_narcotic_count": normalize_int(row["active_narcotic_count"]),
            "active_prn_count": normalize_int(row["active_prn_count"]),
            "scheduled_7d": normalize_int(row["scheduled_7d"]),
            "given_7d": normalize_int(row["given_7d"]),
            "refusals_7d": normalize_int(row["refusals_7d"]),
            "scheduled_30d": normalize_int(row["scheduled_30d"]),
            "given_30d": normalize_int(row["given_30d"]),
            "not_given_30d": normalize_int(row["not_given_30d"]),
            "refusals_30d": normalize_int(row["refusals_30d"]),
            "scheduled_90d": normalize_int(row["scheduled_90d"]),
            "given_90d": normalize_int(row["given_90d"]),
            "not_given_90d": normalize_int(row["not_given_90d"]),
            "refusals_90d": normalize_int(row["refusals_90d"]),
            "last_recorded_date": iso_value(row["last_recorded_date"]),
            "prn_given_30d": normalize_int(row["prn_given_30d"]),
            "prn_followup_30d": normalize_int(row["prn_followup_30d"]),
            "compliance_pct_30d": None if row["compliance_pct_30d"] is None else normalize_float(row["compliance_pct_30d"]),
        }
        for row in mar_resident_summary_rows
    ]

    mar_exception_details = [
        {
            "administration_id": normalize_str(row["administration_id"]),
            "medication_order_id": normalize_str(row["medication_order_id"]),
            "resident_id": normalize_str(row["resident_id"]),
            "resident_name": normalize_str(row["resident_name"]),
            "facility_id": normalize_str(row["facility_id"]),
            "facility_name": normalize_str(row["facility_name"]),
            "medication_name": normalize_str(row["medication_name"]),
            "dosage": normalize_nullable(row["dosage"]),
            "route": normalize_nullable(row["route"]),
            "administration_date": iso_value(row["administration_date"]),
            "scheduled_date": iso_value(row["scheduled_date"]),
            "scheduled_time": normalize_nullable(row["scheduled_time"]),
            "recorded_date": iso_value(row["recorded_date"]),
            "administration_outcome": normalize_str(row["administration_outcome"]),
            "outcome_category": normalize_str(row["outcome_category"]),
            "not_given_reason": normalize_nullable(row["not_given_reason"]),
            "missed_or_held_reason": normalize_nullable(row["missed_or_held_reason"]),
            "is_on_hold": bool(normalize_int(row["is_on_hold"])),
            "is_prn": bool(normalize_int(row["is_prn"])),
            "prn_reason": normalize_nullable(row["prn_reason"]),
            "prn_result": normalize_nullable(row["prn_result"]),
            "prn_result_date": iso_value(row["prn_result_date"]),
            "administration_note": normalize_nullable(row["administration_note"]),
            "minutes_late": normalize_int(row["minutes_late"]),
            "is_refusal": bool(normalize_int(row["is_refusal"])),
            "is_over_60_minutes_late": bool(normalize_int(row["is_over_60_minutes_late"])),
            "month_bucket": normalize_str(row["month_bucket"]),
        }
        for row in mar_exception_rows
    ]

    mar_prn_effectiveness = [
        {
            "administration_id": normalize_str(row["administration_id"]),
            "medication_order_id": normalize_str(row["medication_order_id"]),
            "resident_id": normalize_str(row["resident_id"]),
            "resident_name": normalize_str(row["resident_name"]),
            "facility_id": normalize_str(row["facility_id"]),
            "facility_name": normalize_str(row["facility_name"]),
            "medication_name": normalize_str(row["medication_name"]),
            "dosage": normalize_nullable(row["dosage"]),
            "route": normalize_nullable(row["route"]),
            "administration_date": iso_value(row["administration_date"]),
            "scheduled_date": iso_value(row["scheduled_date"]),
            "recorded_date": iso_value(row["recorded_date"]),
            "administration_outcome": normalize_str(row["administration_outcome"]),
            "prn_reason": normalize_nullable(row["prn_reason"]),
            "prn_result": normalize_nullable(row["prn_result"]),
            "prn_result_date": iso_value(row["prn_result_date"]),
            "prn_result_when": normalize_nullable(row["prn_result_when"]),
            "has_effectiveness_followup": bool(normalize_int(row["has_effectiveness_followup"])),
            "month_bucket": normalize_str(row["month_bucket"]),
        }
        for row in mar_prn_effectiveness_rows
    ]

    mar_medication_orders = [
        {
            "medication_order_id": normalize_str(row["medication_order_id"]),
            "resident_id": normalize_str(row["resident_id"]),
            "resident_name": normalize_str(row["resident_name"]),
            "facility_id": normalize_str(row["facility_id"]),
            "facility_name": normalize_str(row["facility_name"]),
            "medication_name": normalize_str(row["medication_name"]),
            "dosage": normalize_nullable(row["dosage"]),
            "route": normalize_nullable(row["route"]),
            "schedule": normalize_nullable(row["schedule"]),
            "passing_times": normalize_nullable(row["passing_times"]),
            "instructions": normalize_nullable(row["instructions"]),
            "indication": normalize_nullable(row["indication"]),
            "prescriber_code": normalize_nullable(row["prescriber_code"]),
            "diagnosis_code": normalize_nullable(row["diagnosis_code"]),
            "is_narcotic": bool(normalize_int(row["is_narcotic"])),
            "is_psychotropic": bool(normalize_int(row["is_psychotropic"])),
            "is_prn": bool(normalize_int(row["is_prn"])),
            "is_on_hold": bool(normalize_int(row["is_on_hold"])),
            "effective_date": iso_value(row["effective_date"]),
            "prescription_end_date": iso_value(row["prescription_end_date"]),
        }
        for row in mar_medication_order_rows
    ]

    manifest = [
        {
            "slice_name": normalize_str(row["slice_name"]),
            "grain": normalize_str(row["grain"]),
            "row_count": normalize_int(row["row_count"]),
            "min_period": normalize_nullable(row["min_period"]),
            "max_period": normalize_nullable(row["max_period"]),
            "facility_ids": [
                facility_id
                for facility_id in normalize_str(row["facility_ids"]).split(",")
                if facility_id
            ],
            "fields": [
                field
                for field in normalize_str(row["fields"]).split(",")
                if field
            ],
            "generated_at": iso_value(row["generated_at"]),
        }
        for row in manifest_rows
    ]

    analyst_data_qa = [
        {
            "run_id": normalize_str(row["run_id"]),
            "generated_at": iso_value(row["generated_at"]),
            "check_id": normalize_str(row["check_id"]),
            "domain": normalize_str(row["domain"]),
            "severity": normalize_str(row["severity"]),
            "status": normalize_str(row["status"]),
            "expected": normalize_str(row["expected"]),
            "actual": normalize_str(row["actual"]),
            "detail": normalize_str(row["detail"]),
        }
        for row in analyst_qa_rows
    ]

    return {
        "version": 8,
        "manifest": manifest,
        "analystDataQa": analyst_data_qa,
        "tables": {
            "community_operating_summary": community_operating_summary,
            "incident_monthly_by_community_category": incident_monthly_by_community_category,
            "incident_detail_current_month": current_incident_details,
            "incident_detail_history": incident_detail_history,
            "resident_profile": resident_profiles,
            "resident_incident_summary": resident_incident_summary,
            "resident_episode_history": resident_episode_history,
            "resident_flow_weekly_by_community": resident_flow_weekly_by_community,
            "resident_flow_monthly_by_community": resident_flow_monthly_by_community,
            "census_weekly_by_community": census_weekly_by_community,
            "census_data_quality": census_data_quality,
            "resident_countability_audit": resident_countability_audit,
            "resident_unit_history": resident_unit_history,
            "services_provided": services_provided,
            "assessment_summary": assessment_summary,
            "notes_summary": notes_summary,
            "documentation_status": documentation_status,
            "medication_refusal_summary": medication_refusal_summary,
            "medication_compliance_monthly": medication_compliance_monthly,
            "mar_monthly_by_community_medication": mar_monthly_by_community_medication,
            "mar_resident_summary": mar_resident_summary,
            "mar_exception_detail_90d": mar_exception_details,
            "mar_prn_effectiveness_90d": mar_prn_effectiveness,
            "mar_medication_orders_current": mar_medication_orders,
        },
    }


def build_incident_center_summary(generated_at):
    incident_rows = rows(
        """
        WITH latest_incidents AS (
          SELECT
            Unique_ID,
            Facility,
            Facility_Name,
            Res_Number,
            Unit_Number,
            Incident_Date_parsed,
            __TIMESTAMP,
            Incident_Category,
            Type_of_Incident,
            Location_of_Incident_General,
            Location_of_Incident_Specific,
            What_Staff_Saw,
            Assistance_Given,
            Injuires_YN,
            Notify_EmergSrvs_YN,
            Notify_Physician_YN,
            Notify_Family_YN,
            Notify_Manager_YN,
            Notify_Physician_Name,
            Notify_Family_Name,
            Notify_Manager_Name,
            Sentinel_Event_YN,
            Person_Completing_Report_Name,
            Prev_History_YN
          FROM alamohealth.gold.v_incidents
          ORDER BY coalesce(__TIMESTAMP, Incident_Date_parsed) DESC
          LIMIT 250
        )
        SELECT
          i.Unique_ID,
          i.Facility,
          i.Facility_Name,
          i.Res_Number,
          r.First_Name,
          r.Last_Name,
          coalesce(i.Unit_Number, r.Unit_Number) AS Unit_Number,
          i.Incident_Date_parsed,
          i.__TIMESTAMP,
          i.Incident_Category,
          i.Type_of_Incident,
          i.Location_of_Incident_General,
          i.Location_of_Incident_Specific,
          i.What_Staff_Saw,
          i.Assistance_Given,
          i.Injuires_YN,
          i.Notify_EmergSrvs_YN,
          i.Notify_Physician_YN,
          i.Notify_Family_YN,
          i.Notify_Manager_YN,
          i.Notify_Physician_Name,
          i.Notify_Family_Name,
          i.Notify_Manager_Name,
          i.Sentinel_Event_YN,
          i.Person_Completing_Report_Name,
          i.Prev_History_YN,
          r.Age,
          r.Care_Level,
          r.Primary_Diagnosis,
          r.Physician_Name
        FROM latest_incidents i
        LEFT JOIN alamohealth.gold.v_tool_resident_profile r
          ON i.Res_Number = r.Res_Number
         AND i.Facility = r.Facility
        """
    )

    incidents = []
    for row in incident_rows:
        priority = priority_from_incident(row)
        resident_name = " ".join(
            part
            for part in [normalize_str(row["First_Name"]), normalize_str(row["Last_Name"])]
            if part
        )
        incidents.append(
            {
                "id": str(row["Unique_ID"]),
                "priority": priority,
                "stage": "new",
                "facility_id": normalize_str(row["Facility"]),
                "facility_name": normalize_str(row["Facility_Name"]),
                "client_name": resident_name
                or (
                    f"Resident {normalize_str(row['Res_Number'])}"
                    if normalize_str(row["Res_Number"])
                    else "Unknown Resident"
                ),
                "unit_number": normalize_nullable(row["Unit_Number"]),
                "age": normalize_int(row["Age"]) if row["Age"] is not None else None,
                "care_level": normalize_nullable(row["Care_Level"]),
                "primary_diagnosis": normalize_nullable(row["Primary_Diagnosis"]),
                "physician": normalize_nullable(row["Physician_Name"]),
                "staff_name": normalize_nullable(row["Person_Completing_Report_Name"]),
                "sender": normalize_nullable(row["Person_Completing_Report_Name"]),
                "incident_type": normalize_str(
                    row["Incident_Category"] or row["Type_of_Incident"]
                ),
                "location": " · ".join(
                    part
                    for part in [
                        normalize_str(row["Location_of_Incident_General"]),
                        normalize_str(row["Location_of_Incident_Specific"]),
                    ]
                    if part
                ),
                "incident_date": iso_value(row["Incident_Date_parsed"]),
                "triage_score": 90 if priority == "HIGH" else 65 if priority == "MEDIUM" else 35,
                "injury_occurred": normalize_str(row["Injuires_YN"]).lower() == "yes",
                "police_called": normalize_str(row["Notify_EmergSrvs_YN"]).lower() == "yes",
                "email_body": normalize_nullable(row["What_Staff_Saw"]),
                "assistance_given": normalize_nullable(row["Assistance_Given"]),
                "notifications": [
                    notification
                    for notification in [
                        (
                            {
                                "recipient": normalize_str(row["Notify_Physician_Name"])
                                or "Physician",
                                "status": "sent",
                            }
                            if normalize_str(row["Notify_Physician_YN"]).lower() == "yes"
                            else None
                        ),
                        (
                            {
                                "recipient": normalize_str(row["Notify_Family_Name"]) or "Family",
                                "status": "sent",
                            }
                            if normalize_str(row["Notify_Family_YN"]).lower() == "yes"
                            else None
                        ),
                        (
                            {
                                "recipient": normalize_str(row["Notify_Manager_Name"]) or "Manager",
                                "status": "sent",
                            }
                            if normalize_str(row["Notify_Manager_YN"]).lower() == "yes"
                            else None
                        ),
                    ]
                    if notification
                ],
                "flags": incident_flags(row),
                "received_at": iso_value(row["__TIMESTAMP"])
                or iso_value(row["Incident_Date_parsed"])
                or generated_at,
            }
        )

    return {
        "incidents": incidents,
    }


def build_platform_health(generated_at, analyst_data_qa=None):
    qa_rows = analyst_data_qa or []
    qa_failed = sum(1 for row in qa_rows if row.get("status") == "FAIL")
    qa_warned = sum(1 for row in qa_rows if row.get("status") == "WARN")
    health = {
        "ok": True,
        "backend": "published-snapshot",
        "catalog": "alamohealth",
        "schema": "gold",
        "warehouseTime": generated_at,
        "currentCatalog": "alamohealth",
        "currentSchema": "gold",
    }
    if qa_rows:
        health["analystDataQa"] = {
            "status": "fail" if qa_failed else "warning" if qa_warned else "pass",
            "total": len(qa_rows),
            "passed": len(qa_rows) - qa_failed - qa_warned,
            "failed": qa_failed,
            "warnings": qa_warned,
            "generatedAt": qa_rows[0].get("generated_at"),
            "checks": qa_rows,
        }
    return health


def build_home_dashboard(communities, reports_summary, generated_at):
    facilities = communities["facilities"]
    residents = communities["residents"]
    incidents = communities["incidents"]
    compliance = reports_summary["medicationCompliance"]
    documentation_gaps = reports_summary["documentationGaps"]
    refusal_by_medication = reports_summary["refusalByMedication"]

    month_buckets = sorted({row["month_bucket"] for row in incidents if row["month_bucket"]})
    latest_month = month_buckets[-1] if month_buckets else None

    current_incidents = sum(
        row["incident_count"] for row in incidents if row["month_bucket"] == latest_month
    )
    resident_count = len(residents)
    average_age = (
        sum(row["age"] for row in residents) / resident_count if resident_count else 0.0
    )
    average_length_of_stay = (
        sum(row["los_days"] for row in residents) / resident_count if resident_count else 0.0
    )

    incident_trend = [
        {
            "month_bucket": month_bucket,
            "month_label": format_month_label(month_bucket),
            "incidentCount": sum(
                row["incident_count"] for row in incidents if row["month_bucket"] == month_bucket
            ),
        }
        for month_bucket in month_buckets[-6:]
    ]

    communities_summary = []
    for facility in facilities:
        facility_id = facility["facility_id"]
        facility_residents = [row for row in residents if row["facility_id"] == facility_id]
        facility_incidents = [
            row
            for row in incidents
            if row["facility_id"] == facility_id and row["month_bucket"] == latest_month
        ]

        communities_summary.append(
            {
                "facility_id": facility_id,
                "community_name": facility["community_name"],
                "community_code": facility["community_code"],
                "city": facility["city"],
                "state": facility["state"],
                "total_residents": facility["total_residents"],
                "currentIncidents": sum(row["incident_count"] for row in facility_incidents),
                "averageAge": (
                    sum(row["age"] for row in facility_residents) / len(facility_residents)
                    if facility_residents
                    else 0.0
                ),
                "averageLengthOfStay": (
                    sum(row["los_days"] for row in facility_residents) / len(facility_residents)
                    if facility_residents
                    else 0.0
                ),
                "residentSharePct": (
                    (facility["total_residents"] / resident_count) * 100 if resident_count else 0.0
                ),
            }
        )

    communities_summary.sort(key=lambda row: row["total_residents"], reverse=True)

    compliance_months = sorted({row["month_bucket"] for row in compliance if row["month_bucket"]})
    latest_compliance_month = compliance_months[-1] if compliance_months else None
    current_compliance = [
        row for row in compliance if row["month_bucket"] == latest_compliance_month
    ]
    average_compliance = (
        sum(row["compliance_pct"] for row in current_compliance) / len(current_compliance)
        if current_compliance
        else 0.0
    )

    largest_community = communities_summary[0] if communities_summary else None

    return {
        "generated_at": generated_at,
        "reporting_month": latest_month,
        "portfolio": {
            "communityCount": len(facilities),
            "residentCount": resident_count,
            "currentIncidents": current_incidents,
            "averageAge": average_age,
            "averageLengthOfStay": average_length_of_stay,
        },
        "incidentTrend": incident_trend,
        "communities": communities_summary[:5],
        "reporting": {
            "latestMonth": latest_compliance_month,
            "averageCompliance": average_compliance,
            "documentationGapCount": len(documentation_gaps),
            "refusalSignalCount": len([row for row in refusal_by_medication if row["refusals"] > 0]),
        },
        "watch": {
            "largestCommunityName": largest_community["community_name"] if largest_community else None,
            "largestCommunityResidents": largest_community["total_residents"] if largest_community else 0,
        },
    }


def build_community_snapshots(communities, generated_at):
    facilities = communities["facilities"]
    residents = communities["residents"]
    incidents = communities["incidents"]

    snapshots = {}

    for facility in facilities:
        facility_id = facility["facility_id"]
        facility_residents = [row for row in residents if row["facility_id"] == facility_id]
        facility_incidents = [row for row in incidents if row["facility_id"] == facility_id]

        month_buckets = sorted(
            {row["month_bucket"] for row in facility_incidents if row["month_bucket"]}
        )
        latest_month = month_buckets[-1] if month_buckets else None
        prior_month = month_buckets[-2] if len(month_buckets) > 1 else None

        current_incidents = sum(
            row["incident_count"] for row in facility_incidents if row["month_bucket"] == latest_month
        )
        prior_incidents = sum(
            row["incident_count"] for row in facility_incidents if row["month_bucket"] == prior_month
        )

        incident_trend = [
            {
                "month_bucket": month_bucket,
                "month_label": format_month_label(month_bucket),
                "incidentCount": sum(
                    row["incident_count"]
                    for row in facility_incidents
                    if row["month_bucket"] == month_bucket
                ),
            }
            for month_bucket in month_buckets
        ]

        expanded_categories = []
        for row in facility_incidents:
            expanded_categories.extend([row["category"]] * row["incident_count"])

        longest_stay_residents = sorted(
            facility_residents,
            key=lambda row: row["los_days"],
            reverse=True,
        )[:5]

        snapshots[facility_id] = {
            "generated_at": generated_at,
            "facility": facility,
            "reporting_month": latest_month,
            "summary": {
                "residents": facility["total_residents"],
                "currentIncidents": current_incidents,
                "priorIncidents": prior_incidents,
                "averageAge": (
                    sum(row["age"] for row in facility_residents) / len(facility_residents)
                    if facility_residents
                    else 0.0
                ),
                "averageLengthOfStay": (
                    sum(row["los_days"] for row in facility_residents) / len(facility_residents)
                    if facility_residents
                    else 0.0
                ),
            },
            "incidentTrend": incident_trend,
            "topIncidentCategories": summarize_counts(expanded_categories)[:6],
            # Detailed rows live once in the canonical tool-context history. The
            # API hydrates this selected community from that collection.
            "incidentDetails": [],
            "diagnosisMix": summarize_counts(
                [row["primary_diagnosis"] for row in facility_residents]
            )[:6],
            "longestStayResidents": [
                {
                    "res_number": row["res_number"],
                    "first_name": row["first_name"],
                    "last_name": row["last_name"],
                    "unit_number": row["unit_number"],
                    "admit_date": row["admit_date"],
                    "los_days": row["los_days"],
                }
                for row in longest_stay_residents
            ],
        }

    return snapshots


def json_size_bytes(value):
    return len(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )


def build_payload_size_report(payload):
    tool_tables = (
        payload.get("reportsSummary", {})
        .get("toolContext", {})
        .get("tables", {})
    )
    top_level = {
        key: json_size_bytes(value)
        for key, value in payload.items()
    }
    largest_tool_tables = sorted(
        (
            {
                "name": name,
                "bytes": json_size_bytes(table_rows),
                "rows": len(table_rows) if isinstance(table_rows, list) else None,
            }
            for name, table_rows in tool_tables.items()
        ),
        key=lambda item: item["bytes"],
        reverse=True,
    )[:10]

    return {
        "top_level_bytes": dict(
            sorted(top_level.items(), key=lambda item: item[1], reverse=True)
        ),
        "largest_tool_tables": largest_tool_tables,
    }


def build_payload():
    generated_at = datetime.now(timezone.utc).isoformat()
    communities = build_communities_dashboard()
    reports_summary = build_reports_summary()
    incidents = build_incident_center_summary(generated_at)
    health = build_platform_health(
        generated_at,
        reports_summary.get("toolContext", {}).get("analystDataQa", []),
    )
    home_dashboard = build_home_dashboard(communities, reports_summary, generated_at)
    community_snapshots = build_community_snapshots(communities, generated_at)

    return {
        "snapshot": {
            "version": generated_at,
            "generated_at": generated_at,
            "freshness_checked_at": generated_at,
            "source": "published-snapshot",
            "as_of_date": expected_as_of_date,
        },
        "health": health,
        "incidents": incidents,
        "homeDashboard": home_dashboard,
        "communities": communities,
        "reportsSummary": reports_summary,
        "communitySnapshots": community_snapshots,
    }


def build_blob_service_client(storage_account, tenant_id, client_id, client_secret):
    credential = ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )
    account_url = f"https://{storage_account}.blob.core.windows.net"
    return BlobServiceClient(account_url=account_url, credential=credential)


def upload_json(container_client, blob_name, payload_json):
    blob_client = container_client.get_blob_client(blob_name)
    blob_client.upload_blob(
        payload_json.encode("utf-8"),
        overwrite=True,
        blob_type="BlockBlob",
        content_settings=ContentSettings(content_type="application/json; charset=utf-8"),
    )


def validate_snapshot_payload(payload, expected_as_of_date=None):
    tool_context = payload.get("reportsSummary", {}).get("toolContext", {})
    tables = tool_context.get("tables", {})
    manifest = tool_context.get("manifest", [])
    manifest_counts = {
        normalize_str(row.get("slice_name")): normalize_int(row.get("row_count"))
        for row in manifest
        if normalize_str(row.get("slice_name"))
    }
    expected_month = expected_as_of_date[:7] if expected_as_of_date else None

    def min_value(records, field):
        values = [normalize_str(row.get(field)) for row in records if normalize_str(row.get(field))]
        return min(values) if values else None

    def max_value(records, field):
        values = [normalize_str(row.get(field)) for row in records if normalize_str(row.get(field))]
        return max(values) if values else None

    mar_monthly = (
        tool_context.get("marMonthlyByCommunityMedication")
        or tables.get("mar_monthly_by_community_medication")
        or []
    )
    mar_residents = (
        tool_context.get("marResidentSummary")
        or tables.get("mar_resident_summary")
        or []
    )
    mar_exceptions = (
        tool_context.get("marExceptionDetails")
        or tables.get("mar_exception_detail_90d")
        or []
    )
    mar_prn_effectiveness = tables.get("mar_prn_effectiveness_90d") or []
    mar_medication_orders = tables.get("mar_medication_orders_current") or []
    incident_monthly = (
        tool_context.get("incidentMonthlyByCommunityCategory")
        or tables.get("incident_monthly_by_community_category")
        or []
    )
    incident_detail_history = (
        tool_context.get("incidentDetailHistory")
        or tables.get("incident_detail_history")
        or []
    )
    duplicate_community_incident_details = (
        payload.get("communities", {}).get("incidentDetails", []) or []
    )
    medication_compliance = (
        tool_context.get("medicationComplianceMonthly")
        or tables.get("medication_compliance_monthly")
        or []
    )
    census_weekly = (
        tool_context.get("censusWeeklyByCommunity")
        or tables.get("census_weekly_by_community")
        or []
    )
    invalid_weekly_change_rows = 0
    for row in census_weekly:
        try:
            census_date = date.fromisoformat(normalize_str(row.get("census_date"))[:10])
            prior_census_date = date.fromisoformat(normalize_str(row.get("prior_census_date"))[:10])
            week_end = date.fromisoformat(normalize_str(row.get("week_end"))[:10])
            census = int(row.get("census"))
            census_7d_prior = int(row.get("census_7d_prior"))
            census_change_7d = int(row.get("census_change_7d"))
            valid = (
                census_date == week_end
                and (census_date - prior_census_date).days == 7
                and census - census_7d_prior == census_change_7d
            )
        except (TypeError, ValueError):
            valid = False
        if not valid:
            invalid_weekly_change_rows += 1
    census_quality = (
        tool_context.get("censusDataQuality")
        or tables.get("census_data_quality")
        or []
    )
    resident_countability = (
        tool_context.get("residentCountabilityAudit")
        or tables.get("resident_countability_audit")
        or []
    )
    resident_flow_monthly = (
        tool_context.get("residentFlowMonthlyByCommunity")
        or tables.get("resident_flow_monthly_by_community")
        or []
    )
    resident_episode_rows = (
        tool_context.get("residentEpisodeHistory")
        or tables.get("resident_episode_history")
        or []
    )

    audit = {
        "tool_context_version": tool_context.get("version"),
        "expected_as_of_date": expected_as_of_date,
        "snapshot_as_of_date": normalize_str(payload.get("snapshot", {}).get("as_of_date")),
        "communities_as_of_date": normalize_str(payload.get("communities", {}).get("as_of_date")),
        "expected_month": expected_month,
        "manifest_rows": len(manifest),
        "tool_table_count": len(tables),
        "latest_census_month": max_value(census_quality, "latest_census_month"),
        "mar_monthly_rows": len(mar_monthly),
        "mar_resident_rows": len(mar_residents),
        "mar_exception_rows": len(mar_exceptions),
        "mar_prn_effectiveness_rows": len(mar_prn_effectiveness),
        "mar_medication_order_rows": len(mar_medication_orders),
        "manifest_mar_exception_rows": manifest_counts.get("mar_exception_detail_90d"),
        "manifest_mar_prn_effectiveness_rows": manifest_counts.get("mar_prn_effectiveness_90d"),
        "manifest_mar_medication_order_rows": manifest_counts.get("mar_medication_orders_current"),
        "incident_monthly_rows": len(incident_monthly),
        "incident_detail_history_rows": len(incident_detail_history),
        "duplicate_community_incident_detail_rows": len(
            duplicate_community_incident_details
        ),
        "incident_monthly_min_month": min_value(incident_monthly, "month_bucket"),
        "incident_monthly_max_month": max_value(incident_monthly, "month_bucket"),
        "medication_compliance_rows": len(medication_compliance),
        "medication_compliance_min_month": min_value(medication_compliance, "month_bucket"),
        "medication_compliance_max_month": max_value(medication_compliance, "month_bucket"),
        "census_weekly_rows": len(census_weekly),
        "census_quality_rows": len(census_quality),
        "resident_countability_rows": len(resident_countability),
        "resident_flow_monthly_rows": len(resident_flow_monthly),
        "resident_episode_min_date": min_value(resident_episode_rows, "admit_date"),
        "resident_episode_max_date": max_value(resident_episode_rows, "admit_date"),
        "resident_flow_monthly_min_month": min_value(resident_flow_monthly, "month_bucket"),
        "resident_flow_monthly_max_month": max_value(resident_flow_monthly, "month_bucket"),
        "census_weekly_min_week": min_value(census_weekly, "week_start"),
        "census_weekly_max_week": max_value(census_weekly, "week_start"),
        "census_weekly_max_date": max_value(census_weekly, "census_date"),
        "invalid_weekly_change_rows": invalid_weekly_change_rows,
    }

    failures = []
    if expected_as_of_date and audit["snapshot_as_of_date"] != expected_as_of_date:
        failures.append(
            f"snapshot.as_of_date does not match requested business date: {audit['snapshot_as_of_date']} != {expected_as_of_date}"
        )
    if expected_as_of_date and audit["communities_as_of_date"] != expected_as_of_date:
        failures.append(
            f"communities.as_of_date does not match requested business date: {audit['communities_as_of_date']} != {expected_as_of_date}"
        )
    if audit["tool_context_version"] != 8:
        failures.append(f"toolContext.version expected 8, got {audit['tool_context_version']}")
    if audit["manifest_rows"] <= 0:
        failures.append("toolContext.manifest is empty")
    if audit["tool_table_count"] <= 0:
        failures.append("toolContext.tables is empty")
    if audit["mar_monthly_rows"] <= 0:
        failures.append("MAR monthly medication rows are missing from payload")
    if audit["mar_resident_rows"] <= 0:
        failures.append("MAR resident summary rows are missing from payload")
    if audit["mar_medication_order_rows"] <= 0:
        failures.append("Current MAR medication order rows are missing from payload")
    for audit_key, manifest_key, label in [
        ("mar_exception_rows", "manifest_mar_exception_rows", "MAR exception detail"),
        ("mar_prn_effectiveness_rows", "manifest_mar_prn_effectiveness_rows", "MAR PRN effectiveness detail"),
        ("mar_medication_order_rows", "manifest_mar_medication_order_rows", "current MAR medication orders"),
    ]:
        expected_rows = audit[manifest_key]
        if expected_rows is None:
            failures.append(f"{label} is missing from the tool-context manifest")
        elif audit[audit_key] != expected_rows:
            failures.append(
                f"{label} payload is incomplete: {audit[audit_key]} rows published, {expected_rows} rows in manifest"
            )
    if audit["incident_monthly_rows"] <= 0:
        failures.append("incident monthly aggregate rows are missing from payload")
    if audit["incident_detail_history_rows"] <= 0:
        failures.append("canonical incident detail history is missing from payload")
    if audit["duplicate_community_incident_detail_rows"] > 0:
        failures.append(
            "incident detail history is duplicated in communities.incidentDetails"
        )
    if audit["medication_compliance_rows"] <= 0:
        failures.append("medication compliance monthly rows are missing from payload")
    if audit["census_weekly_rows"] <= 0:
        failures.append("weekly census rows are missing from payload")
    if audit["invalid_weekly_change_rows"] > 0:
        failures.append(
            f"{audit['invalid_weekly_change_rows']} weekly census rows do not represent a reconciled seven-day comparison"
        )
    if audit["census_quality_rows"] <= 0:
        failures.append("census data-quality rows are missing from payload")
    if audit["resident_countability_rows"] <= 0:
        failures.append("resident countability audit rows are missing from payload")
    if audit["resident_flow_monthly_rows"] <= 0:
        failures.append("monthly resident flow rows are missing from payload")
    if (
        expected_month
        and audit["latest_census_month"]
        and audit["latest_census_month"] > expected_month
    ):
        failures.append(
            f"latest governed census month exceeds requested snapshot month: {audit['latest_census_month']} > {expected_month}"
        )
    if (
        expected_month
        and audit["resident_flow_monthly_max_month"]
        and audit["resident_flow_monthly_max_month"] > expected_month
    ):
        failures.append(
            f"resident flow exceeds requested snapshot month: {audit['resident_flow_monthly_max_month']} > {expected_month}"
        )
    if (
        expected_as_of_date
        and audit["census_weekly_max_week"]
        and audit["census_weekly_max_week"][:10] > expected_as_of_date
    ):
        failures.append(
            f"weekly census exceeds requested snapshot date: {audit['census_weekly_max_week']} > {expected_as_of_date}"
        )
    if (
        expected_as_of_date
        and audit["census_weekly_max_date"] != expected_as_of_date
    ):
        failures.append(
            f"weekly census does not end on requested snapshot date: {audit['census_weekly_max_date']} != {expected_as_of_date}"
        )
    if (
        audit["latest_census_month"]
        and audit["resident_flow_monthly_max_month"]
        and audit["resident_flow_monthly_max_month"] > audit["latest_census_month"]
    ):
        failures.append(
            f"resident flow extends past latest governed census month: {audit['resident_flow_monthly_max_month']} > {audit['latest_census_month']}"
        )
    if (
        audit["latest_census_month"]
        and audit["census_weekly_max_week"]
        and audit["census_weekly_max_week"][:7] > audit["latest_census_month"]
    ):
        failures.append(
            f"weekly census extends past latest governed census month: {audit['census_weekly_max_week']} > {audit['latest_census_month']}"
        )

    if failures:
        raise ValueError(
            "snapshot_publish built an incomplete app snapshot: "
            + "; ".join(failures)
            + f". Audit: {json.dumps(audit, sort_keys=True)}"
        )

    return audit


storage_account = require_widget("storage_account")
container = require_widget("container")
snapshot_root = require_widget("snapshot_root").strip("/")
date_partition = optional_widget("date_partition")
entra_tenant_id = require_widget("entra_tenant_id")
entra_client_id = require_widget("entra_client_id")
entra_client_secret = require_widget("entra_client_secret")

expected_as_of_date = None
if date_partition:
    try:
        expected_as_of_date = datetime.strptime(date_partition, "%Y-%m-%d").date().isoformat()
    except ValueError:
        raise ValueError("date_partition must be formatted as YYYY-MM-DD")
else:
    expected_as_of_date = resolve_snapshot_as_of_date().isoformat()

SNAPSHOT_AS_OF_SQL = f"DATE '{expected_as_of_date}'"

payload = build_payload()
payload_audit = validate_snapshot_payload(payload, expected_as_of_date=expected_as_of_date)
payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
payload_size_bytes = len(payload_json.encode("utf-8"))
payload_size_limit_bytes = 64 * 1024 * 1024
payload_size_report = build_payload_size_report(payload)
if payload_size_bytes > payload_size_limit_bytes:
    raise ValueError(
        "snapshot_publish payload exceeds the 64 MB platform contract: "
        f"{payload_size_bytes} bytes. Largest components: "
        f"{json.dumps(payload_size_report, sort_keys=True)}"
    )
version = payload["snapshot"]["version"]
date_key = version[:10]

latest_blob = f"{snapshot_root}/latest.json"
dated_blob = f"{snapshot_root}/{date_key}.json"

service_client = build_blob_service_client(
    storage_account=storage_account,
    tenant_id=entra_tenant_id,
    client_id=entra_client_id,
    client_secret=entra_client_secret,
)
container_client = service_client.get_container_client(container)

if not container_client.exists():
    raise ValueError(f"Azure Blob container does not exist: {container}")

upload_json(container_client, latest_blob, payload_json)
upload_json(container_client, dated_blob, payload_json)

result = {
    "ok": True,
    "container": container,
    "latest": latest_blob,
    "dated": dated_blob,
    "version": version,
    "payload_size_bytes": payload_size_bytes,
    "payload_size_limit_bytes": payload_size_limit_bytes,
    "payload_headroom_bytes": payload_size_limit_bytes - payload_size_bytes,
    "payload_size_report": payload_size_report,
    "payload_audit": payload_audit,
}

print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
