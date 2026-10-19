# Databricks notebook source
# MAGIC %md
# MAGIC # census_fast_check
# MAGIC
# MAGIC Fast census gate for the Alamo Platform.
# MAGIC
# MAGIC Run this after `tool_context_views` and before the heavier QA / snapshot publish.
# MAGIC It answers the first question quickly: did census leak past the requested as-of date,
# MAGIC did non-countable rows reach governed output, and where do official census counts
# MAGIC diverge from the governed active roster?

# COMMAND ----------

dbutils.widgets.text("catalog", "alamohealth")
dbutils.widgets.text("silver_schema", "silver")
dbutils.widgets.text("gold_schema", "gold")
dbutils.widgets.text("date_partition", "")
dbutils.widgets.text("expected_counts_json", "")
dbutils.widgets.dropdown("strict_roster_match", "false", ["false", "true"])

import json
from calendar import monthrange
from datetime import date, datetime

catalog = (dbutils.widgets.get("catalog") or "alamohealth").strip()
silver_schema = (dbutils.widgets.get("silver_schema") or "silver").strip()
gold_schema = (dbutils.widgets.get("gold_schema") or "gold").strip()
date_partition = (dbutils.widgets.get("date_partition") or "").strip()
expected_counts_json = (dbutils.widgets.get("expected_counts_json") or "").strip()
strict_roster_match = (dbutils.widgets.get("strict_roster_match") or "false").strip().lower() == "true"

silver = f"{catalog}.{silver_schema}"
gold = f"{catalog}.{gold_schema}"


def is_missing_table_error(exc: Exception) -> bool:
    error_class_getter = getattr(exc, "getErrorClass", None)
    error_class = error_class_getter() if callable(error_class_getter) else None
    if error_class in {"TABLE_OR_VIEW_NOT_FOUND", "SCHEMA_NOT_FOUND"}:
        return True
    message = str(exc)
    return "[TABLE_OR_VIEW_NOT_FOUND]" in message or "[SCHEMA_NOT_FOUND]" in message


def table_exists(fqn: str) -> bool:
    try:
        spark.sql(f"DESCRIBE TABLE {fqn}").limit(1).collect()
        return True
    except Exception as exc:
        if is_missing_table_error(exc):
            return False
        raise RuntimeError(f"Could not inspect required table or view {fqn}") from exc


def table_columns(fqn: str):
    if not table_exists(fqn):
        return set()
    return set(spark.table(fqn).columns)


def _resolve_column(columns, candidates):
    by_lower = {column.lower(): column for column in columns}
    for candidate in candidates:
        found = by_lower.get(candidate.lower())
        if found:
            return found
    return None


def sql_value(alias: str, columns, candidates, cast_type: str = "string") -> str:
    refs = []
    prefix = f"{alias}." if alias else ""
    for candidate in candidates:
        column = _resolve_column(columns, [candidate])
        if column:
            refs.append(f"try_cast({prefix}`{column}` as {cast_type})")
    if not refs:
        return f"cast(NULL as {cast_type})"
    if len(refs) == 1:
        return refs[0]
    return f"coalesce({', '.join(refs)})"


def scalar(sql: str, key: str = "value"):
    row = spark.sql(sql).first()
    return row[key] if row is not None else None


def rows(sql: str):
    return [row.asDict(recursive=True) for row in spark.sql(sql).collect()]


def run(label: str, sql: str):
    print(f"\n--- {label} ---")
    df = spark.sql(sql)
    display(df)
    return df


def normalize_key(value) -> str:
    return str(value or "").strip().lower().replace("&", "and").replace("'", "").replace(".", "").replace(",", "")


def resolve_default_as_of_date() -> date:
    census_fqn = f"{gold}.v_census"
    census_columns = table_columns(census_fqn)
    snapshot_expr = sql_value("c", census_columns, ["snapshot_date"], "date")
    row = spark.sql(
        f"""
        SELECT
          cast(max({snapshot_expr}) AS string) AS snapshot_date,
          max(c.month_bucket) AS month_bucket
        FROM {census_fqn} c
        """
    ).first()
    if row and row["snapshot_date"]:
        return datetime.strptime(str(row["snapshot_date"])[:10], "%Y-%m-%d").date()
    if row and row["month_bucket"]:
        year, month = [int(part) for part in str(row["month_bucket"])[:7].split("-")]
        return date(year, month, monthrange(year, month)[1])
    raise ValueError("date_partition is blank and gold.v_census has no snapshot_date or month_bucket anchor.")


if date_partition:
    try:
        AS_OF_DATE = datetime.strptime(date_partition, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("date_partition must be formatted as YYYY-MM-DD")
else:
    AS_OF_DATE = resolve_default_as_of_date()

AS_OF_MONTH = AS_OF_DATE.strftime("%Y-%m")
AS_OF_SQL = f"DATE '{AS_OF_DATE.isoformat()}'"
AS_OF_MONTH_SQL = f"'{AS_OF_MONTH}'"

required_tables = [
    f"{gold}.v_census",
    f"{gold}.v_tool_census_monthly_by_community",
    f"{gold}.v_tool_resident_countability_audit",
    f"{gold}.v_tool_resident_profile",
    f"{gold}.v_tool_community_operating_summary",
]
missing_tables = [table_name for table_name in required_tables if not table_exists(table_name)]
if missing_tables:
    raise ValueError(
        "Census fast check needs tool_context_views outputs first. Missing: " + ", ".join(missing_tables)
    )

census_columns = table_columns(f"{gold}.v_census")
census_snapshot_expr = sql_value("c", census_columns, ["snapshot_date"], "date")

expected_counts = {}
if expected_counts_json:
    try:
        expected_counts = json.loads(expected_counts_json)
    except json.JSONDecodeError as exc:
        raise ValueError('expected_counts_json must be JSON such as {"San Pablo": 139, "Santa Clarita": 118}') from exc
    if not isinstance(expected_counts, dict):
        raise ValueError("expected_counts_json must be a JSON object keyed by facility id or community name.")

# COMMAND ----------

run(
    "Census coverage and date gates",
    f"""
    SELECT 'gold.v_census' AS source, count(*) AS rows, min(month_bucket) AS min_month, max(month_bucket) AS max_month
    FROM {gold}.v_census
    UNION ALL
    SELECT 'gold.v_tool_census_monthly_by_community', count(*), min(month_bucket), max(month_bucket)
    FROM {gold}.v_tool_census_monthly_by_community
    UNION ALL
    SELECT 'gold.v_tool_census_weekly_by_community', count(*), cast(min(week_start) AS string), cast(max(week_start) AS string)
    FROM {gold}.v_tool_census_weekly_by_community
    UNION ALL
    SELECT 'gold.v_tool_resident_flow_weekly_by_community', count(*), cast(min(week_start) AS string), cast(max(week_start) AS string)
    FROM {gold}.v_tool_resident_flow_weekly_by_community
    """
)

comparison_df = run(
    "As-of census by community",
    f"""
    WITH census AS (
      SELECT
        cast(Facility AS string) AS Facility,
        month_bucket,
        cast(census AS int) AS census
      FROM {gold}.v_census c
      WHERE c.month_bucket = {AS_OF_MONTH_SQL}
    ),
    governed_active_as_of AS (
      SELECT
        cast(Facility AS string) AS Facility,
        count(DISTINCT cast(Res_Number AS string)) AS governed_active_as_of
      FROM {gold}.v_tool_resident_countability_audit
      WHERE coalesce(is_countable_resident, 1) = 1
        AND admit_date <= {AS_OF_SQL}
        AND (discharge_date IS NULL OR discharge_date > {AS_OF_SQL})
      GROUP BY cast(Facility AS string)
    ),
    current_profile AS (
      SELECT
        cast(Facility AS string) AS Facility,
        max(Facility_Name) AS Facility_Name,
        count(DISTINCT cast(Res_Number AS string)) AS governed_current_profile
      FROM {gold}.v_tool_resident_profile
      GROUP BY cast(Facility AS string)
    ),
    operating AS (
      SELECT
        cast(Facility AS string) AS Facility,
        census_month,
        cast(census AS int) AS operating_census
      FROM {gold}.v_tool_community_operating_summary
    )
    SELECT
      coalesce(c.Facility, a.Facility, p.Facility, o.Facility) AS Facility,
      coalesce(p.Facility_Name, coalesce(c.Facility, a.Facility, o.Facility)) AS Facility_Name,
      c.month_bucket,
      c.census AS official_census,
      a.governed_active_as_of,
      p.governed_current_profile,
      o.census_month AS operating_census_month,
      o.operating_census,
      c.census - a.governed_active_as_of AS official_minus_active_as_of,
      o.operating_census - c.census AS operating_minus_official
    FROM census c
    FULL OUTER JOIN governed_active_as_of a
      ON c.Facility = a.Facility
    FULL OUTER JOIN current_profile p
      ON coalesce(c.Facility, a.Facility) = p.Facility
    FULL OUTER JOIN operating o
      ON coalesce(c.Facility, a.Facility, p.Facility) = o.Facility
    ORDER BY Facility_Name
    """
)

run(
    "Rows that would leak past the requested as-of date",
    f"""
    SELECT 'gold.v_census month_bucket' AS check_name, count(*) AS leaked_rows, max(month_bucket) AS max_value
    FROM {gold}.v_census
    WHERE month_bucket > {AS_OF_MONTH_SQL}
    UNION ALL
    SELECT 'gold.v_census snapshot_date', count(*) AS leaked_rows, cast(max({census_snapshot_expr}) AS string) AS max_value
    FROM {gold}.v_census c
    WHERE {census_snapshot_expr} > {AS_OF_SQL}
    UNION ALL
    SELECT 'tool monthly census month_bucket', count(*) AS leaked_rows, max(month_bucket) AS max_value
    FROM {gold}.v_tool_census_monthly_by_community
    WHERE month_bucket > {AS_OF_MONTH_SQL}
    UNION ALL
    SELECT 'tool weekly census week_start', count(*) AS leaked_rows, cast(max(week_start) AS string) AS max_value
    FROM {gold}.v_tool_census_weekly_by_community
    WHERE week_start > {AS_OF_SQL}
    UNION ALL
    SELECT 'tool weekly flow week_start', count(*) AS leaked_rows, cast(max(week_start) AS string) AS max_value
    FROM {gold}.v_tool_resident_flow_weekly_by_community
    WHERE week_start > {AS_OF_SQL}
    UNION ALL
    SELECT 'tool monthly flow month_bucket', count(*) AS leaked_rows, max(month_bucket) AS max_value
    FROM {gold}.v_tool_resident_flow_monthly_by_community
    WHERE month_bucket > {AS_OF_MONTH_SQL}
    """
)

run(
    "Non-countable rows that reached governed resident profile",
    f"""
    SELECT
      p.Facility,
      p.Facility_Name,
      p.Res_Number,
      p.resident_name,
      q.is_countable_resident,
      q.is_suspect_test_resident,
      q.resident_exclusion_reason
    FROM {gold}.v_tool_resident_profile p
    JOIN {gold}.v_tool_resident_countability_audit q
      ON p.Facility = q.Facility
     AND p.Res_Number = q.Res_Number
    WHERE coalesce(q.is_countable_resident, 1) = 0
    ORDER BY p.Facility_Name, p.resident_name
    LIMIT 100
    """
)

# COMMAND ----------

coverage = rows(
    f"""
    SELECT 'gold_v_census' AS key, max(month_bucket) AS max_month, cast(NULL AS string) AS max_date FROM {gold}.v_census
    UNION ALL
    SELECT 'tool_monthly_census', max(month_bucket), cast(NULL AS string) FROM {gold}.v_tool_census_monthly_by_community
    UNION ALL
    SELECT 'tool_weekly_census', cast(NULL AS string), cast(max(week_start) AS string) FROM {gold}.v_tool_census_weekly_by_community
    UNION ALL
    SELECT 'tool_weekly_flow', cast(NULL AS string), cast(max(week_start) AS string) FROM {gold}.v_tool_resident_flow_weekly_by_community
    UNION ALL
    SELECT 'tool_monthly_flow', max(month_bucket), cast(NULL AS string) FROM {gold}.v_tool_resident_flow_monthly_by_community
    """
)
coverage_by_key = {row["key"]: row for row in coverage}

leak_counts = rows(
    f"""
    SELECT 'gold_v_census_month' AS key, count(*) AS value FROM {gold}.v_census WHERE month_bucket > {AS_OF_MONTH_SQL}
    UNION ALL
    SELECT 'gold_v_census_snapshot_date', count(*) AS value FROM {gold}.v_census c WHERE {census_snapshot_expr} > {AS_OF_SQL}
    UNION ALL
    SELECT 'tool_monthly_census_month', count(*) AS value FROM {gold}.v_tool_census_monthly_by_community WHERE month_bucket > {AS_OF_MONTH_SQL}
    UNION ALL
    SELECT 'tool_weekly_census_date', count(*) AS value FROM {gold}.v_tool_census_weekly_by_community WHERE week_start > {AS_OF_SQL}
    UNION ALL
    SELECT 'tool_weekly_flow_date', count(*) AS value FROM {gold}.v_tool_resident_flow_weekly_by_community WHERE week_start > {AS_OF_SQL}
    UNION ALL
    SELECT 'tool_monthly_flow_month', count(*) AS value FROM {gold}.v_tool_resident_flow_monthly_by_community WHERE month_bucket > {AS_OF_MONTH_SQL}
    """
)
leaks = {row["key"]: int(row["value"] or 0) for row in leak_counts}

comparison_rows = [row.asDict(recursive=True) for row in comparison_df.collect()]
roster_mismatches = [
    {
        "facility": row["Facility"],
        "facility_name": row["Facility_Name"],
        "official_census": row["official_census"],
        "governed_active_as_of": row["governed_active_as_of"],
        "difference": row["official_minus_active_as_of"],
    }
    for row in comparison_rows
    if row["official_census"] is not None
    and row["governed_active_as_of"] is not None
    and row["official_census"] != row["governed_active_as_of"]
]
operating_mismatches = [
    {
        "facility": row["Facility"],
        "facility_name": row["Facility_Name"],
        "official_census": row["official_census"],
        "operating_census": row["operating_census"],
        "difference": row["operating_minus_official"],
    }
    for row in comparison_rows
    if row["official_census"] is not None
    and row["operating_census"] is not None
    and row["official_census"] != row["operating_census"]
]

expected_mismatches = []
if expected_counts:
    lookup = {}
    for row in comparison_rows:
        for key in [row["Facility"], row["Facility_Name"]]:
            lookup[normalize_key(key)] = row
    for expected_key, expected_value in expected_counts.items():
        row = lookup.get(normalize_key(expected_key))
        if row is None:
            expected_mismatches.append({
                "expected_key": expected_key,
                "expected_census": expected_value,
                "actual_census": None,
                "reason": "facility not found in as-of census comparison",
            })
            continue
        actual_value = row["official_census"]
        if int(expected_value) != int(actual_value or 0):
            expected_mismatches.append({
                "expected_key": expected_key,
                "facility": row["Facility"],
                "facility_name": row["Facility_Name"],
                "expected_census": int(expected_value),
                "actual_census": int(actual_value or 0),
                "difference": int(actual_value or 0) - int(expected_value),
            })

non_countable_in_profile = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {gold}.v_tool_resident_profile p
        JOIN {gold}.v_tool_resident_countability_audit q
          ON p.Facility = q.Facility
         AND p.Res_Number = q.Res_Number
        WHERE coalesce(q.is_countable_resident, 1) = 0
        """
    )
    or 0
)

duplicate_profile_keys = int(
    scalar(
        f"""
        WITH duplicates AS (
          SELECT Facility, Res_Number
          FROM {gold}.v_tool_resident_profile
          GROUP BY Facility, Res_Number
          HAVING count(*) > 1
        )
        SELECT count(*) AS value FROM duplicates
        """
    )
    or 0
)

failures = []
warnings = []
for key, value in leaks.items():
    if value > 0:
        failures.append(f"{key} has {value} rows after {AS_OF_DATE.isoformat()} / {AS_OF_MONTH}")
if non_countable_in_profile > 0:
    failures.append(f"{non_countable_in_profile} non-countable resident rows reached governed profile")
if duplicate_profile_keys > 0:
    failures.append(f"{duplicate_profile_keys} duplicate Facility + Res_Number keys exist in governed profile")
if operating_mismatches:
    failures.append(f"{len(operating_mismatches)} community operating census rows differ from official census for {AS_OF_MONTH}")
if expected_mismatches:
    failures.append(f"{len(expected_mismatches)} ElderMark expected census values differ from official census for {AS_OF_MONTH}")
if strict_roster_match and roster_mismatches:
    failures.append(f"{len(roster_mismatches)} official census rows differ from governed active roster for {AS_OF_MONTH}")
elif roster_mismatches:
    warnings.append(f"{len(roster_mismatches)} official census rows differ from governed active roster for {AS_OF_MONTH}")

summary = {
    "ok": not failures,
    "as_of_date": AS_OF_DATE.isoformat(),
    "as_of_month": AS_OF_MONTH,
    "failures": failures,
    "warnings": warnings,
    "missing_tables": missing_tables,
    "coverage": coverage_by_key,
    "leaks": leaks,
    "non_countable_in_profile": non_countable_in_profile,
    "duplicate_profile_keys": duplicate_profile_keys,
    "roster_mismatches": roster_mismatches,
    "operating_mismatches": operating_mismatches,
    "expected_mismatches": expected_mismatches,
}

print(f"CENSUS_FAST_CHECK={json.dumps(summary, sort_keys=True)}")
if failures:
    raise ValueError("Census fast check failed: " + "; ".join(failures))
print("CENSUS_FAST_CHECK_COMPLETE")
