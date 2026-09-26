# Databricks notebook source
# MAGIC %md
# MAGIC # tool_context_views
# MAGIC
# MAGIC Creates additive gold views for AH Analyst / local data tools.
# MAGIC
# MAGIC These views do not replace the existing platform source views. They prepare repeatable
# MAGIC analyst-ready slices so chat tools and published snapshots do not need to rebuild the
# MAGIC same joins, month deltas, category counts, and resident summaries on every request.

# COMMAND ----------

dbutils.widgets.text("catalog", "alamohealth")
dbutils.widgets.text("gold_schema", "gold")
dbutils.widgets.text("silver_schema", "silver")
dbutils.widgets.text("date_partition", "")

from calendar import monthrange
from datetime import date, datetime

catalog = (dbutils.widgets.get("catalog") or "alamohealth").strip()
gold_schema = (dbutils.widgets.get("gold_schema") or "gold").strip()
silver_schema = (dbutils.widgets.get("silver_schema") or "silver").strip()
date_partition = (dbutils.widgets.get("date_partition") or "").strip()

DATE_PARTITION_AS_OF_SQL = "cast(NULL as date)"
WINDOW_AS_OF_SQL = "cast(NULL as date)"
if date_partition:
    try:
        parsed_date_partition = datetime.strptime(date_partition, "%Y-%m-%d").date().isoformat()
    except ValueError:
        raise ValueError("date_partition must be formatted as YYYY-MM-DD")
    DATE_PARTITION_AS_OF_SQL = f"DATE '{parsed_date_partition}'"
    WINDOW_AS_OF_SQL = f"DATE '{parsed_date_partition}'"

target = f"{catalog}.{gold_schema}"
source = f"{catalog}.{silver_schema}"

NON_COUNTABLE_RESIDENT_SQL_PATTERN = r"(?i)(^|[^a-z0-9])(test|fake|dummy|sample|training|demo|do not use|zzz)([^a-z0-9]|$)"
PLACEHOLDER_RESIDENT_SQL_PATTERN = r"(?i)^(resident|client|patient|unknown|unk|n/a|na|none|null|[.]|-)$"

# COMMAND ----------

def create_view(name: str, sql: str, schema_evolution: bool = False) -> None:
    schema_clause = " WITH SCHEMA EVOLUTION" if schema_evolution else ""
    spark.sql(f"CREATE OR REPLACE VIEW {target}.{name}{schema_clause} AS {sql}")
    print(f"created -> {target}.{name}")


def is_missing_table_error(exc: Exception) -> bool:
    error_class_getter = getattr(exc, "getErrorClass", None)
    error_class = error_class_getter() if callable(error_class_getter) else None
    if error_class in {"TABLE_OR_VIEW_NOT_FOUND", "SCHEMA_NOT_FOUND"}:
        return True
    message = str(exc)
    return "[TABLE_OR_VIEW_NOT_FOUND]" in message or "[SCHEMA_NOT_FOUND]" in message


def qualified_table_exists(fqn: str) -> bool:
    try:
        spark.sql(f"DESCRIBE TABLE {fqn}").limit(1).collect()
        return True
    except Exception as exc:
        if is_missing_table_error(exc):
            return False
        raise RuntimeError(f"Could not inspect required table or view {fqn}") from exc


def table_exists(table_name: str) -> bool:
    return qualified_table_exists(f"{source}.{table_name}")


def table_columns(table_name: str):
    if not table_exists(table_name):
        return set()
    return set(spark.table(f"{source}.{table_name}").columns)


def target_columns(table_name: str):
    fqn = f"{target}.{table_name}"
    if not qualified_table_exists(fqn):
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
    for candidate in candidates:
        column = _resolve_column(columns, [candidate])
        if column:
            cast_fn = "try_cast" if cast_type.lower() in {"int", "integer", "bigint", "double", "float", "decimal"} else "cast"
            refs.append(f"{cast_fn}({alias}.`{column}` as {cast_type})")
    if not refs:
        return f"cast(NULL as {cast_type})"
    if len(refs) == 1:
        return refs[0]
    return f"coalesce({', '.join(refs)})"


def sql_safe_date(alias: str, column: str) -> str:
    value = f"{alias}.`{column}`"
    text_value = f"trim(cast({value} as string))"
    day_month_date = f"""
      try_cast(concat(
        split({text_value}, '!')[2],
        '-',
        lpad(split({text_value}, '!')[1], 2, '0'),
        '-',
        lpad(split({text_value}, '!')[0], 2, '0')
      ) as date)
    """
    return f"""
      CASE
        WHEN {value} IS NULL THEN cast(NULL as date)
        WHEN lower({text_value}) IN ('', '0!0!0', 'none', 'nan', 'null', 'n/a', 'na') THEN cast(NULL as date)
        -- ElderMark dates are D!M!YYYY. Impossible or ambiguous dates return NULL.
        WHEN {text_value} rlike '^\\\\d{{1,2}}!\\\\d{{1,2}}!\\\\d{{4}}$' THEN {day_month_date}
        ELSE try_cast({value} as date)
      END
    """


def sql_date(alias: str, columns, candidates) -> str:
    refs = []
    for candidate in candidates:
        parsed = _resolve_column(columns, [f"{candidate}_dt", f"{candidate}_parsed"])
        raw = _resolve_column(columns, [candidate])
        if parsed:
            refs.append(sql_safe_date(alias, parsed))
        if raw and raw != parsed:
            refs.append(sql_safe_date(alias, raw))
    if not refs:
        return "cast(NULL as date)"
    if len(refs) == 1:
        return refs[0]
    return f"coalesce({', '.join(refs)})"


def refresh_incident_source_view() -> None:
    columns = table_columns("res_incident")
    if not columns:
        raise RuntimeError(f"Required silver table {source}.res_incident is missing or unreadable")

    incident_date_expr = sql_date("i", columns, ["Incident_Date"])
    create_view(
        "v_incidents",
        f"""
        SELECT
          i.*,
          c.Name AS Facility_Name,
          {incident_date_expr} AS Incident_Date_parsed
        FROM {source}.res_incident i
        LEFT JOIN {source}.companies c
          ON cast(i.Facility AS string) = cast(c.Code AS string)
        WHERE cast(i.Facility AS string) IN ('337', '342', '343', '344', '345')
        """,
        schema_evolution=True,
    )


def refresh_mar_source_view() -> None:
    columns = table_columns("med_delivery")
    if not columns:
        raise RuntimeError(f"Required silver table {source}.med_delivery is missing or unreadable")

    scheduled_date_expr = sql_date("d", columns, ["Scheduled_Date"])
    given_date_expr = sql_date("d", columns, ["Given_or_Recorded_Date"])
    create_view(
        "v_mar",
        f"""
        SELECT
          d.*,
          {scheduled_date_expr} AS Scheduled_Date_parsed,
          {given_date_expr} AS Given_Date_parsed
        FROM {source}.med_delivery d
        WHERE cast(d.Facility AS string) IN ('337', '342', '343', '344', '345')
        """,
        schema_evolution=True,
    )


def rebind_existing_view(view_name: str) -> None:
    row = spark.sql(
        f"""
        SELECT view_definition
        FROM {catalog}.information_schema.views
        WHERE table_schema = '{gold_schema}'
          AND table_name = '{view_name}'
        """
    ).first()
    if not row or not row["view_definition"]:
        raise RuntimeError(f"Required source view {target}.{view_name} does not exist")

    definition = row["view_definition"].strip().rstrip(";")
    spark.sql(f"CREATE OR REPLACE VIEW {target}.`{view_name}` AS {definition}")
    print(f"rebound -> {target}.{view_name}")


def validate_required_source_views() -> None:
    required_views = [
        "v_occupancy",
        "v_active_residents",
        "v_census",
        "v_incidents",
        "v_mar",
        "v_medication_compliance",
        "v_refusal_by_medication",
        "v_documentation_gaps",
    ]
    for view_name in required_views:
        try:
            spark.table(f"{target}.{view_name}").limit(1).collect()
        except Exception as exc:
            print(f"rebinding stale source view -> {target}.{view_name}")
            try:
                rebind_existing_view(view_name)
                spark.table(f"{target}.{view_name}").limit(1).collect()
            except Exception as repair_exc:
                raise RuntimeError(
                    f"Required source view {target}.{view_name} is missing or remains unreadable after "
                    "rebinding its stored definition. This notebook did not mutate silver tables or "
                    "invent replacement business logic."
                ) from repair_exc
        print(f"validated -> {target}.{view_name}")


# Silver tables are replaced during each staged transform. Recreate the two
# SELECT-star source adapters and rebind retained gold definitions only when
# Spark reports their cached schemas as stale.
refresh_incident_source_view()
refresh_mar_source_view()
validate_required_source_views()


if not date_partition:
    census_columns_for_window = target_columns("v_census")
    census_snapshot_expr_for_window = sql_value("c", census_columns_for_window, ["snapshot_date"], "date")
    try:
        census_window_row = spark.sql(
            f"""
            SELECT
              cast(max({census_snapshot_expr_for_window}) AS string) AS snapshot_date,
              max(c.month_bucket) AS month_bucket
            FROM {target}.v_census c
            """
        ).first()
    except Exception as exc:
        raise ValueError(
            f"date_partition was not supplied and tool_context_views could not derive an as-of date from {target}.v_census"
        ) from exc

    if census_window_row and census_window_row["snapshot_date"]:
        derived_as_of_date = datetime.strptime(str(census_window_row["snapshot_date"])[:10], "%Y-%m-%d").date()
    elif census_window_row and census_window_row["month_bucket"]:
        year, month = [int(part) for part in str(census_window_row["month_bucket"])[:7].split("-")]
        derived_as_of_date = date(year, month, monthrange(year, month)[1])
    else:
        raise ValueError(
            f"date_partition was not supplied and {target}.v_census has no snapshot_date or month_bucket to anchor tool_context_views"
        )

    WINDOW_AS_OF_SQL = f"DATE '{derived_as_of_date.isoformat()}'"


def create_empty_view(name: str, columns) -> None:
    select_list = ",\n      ".join(f"cast(NULL as {column_type}) AS {column_name}" for column_name, column_type in columns)
    create_view(name, f"SELECT\n      {select_list}\n    FROM (SELECT 1 AS __seed) seed\n    WHERE false")


def create_resident_countability_audit_view() -> None:
    columns = table_columns("resident")
    if not columns:
        create_empty_view(
            "v_tool_resident_countability_audit",
            [
                ("Facility", "string"),
                ("Facility_Name", "string"),
                ("Res_Number", "string"),
                ("resident_name", "string"),
                ("admit_date", "date"),
                ("discharge_date", "date"),
                ("is_countable_resident", "int"),
                ("is_suspect_test_resident", "int"),
                ("resident_exclusion_reason", "string"),
            ],
        )
        return

    facility_expr = sql_value("r", columns, ["Facility", "facility", "__FACILITY_ID"])
    resident_expr = sql_value("r", columns, ["Res_Number", "Resident_Number", "Resident_ID", "Client_ID"])
    first_expr = sql_value("r", columns, ["First_Name", "FirstName", "Given_Name"])
    last_expr = sql_value("r", columns, ["Last_Name", "LastName", "Family_Name"])
    admit_expr = sql_date("r", columns, ["Admit_Date", "Admission_Date", "Start_Date", "Move_In_Date"])
    discharge_expr = sql_date("r", columns, ["Discharge_Date", "Discharged_Date", "End_Date", "Move_Out_Date"])
    countable_expr = sql_value("r", columns, ["is_countable_resident"], "int")
    suspect_expr = sql_value("r", columns, ["is_suspect_test_resident"], "int")
    exclusion_expr = sql_value("r", columns, ["resident_exclusion_reason"])
    not_resident_expr = sql_value("r", columns, ["Not_a_Resident", "not_a_resident"], "int")
    census_columns = target_columns("v_census")
    report_snapshot_expr = sql_value("c", census_columns, ["snapshot_date"], "date")

    create_view(
        "v_tool_resident_countability_audit",
        f"""
        WITH report_bounds AS (
          SELECT coalesce(
            {DATE_PARTITION_AS_OF_SQL},
            max({report_snapshot_expr}),
            last_day(to_date(concat(max(c.month_bucket), '-01')))
          ) AS report_as_of_date
          FROM {target}.v_census c
        ),
        facility_names AS (
          SELECT
            cast(Facility AS string) AS Facility,
            max(Facility_Name) AS Facility_Name
          FROM {target}.v_occupancy
          GROUP BY cast(Facility AS string)
        ),
        base AS (
          SELECT
            {facility_expr} AS Facility,
            {resident_expr} AS Res_Number,
            {first_expr} AS First_Name,
            {last_expr} AS Last_Name,
            {admit_expr} AS admit_date,
            {discharge_expr} AS discharge_date,
            {countable_expr} AS source_is_countable_resident,
            {suspect_expr} AS source_is_suspect_test_resident,
            {exclusion_expr} AS source_exclusion_reason,
            {not_resident_expr} AS source_not_a_resident,
            rb.report_as_of_date
          FROM {source}.resident r
          CROSS JOIN report_bounds rb
        ),
        derived AS (
          SELECT
            b.*,
            lower(trim(concat_ws(' ', coalesce(b.First_Name, ''), coalesce(b.Last_Name, '')))) AS normalized_name,
            CASE
              WHEN lower(trim(concat_ws(' ', coalesce(b.First_Name, ''), coalesce(b.Last_Name, '')))) rlike '{NON_COUNTABLE_RESIDENT_SQL_PATTERN}'
                OR (
                  lower(trim(coalesce(b.First_Name, ''))) rlike '{PLACEHOLDER_RESIDENT_SQL_PATTERN}'
                  AND lower(trim(coalesce(b.Last_Name, ''))) rlike '{PLACEHOLDER_RESIDENT_SQL_PATTERN}'
                )
              THEN 1 ELSE 0
            END AS derived_is_suspect_test_resident
          FROM base b
        )
        SELECT
          cast(d.Facility AS string) AS Facility,
          coalesce(f.Facility_Name, cast(d.Facility AS string)) AS Facility_Name,
          cast(d.Res_Number AS string) AS Res_Number,
          trim(concat(coalesce(d.First_Name, ''), ' ', coalesce(d.Last_Name, ''))) AS resident_name,
          d.admit_date,
          d.discharge_date,
          coalesce(
            d.source_is_countable_resident,
            CASE
              WHEN d.Res_Number IS NULL OR trim(cast(d.Res_Number AS string)) = '' THEN 0
              WHEN coalesce(d.source_not_a_resident, 0) = 1 THEN 0
              WHEN d.admit_date IS NULL OR d.admit_date > d.report_as_of_date THEN 0
              WHEN d.discharge_date IS NOT NULL AND d.discharge_date < d.admit_date THEN 0
              WHEN d.derived_is_suspect_test_resident = 1 THEN 0
              ELSE 1
            END
          ) AS is_countable_resident,
          coalesce(d.source_is_suspect_test_resident, d.derived_is_suspect_test_resident) AS is_suspect_test_resident,
          CASE
            WHEN d.source_exclusion_reason IS NOT NULL AND d.source_exclusion_reason != '' THEN d.source_exclusion_reason
            ELSE concat_ws(
              '|',
              CASE WHEN d.Res_Number IS NULL OR trim(cast(d.Res_Number AS string)) = '' THEN 'missing_res_number' END,
              CASE WHEN coalesce(d.source_not_a_resident, 0) = 1 THEN 'not_a_resident' END,
              CASE WHEN d.admit_date IS NULL OR d.admit_date > d.report_as_of_date THEN 'invalid_or_missing_admit_date' END,
              CASE WHEN d.discharge_date IS NOT NULL AND d.discharge_date < d.admit_date THEN 'discharge_before_admit' END,
              CASE WHEN d.derived_is_suspect_test_resident = 1 THEN 'suspect_test_or_placeholder_name' END
            )
          END AS resident_exclusion_reason
        FROM derived d
        LEFT JOIN facility_names f
          ON cast(d.Facility AS string) = f.Facility
        """
    )


def create_resident_episode_views() -> None:
    columns = table_columns("res_admittance_history")
    if not columns:
        create_empty_view(
            "v_tool_resident_episode_history",
            [
                ("episode_id", "string"),
                ("Facility", "string"),
                ("Facility_Name", "string"),
                ("Res_Number", "string"),
                ("resident_name", "string"),
                ("admit_date", "date"),
                ("discharge_date", "date"),
                ("discharge_reason", "string"),
                ("discharge_destination", "string"),
                ("episode_status", "string"),
                ("month_bucket", "string"),
                ("source_table", "string"),
            ],
        )
    else:
        facility_expr = sql_value("a", columns, ["Facility", "facility", "__FACILITY_ID"])
        resident_expr = sql_value("a", columns, ["Res_Number", "Resident_Number", "Resident_ID", "Client_ID"])
        admit_expr = sql_date("a", columns, ["Admit_Date", "Admission_Date", "Start_Date", "Move_In_Date"])
        discharge_expr = sql_date("a", columns, ["Discharge_Date", "Discharged_Date", "End_Date", "Move_Out_Date"])
        reason_expr = sql_value("a", columns, ["Discharge_Reason", "Discharge_Reason_Text", "Reason", "Status"])
        destination_expr = sql_value("a", columns, ["Discharge_To", "Discharged_To", "Discharge_Destination", "Destination"])

        create_view(
            "v_tool_resident_episode_history",
            f"""
            WITH base AS (
              SELECT
                {facility_expr} AS Facility,
                {resident_expr} AS Res_Number,
                {admit_expr} AS admit_date,
                {discharge_expr} AS discharge_date,
                {reason_expr} AS discharge_reason,
                {destination_expr} AS discharge_destination
              FROM {source}.res_admittance_history a
            )
            SELECT
              sha2(concat_ws('|', coalesce(b.Facility, ''), coalesce(b.Res_Number, ''), coalesce(cast(b.admit_date AS string), ''), coalesce(cast(b.discharge_date AS string), '')), 256) AS episode_id,
              coalesce(b.Facility, q.Facility, p.Facility) AS Facility,
              coalesce(q.Facility_Name, p.Facility_Name, max(q.Facility_Name) OVER (PARTITION BY coalesce(b.Facility, q.Facility, p.Facility)), b.Facility) AS Facility_Name,
              b.Res_Number,
              coalesce(
                nullif(trim(q.resident_name), ''),
                nullif(trim(p.resident_name), ''),
                concat('Resident ', b.Res_Number)
              ) AS resident_name,
              b.admit_date,
              b.discharge_date,
              b.discharge_reason,
              b.discharge_destination,
              CASE WHEN b.discharge_date IS NULL THEN 'active_or_unknown' ELSE 'discharged' END AS episode_status,
              date_format(b.admit_date, 'yyyy-MM') AS month_bucket,
              'res_admittance_history' AS source_table
            FROM base b
            LEFT JOIN {target}.v_tool_resident_countability_audit q
              ON b.Res_Number = q.Res_Number
             AND (b.Facility = q.Facility OR b.Facility IS NULL)
            LEFT JOIN {target}.v_tool_resident_profile p
              ON b.Res_Number = p.Res_Number
             AND (b.Facility = p.Facility OR b.Facility IS NULL)
            WHERE b.Res_Number IS NOT NULL
              AND (b.admit_date IS NOT NULL OR b.discharge_date IS NOT NULL)
              AND coalesce(q.is_countable_resident, 1) = 1
            """
        )

    create_view(
        "v_tool_resident_flow_weekly_by_community",
        f"""
        WITH report_bounds AS (
          SELECT
            coalesce({DATE_PARTITION_AS_OF_SQL}, max(snapshot_date)) AS report_end_date,
            to_date(concat(min(month_bucket), '-01')) AS history_start_date
          FROM {target}.v_tool_census_monthly_by_community
        ),
        episode AS (
          SELECT *
          FROM {target}.v_tool_resident_episode_history
        ),
        admission_events AS (
          SELECT
            Facility,
            Facility_Name,
            date_sub(admit_date, pmod(dayofweek(admit_date) + 5, 7)) AS week_start,
            1 AS admissions,
            0 AS discharges,
            resident_name AS admitted_resident,
            cast(NULL AS string) AS discharged_resident
          FROM episode
          CROSS JOIN report_bounds b
          WHERE admit_date IS NOT NULL
            AND admit_date <= b.report_end_date
        ),
        discharge_events AS (
          SELECT
            Facility,
            Facility_Name,
            date_sub(discharge_date, pmod(dayofweek(discharge_date) + 5, 7)) AS week_start,
            0 AS admissions,
            1 AS discharges,
            cast(NULL AS string) AS admitted_resident,
            resident_name AS discharged_resident
          FROM episode
          CROSS JOIN report_bounds b
          WHERE discharge_date IS NOT NULL
            AND discharge_date <= b.report_end_date
        ),
        movement AS (
          SELECT * FROM admission_events
          UNION ALL
          SELECT * FROM discharge_events
        ),
        bounds AS (
          SELECT
            date_sub(
              max(b.history_start_date),
              pmod(dayofweek(max(b.history_start_date)) + 5, 7)
            ) AS start_week,
            date_sub(
              max(b.report_end_date),
              pmod(dayofweek(max(b.report_end_date)) + 5, 7)
            ) AS end_week
          FROM episode
          CROSS JOIN report_bounds b
        ),
        weeks AS (
          SELECT explode(sequence(start_week, end_week, interval 7 days)) AS week_start
          FROM bounds
          WHERE start_week IS NOT NULL
            AND end_week IS NOT NULL
        ),
        facilities AS (
          SELECT Facility, max(Facility_Name) AS Facility_Name
          FROM episode
          WHERE Facility IS NOT NULL
          GROUP BY Facility
        ),
        weekly_movement AS (
          SELECT
            Facility,
            max(Facility_Name) AS Facility_Name,
            week_start,
            sum(admissions) AS admissions,
            sum(discharges) AS discharges,
            concat_ws(', ', sort_array(collect_set(admitted_resident))) AS admitted_residents,
            concat_ws(', ', sort_array(collect_set(discharged_resident))) AS discharged_residents,
            count(*) AS source_rows
          FROM movement
          WHERE week_start IS NOT NULL
          GROUP BY Facility, week_start
        )
        SELECT
          f.Facility,
          f.Facility_Name,
          w.week_start,
          date_format(w.week_start, 'yyyy-MM') AS month_bucket,
          coalesce(m.admissions, 0) AS admissions,
          coalesce(m.discharges, 0) AS discharges,
          coalesce(m.admissions, 0) - coalesce(m.discharges, 0) AS net_change,
          coalesce(m.admitted_residents, '') AS admitted_residents,
          coalesce(m.discharged_residents, '') AS discharged_residents,
          coalesce(m.source_rows, 0) AS source_rows
        FROM facilities f
        CROSS JOIN weeks w
        LEFT JOIN weekly_movement m
          ON m.Facility = f.Facility
         AND m.week_start = w.week_start
        """
    )

    create_view(
        "v_tool_resident_flow_monthly_by_community",
        f"""
        WITH report_bounds AS (
          SELECT date_format(coalesce({DATE_PARTITION_AS_OF_SQL}, max(snapshot_date)), 'yyyy-MM') AS report_month,
                 coalesce({DATE_PARTITION_AS_OF_SQL}, max(snapshot_date)) AS report_end_date
          FROM {target}.v_tool_census_monthly_by_community
        ),
        episode AS (
          SELECT *
          FROM {target}.v_tool_resident_episode_history
        ),
        admission_events AS (
          SELECT
            Facility,
            Facility_Name,
            date_format(admit_date, 'yyyy-MM') AS month_bucket,
            1 AS admissions,
            0 AS discharges,
            resident_name AS admitted_resident,
            cast(NULL AS string) AS discharged_resident
          FROM episode
          CROSS JOIN report_bounds b
          WHERE admit_date IS NOT NULL
            AND admit_date <= b.report_end_date
        ),
        discharge_events AS (
          SELECT
            Facility,
            Facility_Name,
            date_format(discharge_date, 'yyyy-MM') AS month_bucket,
            0 AS admissions,
            1 AS discharges,
            cast(NULL AS string) AS admitted_resident,
            resident_name AS discharged_resident
          FROM episode
          CROSS JOIN report_bounds b
          WHERE discharge_date IS NOT NULL
            AND discharge_date <= b.report_end_date
        ),
        movement AS (
          SELECT * FROM admission_events
          UNION ALL
          SELECT * FROM discharge_events
        )
        SELECT
          Facility,
          max(Facility_Name) AS Facility_Name,
          month_bucket,
          sum(admissions) AS admissions,
          sum(discharges) AS discharges,
          sum(admissions) - sum(discharges) AS net_change,
          concat_ws(', ', sort_array(collect_set(admitted_resident))) AS admitted_residents,
          concat_ws(', ', sort_array(collect_set(discharged_resident))) AS discharged_residents,
          count(*) AS source_rows
        FROM movement
        WHERE month_bucket IS NOT NULL
        GROUP BY Facility, month_bucket
        """
    )

    create_view(
        "v_tool_census_weekly_by_community",
        f"""
        WITH report_bounds AS (
          SELECT
            coalesce({DATE_PARTITION_AS_OF_SQL}, max(snapshot_date)) AS report_end_date,
            to_date(concat(min(month_bucket), '-01')) AS history_start_date
          FROM {target}.v_tool_census_monthly_by_community
        ),
        episode AS (
          SELECT *
          FROM {target}.v_tool_resident_episode_history
          WHERE admit_date IS NOT NULL
        ),
        bounds AS (
          SELECT
            date_sub(
              max(b.history_start_date),
              pmod(dayofweek(max(b.history_start_date)) + 5, 7)
            ) AS start_week,
            date_sub(max(b.report_end_date), pmod(dayofweek(max(b.report_end_date)) + 5, 7)) AS end_week,
            max(b.report_end_date) AS report_end_date
          FROM episode
          CROSS JOIN report_bounds b
        ),
        weeks AS (
          SELECT explode(sequence(start_week, end_week, interval 7 days)) AS week_start
          FROM bounds
          WHERE start_week IS NOT NULL AND end_week IS NOT NULL
        ),
        facilities AS (
          SELECT Facility, max(Facility_Name) AS Facility_Name
          FROM episode
          GROUP BY Facility
        ),
        observation_dates AS (
          SELECT
            w.week_start,
            least(date_add(w.week_start, 6), b.report_end_date) AS census_date,
            date_sub(
              least(date_add(w.week_start, 6), b.report_end_date),
              7
            ) AS prior_census_date
          FROM weeks w
          CROSS JOIN bounds b
        ),
        census_counts AS (
          SELECT
            f.Facility,
            f.Facility_Name,
            o.week_start,
            o.census_date,
            o.prior_census_date,
            count(
              DISTINCT CASE
                WHEN e.admit_date <= o.census_date
                 AND (e.discharge_date IS NULL OR e.discharge_date > o.census_date)
                THEN e.Res_Number
              END
            ) AS census,
            count(
              DISTINCT CASE
                WHEN e.admit_date <= o.prior_census_date
                 AND (e.discharge_date IS NULL OR e.discharge_date > o.prior_census_date)
                THEN e.Res_Number
              END
            ) AS census_7d_prior
          FROM facilities f
          CROSS JOIN observation_dates o
          LEFT JOIN episode e
            ON e.Facility = f.Facility
           AND e.admit_date <= o.census_date
          GROUP BY
            f.Facility,
            f.Facility_Name,
            o.week_start,
            o.census_date,
            o.prior_census_date
        )
        SELECT
          Facility,
          Facility_Name,
          week_start,
          census_date AS week_end,
          census_date,
          prior_census_date,
          date_format(census_date, 'yyyy-MM') AS month_bucket,
          census,
          census_7d_prior,
          census - census_7d_prior AS census_change_7d
        FROM census_counts
        """
    )


def create_resident_unit_history_view() -> None:
    columns = table_columns("res_unit_history")
    if not columns:
        create_empty_view(
            "v_tool_resident_unit_history",
            [
                ("Facility", "string"),
                ("Facility_Name", "string"),
                ("Res_Number", "string"),
                ("resident_name", "string"),
                ("unit_number", "string"),
                ("start_date", "date"),
                ("end_date", "date"),
                ("month_bucket", "string"),
            ],
        )
        return

    facility_expr = sql_value("u", columns, ["Facility", "facility", "__FACILITY_ID"])
    resident_expr = sql_value("u", columns, ["Res_Number", "Resident_Number", "Resident_ID", "Client_ID"])
    unit_expr = sql_value("u", columns, ["Unit_Number", "Unit", "Room", "Room_Number", "Bed", "Unit_ID"])
    start_expr = sql_date("u", columns, ["Start_Date", "Effective_Date", "Move_In_Date"])
    end_expr = sql_date("u", columns, ["End_Date", "Move_Out_Date"])

    create_view(
        "v_tool_resident_unit_history",
        f"""
        WITH base AS (
          SELECT
            {facility_expr} AS Facility,
            {resident_expr} AS Res_Number,
            {unit_expr} AS unit_number,
            {start_expr} AS start_date,
            {end_expr} AS end_date
          FROM {source}.res_unit_history u
        )
        SELECT
          coalesce(b.Facility, p.Facility) AS Facility,
          coalesce(p.Facility_Name, b.Facility) AS Facility_Name,
          b.Res_Number,
          coalesce(p.resident_name, concat('Resident ', b.Res_Number)) AS resident_name,
          coalesce(b.unit_number, p.Unit_Number) AS unit_number,
          b.start_date,
          b.end_date,
          date_format(b.start_date, 'yyyy-MM') AS month_bucket
        FROM base b
        LEFT JOIN {target}.v_tool_resident_profile p
          ON b.Res_Number = p.Res_Number
         AND (b.Facility = p.Facility OR b.Facility IS NULL)
        WHERE b.Res_Number IS NOT NULL
          AND (b.start_date IS NOT NULL OR b.end_date IS NOT NULL)
        """
    )


def create_census_data_quality_view() -> None:
    create_view(
        "v_tool_census_data_quality",
        f"""
        WITH latest_census_month AS (
          SELECT max(month_bucket) AS month_bucket
          FROM {target}.v_tool_census_monthly_by_community
        ),
        latest_monthly AS (
          SELECT
            c.Facility,
            c.month_bucket,
            c.snapshot_date AS latest_census_as_of_date,
            c.census,
            c.prior_census,
            c.census_delta
          FROM {target}.v_tool_census_monthly_by_community c
          JOIN latest_census_month lm
            ON c.month_bucket = lm.month_bucket
        ),
        active_roster_as_of_census AS (
          SELECT
            l.Facility,
            count(DISTINCT q.Res_Number) AS active_roster_residents
          FROM latest_monthly l
          LEFT JOIN {target}.v_tool_resident_countability_audit q
            ON q.Facility = l.Facility
           AND coalesce(q.is_countable_resident, 1) = 1
           AND q.admit_date <= l.latest_census_as_of_date
           AND (q.discharge_date IS NULL OR q.discharge_date > l.latest_census_as_of_date)
          GROUP BY l.Facility
        ),
        current_active_roster AS (
          SELECT
            Facility,
            max(Facility_Name) AS Facility_Name,
            count(DISTINCT Res_Number) AS current_active_roster_residents
          FROM {target}.v_tool_resident_profile
          GROUP BY Facility
        ),
        excluded AS (
          SELECT
            Facility,
            count(*) AS excluded_or_non_countable_rows,
            sum(CASE WHEN is_suspect_test_resident = 1 THEN 1 ELSE 0 END) AS suspected_test_rows,
            concat_ws(', ', sort_array(collect_set(resident_exclusion_reason))) AS exclusion_reasons
          FROM {target}.v_tool_resident_countability_audit
          WHERE coalesce(is_countable_resident, 1) = 0
          GROUP BY Facility
        ),
        weekly_bounds AS (
          SELECT
            Facility,
            min(week_start) AS min_week,
            max(week_start) AS max_week,
            count(*) AS weekly_census_rows
          FROM {target}.v_tool_census_weekly_by_community
          GROUP BY Facility
        )
        SELECT
          coalesce(l.Facility, c.Facility) AS Facility,
          coalesce(c.Facility_Name, coalesce(l.Facility, c.Facility)) AS Facility_Name,
          l.month_bucket AS latest_census_month,
          l.census AS latest_monthly_census,
          a.active_roster_residents,
          c.current_active_roster_residents,
          c.current_active_roster_residents - l.census AS current_active_minus_latest_census,
          l.census - a.active_roster_residents AS monthly_census_minus_active_roster,
          l.prior_census,
          l.census_delta,
          coalesce(e.excluded_or_non_countable_rows, 0) AS excluded_or_non_countable_rows,
          coalesce(e.suspected_test_rows, 0) AS suspected_test_rows,
          e.exclusion_reasons,
          w.min_week,
          w.max_week,
          coalesce(w.weekly_census_rows, 0) AS weekly_census_rows
        FROM latest_monthly l
        LEFT JOIN active_roster_as_of_census a
          ON l.Facility = a.Facility
        FULL OUTER JOIN current_active_roster c
          ON l.Facility = c.Facility
        LEFT JOIN excluded e
          ON coalesce(l.Facility, c.Facility) = e.Facility
        LEFT JOIN weekly_bounds w
          ON coalesce(l.Facility, c.Facility) = w.Facility
        """
    )


def create_services_provided_view() -> None:
    service_parts = []
    for table_name, source_label, date_candidates in [
        ("service_archive", "service_archive", ["Service_Date", "Date", "Create_Date"]),
        ("scheduled_employee", "scheduled_employee", ["Service_Date", "Date", "Create_Date"]),
    ]:
        columns = table_columns(table_name)
        if not columns:
            continue
        facility_expr = sql_value("s", columns, ["Facility", "facility", "__FACILITY_ID"])
        resident_expr = sql_value("s", columns, ["Res_Number", "Resident_Number", "Resident_ID", "Client_ID"])
        service_date_expr = sql_date("s", columns, date_candidates)
        service_type_expr = sql_value("s", columns, ["Service_Type", "Service_Type_ID", "Service_Type_Code", "Service", "Description", "Service_Description", "Task"])
        employee_expr = sql_value("s", columns, ["Employee_ID", "Emp_ID", "Employee", "Staff_ID", "Staff", "Assigned_To"])
        status_expr = sql_value("s", columns, ["Status", "Service_Status", "Bill_Status", "Outcome"])
        units_expr = sql_value("s", columns, ["Units", "Service_Units", "Hours", "Duration", "Minutes"], "double")
        service_parts.append(
            f"""
            SELECT
              {facility_expr} AS Facility,
              {resident_expr} AS Res_Number,
              {service_date_expr} AS service_date,
              {service_type_expr} AS service_type,
              {employee_expr} AS employee_id,
              {status_expr} AS service_status,
              {units_expr} AS service_units,
              '{source_label}' AS source_table
            FROM {source}.{table_name} s
            """
        )

    if not service_parts:
        create_empty_view(
            "v_tool_services_provided",
            [
                ("Facility", "string"),
                ("Facility_Name", "string"),
                ("Res_Number", "string"),
                ("resident_name", "string"),
                ("service_date", "date"),
                ("month_bucket", "string"),
                ("service_type", "string"),
                ("employee_id", "string"),
                ("service_status", "string"),
                ("service_units", "double"),
                ("source_table", "string"),
            ],
        )
        return

    create_view(
        "v_tool_services_provided",
        f"""
        WITH base AS (
          {' UNION ALL '.join(service_parts)}
        )
        SELECT
          coalesce(b.Facility, p.Facility) AS Facility,
          coalesce(p.Facility_Name, b.Facility) AS Facility_Name,
          b.Res_Number,
          coalesce(p.resident_name, concat('Resident ', b.Res_Number)) AS resident_name,
          b.service_date,
          date_format(b.service_date, 'yyyy-MM') AS month_bucket,
          coalesce(b.service_type, 'Unspecified service') AS service_type,
          b.employee_id,
          b.service_status,
          b.service_units,
          b.source_table
        FROM base b
        LEFT JOIN {target}.v_tool_resident_profile p
          ON b.Res_Number = p.Res_Number
         AND (b.Facility = p.Facility OR b.Facility IS NULL)
        WHERE b.service_date IS NOT NULL
        """
    )


def create_assessment_summary_view() -> None:
    columns = table_columns("assessment")
    if not columns:
        create_empty_view(
            "v_tool_assessment_summary",
            [
                ("Facility", "string"),
                ("Facility_Name", "string"),
                ("Res_Number", "string"),
                ("resident_name", "string"),
                ("assessment_date", "date"),
                ("month_bucket", "string"),
                ("assessment_type", "string"),
                ("assessment_status", "string"),
                ("assessment_score", "double"),
            ],
        )
        return

    facility_expr = sql_value("a", columns, ["Facility", "facility", "__FACILITY_ID"])
    resident_expr = sql_value("a", columns, ["Res_Number", "Resident_Number", "Resident_ID", "Client_ID"])
    date_expr = sql_date("a", columns, ["Assessment_Date", "Date", "Create_Date"])
    type_expr = sql_value("a", columns, ["Assessment_Type", "Assessment", "Assessment_Name", "Type", "Description"])
    status_expr = sql_value("a", columns, ["Status", "Assessment_Status", "Complete_YN", "Completed_YN"])
    score_expr = sql_value("a", columns, ["Score", "Total_Score", "Assessment_Score"], "double")

    create_view(
        "v_tool_assessment_summary",
        f"""
        WITH base AS (
          SELECT
            {facility_expr} AS Facility,
            {resident_expr} AS Res_Number,
            {date_expr} AS assessment_date,
            {type_expr} AS assessment_type,
            {status_expr} AS assessment_status,
            {score_expr} AS assessment_score
          FROM {source}.assessment a
        )
        SELECT
          coalesce(b.Facility, p.Facility) AS Facility,
          coalesce(p.Facility_Name, b.Facility) AS Facility_Name,
          b.Res_Number,
          coalesce(p.resident_name, concat('Resident ', b.Res_Number)) AS resident_name,
          b.assessment_date,
          date_format(b.assessment_date, 'yyyy-MM') AS month_bucket,
          coalesce(b.assessment_type, 'Unspecified assessment') AS assessment_type,
          b.assessment_status,
          b.assessment_score
        FROM base b
        LEFT JOIN {target}.v_tool_resident_profile p
          ON b.Res_Number = p.Res_Number
         AND (b.Facility = p.Facility OR b.Facility IS NULL)
        WHERE b.assessment_date IS NOT NULL
        """
    )


def create_notes_summary_view() -> None:
    columns = table_columns("notes")
    if not columns:
        create_empty_view(
            "v_tool_notes_summary",
            [
                ("Facility", "string"),
                ("Facility_Name", "string"),
                ("Res_Number", "string"),
                ("resident_name", "string"),
                ("note_date", "date"),
                ("month_bucket", "string"),
                ("note_type", "string"),
                ("note_text", "string"),
                ("action_required_by_date", "date"),
            ],
        )
        return

    facility_expr = sql_value("n", columns, ["Facility", "facility", "__FACILITY_ID"])
    resident_expr = sql_value("n", columns, ["Res_Number", "Resident_Number", "Resident_ID", "Client_ID"])
    note_date_expr = sql_date("n", columns, ["Entry_Date", "Note_Date", "Create_Date"])
    note_type_expr = sql_value("n", columns, ["Note_Type", "Type", "Category", "Subject"])
    note_text_expr = sql_value("n", columns, ["Note_Text", "Notes", "Narrative", "Description", "Text", "Comments"])
    action_date_expr = sql_date("n", columns, ["Action_Required_By_Date", "Followup_Date", "Due_Date"])

    create_view(
        "v_tool_notes_summary",
        f"""
        WITH base AS (
          SELECT
            {facility_expr} AS Facility,
            {resident_expr} AS Res_Number,
            {note_date_expr} AS note_date,
            {note_type_expr} AS note_type,
            {note_text_expr} AS note_text,
            {action_date_expr} AS action_required_by_date
          FROM {source}.notes n
        )
        SELECT
          coalesce(b.Facility, p.Facility) AS Facility,
          coalesce(p.Facility_Name, b.Facility) AS Facility_Name,
          b.Res_Number,
          coalesce(p.resident_name, concat('Resident ', b.Res_Number)) AS resident_name,
          b.note_date,
          date_format(b.note_date, 'yyyy-MM') AS month_bucket,
          coalesce(b.note_type, 'Unspecified note') AS note_type,
          b.note_text,
          b.action_required_by_date
        FROM base b
        LEFT JOIN {target}.v_tool_resident_profile p
          ON b.Res_Number = p.Res_Number
         AND (b.Facility = p.Facility OR b.Facility IS NULL)
        WHERE b.note_date IS NOT NULL
        """
    )


# COMMAND ----------

create_resident_countability_audit_view()

# COMMAND ----------

create_view(
    "v_tool_incident_monthly_by_community_category",
    f"""
    SELECT
      cast(Facility AS string) AS Facility,
      max(Facility_Name) AS Facility_Name,
      coalesce(Incident_Category, 'Uncategorized') AS Incident_Category,
      date_format(Incident_Date_parsed, 'yyyy-MM') AS month_bucket,
      count(*) AS incident_count,
      count(DISTINCT Res_Number) AS resident_count,
      max(Incident_Date_parsed) AS latest_incident_date
    FROM {target}.v_incidents
    WHERE Incident_Date_parsed IS NOT NULL
    GROUP BY
      cast(Facility AS string),
      coalesce(Incident_Category, 'Uncategorized'),
      date_format(Incident_Date_parsed, 'yyyy-MM')
    """
)

# COMMAND ----------

create_view(
    "v_tool_incident_detail_current_month",
    f"""
    WITH current_month AS (
      SELECT max(date_format(Incident_Date_parsed, 'yyyy-MM')) AS month_bucket
      FROM {target}.v_incidents
      WHERE Incident_Date_parsed IS NOT NULL
    ), resident_names AS (
      SELECT
        Facility,
        Res_Number,
        max(element_at(split(resident_name, ' '), 1)) AS First_Name,
        max(regexp_extract(resident_name, '^[^ ]+\\\\s+(.+)$', 1)) AS Last_Name,
        cast(NULL AS string) AS Unit_Number
      FROM {target}.v_tool_resident_countability_audit
      WHERE coalesce(is_countable_resident, 1) = 1
      GROUP BY Facility, Res_Number
    )
    SELECT
      cast(i.Unique_ID AS string) AS Unique_ID,
      cast(i.Facility AS string) AS Facility,
      i.Facility_Name,
      cast(i.Res_Number AS string) AS Res_Number,
      r.First_Name,
      r.Last_Name,
      coalesce(i.Unit_Number, r.Unit_Number) AS Unit_Number,
      i.Incident_Date_parsed,
      i.__TIMESTAMP,
      coalesce(i.Incident_Category, 'Uncategorized') AS Incident_Category,
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
      date_format(i.Incident_Date_parsed, 'yyyy-MM') AS month_bucket
    FROM {target}.v_incidents i
    JOIN current_month m
      ON date_format(i.Incident_Date_parsed, 'yyyy-MM') = m.month_bucket
    LEFT JOIN resident_names r
      ON i.Res_Number = r.Res_Number
     AND i.Facility = r.Facility
    WHERE i.Incident_Date_parsed IS NOT NULL
    """
)

# COMMAND ----------

create_view(
    "v_tool_incident_detail_history",
    f"""
    WITH resident_names AS (
      SELECT
        Facility,
        Res_Number,
        max(element_at(split(resident_name, ' '), 1)) AS First_Name,
        max(regexp_extract(resident_name, '^[^ ]+\\\\s+(.+)$', 1)) AS Last_Name,
        cast(NULL AS string) AS Unit_Number
      FROM {target}.v_tool_resident_countability_audit
      WHERE coalesce(is_countable_resident, 1) = 1
      GROUP BY Facility, Res_Number
    )
    SELECT
      cast(i.Unique_ID AS string) AS Unique_ID,
      cast(i.Facility AS string) AS Facility,
      i.Facility_Name,
      cast(i.Res_Number AS string) AS Res_Number,
      r.First_Name,
      r.Last_Name,
      coalesce(i.Unit_Number, r.Unit_Number) AS Unit_Number,
      i.Incident_Date_parsed,
      i.__TIMESTAMP,
      coalesce(i.Incident_Category, 'Uncategorized') AS Incident_Category,
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
      date_format(i.Incident_Date_parsed, 'yyyy-MM') AS month_bucket
    FROM {target}.v_incidents i
    LEFT JOIN resident_names r
      ON i.Res_Number = r.Res_Number
     AND i.Facility = r.Facility
    WHERE i.Incident_Date_parsed IS NOT NULL
    """
)

# COMMAND ----------

census_columns = target_columns("v_census")
census_snapshot_date_expr = sql_value("c", census_columns, ["snapshot_date"], "date")

create_view(
    "v_tool_census_monthly_by_community",
    f"""
    SELECT
      cast(c.Facility AS string) AS Facility,
      c.month_bucket,
      coalesce({census_snapshot_date_expr}, last_day(to_date(concat(c.month_bucket, '-01')))) AS snapshot_date,
      cast(c.census AS int) AS census,
      lag(cast(c.census AS int)) OVER (
        PARTITION BY cast(c.Facility AS string)
        ORDER BY c.month_bucket
      ) AS prior_census,
      cast(c.census AS int) - lag(cast(c.census AS int)) OVER (
        PARTITION BY cast(c.Facility AS string)
        ORDER BY c.month_bucket
      ) AS census_delta
    FROM {target}.v_census c
    WHERE c.month_bucket <= date_format({WINDOW_AS_OF_SQL}, 'yyyy-MM')
    """
)

# COMMAND ----------

create_view(
    "v_tool_resident_profile",
    f"""
    WITH countability AS (
      SELECT
        Facility,
        Res_Number,
        min(coalesce(is_countable_resident, 1)) AS is_countable_resident
      FROM {target}.v_tool_resident_countability_audit
      GROUP BY Facility, Res_Number
    )
    SELECT
      cast(r.Res_Number AS string) AS Res_Number,
      trim(concat(coalesce(r.First_Name, ''), ' ', coalesce(r.Last_Name, ''))) AS resident_name,
      r.First_Name,
      r.Last_Name,
      cast(r.Age AS int) AS Age,
      r.Admit_Date,
      cast(r.LOS_Days AS int) AS LOS_Days,
      cast(r.Facility AS string) AS Facility,
      r.Facility_Name,
      r.Unit_Number,
      r.Care_Level,
      r.Payor_Text,
      r.Primary_Diagnosis,
      r.Physician_Name,
      r.Diet
    FROM {target}.v_active_residents r
    JOIN countability q
      ON cast(r.Res_Number AS string) = q.Res_Number
     AND cast(r.Facility AS string) = q.Facility
    WHERE q.is_countable_resident = 1
    """
)

# COMMAND ----------

create_view(
    "v_tool_resident_incident_summary",
    f"""
    WITH incident_rollup AS (
    SELECT
      cast(i.Facility AS string) AS Facility,
      max(i.Facility_Name) AS Facility_Name,
      cast(i.Res_Number AS string) AS Res_Number,
      count(*) AS incident_count_all_time,
      sum(CASE WHEN i.Incident_Date_parsed >= date_sub({WINDOW_AS_OF_SQL}, 30) THEN 1 ELSE 0 END) AS incident_count_30d,
      sum(CASE WHEN i.Incident_Date_parsed >= date_sub({WINDOW_AS_OF_SQL}, 90) THEN 1 ELSE 0 END) AS incident_count_90d,
      sum(CASE WHEN i.Incident_Date_parsed >= date_sub({WINDOW_AS_OF_SQL}, 180) THEN 1 ELSE 0 END) AS incident_count_180d,
      max(i.Incident_Date_parsed) AS last_incident_date,
      max_by(coalesce(i.Incident_Category, 'Uncategorized'), i.Incident_Date_parsed) AS last_incident_category
    FROM {target}.v_incidents i
    WHERE i.Incident_Date_parsed IS NOT NULL
    GROUP BY cast(i.Facility AS string), cast(i.Res_Number AS string)
    )
    SELECT
      i.*,
      max(p.resident_name) AS resident_name
    FROM incident_rollup i
    LEFT JOIN {target}.v_tool_resident_profile p
      ON i.Res_Number = p.Res_Number
     AND i.Facility = p.Facility
    GROUP BY
      i.Facility,
      i.Facility_Name,
      i.Res_Number,
      i.incident_count_all_time,
      i.incident_count_30d,
      i.incident_count_90d,
      i.incident_count_180d,
      i.last_incident_date,
      i.last_incident_category
    """
)

# COMMAND ----------

create_view(
    "v_tool_documentation_status",
    f"""
    SELECT
      cast(Res_Number AS string) AS Res_Number,
      trim(concat(coalesce(First_Name, ''), ' ', coalesce(Last_Name, ''))) AS resident_name,
      cast(Facility AS string) AS Facility,
      Facility_Name,
      last_note_date,
      cast(days_since_last_note AS int) AS days_since_last_note
    FROM {target}.v_documentation_gaps
    """
)

# COMMAND ----------

create_view(
    "v_tool_resident_profile_enriched",
    f"""
    SELECT
      p.*,
      coalesce(i.incident_count_all_time, 0) AS incident_count_all_time,
      coalesce(i.incident_count_30d, 0) AS incident_count_30d,
      coalesce(i.incident_count_90d, 0) AS incident_count_90d,
      coalesce(i.incident_count_180d, 0) AS incident_count_180d,
      i.last_incident_date,
      i.last_incident_category,
      d.last_note_date,
      d.days_since_last_note
    FROM {target}.v_tool_resident_profile p
    LEFT JOIN {target}.v_tool_resident_incident_summary i
      ON p.Res_Number = i.Res_Number
     AND p.Facility = i.Facility
    LEFT JOIN {target}.v_tool_documentation_status d
      ON p.Res_Number = d.Res_Number
     AND p.Facility = d.Facility
    """
)

# COMMAND ----------

create_view(
    "v_tool_medication_refusal_summary",
    f"""
    SELECT
      cast(Facility AS string) AS Facility,
      Medication,
      cast(total_scheduled AS int) AS total_scheduled,
      cast(refusals AS int) AS refusals,
      cast(refusal_pct AS double) AS refusal_pct
    FROM {target}.v_refusal_by_medication
    """
)

# COMMAND ----------

create_view(
    "v_tool_medication_compliance_monthly",
    f"""
    SELECT
      cast(Facility AS string) AS Facility,
      Facility_Name,
      month_bucket,
      cast(total_scheduled AS int) AS total_scheduled,
      cast(given AS int) AS given,
      cast(not_given AS int) AS not_given,
      cast(compliance_pct AS double) AS compliance_pct
    FROM {target}.v_medication_compliance
    """
)

# COMMAND ----------

create_view(
    "v_tool_mar_monthly_by_community_medication",
    f"""
    SELECT *
    FROM {target}.v_mar_monthly_by_community_medication
    WHERE month_bucket >= date_format(add_months({WINDOW_AS_OF_SQL}, -18), 'yyyy-MM')
    """
)

# COMMAND ----------

create_view(
    "v_tool_mar_resident_summary",
    f"""
    SELECT *
    FROM {target}.v_mar_resident_summary
    """
)

# COMMAND ----------

create_view(
    "v_tool_mar_exception_detail_90d",
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
      scheduled_time,
      recorded_date,
      administration_outcome,
      outcome_category,
      not_given_reason,
      missed_or_held_reason,
      is_on_hold,
      is_prn,
      prn_reason,
      prn_result,
      prn_result_date,
      administration_note,
      minutes_late,
      is_refusal,
      is_over_60_minutes_late,
      month_bucket
    FROM {target}.v_mar_exception_detail
    WHERE administration_date >= date_sub({WINDOW_AS_OF_SQL}, 90)
      AND (administration_outcome = 'not_given' OR is_over_60_minutes_late = 1)
    """
)

# COMMAND ----------

create_view(
    "v_tool_mar_prn_effectiveness_90d",
    f"""
    SELECT *
    FROM {target}.v_mar_prn_effectiveness
    WHERE administration_date >= date_sub({WINDOW_AS_OF_SQL}, 90)
    """
)

# COMMAND ----------

create_view(
    "v_tool_mar_medication_orders_current",
    f"""
    SELECT
      o.medication_order_id,
      o.resident_id,
      r.resident_name,
      o.facility_id,
      o.facility_name,
      o.medication_name,
      o.dosage,
      o.route,
      o.schedule,
      o.passing_times,
      o.instructions,
      o.indication,
      o.prescriber_code,
      o.diagnosis_code,
      o.is_narcotic,
      o.is_psychotropic,
      o.is_prn,
      o.is_on_hold,
      o.effective_date,
      o.prescription_end_date
    FROM {target}.v_mar_medication_orders_current o
    LEFT JOIN {target}.v_mar_resident_summary r
      ON o.facility_id = r.facility_id
     AND o.resident_id = r.resident_id
    """
)

# COMMAND ----------

create_resident_episode_views()
create_census_data_quality_view()

# COMMAND ----------

create_resident_unit_history_view()

# COMMAND ----------

create_services_provided_view()

# COMMAND ----------

create_assessment_summary_view()

# COMMAND ----------

create_notes_summary_view()

# COMMAND ----------

create_view(
    "v_tool_community_operating_summary",
    f"""
    WITH latest_census AS (
      SELECT *
      FROM (
        SELECT
          c.*,
          row_number() OVER (PARTITION BY c.Facility ORDER BY c.month_bucket DESC) AS rn
        FROM {target}.v_tool_census_monthly_by_community c
      )
      WHERE rn = 1
    ),
    latest_incident_month AS (
      SELECT max(month_bucket) AS month_bucket
      FROM {target}.v_tool_incident_monthly_by_community_category
    ),
    incident_current AS (
      SELECT
        Facility,
        month_bucket,
        sum(incident_count) AS incidents
      FROM {target}.v_tool_incident_monthly_by_community_category
      WHERE month_bucket = (SELECT month_bucket FROM latest_incident_month)
      GROUP BY Facility, month_bucket
    ),
    resident_rollup AS (
      SELECT
        c.Facility,
        max(p.Facility_Name) AS Facility_Name,
        count(DISTINCT p.Res_Number) AS profile_rows_as_of_census,
        avg(cast(p.Age AS double)) AS average_age,
        avg(
          CASE
            WHEN try_cast(p.Admit_Date AS date) IS NOT NULL THEN datediff(c.snapshot_date, try_cast(p.Admit_Date AS date))
            ELSE cast(p.LOS_Days AS double)
          END
        ) AS average_los_days
      FROM latest_census c
      LEFT JOIN {target}.v_tool_resident_profile p
        ON p.Facility = c.Facility
       AND (try_cast(p.Admit_Date AS date) IS NULL OR try_cast(p.Admit_Date AS date) <= c.snapshot_date)
      GROUP BY c.Facility
    ),
    compliance_latest AS (
      SELECT *
      FROM (
        SELECT
          m.*,
          row_number() OVER (PARTITION BY m.Facility ORDER BY m.month_bucket DESC) AS rn
        FROM {target}.v_tool_medication_compliance_monthly m
      )
      WHERE rn = 1
    ),
    doc_gaps AS (
      SELECT
        Facility,
        count(*) AS documentation_gap_rows,
        max(days_since_last_note) AS largest_documentation_gap_days
      FROM {target}.v_tool_documentation_status
      GROUP BY Facility
    )
    SELECT
      c.Facility,
      coalesce(r.Facility_Name, c.Facility) AS Facility_Name,
      c.census AS resident_rows,
      c.month_bucket AS census_month,
      c.census,
      c.prior_census,
      c.census_delta,
      i.month_bucket AS incident_month,
      coalesce(i.incidents, 0) AS incidents,
      CASE
        WHEN c.census > 0 THEN coalesce(i.incidents, 0) / c.census * 100
        ELSE NULL
      END AS incidents_per_100_residents,
      r.average_age,
      r.average_los_days,
      m.month_bucket AS medication_month,
      m.compliance_pct,
      coalesce(d.documentation_gap_rows, 0) AS documentation_gap_rows,
      d.largest_documentation_gap_days
    FROM latest_census c
    LEFT JOIN resident_rollup r ON c.Facility = r.Facility
    LEFT JOIN incident_current i ON c.Facility = i.Facility
    LEFT JOIN compliance_latest m ON c.Facility = m.Facility
    LEFT JOIN doc_gaps d ON c.Facility = d.Facility
    """
)

# COMMAND ----------

create_view(
    "v_tool_context_manifest",
    f"""
    SELECT
      'community_operating_summary' AS slice_name,
      'community_current' AS grain,
      count(*) AS row_count,
      min(census_month) AS min_period,
      max(census_month) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,resident_rows,census_month,census,prior_census,census_delta,incident_month,incidents,incidents_per_100_residents,average_age,average_los_days,medication_month,compliance_pct,documentation_gap_rows,largest_documentation_gap_days' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_community_operating_summary

    UNION ALL

    SELECT
      'incident_monthly_by_community_category' AS slice_name,
      'community_month_category' AS grain,
      count(*) AS row_count,
      min(month_bucket) AS min_period,
      max(month_bucket) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,Incident_Category,month_bucket,incident_count,resident_count,latest_incident_date' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_incident_monthly_by_community_category

    UNION ALL

    SELECT
      'incident_detail_current_month' AS slice_name,
      'incident_detail' AS grain,
      count(*) AS row_count,
      min(month_bucket) AS min_period,
      max(month_bucket) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Unique_ID,Facility,Facility_Name,Res_Number,First_Name,Last_Name,Unit_Number,Incident_Date_parsed,__TIMESTAMP,Incident_Category,Type_of_Incident,Location_of_Incident_General,Location_of_Incident_Specific,What_Staff_Saw,Assistance_Given,Injuires_YN,Notify_EmergSrvs_YN,Sentinel_Event_YN,Prev_History_YN,month_bucket' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_incident_detail_current_month

    UNION ALL

    SELECT
      'incident_detail_history' AS slice_name,
      'incident_detail' AS grain,
      count(*) AS row_count,
      min(month_bucket) AS min_period,
      max(month_bucket) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Unique_ID,Facility,Facility_Name,Res_Number,First_Name,Last_Name,Unit_Number,Incident_Date_parsed,__TIMESTAMP,Incident_Category,Type_of_Incident,Location_of_Incident_General,Location_of_Incident_Specific,What_Staff_Saw,Assistance_Given,Injuires_YN,Notify_EmergSrvs_YN,Sentinel_Event_YN,Prev_History_YN,month_bucket' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_incident_detail_history

    UNION ALL

    SELECT
      'resident_profile' AS slice_name,
      'resident_current' AS grain,
      count(*) AS row_count,
      NULL AS min_period,
      NULL AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Res_Number,resident_name,First_Name,Last_Name,Age,Admit_Date,LOS_Days,Facility,Facility_Name,Unit_Number,Care_Level,Payor_Text,Primary_Diagnosis,Physician_Name,Diet' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_resident_profile

    UNION ALL

    SELECT
      'resident_profile_enriched' AS slice_name,
      'resident_current_enriched' AS grain,
      count(*) AS row_count,
      cast(min(last_incident_date) AS string) AS min_period,
      cast(max(last_incident_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Res_Number,resident_name,First_Name,Last_Name,Age,Admit_Date,LOS_Days,Facility,Facility_Name,Unit_Number,Care_Level,Payor_Text,Primary_Diagnosis,Physician_Name,Diet,incident_count_all_time,incident_count_30d,incident_count_90d,incident_count_180d,last_incident_date,last_incident_category,last_note_date,days_since_last_note' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_resident_profile_enriched

    UNION ALL

    SELECT
      'resident_incident_summary' AS slice_name,
      'resident_rollup' AS grain,
      count(*) AS row_count,
      cast(min(last_incident_date) AS string) AS min_period,
      cast(max(last_incident_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,Res_Number,resident_name,incident_count_all_time,incident_count_30d,incident_count_90d,incident_count_180d,last_incident_date,last_incident_category' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_resident_incident_summary

    UNION ALL

    SELECT
      'resident_episode_history' AS slice_name,
      'resident_episode' AS grain,
      count(*) AS row_count,
      cast(min(admit_date) AS string) AS min_period,
      cast(max(coalesce(discharge_date, admit_date)) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'episode_id,Facility,Facility_Name,Res_Number,resident_name,admit_date,discharge_date,discharge_reason,discharge_destination,episode_status,month_bucket,source_table' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_resident_episode_history

    UNION ALL

    SELECT
      'resident_flow_weekly_by_community' AS slice_name,
      'community_week_movement' AS grain,
      count(*) AS row_count,
      cast(min(week_start) AS string) AS min_period,
      cast(max(week_start) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,week_start,month_bucket,admissions,discharges,net_change,admitted_residents,discharged_residents,source_rows' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_resident_flow_weekly_by_community

    UNION ALL

    SELECT
      'resident_flow_monthly_by_community' AS slice_name,
      'community_month_movement' AS grain,
      count(*) AS row_count,
      min(month_bucket) AS min_period,
      max(month_bucket) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,month_bucket,admissions,discharges,net_change,admitted_residents,discharged_residents,source_rows' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_resident_flow_monthly_by_community

    UNION ALL

    SELECT
      'census_weekly_by_community' AS slice_name,
      'community_week_census' AS grain,
      count(*) AS row_count,
      cast(min(week_start) AS string) AS min_period,
      cast(max(week_start) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,week_start,week_end,month_bucket,census' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_census_weekly_by_community

    UNION ALL

    SELECT
      'resident_countability_audit' AS slice_name,
      'resident_countability' AS grain,
      count(*) AS row_count,
      cast(min(admit_date) AS string) AS min_period,
      cast(max(coalesce(discharge_date, admit_date)) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,Res_Number,resident_name,admit_date,discharge_date,is_countable_resident,is_suspect_test_resident,resident_exclusion_reason' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_resident_countability_audit

    UNION ALL

    SELECT
      'census_data_quality' AS slice_name,
      'community_census_quality' AS grain,
      count(*) AS row_count,
      min(latest_census_month) AS min_period,
      max(latest_census_month) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,latest_census_month,latest_monthly_census,active_roster_residents,current_active_roster_residents,current_active_minus_latest_census,monthly_census_minus_active_roster,prior_census,census_delta,excluded_or_non_countable_rows,suspected_test_rows,exclusion_reasons,min_week,max_week,weekly_census_rows' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_census_data_quality

    UNION ALL

    SELECT
      'resident_unit_history' AS slice_name,
      'resident_unit_history' AS grain,
      count(*) AS row_count,
      cast(min(start_date) AS string) AS min_period,
      cast(max(coalesce(end_date, start_date)) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,Res_Number,resident_name,unit_number,start_date,end_date,month_bucket' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_resident_unit_history

    UNION ALL

    SELECT
      'services_provided' AS slice_name,
      'resident_service_detail' AS grain,
      count(*) AS row_count,
      cast(min(service_date) AS string) AS min_period,
      cast(max(service_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,Res_Number,resident_name,service_date,month_bucket,service_type,employee_id,service_status,service_units,source_table' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_services_provided

    UNION ALL

    SELECT
      'assessment_summary' AS slice_name,
      'resident_assessment_detail' AS grain,
      count(*) AS row_count,
      cast(min(assessment_date) AS string) AS min_period,
      cast(max(assessment_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,Res_Number,resident_name,assessment_date,month_bucket,assessment_type,assessment_status,assessment_score' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_assessment_summary

    UNION ALL

    SELECT
      'notes_summary' AS slice_name,
      'resident_note_detail' AS grain,
      count(*) AS row_count,
      cast(min(note_date) AS string) AS min_period,
      cast(max(note_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,Res_Number,resident_name,note_date,month_bucket,note_type,note_text,action_required_by_date' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_notes_summary

    UNION ALL

    SELECT
      'documentation_status' AS slice_name,
      'resident_documentation' AS grain,
      count(*) AS row_count,
      cast(min(last_note_date) AS string) AS min_period,
      cast(max(last_note_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Res_Number,resident_name,Facility,Facility_Name,last_note_date,days_since_last_note' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_documentation_status

    UNION ALL

    SELECT
      'medication_refusal_summary' AS slice_name,
      'community_medication' AS grain,
      count(*) AS row_count,
      NULL AS min_period,
      NULL AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Medication,total_scheduled,refusals,refusal_pct' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_medication_refusal_summary

    UNION ALL

    SELECT
      'medication_compliance_monthly' AS slice_name,
      'community_month' AS grain,
      count(*) AS row_count,
      min(month_bucket) AS min_period,
      max(month_bucket) AS max_period,
      concat_ws(',', sort_array(collect_set(Facility))) AS facility_ids,
      'Facility,Facility_Name,month_bucket,total_scheduled,given,not_given,compliance_pct' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_medication_compliance_monthly

    UNION ALL

    SELECT
      'mar_monthly_by_community_medication' AS slice_name,
      'community_month_medication' AS grain,
      count(*) AS row_count,
      min(month_bucket) AS min_period,
      max(month_bucket) AS max_period,
      concat_ws(',', sort_array(collect_set(facility_id))) AS facility_ids,
      'facility_id,facility_name,month_bucket,medication_name,administration_count,scheduled_count,given_count,not_given_count,refusal_count,prn_given_count,awol_count,hospital_count,unknown_count,resident_count,compliance_pct' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_mar_monthly_by_community_medication

    UNION ALL

    SELECT
      'mar_resident_summary' AS slice_name,
      'resident_current_medication' AS grain,
      count(*) AS row_count,
      cast(min(last_recorded_date) AS string) AS min_period,
      cast(max(last_recorded_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(facility_id))) AS facility_ids,
      'resident_id,resident_name,facility_id,facility_name,active_medication_count,active_psychotropic_count,active_narcotic_count,active_prn_count,scheduled_7d,given_7d,refusals_7d,scheduled_30d,given_30d,not_given_30d,refusals_30d,scheduled_90d,given_90d,not_given_90d,refusals_90d,last_recorded_date,prn_given_30d,prn_followup_30d,compliance_pct_30d' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_mar_resident_summary

    UNION ALL

    SELECT
      'mar_exception_detail_90d' AS slice_name,
      'medication_exception_detail' AS grain,
      count(*) AS row_count,
      cast(min(administration_date) AS string) AS min_period,
      cast(max(administration_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(facility_id))) AS facility_ids,
      'administration_id,medication_order_id,resident_id,resident_name,facility_id,facility_name,medication_name,dosage,route,administration_date,scheduled_date,scheduled_time,recorded_date,administration_outcome,outcome_category,not_given_reason,missed_or_held_reason,is_on_hold,is_prn,prn_reason,prn_result,prn_result_date,administration_note,minutes_late,is_refusal,is_over_60_minutes_late,month_bucket' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_mar_exception_detail_90d

    UNION ALL

    SELECT
      'mar_prn_effectiveness_90d' AS slice_name,
      'medication_prn_detail' AS grain,
      count(*) AS row_count,
      cast(min(administration_date) AS string) AS min_period,
      cast(max(administration_date) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(facility_id))) AS facility_ids,
      'administration_id,medication_order_id,resident_id,resident_name,facility_id,facility_name,medication_name,dosage,route,administration_date,scheduled_date,recorded_date,administration_outcome,prn_reason,prn_result,prn_result_date,prn_result_when,has_effectiveness_followup,month_bucket' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_mar_prn_effectiveness_90d

    UNION ALL

    SELECT
      'mar_medication_orders_current' AS slice_name,
      'resident_current_medication_order' AS grain,
      count(*) AS row_count,
      cast(min(effective_date) AS string) AS min_period,
      cast(max(coalesce(prescription_end_date, {WINDOW_AS_OF_SQL})) AS string) AS max_period,
      concat_ws(',', sort_array(collect_set(facility_id))) AS facility_ids,
      'medication_order_id,resident_id,resident_name,facility_id,facility_name,medication_name,dosage,route,schedule,passing_times,instructions,indication,prescriber_code,diagnosis_code,is_narcotic,is_psychotropic,is_prn,is_on_hold,effective_date,prescription_end_date' AS fields,
      current_timestamp() AS generated_at
    FROM {target}.v_tool_mar_medication_orders_current
    """
)

# COMMAND ----------

print("tool_context_views completed successfully.")
