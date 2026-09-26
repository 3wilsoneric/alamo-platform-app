# Databricks notebook source

from collections import Counter
from datetime import datetime, date, timezone
from functools import reduce
from itertools import chain
import json
import time

from dateutil.relativedelta import relativedelta
from pyspark.sql import DataFrame, functions as F
from pyspark.sql.functions import create_map, lit
from pyspark.sql.types import FloatType, IntegerType, StringType

dbutils.widgets.text("date_partition", "")

date_partition = dbutils.widgets.get("date_partition").strip()
catalog = "alamohealth"
silver_schema = "silver"
CENSUS_HISTORY_MONTHS = 52

if not date_partition:
    raise ValueError("Missing required widget: date_partition")

try:
    AS_OF_DATE = datetime.strptime(date_partition, "%Y-%m-%d").date()
except ValueError:
    raise ValueError("date_partition must be formatted as YYYY-MM-DD")

AS_OF_MONTH = AS_OF_DATE.strftime("%Y-%m")

STORAGE = "abfss://data@alamodatalake.dfs.core.windows.net"
INPUT_PATH = f"{STORAGE}/eldermark/raw"
STABLE_OUTPUT_PATH = f"{STORAGE}/eldermark/staged/clean"
STAGING_OUTPUT_PATH = f"{STORAGE}/eldermark/staged/staging/{date_partition}"

FACILITY_WHITELIST = ["337", "343", "345", "344", "342"]

NON_COUNTABLE_RESIDENT_PATTERN = r"(?i)(^|[^a-z0-9])(test|fake|dummy|sample|training|demo|do not use|zzz)([^a-z0-9]|$)"
MHW_PLACEHOLDER_RESIDENT_PATTERN = r"(?i)(^|[^a-z0-9])mhw\s*\d*\s*(am|pm)?([^a-z0-9]|$)"
PLACEHOLDER_RESIDENT_PATTERN = r"(?i)^(resident|client|patient|unknown|unk|n/a|na|none|null|\.|-)$"


def as_of_date_col():
    return F.lit(AS_OF_DATE.isoformat()).cast("date")


def boolish_col(column_name: str):
    normalized = F.lower(F.trim(F.coalesce(F.col(column_name).cast("string"), F.lit(""))))
    return normalized.isin("true", "t", "yes", "y", "1")


def elapsed_seconds(start: float) -> str:
    return f"{time.perf_counter() - start:.1f}s"

FACILITY_TABLES = [
    "Resident",
    "Res_Leave_of_Absence",
    "Allergies",
    "Med_Incident",
    "Notes",
]

RES_NUMBER_TABLES = [
    "Res_Admittance_History",
    "Res_Unit_History",
    "Res_Medications",
    "Res_Incident",
    "Res_Diagnosis",
    "Assessment",
    "Res_Payor",
    "Scheduled_Employee",
    "Res_Contacts",
    "Res_Pharmacy",
    "Res_Med_Professionals",
    "Res_Immunization",
    "Service_Plan",
    "Med_Delivery",
]

GLOBAL_REFERENCE_TABLES = [
    "Companies",
    "Units",
    "Unit_Types",
    "Service_Type",
    "Med_Schedule_Codes",
    "Diagnosis",
    "MEDNAME",
    "MEDNDC",
]

EMPLOYEE_TABLES = [
    "Employee",
    "Medical_Professionals",
]

UNSCOPED_TABLES = [
    "Inquiry",
    "Prospect",
    "Service_Archive",
]

TABLES = [
    "Companies",
    "Units",
    "Unit_Types",
    "Service_Type",
    "Med_Schedule_Codes",
    "Medical_Professionals",
    "Diagnosis",
    "MEDNAME",
    "MEDNDC",
    "Resident",
    "Res_Admittance_History",
    "Res_Unit_History",
    "Res_Leave_of_Absence",
    "Res_Payor",
    "Res_Contacts",
    "Res_Pharmacy",
    "Res_Med_Professionals",
    "Res_Immunization",
    "Res_Medications",
    "Res_Diagnosis",
    "Res_Incident",
    "Med_Incident",
    "Assessment",
    "Allergies",
    "Notes",
    "Service_Plan",
    "Employee",
    "Scheduled_Employee",
    "Inquiry",
    "Prospect",
    "Service_Archive",
    "Med_Delivery",
]

TABLE_NAME_MAP = {
    "Companies": "companies",
    "Units": "units",
    "Unit_Types": "unit_types",
    "Service_Type": "service_type",
    "Med_Schedule_Codes": "med_schedule_codes",
    "Medical_Professionals": "medical_professionals",
    "Diagnosis": "diagnosis",
    "MEDNAME": "medname",
    "MEDNDC": "medndc",
    "Resident": "resident",
    "Res_Admittance_History": "res_admittance_history",
    "Res_Unit_History": "res_unit_history",
    "Res_Leave_of_Absence": "res_leave_of_absence",
    "Res_Payor": "res_payor",
    "Res_Contacts": "res_contacts",
    "Res_Pharmacy": "res_pharmacy",
    "Res_Med_Professionals": "res_med_professionals",
    "Res_Immunization": "res_immunization",
    "Res_Medications": "res_medications",
    "Res_Diagnosis": "res_diagnosis",
    "Res_Incident": "res_incident",
    "Med_Incident": "med_incident",
    "Assessment": "assessment",
    "Allergies": "allergies",
    "Res_Vitals": "res_vitals",
    "Notes": "notes",
    "Service_Plan": "service_plan",
    "Employee": "employee",
    "Scheduled_Employee": "scheduled_employee",
    "Inquiry": "inquiry",
    "Prospect": "prospect",
    "Service_Archive": "service_archive",
    "Med_Delivery": "med_delivery",
    "Census_Snapshot": "census_snapshot",
}

all_classified = (
    FACILITY_TABLES
    + RES_NUMBER_TABLES
    + GLOBAL_REFERENCE_TABLES
    + EMPLOYEE_TABLES
    + UNSCOPED_TABLES
)
counts = Counter(all_classified)
duplicates = [table for table, count in counts.items() if count > 1]
if duplicates:
    raise ValueError(
        f"Tables appear in multiple classification lists: {duplicates}. "
        "Each table must be in exactly one list."
    )

unclassified = [table for table in TABLES if table not in all_classified]
if unclassified:
    raise ValueError(
        f"Tables not in any classification list: {unclassified}. "
        "Add each table to exactly one classification list before running."
    )

DATE_COLUMNS = {
    "Resident": ["Admit_Date", "Discharge_Date", "BirthDate"],
    "Res_Admittance_History": ["Admit_Date", "Discharge_Date"],
    "Res_Unit_History": ["Move_In", "Move_Out", "Physical_Move_In_Date", "Physical_Move_Out_Date", "Create_Date"],
    "Res_Medications": ["Effective_Date", "Prescription_End_Date", "Archive_Date"],
    "Res_Incident": ["Incident_Date"],
    "Med_Incident": [
        "Incident_Date",
        "Create_Date",
        "Notify_Res_Date",
        "Notify_Family_Date",
        "Notify_Physician_Date",
        "Notify_HlthSrvsDir_Date",
    ],
    "Res_Diagnosis": ["Onset_Date", "Resolve_Date", "Create_Date"],
    "Assessment": ["Assessment_Date"],
    "Res_Leave_of_Absence": ["From_Date", "To_Date"],
    "Notes": ["Entry_Date", "Action_Required_By_Date", "Incident_Date", "Late_Entry_Date"],
    "Allergies": ["Onset_Date", "End_Date", "Create_Date"],
    "Res_Immunization": ["Date_Received", "Create_Date"],
    "Service_Plan": ["Effective_Date", "End_Date", "Create_Date"],
    "Med_Delivery": ["Scheduled_Date", "Given_or_Recorded_Date", "PRN_Result_Date", "Create_Date"],
    "Prospect": ["Inquiry_Date"],
    "Inquiry": ["Inquiry_Date"],
    "Scheduled_Employee": ["Service_Date"],
    "Medical_Professionals": ["Create_Date"],
    "Diagnosis": ["Create_Date"],
}

INCIDENT_MAP = {
    "Medication Refusal": "Medication Refusal",
    "Refusal of Meds": "Medication Refusal",
    "Missed Meds": "Medication Refusal",
    "Medication Refusal/AWOL": "Medication Refusal",
    "Other: medication refusal": "Medication Refusal",
    "Other: refusal": "Medication Refusal",
    "Other: Non-compliance": "Medication Refusal",
    "OTHER: Medication non-compliance": "Medication Refusal",
    "Other: CT  is non compliance w/ routine medication.": "Medication Refusal",
    "Other: Pocketing Meds": "Medication Refusal",
    "AWOL": "AWOL/Elopement",
    "AWOL/Elopement": "AWOL/Elopement",
    "Elopement": "AWOL/Elopement",
    "Elopement (s)": "AWOL/Elopement",
    "Exited": "AWOL/Elopement",
    "Other: AWOL": "AWOL/Elopement",
    "Other: exited": "AWOL/Elopement",
    "OTHER: AWOL and behavior": "AWOL/Elopement",
    "Self Discharge": "AWOL/Elopement",
    "Other: Self Discharge": "AWOL/Elopement",
    "OTHER: CLIENT SELF DISCHARGED": "AWOL/Elopement",
    "OTHER: Self-Discharge": "AWOL/Elopement",
    "Other: Left the building": "AWOL/Elopement",
    "Other: out of the building": "AWOL/Elopement",
    "Other: CT left the facilty": "AWOL/Elopement",
    "Other: Left building without taking medication.": "AWOL/Elopement",
    "Other: Missing Person": "AWOL/Elopement",
    "Other: Missing Person report": "AWOL/Elopement",
    "Unknown Substance": "Substance Use",
    "smoking unknown substance": "Substance Use",
    "suspicious drug use": "Substance Use",
    "under the influence": "Substance Use",
    "OTHER: intoxication": "Substance Use",
    "Ingestion of unknown substance or object": "Substance Use",
    "Other: Possession of lighter": "Substance Use",
    "OTHER: POSSESSION OF A LIGHTER": "Substance Use",
    "Other: SMOKING": "Substance Use",
    "Other: Vaping": "Substance Use",
    "OTHER: Possession of Alcohol": "Substance Use",
    "Other: Bottle of Vodka": "Substance Use",
    "Other: DRINKING ALCOHOL": "Substance Use",
    "Other: Drug Testing": "Substance Use",
    "Aggressive Behavior": "Aggressive Behavior",
    "Agressive Behavior": "Aggressive Behavior",
    "Physical Altercation": "Aggressive Behavior",
    "Resident to Resident Altercation": "Aggressive Behavior",
    "Resident to Resident Altercation(s)": "Aggressive Behavior",
    "Resident to Staff Altercation(s)": "Aggressive Behavior",
    "Staff to Resident Altercation(s)": "Aggressive Behavior",
    "Behavior episode": "Aggressive Behavior",
    "Change in behavior": "Aggressive Behavior",
    "Destruction of Property": "Aggressive Behavior",
    "Other: verbal threats": "Aggressive Behavior",
    "OTHER: Theft": "Aggressive Behavior",
    "Unwitnessed Theft": "Aggressive Behavior",
    "Other: Alleged Assault": "Aggressive Behavior",
    "Alleged abuse": "Aggressive Behavior",
    "Fall": "Fall",
    "Unwitnessed Fall": "Fall",
    "Witnessed Fall": "Fall",
    "Alleged Fall": "Fall",
    "Found on Floor": "Fall",
    "Slid out of bed": "Fall",
    "Transported to hospital": "Medical Emergency",
    "Medical Emergency": "Medical Emergency",
    "Possible Seizure": "Medical Emergency",
    "Shortness of breath": "Medical Emergency",
    "Bleeding": "Medical Emergency",
    "CLIENT ACTIVATED 911": "Medical Emergency",
    "Activated 911": "Medical Emergency",
    "Change of Condition": "Medical Emergency",
    "Change In Baseline": "Medical Emergency",
    "In Pain": "Medical Emergency",
    "Resident feeling ill": "Medical Emergency",
    "Fainted": "Medical Emergency",
    "Head Injury": "Medical Emergency",
    "Fracture": "Medical Emergency",
    "Choking": "Medical Emergency",
    "Medical Clearance": "Medical Emergency",
    "Other: Transported to CSU": "Medical Emergency",
    "OTHER: TRANSPORTED TO HOSPITAL": "Medical Emergency",
    "COVID-19": "Medical Emergency",
    "51/50": "Mental Health Crisis",
    "suicidal ideation": "Mental Health Crisis",
    "Danger to self": "Mental Health Crisis",
    "SELF INJURIOUS BEHAVIOR": "Mental Health Crisis",
    "Other: SUICIDAL IDEATIONS": "Mental Health Crisis",
    "Other: SELF HARM": "Mental Health Crisis",
    "Confused": "Mental Health Crisis",
    "Sexual Harrasement": "Sexual Incident",
    "Sexual misconduct": "Sexual Incident",
    "OTHER: Sexual Conduct": "Sexual Incident",
    "Consensual Physical Contact": "Sexual Incident",
    "Death": "Death",
    "Other: Sheriff Department came to question the client": "911/Police",
    "Other: ARRESTED": "911/Police",
    "OTHER: Incarcerated": "911/Police",
    "OTHER: Police Report Filed": "911/Police",
    "Other: Detained": "911/Police",
    "Other: Safety Check Refusal": "Safety Check Refusal",
    "OTHER: Refused Safety Check": "Safety Check Refusal",
    "OTHER: Safety Check": "Safety Check Refusal",
    "Other: Urinating in courtyard": "Hygiene/Public Behavior",
    "OTHER: Urinating in Public": "Hygiene/Public Behavior",
    "Other: Unsanitary Living Conditions": "Hygiene/Public Behavior",
    "OTHER: Activated Fire Alarm": "Fire/Safety Hazard",
    "Other: Started a fire": "Fire/Safety Hazard",
    "Other: POSSESSION OF A KNIFE": "Fire/Safety Hazard",
    "OTHER: Possession of knife": "Fire/Safety Hazard",
}


def safe_float(column_name: str):
    cleaned = F.trim(F.col(column_name))
    invalid_tokens = [
        "",
        "na",
        "n/a",
        "null",
        "none",
        "nan",
        "unknown",
        "--",
    ]
    quoted = f"`{column_name}`"
    return (
        F.when(cleaned.isNull(), F.lit(None).cast(FloatType()))
        .when(F.lower(cleaned).isin(invalid_tokens), F.lit(None).cast(FloatType()))
        .otherwise(F.expr(f"try_cast(trim({quoted}) as float)"))
    )


def safe_int(column_name: str):
    cleaned = F.trim(F.col(column_name))
    invalid_tokens = [
        "",
        "na",
        "n/a",
        "null",
        "none",
        "nan",
        "unknown",
        "--",
    ]
    quoted = f"`{column_name}`"
    return (
        F.when(cleaned.isNull(), F.lit(None).cast(IntegerType()))
        .when(F.lower(cleaned).isin(invalid_tokens), F.lit(None).cast(IntegerType()))
        .otherwise(F.expr(f"try_cast(trim({quoted}) as int)"))
    )


def parse_eldermark_date(column_name: str):
    quoted = f"`{column_name}`"
    text_value = f"trim(cast({quoted} as string))"
    day_month_candidate = f"""
      try_cast(concat(
        split({text_value}, '!')[2],
        '-',
        lpad(split({text_value}, '!')[1], 2, '0'),
        '-',
        lpad(split({text_value}, '!')[0], 2, '0')
      ) as date)
    """
    return F.expr(f"""
      CASE
        WHEN {quoted} IS NULL THEN cast(NULL as date)
        WHEN lower({text_value}) IN ('', '0!0!0', 'none', 'nan', 'null', 'n/a', 'na') THEN cast(NULL as date)
        -- ElderMark dates are D!M!YYYY. Impossible or ambiguous dates return NULL.
        WHEN {text_value} rlike '^\\\\d{{1,2}}!\\\\d{{1,2}}!\\\\d{{4}}$' THEN {day_month_candidate}
        ELSE try_cast({text_value} as date)
      END
    """)


def clean_sentinel_date(column_name: str):
    return (
        F.when(F.col(column_name).isNull(), None)
        .when(F.year(F.col(column_name)) >= 2900, None)
        .otherwise(F.col(column_name))
    )


def cast_strings(df: DataFrame) -> DataFrame:
    for field in df.schema.fields:
        df = df.withColumn(field.name, F.col(field.name).cast(StringType()))
    return df


def parse_dates(df: DataFrame, table_name: str) -> DataFrame:
    for date_column in DATE_COLUMNS.get(table_name, []):
        if date_column in df.columns:
            df = df.withColumn(f"{date_column}_dt", parse_eldermark_date(date_column))
            df = df.withColumn(f"{date_column}_dt", clean_sentinel_date(f"{date_column}_dt"))
    return df


def ensure_partition_exists(table_name: str) -> None:
    partition_path = f"{INPUT_PATH}/{table_name}/dt={date_partition}/"
    try:
        files = dbutils.fs.ls(partition_path)
    except Exception as exc:
        raise FileNotFoundError(
            f"Missing raw partition for {table_name}: {partition_path}"
        ) from exc

    parquet_files = [entry.path for entry in files if entry.path.endswith(".parquet")]
    if not parquet_files:
        raise FileNotFoundError(
            f"No parquet files found for {table_name} in {partition_path}"
        )


def read_partition(table_name: str) -> DataFrame:
    ensure_partition_exists(table_name)
    return spark.read.parquet(f"{INPUT_PATH}/{table_name}/dt={date_partition}/")


def deduplicate(df: DataFrame, table_name: str) -> DataFrame:
    if "__KEY" not in df.columns:
        return df

    if table_name == "Res_Incident":
        if "Unique_ID" not in df.columns:
            return df.dropDuplicates(["__KEY"])

        # A resident can legitimately have the same incident type more than
        # once per day. Preserve those events by using the source record ID.
        incident_key = F.when(
            F.col("Unique_ID").isNotNull() & (F.trim(F.col("Unique_ID")) != ""),
            F.concat(F.lit("incident:"), F.trim(F.col("Unique_ID"))),
        ).otherwise(F.concat(F.lit("source:"), F.col("__KEY")))
        return (
            df.withColumn("_incident_dedupe_key", incident_key)
            .dropDuplicates(["_incident_dedupe_key"])
            .drop("_incident_dedupe_key")
        )
    if table_name == "Med_Delivery" and "Med_Delivery_ID" in df.columns:
        return df.dropDuplicates(["Med_Delivery_ID"])
    if table_name == "Notes" and "Note_ID" in df.columns:
        return df.dropDuplicates(["Note_ID"])
    return df.dropDuplicates(["__KEY"])


def stable_table_path(table_name: str) -> str:
    return f"{STABLE_OUTPUT_PATH}/{table_name}"


def staging_table_path(table_name: str) -> str:
    return f"{STAGING_OUTPUT_PATH}/{table_name}"


def rollback_table_path(table_name: str) -> str:
    return f"{STAGING_OUTPUT_PATH}/_rollback/{table_name}"


def rollback_root_path() -> str:
    return f"{STAGING_OUTPUT_PATH}/_rollback"


def is_missing_path_error(exc: Exception) -> bool:
    error_class_getter = getattr(exc, "getErrorClass", None)
    error_class = error_class_getter() if callable(error_class_getter) else None
    if error_class in {"PATH_NOT_FOUND", "RESOURCE_DOES_NOT_EXIST"}:
        return True
    message = str(exc)
    return any(
        marker in message
        for marker in (
            "[PATH_NOT_FOUND]",
            "java.io.FileNotFoundException",
            "Path does not exist:",
            "The specified path does not exist.",
        )
    )


def path_exists(path: str) -> bool:
    try:
        dbutils.fs.ls(path)
        return True
    except Exception as exc:
        if is_missing_path_error(exc):
            return False
        raise RuntimeError(f"Could not inspect filesystem path: {path}") from exc


def remove_path(path: str) -> None:
    if not path_exists(path):
        return
    if not dbutils.fs.rm(path, recurse=True) or path_exists(path):
        raise RuntimeError(f"Could not remove filesystem path: {path}")


def ensure_directory(path: str) -> None:
    if path_exists(path):
        return
    if not dbutils.fs.mkdirs(path) or not path_exists(path):
        raise RuntimeError(f"Could not create filesystem directory: {path}")


def move_path(source: str, target: str) -> None:
    if not path_exists(source):
        raise RuntimeError(f"Cannot move missing filesystem path: {source}")
    if not dbutils.fs.mv(source, target, recurse=True) or not path_exists(target):
        raise RuntimeError(f"Could not move filesystem path from {source} to {target}")


def validate_parquet_path(path: str, label: str) -> None:
    try:
        files = dbutils.fs.ls(path)
        if not any(entry.path.endswith(".parquet") for entry in files):
            raise RuntimeError(f"{label} has no Parquet data files: {path}")
        spark.read.parquet(path).limit(1).collect()
    except Exception as exc:
        raise RuntimeError(f"{label} is not readable Parquet: {path}") from exc


def recover_interrupted_promotion(table_name: str) -> None:
    stable_target = stable_table_path(table_name)
    rollback_target = rollback_table_path(table_name)
    if not path_exists(rollback_target):
        return

    if path_exists(stable_target):
        validate_parquet_path(stable_target, f"{table_name} stable dataset")
        remove_path(rollback_target)
        return

    move_path(rollback_target, stable_target)
    validate_parquet_path(stable_target, f"{table_name} recovered stable dataset")
    raise RuntimeError(
        f"Recovered {table_name} from an interrupted prior publish. "
        "Re-run this partition so the new staged dataset can be published cleanly."
    )


def promote_to_stable(table_name: str) -> dict:
    staging_target = staging_table_path(table_name)
    stable_target = stable_table_path(table_name)
    rollback_target = rollback_table_path(table_name)
    validate_parquet_path(staging_target, f"{table_name} staged dataset")
    recover_interrupted_promotion(table_name)

    had_previous_stable = path_exists(stable_target)
    if had_previous_stable:
        ensure_directory(rollback_root_path())
        move_path(stable_target, rollback_target)

    try:
        move_path(staging_target, stable_target)
        validate_parquet_path(stable_target, f"{table_name} promoted stable dataset")
    except Exception as exc:
        if path_exists(stable_target):
            remove_path(stable_target)
        if had_previous_stable and path_exists(rollback_target):
            move_path(rollback_target, stable_target)
            validate_parquet_path(stable_target, f"{table_name} restored stable dataset")
        raise RuntimeError(f"Failed to promote {table_name}; the prior stable dataset was restored.") from exc

    return {
        "had_previous_stable": had_previous_stable,
        "rollback_target": rollback_target,
    }


def finish_promotion(promotion: dict) -> None:
    rollback_target = promotion["rollback_target"]
    if path_exists(rollback_target):
        remove_path(rollback_target)


def rollback_promotion(table_name: str, promotion: dict) -> None:
    stable_target = stable_table_path(table_name)
    rollback_target = promotion["rollback_target"]
    if path_exists(stable_target):
        remove_path(stable_target)
    if promotion["had_previous_stable"]:
        move_path(rollback_target, stable_target)
        validate_parquet_path(stable_target, f"{table_name} restored stable dataset")


def register_silver_table(table_name: str) -> None:
    silver_table_name = TABLE_NAME_MAP[table_name]
    silver_location = stable_table_path(table_name)
    fqn = f"{catalog}.{silver_schema}.{silver_table_name}"
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{silver_schema}")
    spark.sql(f"DROP TABLE IF EXISTS {fqn}")
    spark.sql(
        f"""
        CREATE TABLE {fqn}
        USING PARQUET
        LOCATION '{silver_location}'
        """
    )


def validate_silver_table_readable(table_name: str) -> None:
    silver_table_name = TABLE_NAME_MAP[table_name]
    fqn = f"{catalog}.{silver_schema}.{silver_table_name}"
    try:
        spark.table(fqn).limit(1).collect()
    except Exception as exc:
        raise RuntimeError(
            f"Silver table {fqn} is not readable immediately after publish. "
            "This usually means the metastore schema and Parquet files disagree, "
            "or old mixed-schema files remain under the stable output path. "
            "Do not continue to downstream QA until this table is repaired."
        ) from exc


def write_table(df: DataFrame, table_name: str) -> None:
    write_start = time.perf_counter()
    staged_path = staging_table_path(table_name)
    remove_path(staged_path)
    print(f"{table_name}: staging path cleared after {elapsed_seconds(write_start)}.")
    parquet_start = time.perf_counter()
    (
        df.withColumn("_transform_partition", lit(date_partition))
        .withColumn("_transform_timestamp", lit(datetime.now(timezone.utc).isoformat()))
        .write.mode("overwrite")
        .parquet(staged_path)
    )
    print(f"{table_name}: parquet write finished after {elapsed_seconds(parquet_start)}.")
    promote_start = time.perf_counter()
    promotion = promote_to_stable(table_name)
    print(f"{table_name}: promoted staging to stable after {elapsed_seconds(promote_start)}.")
    try:
        register_start = time.perf_counter()
        register_silver_table(table_name)
        print(f"{table_name}: silver table registered after {elapsed_seconds(register_start)}.")
        validate_start = time.perf_counter()
        validate_silver_table_readable(table_name)
        print(f"{table_name}: silver readability validated after {elapsed_seconds(validate_start)}.")
    except Exception as publish_exc:
        try:
            rollback_promotion(table_name, promotion)
            if promotion["had_previous_stable"]:
                register_silver_table(table_name)
                validate_silver_table_readable(table_name)
            else:
                spark.sql(f"DROP TABLE IF EXISTS {catalog}.{silver_schema}.{TABLE_NAME_MAP[table_name]}")
        except Exception as rollback_exc:
            raise RuntimeError(
                f"{table_name} publish failed and automatic rollback also failed. "
                f"The retained backup is {promotion['rollback_target']}."
            ) from rollback_exc
        raise RuntimeError(
            f"{table_name} publish failed after promotion; the prior stable dataset and table were restored."
        ) from publish_exc

    finish_promotion(promotion)
    print(f"{table_name}: total write/publish time {elapsed_seconds(write_start)}.")


def build_resident_quality_flags(df: DataFrame) -> DataFrame:
    first_name = F.lower(F.trim(F.coalesce(F.col("First_Name"), F.lit(""))))
    last_name = F.lower(F.trim(F.coalesce(F.col("Last_Name"), F.lit(""))))
    full_name = F.lower(F.trim(F.concat_ws(" ", first_name, last_name)))
    has_res_number = F.col("Res_Number").isNotNull() & (F.trim(F.col("Res_Number")) != "")
    has_valid_admit = F.col("Admit_Date_dt").isNotNull() & (F.col("Admit_Date") != "0!0!0") & (F.col("Admit_Date_dt") <= as_of_date_col())
    has_bad_discharge_order = F.col("Discharge_Date_dt").isNotNull() & (F.col("Discharge_Date_dt") < F.col("Admit_Date_dt"))
    not_resident_flags = [
        boolish_col(column_name)
        for column_name in ["Not_a_Resident", "not_a_resident"]
        if column_name in df.columns
    ]
    source_not_a_resident = reduce(lambda left, right: left | right, not_resident_flags) if not_resident_flags else F.lit(False)
    has_mhw_placeholder_name = (
        full_name.rlike(MHW_PLACEHOLDER_RESIDENT_PATTERN)
        | first_name.rlike(MHW_PLACEHOLDER_RESIDENT_PATTERN)
        | last_name.rlike(MHW_PLACEHOLDER_RESIDENT_PATTERN)
    )
    has_suspect_name = (
        full_name.rlike(NON_COUNTABLE_RESIDENT_PATTERN)
        | (first_name.rlike(PLACEHOLDER_RESIDENT_PATTERN) & last_name.rlike(PLACEHOLDER_RESIDENT_PATTERN))
        | has_mhw_placeholder_name
    )

    exclusion_reason = F.concat_ws(
        "|",
        F.when(~has_res_number, F.lit("missing_res_number")),
        F.when(~has_valid_admit, F.lit("invalid_or_missing_admit_date")),
        F.when(source_not_a_resident, F.lit("not_a_resident")),
        F.when(has_bad_discharge_order, F.lit("discharge_before_admit")),
        F.when(has_mhw_placeholder_name, F.lit("mhw_placeholder_resident")),
        F.when(has_suspect_name, F.lit("suspect_test_or_placeholder_name")),
    )

    return (
        df.withColumn("resident_full_name_normalized", full_name)
        .withColumn("is_mhw_placeholder_resident", has_mhw_placeholder_name.cast("integer"))
        .withColumn("is_suspect_test_resident", has_suspect_name.cast("integer"))
        .withColumn("source_not_a_resident", source_not_a_resident.cast("integer"))
        .withColumn("resident_exclusion_reason", exclusion_reason)
        .withColumn(
            "is_countable_resident",
            (has_res_number & has_valid_admit & ~source_not_a_resident & ~has_bad_discharge_order & ~has_suspect_name).cast("integer"),
        )
    )


def build_leave_intervals() -> DataFrame:
    leave_df = parse_dates(cast_strings(read_partition("Res_Leave_of_Absence")), "Res_Leave_of_Absence")
    required_columns = {"Facility", "Res_Number", "On_Leave", "From_Date_dt", "To_Date_dt"}
    missing_columns = sorted(required_columns - set(leave_df.columns))
    if missing_columns:
        raise RuntimeError(
            "Res_Leave_of_Absence is missing columns required for informational leave status: "
            + ", ".join(missing_columns)
        )

    return (
        leave_df.filter(F.col("Facility").isin(FACILITY_WHITELIST))
        .filter(F.col("Facility").isNotNull() & F.col("Res_Number").isNotNull())
        .filter(F.col("From_Date_dt").isNotNull() & (F.col("From_Date_dt") <= as_of_date_col()))
        .filter(
            (F.col("To_Date_dt").isNotNull() & (F.col("To_Date_dt") > F.col("From_Date_dt")))
            | (F.col("To_Date_dt").isNull() & boolish_col("On_Leave"))
        )
        .select(
            F.col("Facility").cast("string").alias("Facility"),
            F.col("Res_Number").cast("string").alias("Res_Number"),
            F.col("From_Date_dt").alias("leave_start_date"),
            F.col("To_Date_dt").alias("leave_end_date"),
        )
        .distinct()
    )


def build_resident_flags(df: DataFrame, leave_intervals: DataFrame) -> DataFrame:
    loa_active = (
        leave_intervals.filter(
            (F.col("leave_start_date") <= as_of_date_col())
            & (F.col("leave_end_date").isNull() | (F.col("leave_end_date") > as_of_date_col()))
        )
        .select("Facility", "Res_Number")
        .distinct()
        .withColumn("is_on_loa_flag", F.lit(True))
    )

    df = df.join(loa_active, on=["Facility", "Res_Number"], how="left")
    df = df.withColumn("is_on_loa", (F.col("is_on_loa_flag").isNotNull()).cast("integer"))
    df = df.withColumn("is_active", (F.col("Discharge_Date") == "0!0!0").cast("integer"))
    df = df.withColumn(
        "is_active_final",
        (
            (F.col("Discharge_Date") == "0!0!0")
            & (F.col("Admit_Date") != "0!0!0")
        ).cast("integer"),
    )
    df = df.withColumn(
        "is_active_including_loa",
        ((F.col("Discharge_Date") == "0!0!0") & (F.col("Admit_Date") != "0!0!0")).cast("integer"),
    )
    df = df.drop("is_on_loa_flag")
    df = df.withColumn("Age", F.floor(F.datediff(as_of_date_col(), F.col("BirthDate_dt")) / 365.25))
    df = df.withColumn(
        "LOS_Days",
        F.when(
            F.col("is_active_including_loa") == 1,
            F.datediff(as_of_date_col(), F.col("Admit_Date_dt")),
        ).otherwise(F.datediff(F.col("Discharge_Date_dt"), F.col("Admit_Date_dt"))),
    )
    return df


def build_census_snapshot(resident_df: DataFrame) -> DataFrame:
    census_start = time.perf_counter()
    today = AS_OF_DATE
    eligible_residents = resident_df.filter(F.col("is_countable_resident") == 1)
    print("Census_Snapshot: resolving earliest countable admit date.")
    earliest_row = eligible_residents.select(F.min("Admit_Date_dt").alias("earliest_admit")).first()
    earliest_admit = earliest_row["earliest_admit"] if earliest_row else None
    if earliest_admit is None:
        raise RuntimeError("No countable residents with valid admit dates; cannot build Census_Snapshot.")
    print(f"Census_Snapshot: earliest countable admit date is {earliest_admit}.")

    if CENSUS_HISTORY_MONTHS > 0:
        start_month = today - relativedelta(months=CENSUS_HISTORY_MONTHS - 1)
    else:
        start_month = earliest_admit

    cursor = start_month.replace(day=1)
    end_cursor = today.replace(day=1)
    census_dates = []
    while cursor <= end_cursor:
        month_end = cursor + relativedelta(months=1) - relativedelta(days=1)
        snapshot_date = min(month_end, AS_OF_DATE)
        month_bucket = cursor.strftime("%Y-%m")
        census_dates.append((month_bucket, snapshot_date))
        cursor = cursor + relativedelta(months=1)
    print(
        "Census_Snapshot: planned "
        f"{len(census_dates)} monthly snapshots from {census_dates[0][0]} through {census_dates[-1][0]} "
        f"after {elapsed_seconds(census_start)}."
    )

    census_dates_df = spark.createDataFrame(
        census_dates,
        "month_bucket string, snapshot_date date",
    )
    resident_months = (
        eligible_residents.alias("r")
        .join(
            F.broadcast(census_dates_df).alias("m"),
            (F.col("r.Admit_Date_dt") <= F.col("m.snapshot_date"))
            & (
                F.col("r.Discharge_Date_dt").isNull()
                | (F.col("r.Discharge_Date_dt") > F.col("m.snapshot_date"))
            ),
            "inner",
        )
        .select(
            F.col("r.Facility").cast("string").alias("Facility"),
            F.col("r.Res_Number").cast("string").alias("Res_Number"),
            F.col("m.month_bucket"),
            F.col("m.snapshot_date"),
        )
    )
    census_df = (
        resident_months.groupBy("Facility", "month_bucket", "snapshot_date")
        .agg(F.countDistinct("Res_Number").alias("census"))
    )

    print(f"Census_Snapshot: set-based monthly plan built after {elapsed_seconds(census_start)}.")
    return census_df


def json_default(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def active_as_of_condition():
    return (
        (F.col("Admit_Date_dt") <= as_of_date_col())
        & (
            F.col("Discharge_Date_dt").isNull()
            | (F.col("Discharge_Date_dt") > as_of_date_col())
        )
    )


def summarize_transform_census(resident_df: DataFrame, census_df: DataFrame) -> None:
    summary_start = time.perf_counter()
    resident_key = F.concat_ws(
        "::",
        F.coalesce(F.col("Facility").cast("string"), F.lit("")),
        F.coalesce(F.col("Res_Number").cast("string"), F.lit("")),
    )
    active_as_of = active_as_of_condition()
    countable = F.coalesce(F.col("is_countable_resident"), F.lit(0)) == 1

    resident_summary = resident_df.agg(
        F.count(F.lit(1)).alias("resident_source_rows"),
        F.countDistinct(F.when(active_as_of, resident_key)).alias("active_source_residents_as_of"),
        F.countDistinct(F.when(active_as_of & countable, resident_key)).alias("active_countable_residents_as_of"),
        F.sum(F.when(F.coalesce(F.col("is_countable_resident"), F.lit(0)) == 0, 1).otherwise(0)).alias("non_countable_source_rows"),
        F.sum(F.when(F.coalesce(F.col("source_not_a_resident"), F.lit(0)) == 1, 1).otherwise(0)).alias("source_not_a_resident_rows"),
        F.sum(F.when(F.coalesce(F.col("is_suspect_test_resident"), F.lit(0)) == 1, 1).otherwise(0)).alias("suspect_test_rows"),
        F.sum(F.when(F.col("Admit_Date_dt") > as_of_date_col(), 1).otherwise(0)).alias("future_admit_rows"),
        F.sum(F.when(F.col("Discharge_Date_dt").isNotNull() & (F.col("Discharge_Date_dt") < F.col("Admit_Date_dt")), 1).otherwise(0)).alias("bad_discharge_order_rows"),
    ).first().asDict()
    print(f"Census_Snapshot: resident summary collected after {elapsed_seconds(summary_start)}.")

    latest_census_month = census_df.agg(F.max("month_bucket").alias("month_bucket")).first()["month_bucket"]
    latest_census_total = census_df.filter(F.col("month_bucket") == latest_census_month).agg(
        F.sum("census").alias("census")
    ).first()["census"]
    print(f"Census_Snapshot: latest census month summary collected after {elapsed_seconds(summary_start)}.")

    current_census_df = census_df.filter(F.col("month_bucket") == AS_OF_MONTH).select(
        F.col("Facility").cast("string").alias("Facility"),
        F.col("census").cast("int").alias("census"),
    )
    active_countable_df = resident_df.filter(active_as_of & countable).groupBy(
        F.col("Facility").cast("string").alias("Facility")
    ).agg(F.countDistinct("Res_Number").alias("active_countable_residents"))

    comparison_df = (
        current_census_df.join(active_countable_df, on="Facility", how="full")
        .na.fill(0, subset=["census", "active_countable_residents"])
        .withColumn("delta", F.col("census") - F.col("active_countable_residents"))
        .orderBy("Facility")
    )
    mismatches = [row.asDict() for row in comparison_df.filter(F.col("delta") != 0).collect()]
    print(f"Census_Snapshot: facility comparison collected after {elapsed_seconds(summary_start)}.")

    duplicate_active_keys = (
        resident_df.filter(active_as_of & countable)
        .groupBy("Facility", "Res_Number")
        .count()
        .filter(F.col("count") > 1)
        .count()
    )
    print(f"Census_Snapshot: duplicate active key check collected after {elapsed_seconds(summary_start)}.")
    month_leaks = census_df.filter(F.col("month_bucket") > AS_OF_MONTH).count()
    print(f"Census_Snapshot: month leak check collected after {elapsed_seconds(summary_start)}.")
    exclusion_df = (
        resident_df.filter(F.coalesce(F.col("is_countable_resident"), F.lit(0)) == 0)
        .groupBy("resident_exclusion_reason")
        .agg(F.count(F.lit(1)).alias("rows"))
        .orderBy(F.desc("rows"))
    )

    failures = []
    if latest_census_month and latest_census_month > AS_OF_MONTH:
        failures.append(f"latest census month {latest_census_month} is after transform as-of month {AS_OF_MONTH}")
    if month_leaks:
        failures.append(f"{month_leaks} Census_Snapshot rows extend past transform as-of month {AS_OF_MONTH}")
    if duplicate_active_keys:
        failures.append(f"{duplicate_active_keys} duplicate active countable resident keys found")
    if mismatches:
        failures.append(f"{len(mismatches)} facility census rows do not match active countable residents for {AS_OF_MONTH}")

    summary = {
        "ok": not failures,
        "as_of_date": AS_OF_DATE.isoformat(),
        "as_of_month": AS_OF_MONTH,
        "latest_census_month": latest_census_month,
        "latest_census_total": int(latest_census_total or 0),
        "duplicate_active_resident_keys": int(duplicate_active_keys),
        "census_rows_after_as_of_month": int(month_leaks),
        "facility_mismatches": mismatches,
        "resident_summary": resident_summary,
        "failures": failures,
    }

    print(f"TRANSFORM_CENSUS_SUMMARY={json.dumps(summary, sort_keys=True, default=json_default)}")
    print("Transform census by facility")
    display(comparison_df)
    print("Transform excluded resident rows")
    display(exclusion_df.limit(25))

    if failures:
        raise ValueError("Transform census validation failed: " + "; ".join(failures))
    print(f"Census_Snapshot: validation summary finished after {elapsed_seconds(summary_start)}.")


def transform_table(
    table_name: str,
    valid_res_numbers: DataFrame | None,
    leave_intervals: DataFrame,
    table_index: int,
    table_total: int,
) -> tuple[DataFrame, DataFrame | None]:
    table_start = time.perf_counter()
    print(f"\nProcessing {table_name} ({table_index}/{table_total}) for partition {date_partition}...")
    df = read_partition(table_name)
    print(f"{table_name}: raw partition read after {elapsed_seconds(table_start)}.")
    df = cast_strings(df)
    print(f"{table_name}: string casts planned after {elapsed_seconds(table_start)}.")

    if table_name in FACILITY_TABLES:
        df = df.filter(F.col("Facility").isin(FACILITY_WHITELIST))
    elif table_name in RES_NUMBER_TABLES and valid_res_numbers is not None and "Res_Number" in df.columns:
        df = df.join(valid_res_numbers, on="Res_Number", how="inner")

    df = parse_dates(df, table_name)
    print(f"{table_name}: date parsing planned after {elapsed_seconds(table_start)}.")

    if table_name == "Resident":
        df = build_resident_quality_flags(build_resident_flags(df, leave_intervals))
    elif table_name == "Res_Medications":
        df = df.withColumn("is_active", (F.col("Archive_Date") == "0!0!0").cast("integer"))
        df = df.withColumn("Narcotic", (F.col("Narcotic") == "True").cast("integer"))
        df = df.withColumn("Psychotropic", (F.col("Psychotropic") == "True").cast("integer"))
    elif table_name == "Res_Leave_of_Absence":
        df = df.withColumn(
            "is_on_loa",
            (
                F.col("From_Date_dt").isNotNull()
                & (F.col("From_Date_dt") <= as_of_date_col())
                & (
                    (F.col("To_Date_dt").isNotNull() & (F.col("To_Date_dt") > as_of_date_col()))
                    | (F.col("To_Date_dt").isNull() & boolish_col("On_Leave"))
                )
            ).cast("integer"),
        )
    elif table_name == "Res_Incident":
        mapping_expr = create_map([lit(item) for item in chain(*INCIDENT_MAP.items())])
        df = df.withColumn("Incident_Category", mapping_expr[F.col("Type_of_Incident")])
        df = df.withColumn(
            "Incident_Category",
            F.when(F.col("Incident_Category").isNotNull(), F.col("Incident_Category"))
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"death|died|deceas|passed"), "Death")
            .when(
                F.lower(F.col("Type_of_Incident")).rlike(
                    r"suicid|self.harm|self.injur|danger to self|5150|psych crisis"
                ),
                "Mental Health Crisis",
            )
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"sex|inappropriat|harass"), "Sexual Incident")
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"police|sheriff|arrest|incarcerat|jail"), "911/Police")
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"fire alarm|knife|weapon|started a fire"), "Fire/Safety Hazard")
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"safety check|welfare check|refused check"), "Safety Check Refusal")
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"urinat|defecate|courtyard"), "Hygiene/Public Behavior")
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"awol|elope|left facility|missing person|self discharge"), "AWOL/Elopement")
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"fall|fell|found on floor|slipped"), "Fall")
            .when(
                F.lower(F.col("Type_of_Incident")).rlike(
                    r"smok|vap|drug|substance|alcohol|lighter|pipe|cannabis|paraphernalia"
                ),
                "Substance Use",
            )
            .when(
                F.lower(F.col("Type_of_Incident")).rlike(
                    r"aggress|altercation|fight|hit|punch|kick|scratch|bite|destruct|threat|theft|stole|taunting"
                ),
                "Aggressive Behavior",
            )
            .when(
                F.lower(F.col("Type_of_Incident")).rlike(
                    r"911|ambulance|hospital|seizure|breath|bleed|emergency|change of condition|faint|unresponsive|transported|sent out"
                ),
                "Medical Emergency",
            )
            .when(F.lower(F.col("Type_of_Incident")).rlike(r"medication|refusal|non.compliance|pocketing|missed med"), "Medication Refusal")
            .otherwise("Other"),
        )
    elif table_name == "Med_Delivery":
        df = df.withColumn(
            "outcome",
            F.when(F.col("Given") == "True", "given")
            .when(F.col("Not_Given_Reason").isNotNull() & (F.col("Not_Given_Reason") != ""), "not_given")
            .otherwise("unknown"),
        )
        for column_name in ["Pulse", "Respiration", "Temperature", "Blood_Sugar", "O2_Saturation", "Weight"]:
            if column_name in df.columns:
                df = df.withColumn(column_name, safe_float(column_name))
        if "Sched_to_Given_Minutes_Late" in df.columns:
            df = df.withColumn(
                "Sched_to_Given_Minutes_Late",
                safe_int("Sched_to_Given_Minutes_Late"),
            )
    elif table_name == "Allergies" and "End_Date" in df.columns:
        df = df.withColumn("is_active", (F.col("End_Date") == "0!0!0").cast("integer"))
    elif table_name == "MEDNAME":
        df = df.withColumn("Narcotic", (F.col("Narcotic") == "True").cast("integer"))
    elif table_name == "Notes" and "Late_Entry" in df.columns:
        df = df.withColumn("is_late_entry", (F.col("Late_Entry") == "True").cast("integer"))
    elif table_name == "Res_Contacts":
        for column_name in [
            "Conservator_of_Person",
            "Conservator_of_Estate",
            "Guardian",
            "Power_of_Attorney",
            "MHPOA",
            "Emergency",
            "Responsible_Party",
        ]:
            if column_name in df.columns:
                df = df.withColumn(column_name, (F.col(column_name) == "True").cast("integer"))

    df = deduplicate(df, table_name)
    print(f"{table_name}: table-specific transforms planned after {elapsed_seconds(table_start)}.")
    write_table(df, table_name)
    print(f"Finished {table_name} ({table_index}/{table_total}) after {elapsed_seconds(table_start)}.")

    if table_name == "Resident":
        valid_res_numbers = df.select("Res_Number").distinct()

    return df, valid_res_numbers


def publish_census_snapshot(
    resident_df: DataFrame,
    step_label: str,
) -> None:
    census_start = time.perf_counter()
    print(f"Preparing Census_Snapshot ({step_label}) for partition {date_partition}...")
    census_df = build_census_snapshot(resident_df)
    print(
        "Census_Snapshot: logical frame prepared "
        f"for {CENSUS_HISTORY_MONTHS if CENSUS_HISTORY_MONTHS > 0 else 'full-history'} month setting "
        f"after {elapsed_seconds(census_start)}."
    )
    print(
        "Census_Snapshot: skipping expensive pre-write census summary in the transform; "
        "downstream census_quality_audit remains the validation gate."
    )
    print(f"Processing Census_Snapshot ({step_label}) for partition {date_partition}...")
    write_table(census_df, "Census_Snapshot")
    print(f"Finished Census_Snapshot ({step_label}) after {elapsed_seconds(census_start)}.")


def main() -> None:
    valid_res_numbers = None
    resident_df = None
    leave_intervals = build_leave_intervals()

    table_total = len(TABLES)
    for table_index, table_name in enumerate(TABLES, start=1):
        transformed_df, valid_res_numbers = transform_table(
            table_name,
            valid_res_numbers,
            leave_intervals,
            table_index,
            table_total,
        )
        if table_name == "Resident":
            resident_df = transformed_df

    if resident_df is None:
        raise RuntimeError("Resident table did not produce output; cannot build Census_Snapshot.")

    publish_census_snapshot(
        resident_df,
        f"{table_total + 1}/{table_total + 1}",
    )

    print(
        f"eldermark_staged_transform completed successfully for partition {date_partition}. "
        f"Wrote {len(TABLES) + 1} silver datasets."
    )


main()
