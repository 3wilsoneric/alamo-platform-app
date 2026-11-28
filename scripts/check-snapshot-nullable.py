"""Execute the actual publisher's resident projection with null/zero fixtures."""
import ast
from collections import defaultdict
from pathlib import Path

tree = ast.parse(Path("databricks/notebooks/snapshot_publish.py").read_text())
namespace = {}
namespace["expected_as_of_date"] = "2026-11-23"
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in {"normalize_str", "normalize_nullable", "normalize_int", "normalize_float", "iso_value"}:
        exec(compile(ast.Module(body=[node], type_ignores=[]), "publisher", "exec"), namespace)
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "build_tool_context_summary")
projections = {node.targets[0].id: node for node in function.body if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)}
namespace["resident_profile_rows"] = [defaultdict(lambda: None, Age=value, LOS_Days=value, days_since_last_note=value) for value in [None, 0, 37]]
namespace["manifest_rows"] = [defaultdict(lambda: None, slice_name="resident_profile", fields="Age,LOS_Days,days_since_last_note")]
for key in ["resident_profiles", "manifest"]:
    exec(compile(ast.Module(body=[projections[key]], type_ignores=[]), "publisher", "exec"), namespace)
for key in ["age", "los_days", "days_since_last_note"]:
    assert [row[key] for row in namespace["resident_profiles"]] == [None, 0, 37], key
assert namespace["manifest"][0]["nullable_fields"] == ["Age", "LOS_Days", "days_since_last_note"]
assert namespace["manifest"][0]["as_of_date"] == "2026-11-23"
namespace["manifest_rows"][0]["fields"] = "Age,LOS_Days"
exec(compile(ast.Module(body=[projections["manifest"]], type_ignores=[]), "publisher", "exec"), namespace)
assert namespace["manifest"][0]["nullable_fields"] == ["Age", "LOS_Days"]
print("Actual snapshot projection preserves missing, zero and known resident measures.")


# The complete current roster must be exposed under both canonical manifests.
namespace["manifest_rows"] = [defaultdict(lambda: None, slice_name="resident_profile_enriched", fields="Age,LOS_Days,days_since_last_note")]
exec(compile(ast.Module(body=[projections["manifest"]], type_ignores=[]), "publisher", "exec"), namespace)
assert namespace["manifest"][0]["nullable_fields"] == ["Age", "LOS_Days", "days_since_last_note"]
namespace["monthly_census_rows"] = [defaultdict(lambda: None, Facility="337", month_bucket="2026-09", snapshot_date="2026-09-30", census=4, prior_census=None, census_delta=None)]
returned = next(node.value for node in function.body if isinstance(node, ast.Return))
tables = next(value for key,value in zip(returned.keys,returned.values) if isinstance(key,ast.Constant) and key.value == "tables")
monthly = next(value for key,value in zip(tables.keys,tables.values) if isinstance(key,ast.Constant) and key.value == "census_monthly_by_community")
monthly_values=eval(compile(ast.Expression(body=monthly),"publisher","eval"),namespace)
assert monthly_values[0]["prior_census"] is None
assert monthly_values[0]["census_delta"] is None

# Execute the actual note-view builder against the real source column names.
views_tree = ast.parse(Path("databricks/notebooks/tool_context_views.py").read_text())
view_functions = [node for node in views_tree.body if isinstance(node, ast.FunctionDef) and node.name in {"_resolve_column", "sql_value", "sql_safe_date", "sql_date", "create_notes_summary_view"}]
views = {}
view_namespace={"target":"fixture.gold", "source":"fixture.silver", "table_columns":lambda _: ["Facility", "Res_Number", "Entry_Date_dt", "Comment", "Note_Type"], "create_view":lambda name,sql:views.update({name:sql})}
exec(compile(ast.Module(body=view_functions,type_ignores=[]),"note-builder","exec"),view_namespace)
view_namespace["create_notes_summary_view"]()
assert 'n.`Comment`' in views["v_tool_notes_summary"]
assert 'cast(NULL as string) AS note_text' not in views["v_tool_notes_summary"]
print("Enriched roster publication, monthly nulls, and actual ElderMark note-comment mapping passed.")

# Service minutes and visits retain units and missingness rather than a generic unit.
namespace["services_provided_rows"]=[defaultdict(lambda:None, service_minutes=value, service_visits=value) for value in [None,0,15]]
exec(compile(ast.Module(body=[projections["services_provided"]],type_ignores=[]),"publisher","exec"),namespace)
for key in ["service_minutes","service_visits"]:
    assert [row[key] for row in namespace["services_provided"]]==[None,0,15]
service_functions=[node for node in views_tree.body if isinstance(node,ast.FunctionDef) and node.name=="create_services_provided_view"]
view_namespace["table_columns"]=lambda _: ["Facility","Res_Number","Service_Month","Service_Type","Canceled_Code","Minutes_of_Service","Visits"]
exec(compile(ast.Module(body=service_functions,type_ignores=[]),"service-builder","exec"),view_namespace)
view_namespace["create_services_provided_view"]()
service_sql=views["v_tool_services_provided"]
assert 'scheduled_employee' not in service_sql
for column in ['Service_Month','Minutes_of_Service','Visits']:
    assert f's.`{column}`' in service_sql
assert 'AS service_minutes' in service_sql and 'AS service_visits' in service_sql
print("Monthly client-service archives keep exact units and exclude employee schedules.")

# Exercise episode serialization with only the columns its real SELECT returns.
# A permissive defaultdict would hide a publisher reference to another dataset.
episode_sql = projections["resident_episode_rows"].value.args[0].value
episode_columns = [column.strip() for column in episode_sql.split("SELECT", 1)[1].split("FROM", 1)[0].split(",")]
namespace["resident_episode_rows"] = [{column: None for column in episode_columns}]
exec(compile(ast.Module(body=[projections["resident_episode_history"]], type_ignores=[]), "publisher", "exec"), namespace)
assert len(namespace["resident_episode_history"]) == 1
assert namespace["resident_episode_history"][0]["discharge_date"] is None
print("Episode serialization uses only columns returned by its source query.")
