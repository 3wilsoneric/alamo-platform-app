# Databricks notebook source

from datetime import date
import json
import re


dbutils.widgets.text("date_partition_override", "")
dbutils.widgets.text("max_raw_partition_age_days", "2")
date_partition_override = dbutils.widgets.get("date_partition_override").strip()
max_raw_partition_age_days = int(dbutils.widgets.get("max_raw_partition_age_days").strip() or "2")

if max_raw_partition_age_days < 0:
    raise ValueError("max_raw_partition_age_days cannot be negative")

BASE_PATH = "abfss://data@alamodatalake.dfs.core.windows.net/eldermark/raw"
PUBLISH_HISTORY_TABLE = "alamohealth.gold.platform_publish_history"
PARTITION_RE = re.compile(r"/dt=(\d{4}-\d{2}-\d{2})/?$")

TABLES = [
    "Companies", "Units", "Unit_Types", "Service_Type",
    "Med_Schedule_Codes", "Medical_Professionals",
    "Diagnosis", "MEDNAME", "MEDNDC",
    "Resident", "Res_Admittance_History", "Res_Unit_History",
    "Res_Leave_of_Absence", "Res_Payor", "Res_Contacts",
    "Res_Pharmacy", "Res_Med_Professionals", "Res_Immunization",
    "Res_Medications", "Res_Diagnosis", "Res_Incident", "Med_Incident",
    "Assessment", "Allergies", "Notes", "Service_Plan",
    "Employee", "Scheduled_Employee", "Inquiry", "Prospect",
    "Service_Archive", "Med_Delivery",
]


def parse_partition(value):
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("date_partition_override must be formatted as YYYY-MM-DD") from exc


available_by_table = {}
for table in TABLES:
    table_path = f"{BASE_PATH}/{table}/"
    try:
        entries = dbutils.fs.ls(table_path)
    except Exception as exc:
        raise RuntimeError(f"Could not list raw partitions for {table}: {exc}") from exc

    partitions = set()
    for entry in entries:
        match = PARTITION_RE.search(entry.path)
        if match:
            partitions.add(match.group(1))
    if not partitions:
        raise RuntimeError(f"No date partitions were found for {table} under {table_path}")
    available_by_table[table] = partitions

if date_partition_override:
    selected_partition = date_partition_override
    parse_partition(selected_partition)
    missing_tables = [
        table for table in TABLES
        if selected_partition not in available_by_table[table]
    ]
    if missing_tables:
        raise RuntimeError(
            f"Override partition {selected_partition} is missing for: {', '.join(missing_tables)}"
        )
    selection_mode = "operator_override"
else:
    complete_partitions = set.intersection(
        *(available_by_table[table] for table in TABLES)
    )
    if not complete_partitions:
        raise RuntimeError("No raw date partition is present across all required ElderMark tables")
    selected_partition = max(complete_partitions)
    selection_mode = "latest_complete_raw_partition"

selected_date = parse_partition(selected_partition)
if selected_date > date.today():
    raise RuntimeError(f"Selected raw partition {selected_partition} is in the future")
raw_partition_age_days = (date.today() - selected_date).days
if not date_partition_override and raw_partition_age_days > max_raw_partition_age_days:
    raise RuntimeError(
        f"Latest complete raw partition {selected_partition} is {raw_partition_age_days} days old; "
        f"maximum allowed age is {max_raw_partition_age_days} days"
    )

file_counts = {}
for table in TABLES:
    partition_path = f"{BASE_PATH}/{table}/dt={selected_partition}/"
    try:
        files = dbutils.fs.ls(partition_path)
    except Exception as exc:
        raise RuntimeError(f"Selected partition is unreadable for {table}: {exc}") from exc
    parquet_count = sum(1 for item in files if item.path.endswith(".parquet"))
    if parquet_count == 0:
        raise RuntimeError(f"Selected partition has no parquet files for {table}: {partition_path}")
    file_counts[table] = parquet_count

total_files = sum(file_counts.values())

published_partition = None
try:
    published_row = spark.sql(
        f"""
        SELECT cast(max(published_partition) AS string) AS as_of_date
        FROM {PUBLISH_HISTORY_TABLE}
        WHERE pipeline = 'daily_platform_snapshot'
        """
    ).first()
    if published_row and published_row["as_of_date"]:
        published_partition = published_row["as_of_date"][:10]
        published_date = parse_partition(published_partition)
except Exception as exc:
    error_text = str(exc)
    missing_table = (
        "TABLE_OR_VIEW_NOT_FOUND" in error_text
        or "Table or view not found" in error_text
    )
    if not missing_table:
        raise RuntimeError(f"Could not inspect governed publish history: {exc}") from exc

should_publish = (
    bool(date_partition_override)
    or published_partition is None
    or selected_date > published_date
)

dbutils.jobs.taskValues.set(key="date_partition", value=selected_partition)
dbutils.jobs.taskValues.set(key="selection_mode", value=selection_mode)
dbutils.jobs.taskValues.set(key="raw_table_count", value=len(TABLES))
dbutils.jobs.taskValues.set(key="raw_file_count", value=total_files)
dbutils.jobs.taskValues.set(key="raw_partition_age_days", value=raw_partition_age_days)
dbutils.jobs.taskValues.set(key="published_partition", value=published_partition or "")
dbutils.jobs.taskValues.set(key="should_publish", value=str(should_publish).lower())

print(
    f"Selected {selected_partition} using {selection_mode}; "
    f"verified {len(TABLES)} tables and {total_files} parquet files; "
    f"published partition is {published_partition or 'none'}; "
    f"should_publish={str(should_publish).lower()}"
)

dbutils.notebook.exit(
    json.dumps(
        {
            "date_partition": selected_partition,
            "selection_mode": selection_mode,
            "raw_table_count": len(TABLES),
            "raw_file_count": total_files,
            "raw_partition_age_days": raw_partition_age_days,
            "published_partition": published_partition,
            "should_publish": should_publish,
        }
    )
)
