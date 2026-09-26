# Databricks notebook source

from datetime import datetime, date, timezone
import json
import time

from dateutil.relativedelta import relativedelta
from pyspark.sql import DataFrame, functions as F
from pyspark.sql.functions import lit

dbutils.widgets.text("date_partition", "")

date_partition = dbutils.widgets.get("date_partition").strip()

if not date_partition:
    raise ValueError("Missing required widget: date_partition")

try:
    AS_OF_DATE = datetime.strptime(date_partition, "%Y-%m-%d").date()
except ValueError:
    raise ValueError("date_partition must be formatted as YYYY-MM-DD")

CATALOG = "alamohealth"
SILVER_SCHEMA = "silver"
CENSUS_HISTORY_MONTHS = 52
AS_OF_MONTH = AS_OF_DATE.strftime("%Y-%m")

STORAGE = "abfss://data@alamodatalake.dfs.core.windows.net"
STABLE_OUTPUT_PATH = f"{STORAGE}/eldermark/staged/clean"
STAGING_OUTPUT_PATH = f"{STORAGE}/eldermark/staged/staging/{date_partition}"


def elapsed_seconds(start: float) -> str:
    return f"{time.perf_counter() - start:.1f}s"


def as_of_date_col():
    return F.lit(AS_OF_DATE.isoformat()).cast("date")


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


def register_silver_table(table_name: str, silver_table_name: str) -> None:
    silver_location = stable_table_path(table_name)
    fqn = f"{CATALOG}.{SILVER_SCHEMA}.{silver_table_name}"
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SILVER_SCHEMA}")
    spark.sql(f"DROP TABLE IF EXISTS {fqn}")
    spark.sql(
        f"""
        CREATE TABLE {fqn}
        USING PARQUET
        LOCATION '{silver_location}'
        """
    )


def validate_silver_table_readable(silver_table_name: str) -> None:
    fqn = f"{CATALOG}.{SILVER_SCHEMA}.{silver_table_name}"
    try:
        spark.table(fqn).limit(1).collect()
    except Exception as exc:
        raise RuntimeError(
            f"Silver table {fqn} is not readable immediately after publish. "
            "Do not continue to downstream QA until this table is repaired."
        ) from exc


def write_census_snapshot(df: DataFrame) -> None:
    write_start = time.perf_counter()
    staged_path = staging_table_path("Census_Snapshot")
    remove_path(staged_path)
    print(f"Census_Snapshot: staging path cleared after {elapsed_seconds(write_start)}.")

    parquet_start = time.perf_counter()
    (
        df.withColumn("_transform_partition", lit(date_partition))
        .withColumn("_transform_timestamp", lit(datetime.now(timezone.utc).isoformat()))
        .write.mode("overwrite")
        .parquet(staged_path)
    )
    print(f"Census_Snapshot: parquet write finished after {elapsed_seconds(parquet_start)}.")

    promote_start = time.perf_counter()
    promotion = promote_to_stable("Census_Snapshot")
    print(f"Census_Snapshot: promoted staging to stable after {elapsed_seconds(promote_start)}.")

    try:
        register_start = time.perf_counter()
        register_silver_table("Census_Snapshot", "census_snapshot")
        print(f"Census_Snapshot: silver table registered after {elapsed_seconds(register_start)}.")

        validate_start = time.perf_counter()
        validate_silver_table_readable("census_snapshot")
        print(f"Census_Snapshot: silver readability validated after {elapsed_seconds(validate_start)}.")
    except Exception as publish_exc:
        try:
            rollback_promotion("Census_Snapshot", promotion)
            if promotion["had_previous_stable"]:
                register_silver_table("Census_Snapshot", "census_snapshot")
                validate_silver_table_readable("census_snapshot")
            else:
                spark.sql(f"DROP TABLE IF EXISTS {CATALOG}.{SILVER_SCHEMA}.census_snapshot")
        except Exception as rollback_exc:
            raise RuntimeError(
                "Census_Snapshot publish failed and automatic rollback also failed. "
                f"The retained backup is {promotion['rollback_target']}."
            ) from rollback_exc
        raise RuntimeError(
            "Census_Snapshot publish failed after promotion; the prior stable dataset and table were restored."
        ) from publish_exc

    finish_promotion(promotion)
    print(f"Census_Snapshot: total write/publish time {elapsed_seconds(write_start)}.")


def read_resident_silver() -> DataFrame:
    fqn = f"{CATALOG}.{SILVER_SCHEMA}.resident"
    try:
        df = spark.table(fqn)
        print(f"Loaded resident silver table {fqn}.")
    except Exception as exc:
        raise RuntimeError(
            f"Required resident silver table {fqn} is not readable. "
            "Run eldermark_staged_transform successfully before using the census-only recovery notebook."
        ) from exc

    required_columns = {
        "Res_Number",
        "Facility",
        "Admit_Date_dt",
        "Discharge_Date_dt",
        "is_countable_resident",
        "_transform_partition",
    }
    missing_columns = sorted(required_columns - set(df.columns))
    if missing_columns:
        raise RuntimeError(
            f"Resident silver table {fqn} is missing governed columns: {', '.join(missing_columns)}. "
            "Run eldermark_staged_transform before rebuilding census."
        )

    df = df.filter(F.col("_transform_partition") == date_partition)

    if df.limit(1).count() == 0:
        raise RuntimeError(
            f"No resident silver rows found for partition {date_partition}. "
            "Do not rebuild census until the source-table transform has completed Resident for this date."
        )

    return df


def build_census_snapshot(resident_df: DataFrame) -> DataFrame:
    census_start = time.perf_counter()
    eligible_residents = resident_df.filter(F.col("is_countable_resident") == 1)

    print("Census_Snapshot: resolving earliest countable admit date.")
    earliest_row = eligible_residents.select(F.min("Admit_Date_dt").alias("earliest_admit")).first()
    earliest_admit = earliest_row["earliest_admit"] if earliest_row else None
    if earliest_admit is None:
        raise RuntimeError("No countable residents with valid admit dates; cannot build Census_Snapshot.")
    print(f"Census_Snapshot: earliest countable admit date is {earliest_admit}.")

    start_month = AS_OF_DATE - relativedelta(months=CENSUS_HISTORY_MONTHS - 1)
    cursor = start_month.replace(day=1)
    end_cursor = AS_OF_DATE.replace(day=1)
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


def active_as_of_condition():
    return (
        (F.col("Admit_Date_dt") <= as_of_date_col())
        & (
            F.col("Discharge_Date_dt").isNull()
            | (F.col("Discharge_Date_dt") > as_of_date_col())
        )
    )


def json_default(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)


def summarize_census(resident_df: DataFrame, census_df: DataFrame) -> None:
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
    month_leaks = census_df.filter(F.col("month_bucket") > AS_OF_MONTH).count()

    failures = []
    if duplicate_active_keys:
        failures.append(f"{duplicate_active_keys} duplicate active countable resident keys found")
    if month_leaks:
        failures.append(f"{month_leaks} Census_Snapshot rows extend past transform as-of month {AS_OF_MONTH}")
    if mismatches:
        failures.append(f"{len(mismatches)} facility census rows do not match active countable residents for {AS_OF_MONTH}")

    summary = {
        "ok": not failures,
        "as_of_date": AS_OF_DATE.isoformat(),
        "as_of_month": AS_OF_MONTH,
        "census_history_months": CENSUS_HISTORY_MONTHS,
        "latest_census_month": latest_census_month,
        "latest_census_total": int(latest_census_total or 0),
        "duplicate_active_resident_keys": int(duplicate_active_keys),
        "census_rows_after_as_of_month": int(month_leaks),
        "facility_mismatches": mismatches,
        "resident_summary": resident_summary,
        "failures": failures,
    }

    print(f"CENSUS_REBUILD_SUMMARY={json.dumps(summary, sort_keys=True, default=json_default)}")
    print("Census rebuild by facility")
    display(comparison_df)

    if failures:
        raise ValueError("Census rebuild validation failed: " + "; ".join(failures))

    print(f"Census_Snapshot: validation summary finished after {elapsed_seconds(summary_start)}.")


def main() -> None:
    run_start = time.perf_counter()
    print(
        f"eldermark_census_rebuild starting for partition {date_partition}; "
        f"catalog={CATALOG}; silver_schema={SILVER_SCHEMA}; census_history_months={CENSUS_HISTORY_MONTHS}."
    )
    resident_df = read_resident_silver()
    census_df = build_census_snapshot(resident_df)
    print(
        "Census_Snapshot: skipping expensive pre-write census summary in recovery; "
        "run census_quality_audit after tool-context refresh for validation."
    )
    write_census_snapshot(census_df)
    print(f"eldermark_census_rebuild completed successfully after {elapsed_seconds(run_start)}.")


main()
