# Databricks notebook source
# MAGIC %md
# MAGIC # census_quality_audit
# MAGIC
# MAGIC One-off/debug audit for census correctness.
# MAGIC
# MAGIC Use this when census looks wrong, fake/test residents may be included, or
# MAGIC historical census needs to be reconciled against resident episodes.

# COMMAND ----------

dbutils.widgets.text("catalog", "alamohealth")
dbutils.widgets.text("silver_schema", "silver")
dbutils.widgets.text("gold_schema", "gold")
dbutils.widgets.text("lookback_months", "0")
dbutils.widgets.text("date_partition", "")
dbutils.widgets.text("minimum_reasonable_admit_date", "2000-01-01")

import json
from calendar import monthrange
from datetime import date, datetime

catalog = (dbutils.widgets.get("catalog") or "alamohealth").strip()
silver_schema = (dbutils.widgets.get("silver_schema") or "silver").strip()
gold_schema = (dbutils.widgets.get("gold_schema") or "gold").strip()
lookback_months = int((dbutils.widgets.get("lookback_months") or "0").strip())
date_partition = (dbutils.widgets.get("date_partition") or "").strip()
minimum_reasonable_admit_date = (dbutils.widgets.get("minimum_reasonable_admit_date") or "2000-01-01").strip()

silver = f"{catalog}.{silver_schema}"
gold = f"{catalog}.{gold_schema}"


def resolve_default_as_of_date() -> date:
    try:
        census_columns = set(spark.table(f"{gold}.v_census").columns)
        if "snapshot_date" in census_columns:
            row = spark.sql(
                f"SELECT cast(max(snapshot_date) AS string) AS value FROM {gold}.v_census"
            ).first()
            if row and row["value"]:
                return datetime.strptime(row["value"][:10], "%Y-%m-%d").date()

        row = spark.sql(f"SELECT max(month_bucket) AS value FROM {gold}.v_census").first()
        if row and row["value"]:
            year, month = [int(part) for part in row["value"][:7].split("-")]
            return date(year, month, monthrange(year, month)[1])
    except Exception as exc:
        raise ValueError(
            f"date_partition was not supplied and the audit could not derive an as-of date from {gold}.v_census"
        ) from exc

    raise ValueError(
        f"date_partition was not supplied and {gold}.v_census has no snapshot_date or month_bucket to anchor the audit"
    )


if date_partition:
    try:
        AS_OF_DATE = datetime.strptime(date_partition, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("date_partition must be formatted as YYYY-MM-DD")
else:
    AS_OF_DATE = resolve_default_as_of_date()

AS_OF_SQL_DATE = f"DATE '{AS_OF_DATE.isoformat()}'"
AS_OF_MONTH = AS_OF_DATE.strftime("%Y-%m")
try:
    MIN_REASONABLE_ADMIT_DATE = datetime.strptime(minimum_reasonable_admit_date, "%Y-%m-%d").date()
except ValueError:
    raise ValueError("minimum_reasonable_admit_date must be formatted as YYYY-MM-DD")
MIN_REASONABLE_ADMIT_SQL_DATE = f"DATE '{MIN_REASONABLE_ADMIT_DATE.isoformat()}'"

NON_COUNTABLE_PATTERN = r"(?i)(^|[^a-z0-9])(test|fake|dummy|sample|training|demo|do not use|zzz)([^a-z0-9]|$)"
PLACEHOLDER_PATTERN = r"(?i)^(resident|client|patient|unknown|unk|n/a|na|none|null|[.]|-)$"


def run(label: str, sql: str):
    print(f"\n--- {label} ---")
    df = spark.sql(sql)
    display(df)
    return df


def scalar(sql: str, key: str = "value"):
    row = spark.sql(sql).first()
    return row[key] if row is not None else None


def table_columns(table_name: str):
    return set(spark.table(f"{silver}.{table_name}").columns)


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
            cast_fn = "try_cast" if cast_type.lower() in {"int", "integer", "bigint", "double", "float", "decimal"} else "cast"
            refs.append(f"{cast_fn}({prefix}`{column}` as {cast_type})")
    if not refs:
        return f"cast(NULL as {cast_type})"
    if len(refs) == 1:
        return refs[0]
    return f"coalesce({', '.join(refs)})"


resident_columns = table_columns("resident")
census_snapshot_columns = table_columns("census_snapshot")
resident_source_countable_expr = sql_value("r", resident_columns, ["is_countable_resident"], "int")
resident_source_suspect_expr = sql_value("r", resident_columns, ["is_suspect_test_resident"], "int")
resident_source_exclusion_expr = sql_value("r", resident_columns, ["resident_exclusion_reason"], "string")
resident_not_resident_expr = sql_value("r", resident_columns, ["Not_a_Resident", "not_a_resident"], "int")
resident_transform_partition_expr = sql_value("r", resident_columns, ["_transform_partition"], "string")
census_transform_partition_expr = sql_value("c", census_snapshot_columns, ["_transform_partition"], "string")
resident_countable_expr = f"""
coalesce(
  {resident_source_countable_expr},
  CASE WHEN coalesce({resident_not_resident_expr}, 0) = 1 THEN 0 ELSE 1 END
)
"""
resident_suspect_expr = f"coalesce({resident_source_suspect_expr}, 0)"
resident_exclusion_expr = f"""
coalesce(
  {resident_source_exclusion_expr},
  CASE WHEN coalesce({resident_not_resident_expr}, 0) = 1 THEN 'not_a_resident' END
)
"""


# COMMAND ----------

run(
    "Source and gold row counts",
    f"""
    SELECT 'silver.resident' AS dataset, count(*) AS rows, cast(min(Admit_Date_dt) AS string) AS min_date, cast(max(Admit_Date_dt) AS string) AS max_date FROM {silver}.resident
    UNION ALL
    SELECT 'silver.census_snapshot', count(*), min(month_bucket), max(month_bucket) FROM {silver}.census_snapshot
    UNION ALL
    SELECT 'gold.v_census', count(*), min(month_bucket), max(month_bucket) FROM {gold}.v_census
    UNION ALL
    SELECT 'gold.v_active_residents', count(*), cast(min(Admit_Date) AS string), cast(max(Admit_Date) AS string) FROM {gold}.v_active_residents
    UNION ALL
    SELECT 'gold.v_tool_resident_profile (governed)', count(*), cast(min(Admit_Date) AS string), cast(max(Admit_Date) AS string) FROM {gold}.v_tool_resident_profile
    """
)

# COMMAND ----------

run(
    "Transform partition vs governed census month",
    f"""
    WITH resident_partition AS (
      SELECT max({resident_transform_partition_expr}) AS resident_transform_partition
      FROM {silver}.resident r
    ),
    census_partition AS (
      SELECT max({census_transform_partition_expr}) AS census_transform_partition
      FROM {silver}.census_snapshot c
    ),
    latest_silver AS (
      SELECT max(month_bucket) AS latest_silver_census_month
      FROM {silver}.census_snapshot
    ),
    latest_gold AS (
      SELECT max(month_bucket) AS latest_gold_census_month
      FROM {gold}.v_census
    )
    SELECT
      r.resident_transform_partition,
      date_format(to_date(r.resident_transform_partition), 'yyyy-MM') AS resident_transform_month,
      c.census_transform_partition,
      date_format(to_date(c.census_transform_partition), 'yyyy-MM') AS census_transform_month,
      s.latest_silver_census_month,
      g.latest_gold_census_month,
      '{AS_OF_MONTH}' AS audit_as_of_month
    FROM resident_partition r
    CROSS JOIN census_partition c
    CROSS JOIN latest_silver s
    CROSS JOIN latest_gold g
    """
)

# COMMAND ----------

run(
    "Latest census vs raw and governed active roster",
    f"""
    WITH latest_month AS (
      SELECT max(month_bucket) AS month_bucket FROM {gold}.v_census
    ),
    latest_census AS (
      SELECT Facility, month_bucket, census
      FROM {gold}.v_census
      WHERE month_bucket = (SELECT month_bucket FROM latest_month)
    ),
    raw_active_roster AS (
      SELECT cast(Facility AS string) AS Facility, count(DISTINCT cast(Res_Number AS string)) AS active_roster_residents
      FROM {gold}.v_active_residents
      GROUP BY cast(Facility AS string)
    ),
    governed_active_roster AS (
      SELECT cast(Facility AS string) AS Facility, count(DISTINCT cast(Res_Number AS string)) AS governed_active_residents
      FROM {gold}.v_tool_resident_profile
      GROUP BY cast(Facility AS string)
    )
    SELECT
      coalesce(c.Facility, a.Facility, g.Facility) AS Facility,
      c.month_bucket,
      c.census AS latest_monthly_census,
      a.active_roster_residents,
      g.governed_active_residents,
      a.active_roster_residents - g.governed_active_residents AS raw_minus_governed_active,
      c.census - g.governed_active_residents AS census_minus_governed_active
    FROM latest_census c
    FULL OUTER JOIN raw_active_roster a
      ON c.Facility = a.Facility
    FULL OUTER JOIN governed_active_roster g
      ON coalesce(c.Facility, a.Facility) = g.Facility
    ORDER BY Facility
    """
)

# COMMAND ----------

run(
    "Non-countable rows that reached governed resident profile",
    f"""
    SELECT
      p.Facility,
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
    ORDER BY p.Facility, p.resident_name
    LIMIT 500
    """
)

# COMMAND ----------

run(
    "Suspected fake/test/non-countable resident rows",
    f"""
    WITH base AS (
      SELECT
        cast(Facility AS string) AS Facility,
        cast(Res_Number AS string) AS Res_Number,
        trim(concat(coalesce(First_Name, ''), ' ', coalesce(Last_Name, ''))) AS resident_name,
        Admit_Date,
        Discharge_Date,
        Admit_Date_dt,
        Discharge_Date_dt,
        lower(trim(concat_ws(' ', coalesce(First_Name, ''), coalesce(Last_Name, '')))) AS normalized_name,
        cast({resident_countable_expr} AS int) AS is_countable_resident,
        cast({resident_suspect_expr} AS int) AS is_suspect_test_resident,
        {resident_exclusion_expr} AS resident_exclusion_reason
      FROM {silver}.resident r
    )
    SELECT *
    FROM base
    WHERE is_countable_resident = 0
       OR is_suspect_test_resident = 1
       OR normalized_name rlike '{NON_COUNTABLE_PATTERN}'
       OR Res_Number IS NULL
       OR Admit_Date_dt IS NULL
       OR Admit_Date_dt > {AS_OF_SQL_DATE}
       OR (Discharge_Date_dt IS NOT NULL AND Discharge_Date_dt < Admit_Date_dt)
    ORDER BY Facility, resident_name, Res_Number
    LIMIT 500
    """
)

# COMMAND ----------

run(
    "Duplicate active resident rows by facility/resident",
    f"""
    SELECT
      cast(Facility AS string) AS Facility,
      cast(Res_Number AS string) AS Res_Number,
      max(trim(concat(coalesce(First_Name, ''), ' ', coalesce(Last_Name, '')))) AS resident_name,
      count(*) AS rows,
      collect_set(Unit_Number) AS units,
      collect_set(Admit_Date) AS admit_dates,
      collect_set(Discharge_Date) AS discharge_dates
    FROM {silver}.resident r
    WHERE {resident_countable_expr} = 1
      AND Admit_Date_dt <= {AS_OF_SQL_DATE}
      AND (Discharge_Date_dt IS NULL OR Discharge_Date_dt > {AS_OF_SQL_DATE})
    GROUP BY cast(Facility AS string), cast(Res_Number AS string)
    HAVING count(*) > 1
    ORDER BY rows DESC, Facility, resident_name
    LIMIT 500
    """
)

# COMMAND ----------

run(
    "Countable resident rows before the configured historical floor",
    f"""
    SELECT
      cast(Facility AS string) AS Facility,
      cast(Res_Number AS string) AS Res_Number,
      trim(concat(coalesce(First_Name, ''), ' ', coalesce(Last_Name, ''))) AS resident_name,
      Admit_Date,
      Admit_Date_dt,
      Discharge_Date,
      Discharge_Date_dt,
      cast({resident_countable_expr} AS int) AS is_countable_resident,
      cast({resident_suspect_expr} AS int) AS is_suspect_test_resident,
      {resident_exclusion_expr} AS resident_exclusion_reason
    FROM {silver}.resident r
    WHERE cast({resident_countable_expr} AS int) = 1
      AND Admit_Date_dt IS NOT NULL
      AND Admit_Date_dt < {MIN_REASONABLE_ADMIT_SQL_DATE}
    ORDER BY Admit_Date_dt, Facility, Res_Number
    LIMIT 200
    """
)

# COMMAND ----------

period_filter = (
    f"WHERE month_bucket >= date_format(add_months({AS_OF_SQL_DATE}, -{lookback_months}), 'yyyy-MM')"
    if lookback_months > 0
    else ""
)

run(
    "Gold census vs recalculated silver resident month-end census",
    f"""
    WITH gold_census AS (
      SELECT cast(Facility AS string) AS Facility, month_bucket, cast(census AS int) AS gold_census
      FROM {gold}.v_census
      {period_filter}
    ),
    eligible AS (
      SELECT
        cast(Facility AS string) AS Facility,
        cast(Res_Number AS string) AS Res_Number,
        Admit_Date_dt,
        Discharge_Date_dt
      FROM {silver}.resident r
      WHERE {resident_countable_expr} = 1
        AND Res_Number IS NOT NULL
        AND Admit_Date_dt IS NOT NULL
    ),
    bounds AS (
      SELECT
        to_date(concat(min(month_bucket), '-01')) AS start_month,
        to_date(concat(max(month_bucket), '-01')) AS end_month
      FROM gold_census
    ),
    months AS (
      SELECT explode(sequence(start_month, end_month, interval 1 month)) AS month_start
      FROM bounds
    ),
    month_points AS (
      SELECT
        month_start,
        least(last_day(month_start), {AS_OF_SQL_DATE}) AS census_date
      FROM months
    ),
    recalculated AS (
      SELECT
        e.Facility,
        date_format(m.month_start, 'yyyy-MM') AS month_bucket,
        count(DISTINCT e.Res_Number) AS recalculated_census
      FROM month_points m
      JOIN eligible e
        ON e.Admit_Date_dt <= m.census_date
       AND (e.Discharge_Date_dt IS NULL OR e.Discharge_Date_dt > m.census_date)
      GROUP BY e.Facility, date_format(m.month_start, 'yyyy-MM')
    )
    SELECT
      coalesce(g.Facility, r.Facility) AS Facility,
      coalesce(g.month_bucket, r.month_bucket) AS month_bucket,
      g.gold_census,
      r.recalculated_census,
      g.gold_census - r.recalculated_census AS difference
    FROM gold_census g
    FULL OUTER JOIN recalculated r
      ON g.Facility = r.Facility
     AND g.month_bucket = r.month_bucket
    WHERE coalesce(g.gold_census, -1) != coalesce(r.recalculated_census, -1)
    ORDER BY month_bucket DESC, Facility
    LIMIT 1000
    """
)

# COMMAND ----------

run(
    "Weekly census coverage from resident episodes",
    f"""
    SELECT
      Facility,
      min(week_start) AS min_week,
      max(week_start) AS max_week,
      count(*) AS weekly_rows,
      min(census) AS min_census,
      max(census) AS max_census
    FROM {gold}.v_tool_census_weekly_by_community
    GROUP BY Facility
    ORDER BY Facility
    """
)

# COMMAND ----------

suspected_non_countable_count = int(
    scalar(
        f"""
        WITH base AS (
          SELECT
            cast(Res_Number AS string) AS Res_Number,
            Admit_Date_dt,
            Discharge_Date_dt,
            lower(trim(concat_ws(' ', coalesce(First_Name, ''), coalesce(Last_Name, '')))) AS normalized_name,
            cast({resident_countable_expr} AS int) AS is_countable_resident,
            cast({resident_suspect_expr} AS int) AS is_suspect_test_resident
          FROM {silver}.resident r
        )
        SELECT count(*) AS value
        FROM base
        WHERE is_countable_resident = 0
           OR is_suspect_test_resident = 1
           OR normalized_name rlike '{NON_COUNTABLE_PATTERN}'
           OR Res_Number IS NULL
           OR Admit_Date_dt IS NULL
           OR Admit_Date_dt > {AS_OF_SQL_DATE}
           OR (Discharge_Date_dt IS NOT NULL AND Discharge_Date_dt < Admit_Date_dt)
        """
    )
    or 0
)
old_countable_admit_count = int(
    scalar(
        f"""
        SELECT count(*) AS value
        FROM {silver}.resident r
        WHERE cast({resident_countable_expr} AS int) = 1
          AND Admit_Date_dt IS NOT NULL
          AND Admit_Date_dt < {MIN_REASONABLE_ADMIT_SQL_DATE}
        """
    )
    or 0
)
earliest_countable_admit_date = scalar(
    f"""
    SELECT cast(min(Admit_Date_dt) AS string) AS value
    FROM {silver}.resident r
    WHERE cast({resident_countable_expr} AS int) = 1
      AND Admit_Date_dt IS NOT NULL
    """
)
duplicate_active_count = int(
    scalar(
        f"""
        WITH duplicates AS (
          SELECT cast(Facility AS string) AS Facility, cast(Res_Number AS string) AS Res_Number
          FROM {silver}.resident r
          WHERE {resident_countable_expr} = 1
            AND Admit_Date_dt <= {AS_OF_SQL_DATE}
            AND (Discharge_Date_dt IS NULL OR Discharge_Date_dt > {AS_OF_SQL_DATE})
          GROUP BY cast(Facility AS string), cast(Res_Number AS string)
          HAVING count(*) > 1
        )
        SELECT count(*) AS value FROM duplicates
        """
    )
    or 0
)
governed_profile_non_countable_count = int(
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
census_recalc_mismatch_count = int(
    scalar(
        f"""
        WITH gold_census AS (
          SELECT cast(Facility AS string) AS Facility, month_bucket, cast(census AS int) AS gold_census
          FROM {gold}.v_census
          {period_filter}
        ),
        eligible AS (
          SELECT
            cast(Facility AS string) AS Facility,
            cast(Res_Number AS string) AS Res_Number,
            Admit_Date_dt,
            Discharge_Date_dt
          FROM {silver}.resident r
          WHERE {resident_countable_expr} = 1
            AND Res_Number IS NOT NULL
            AND Admit_Date_dt IS NOT NULL
        ),
        bounds AS (
          SELECT
            to_date(concat(min(month_bucket), '-01')) AS start_month,
            to_date(concat(max(month_bucket), '-01')) AS end_month
          FROM gold_census
        ),
        months AS (
          SELECT explode(sequence(start_month, end_month, interval 1 month)) AS month_start
          FROM bounds
        ),
        month_points AS (
          SELECT
            month_start,
            least(last_day(month_start), {AS_OF_SQL_DATE}) AS census_date
          FROM months
        ),
        recalculated AS (
          SELECT e.Facility, date_format(m.month_start, 'yyyy-MM') AS month_bucket, count(DISTINCT e.Res_Number) AS recalculated_census
          FROM month_points m
          JOIN eligible e
            ON e.Admit_Date_dt <= m.census_date
           AND (e.Discharge_Date_dt IS NULL OR e.Discharge_Date_dt > m.census_date)
          GROUP BY e.Facility, date_format(m.month_start, 'yyyy-MM')
        )
        SELECT count(*) AS value
        FROM gold_census g
        FULL OUTER JOIN recalculated r
          ON g.Facility = r.Facility
         AND g.month_bucket = r.month_bucket
        WHERE coalesce(g.gold_census, -1) != coalesce(r.recalculated_census, -1)
        """
    )
    or 0
)
weekly_coverage = spark.sql(
    f"""
    SELECT
      count(*) AS weekly_rows,
      cast(min(week_start) AS string) AS min_week,
      cast(max(week_start) AS string) AS max_week,
      cast(max(census_date) AS string) AS max_census_date,
      sum(
        CASE
          WHEN census_date <> week_end
            OR datediff(census_date, prior_census_date) <> 7
            OR census - census_7d_prior <> census_change_7d
          THEN 1
          ELSE 0
        END
      ) AS invalid_weekly_change_rows
    FROM {gold}.v_tool_census_weekly_by_community
    """
).first().asDict(recursive=True)
latest_gold_census_month = scalar(
    f"SELECT max(month_bucket) AS value FROM {gold}.v_census"
)
partition_state = spark.sql(
    f"""
    WITH resident_partition AS (
      SELECT max({resident_transform_partition_expr}) AS resident_transform_partition
      FROM {silver}.resident r
    ),
    census_partition AS (
      SELECT max({census_transform_partition_expr}) AS census_transform_partition
      FROM {silver}.census_snapshot c
    ),
    latest_silver AS (
      SELECT max(month_bucket) AS latest_silver_census_month
      FROM {silver}.census_snapshot
    )
    SELECT
      resident_partition.resident_transform_partition,
      census_partition.census_transform_partition,
      latest_silver.latest_silver_census_month
    FROM resident_partition
    CROSS JOIN census_partition
    CROSS JOIN latest_silver
    """
).first().asDict(recursive=True)


def month_from_dateish(value):
    if value is None:
        return None
    text = str(value)
    return text[:7] if len(text) >= 7 else None


resident_transform_month = month_from_dateish(partition_state["resident_transform_partition"])
census_transform_month = month_from_dateish(partition_state["census_transform_partition"])
latest_silver_census_month = partition_state["latest_silver_census_month"]

failures = []
warnings = []
if latest_gold_census_month and latest_gold_census_month > AS_OF_MONTH:
    failures.append(
        f"gold census extends past as-of month: {latest_gold_census_month} > {AS_OF_MONTH}"
    )
if latest_gold_census_month and resident_transform_month and latest_gold_census_month > resident_transform_month:
    failures.append(
        f"gold census extends past resident transform partition month: {latest_gold_census_month} > {resident_transform_month}"
    )
if latest_gold_census_month and census_transform_month and latest_gold_census_month > census_transform_month:
    failures.append(
        f"gold census extends past census transform partition month: {latest_gold_census_month} > {census_transform_month}"
    )
if latest_gold_census_month and latest_silver_census_month and latest_gold_census_month != latest_silver_census_month:
    failures.append(
        f"gold census latest month does not match silver census snapshot latest month: {latest_gold_census_month} != {latest_silver_census_month}"
    )
if weekly_coverage["max_week"] and str(weekly_coverage["max_week"])[:10] > AS_OF_DATE.isoformat():
    failures.append(
        f"weekly census extends past as-of date: {weekly_coverage['max_week']} > {AS_OF_DATE.isoformat()}"
    )
if str(weekly_coverage["max_census_date"] or "")[:10] != AS_OF_DATE.isoformat():
    failures.append(
        f"weekly census does not end on the as-of date: {weekly_coverage['max_census_date']} != {AS_OF_DATE.isoformat()}"
    )
if int(weekly_coverage["invalid_weekly_change_rows"] or 0) > 0:
    failures.append(
        f"{weekly_coverage['invalid_weekly_change_rows']} weekly census rows do not represent a reconciled seven-day comparison"
    )
if old_countable_admit_count > 0:
    failures.append(
        f"{old_countable_admit_count} countable resident rows have admit dates before configured historical floor {MIN_REASONABLE_ADMIT_DATE.isoformat()}; earliest countable admit is {earliest_countable_admit_date}"
    )
if governed_profile_non_countable_count > 0:
    failures.append(
        f"{governed_profile_non_countable_count} non-countable resident rows reached governed resident profile"
    )
if duplicate_active_count > 0:
    failures.append(
        f"{duplicate_active_count} countable active resident keys have duplicate source rows"
    )
if census_recalc_mismatch_count > 0:
    failures.append(
        f"{census_recalc_mismatch_count} gold census rows differ from recalculated silver month-end census"
    )
if int(weekly_coverage["weekly_rows"] or 0) <= 0:
    failures.append("weekly census coverage is empty")
if suspected_non_countable_count > 0:
    warnings.append(
        f"{suspected_non_countable_count} suspect/non-countable source rows were found; verify they remain excluded from governed outputs"
    )

summary = {
    "ok": not failures,
    "as_of_date": AS_OF_DATE.isoformat(),
    "as_of_month": AS_OF_MONTH,
    "failures": failures,
    "warnings": warnings,
    "minimum_reasonable_admit_date": MIN_REASONABLE_ADMIT_DATE.isoformat(),
    "latest_gold_census_month": latest_gold_census_month,
    "latest_silver_census_month": latest_silver_census_month,
    "resident_transform_partition": partition_state["resident_transform_partition"],
    "census_transform_partition": partition_state["census_transform_partition"],
    "earliest_countable_admit_date": earliest_countable_admit_date,
    "old_countable_admit_rows": old_countable_admit_count,
    "suspected_non_countable_rows": suspected_non_countable_count,
    "duplicate_active_resident_keys": duplicate_active_count,
    "governed_profile_non_countable_rows": governed_profile_non_countable_count,
    "census_recalculation_mismatches": census_recalc_mismatch_count,
    "weekly_census_rows": int(weekly_coverage["weekly_rows"] or 0),
    "weekly_census_min_week": weekly_coverage["min_week"],
    "weekly_census_max_week": weekly_coverage["max_week"],
    "weekly_census_max_date": weekly_coverage["max_census_date"],
    "invalid_weekly_change_rows": int(weekly_coverage["invalid_weekly_change_rows"] or 0),
}
print(f"CENSUS_QUALITY_SUMMARY={json.dumps(summary, sort_keys=True)}")
if failures:
    raise ValueError("Census quality audit failed: " + "; ".join(failures))
print("CENSUS_QUALITY_AUDIT_COMPLETE")
