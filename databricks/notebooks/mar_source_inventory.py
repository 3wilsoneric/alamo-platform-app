# Databricks notebook source
# MAGIC %md
# MAGIC # mar_source_inventory
# MAGIC
# MAGIC Read-only inventory of the ElderMark medication-order and administration
# MAGIC tables. This notebook prints schema and aggregate coverage only; it does
# MAGIC not display resident-level medication rows.

# COMMAND ----------

dbutils.widgets.text("catalog", "alamohealth")
dbutils.widgets.text("silver_schema", "silver")

import json
from datetime import date, datetime

from pyspark.sql import functions as F

catalog = (dbutils.widgets.get("catalog") or "alamohealth").strip()
silver_schema = (dbutils.widgets.get("silver_schema") or "silver").strip()

sources = {
    "medication_orders": f"{catalog}.{silver_schema}.res_medications",
    "medication_administrations": f"{catalog}.{silver_schema}.med_delivery",
}

date_candidates = [
    "Effective_Date_dt",
    "Prescription_End_Date_dt",
    "Archive_Date_dt",
    "Scheduled_Date_dt",
    "Given_or_Recorded_Date_dt",
    "PRN_Result_Date_dt",
    "Create_Date_dt",
]

priority_fields = [
    "Res_Number",
    "Facility",
    "Res_Medication_ID",
    "Medication_ID",
    "Med_Delivery_ID",
    "Medication",
    "Medication_Name",
    "Description",
    "Dosage",
    "Dose",
    "Strength",
    "Route",
    "Frequency",
    "Schedule_Code",
    "Scheduled_Date",
    "Given_or_Recorded_Date",
    "Given",
    "outcome",
    "Not_Given_Reason",
    "PRN",
    "PRN_Result",
    "PRN_Result_Date",
    "Physician",
    "Prescriber",
    "Narcotic",
    "Psychotropic",
    "is_active",
]

status_fields = [
    "Given",
    "outcome",
    "Not_Given_Reason",
    "PRN",
    "PRN_Result",
    "Narcotic",
    "Psychotropic",
    "is_active",
]


def json_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def nonempty(column_name):
    return F.col(column_name).isNotNull() & (F.trim(F.col(column_name).cast("string")) != "")


def profile_source(source_name, table_name):
    if not spark.catalog.tableExists(table_name):
        return {
            "source": source_name,
            "table": table_name,
            "available": False,
            "error": "table not found",
        }

    df = spark.table(table_name)
    columns = set(df.columns)
    row_count = df.count()
    resident_count = df.select("Res_Number").where(nonempty("Res_Number")).distinct().count() if "Res_Number" in columns else None
    facility_count = df.select("Facility").where(nonempty("Facility")).distinct().count() if "Facility" in columns else None

    date_coverage = {}
    for column_name in date_candidates:
        if column_name not in columns:
            continue
        coverage = df.agg(
            F.min(F.col(column_name)).alias("earliest"),
            F.max(F.col(column_name)).alias("latest"),
            F.count(F.col(column_name)).alias("populated"),
        ).first()
        date_coverage[column_name] = {
            "earliest": json_value(coverage["earliest"]),
            "latest": json_value(coverage["latest"]),
            "populated": int(coverage["populated"] or 0),
        }

    field_coverage = []
    for column_name in priority_fields:
        if column_name not in columns:
            continue
        populated = df.where(nonempty(column_name)).count()
        field_coverage.append(
            {
                "field": column_name,
                "populated": populated,
                "coverage_pct": round((populated / row_count * 100) if row_count else 0, 2),
            }
        )

    top_values = {}
    for column_name in status_fields:
        if column_name not in columns:
            continue
        top_values[column_name] = [
            {
                "value": str(row[column_name]) if row[column_name] is not None else "<null>",
                "count": int(row["count"]),
            }
            for row in (
                df.groupBy(column_name)
                .count()
                .orderBy(F.desc("count"))
                .limit(20)
                .collect()
            )
        ]

    return {
        "source": source_name,
        "table": table_name,
        "available": True,
        "row_count": row_count,
        "resident_count": resident_count,
        "facility_count": facility_count,
        "columns": [
            {"name": field.name, "type": field.dataType.simpleString(), "nullable": field.nullable}
            for field in df.schema.fields
        ],
        "date_coverage": date_coverage,
        "field_coverage": field_coverage,
        "top_values": top_values,
    }


inventory = [profile_source(source_name, table_name) for source_name, table_name in sources.items()]

summary_rows = [
    {
        "source": item["source"],
        "table": item["table"],
        "available": item["available"],
        "rows": item.get("row_count", 0),
        "residents": item.get("resident_count") or 0,
        "facilities": item.get("facility_count") or 0,
        "column_count": len(item.get("columns", [])),
    }
    for item in inventory
]

display(spark.createDataFrame(summary_rows))

for item in inventory:
    print(f"\n=== {item['source']} · {item['table']} ===")
    if not item["available"]:
        print(item["error"])
        continue

    display(spark.createDataFrame(item["columns"]))
    if item["field_coverage"]:
        display(spark.createDataFrame(item["field_coverage"]).orderBy("field"))
    for field_name, values in item["top_values"].items():
        print(f"Top values: {field_name}")
        display(spark.createDataFrame(values))

inventory_json = json.dumps(inventory, default=json_value)
print(f"MAR_SOURCE_INVENTORY_JSON={inventory_json}")
dbutils.notebook.exit(inventory_json)
